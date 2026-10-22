import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";

import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { stripLocale } from "@/i18n/paths";
import { enquiryContextSchema, type EnquiryContext } from "@/lib/contracts/enquiry";
import {
  findGatePass,
  GATE_LEAD_SOURCE,
  GATE_PASS_TTL_MS,
  recordToolUse,
  revokeGatePass,
  unlockGateLead,
  withdrawGateConsent,
  type GateUnlockResult,
} from "@/lib/crm";
import { consentLocale, leadGateConsentRecord } from "@/lib/server/enquiry-consent";
import { toE164IndianMobile } from "@/lib/server/enquiry-capture";
import { toLeadContext } from "@/lib/server/lead-sink";
import { getClientIp } from "@/lib/server/request-guards";

import {
  LEAD_GATE_LIMIT_HEADER,
  LEAD_GATE_MAX_BODY_BYTES,
  LEAD_GATE_USAGE_MAX_BODY_BYTES,
  leadGateSubmitSchema,
  leadGateUsageSchema,
  type LeadGateForgetData,
  type LeadGateTool,
  type LeadGateUnlockData,
  type LeadGateUsageData,
  type LeadGateUsageSkipReason,
} from "./contract";
import { gatePhoneKey, ipBucket } from "./limits";
import { leadGateExceptionReason, leadGateLog, type LeadGateLogEntry, type LeadGateLogReason } from "./log";
import {
  applyLeadGateCookies,
  clearLeadGateCookie,
  defaultLeadGateRuntime,
  LEAD_GATE_COOKIE,
  leadGateConfig,
  leadGatePrefill,
  leadGateStatusData,
  resolveLeadGateAccess,
  setLeadGateCookie,
  type LeadGateRuntime,
} from "./server";
import { generatePassId, hashPassId, signPassToken, verifyPassToken } from "./token";

/**
 * Route handlers of /api/lead-gate (docs/lead-gate-plan.md §5), built from injectable deps so the
 * tests can drive the clock, limiters and failures. The real routes use `leadGateHandlers`.
 *
 *   GET    /api/lead-gate          status (mode, unlocked, via, recordsUse, expiresAt, sample, prefill)
 *   POST   /api/lead-gate          share details once → CRM capture + pass cookie (201)
 *   DELETE /api/lead-gate          "Not you?" (forget this browser); ?withdraw=1 also withdraws consent
 *   POST   /api/lead-gate/usage    one use of a browser-only tool (predictor, planner)
 */

/** English D-007 messages (the UI shows its own localised copy by outcome). */
export const LEAD_GATE_SERVER_MESSAGES = {
  rateLimited: "Too many tries from this connection. Please try again in a few minutes.",
  phoneCapped: "This number was used several times today. Try again tomorrow or call Aspire.",
  paused: "Sharing details is paused right now. Nothing was saved.",
  storeFailed: "We couldn't save your details. Nothing was saved. Please try again.",
  serverError: "Something went wrong. Please try again.",
} as const;

export interface LeadGateHandlerDeps extends LeadGateRuntime {
  unlock: typeof unlockGateLead;
  withdraw: typeof withdrawGateConsent;
  revoke: typeof revokeGatePass;
  record: typeof recordToolUse;
}

const LOG_REASONS: ReadonlySet<string> = new Set([
  "origin_mismatch",
  "origin_null",
  "origin_invalid",
  "cross_site_fetch",
  "missing_origin",
  "unsupported_media_type",
  "payload_too_large",
  "invalid_json",
  "invalid_encoding",
  "invalid_content_length",
]);

function safeReason(code: unknown): LeadGateLogReason | undefined {
  return typeof code === "string" && LOG_REASONS.has(code) ? (code as LeadGateLogReason) : undefined;
}

/** Attribution: the visitor's context re-validated leniently with `tool` forced to the gate's tool. */
export function leadGateContext(raw: Record<string, unknown> | undefined, tool: LeadGateTool): EnquiryContext {
  const parsed = enquiryContextSchema.safeParse({ ...(raw ?? {}), tool });
  return parsed.success && parsed.data ? parsed.data : { tool };
}

function retryAfter(seconds: number, extra?: Record<string, string>): Record<string, string> {
  return { "Retry-After": String(seconds), ...extra };
}

export function createLeadGateHandlers(overrides: Partial<LeadGateHandlerDeps> = {}) {
  const deps: LeadGateHandlerDeps = {
    ...defaultLeadGateRuntime,
    unlock: unlockGateLead,
    withdraw: withdrawGateConsent,
    revoke: revokeGatePass,
    record: recordToolUse,
    ...overrides,
  };

  function logger(action: LeadGateLogEntry["action"]) {
    const started = performance.now();
    return (entry: Omit<LeadGateLogEntry, "action" | "durationMs">) =>
      leadGateLog({ action, ...entry, durationMs: performance.now() - started });
  }

  /** GET /api/lead-gate. Request-time (session + cookie); prerender bail-outs re-throw. */
  async function GET(request: NextRequest): Promise<Response> {
    try {
      const access = await resolveLeadGateAccess(deps);
      const limit = deps.limiters().status.check(ipBucket(getClientIp(request.headers)));
      if (!limit.allowed) {
        leadGateLog({ action: "status", outcome: "rate_limited" });
        return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.rateLimited, { headers: retryAfter(limit.retryAfterSeconds) });
      }
      return applyLeadGateCookies(portalApiItem(leadGateStatusData(access, deps.sampleData(), leadGatePrefill(access))), access);
    } catch (error) {
      unstable_rethrow(error);
      leadGateLog({ action: "status", outcome: "error", reason: leadGateExceptionReason(error) });
      return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.serverError);
    }
  }

  /**
   * POST /api/lead-gate. Order: same-origin (403) → gate off / an account let through (`session`:
   * a student or parent with a mobile on file; 200, nothing stored, body unread) → per-connection
   * limit (429) → JSON ≤ 4 KB + schema (415/413/400/422) → honeypot (201, dead cookie) → flood
   * breaker (503) → per-phone cap → capture + pass in one transaction (201 with Set-Cookie; 429 when
   * capped and the number has no lead; 500 and no cookie on a store failure). Signed-in staff and
   * admins go through exactly like visitors. A signed-in student or parent account's submission also
   * records the account id and role on the lead (submission meta; nothing else from the account).
   * The 201 body is the same for a new and an existing family and never names anyone.
   */
  async function POST(request: NextRequest): Promise<Response> {
    const log = logger("unlock");
    try {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) {
        log({ outcome: "forbidden", reason: safeReason(crossOrigin.reason) });
        return crossOrigin.response;
      }

      const access = await resolveLeadGateAccess(deps);
      if (access.via === "off" || access.via === "session") {
        log({ outcome: access.via });
        return applyLeadGateCookies(
          portalApiItem<LeadGateUnlockData>({ unlocked: true, via: access.via, recordsUse: false, expiresAt: null }),
          access,
        );
      }

      const limiters = deps.limiters();
      const limit = limiters.submit.check(ipBucket(getClientIp(request.headers)));
      if (!limit.allowed) {
        log({ outcome: "rate_limited" });
        return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.rateLimited, { headers: retryAfter(limit.retryAfterSeconds) });
      }

      const parsed = await parseJsonBody(request, leadGateSubmitSchema, LEAD_GATE_MAX_BODY_BYTES);
      if (!parsed.ok) {
        log({ outcome: parsed.response.status === 422 ? "validation_failed" : "bad_request", reason: safeReason(parsed.reason) });
        return parsed.response;
      }
      const body = parsed.data;
      const now = deps.now();
      const config = leadGateConfig(deps);
      const secret = config.secret;
      if (!secret) throw new Error("lead gate secret missing while the gate is on"); // unreachable: parseLeadGateConfig forces off
      const expiresAt = Math.floor((now + GATE_PASS_TTL_MS) / 1000) * 1000;
      const passId = generatePassId();
      const recordsUse =
        access.mode !== "off" && config.recordUse !== "off" && (config.recordUse === "all" || body.submittedBy === "parent");
      const unlocked = () => {
        const response = portalApiItem<LeadGateUnlockData>(
          { unlocked: true, via: "pass", recordsUse, expiresAt: new Date(expiresAt).toISOString() },
          { status: 201 },
        );
        setLeadGateCookie(response, signPassToken(secret, passId, expiresAt), expiresAt, now);
        return applyLeadGateCookies(response, { ...access, staleCookie: false });
      };

      // Honeypot: looks exactly like a success; the pass id is never stored, so the cookie is dead.
      if (body.website && body.website.trim() !== "") {
        log({ outcome: "honeypot", tool: body.tool });
        return unlocked();
      }

      if (limiters.breaker.tripped(now, config.maxNewLeadsPerHour)) {
        log({ outcome: "paused", tool: body.tool });
        return portalApiError("not_configured", LEAD_GATE_SERVER_MESSAGES.paused);
      }

      const phone = toE164IndianMobile(body.phone);
      const context = leadGateContext(body.context, body.tool);
      const locale = consentLocale(context);
      const consent = leadGateConsentRecord(body.consentVersion, locale, new Date(now));
      const cap = limiters.phone.check(gatePhoneKey(phone));

      let result: GateUnlockResult;
      try {
        result = deps.unlock(
          {
            lead: {
              source: GATE_LEAD_SOURCE,
              studentName: body.studentName,
              phone,
              currentClass: body.currentClass,
              submittedBy: body.submittedBy,
              consent: { textVersion: consent.version, at: now, locale: consent.locale, text: consent.text },
              context: toLeadContext(context, locale) ?? { locale },
            },
            phoneCapped: !cap.allowed,
            pass: {
              passHash: hashPassId(passId),
              expiresAt,
              consentVersion: consent.version,
              submittedBy: body.submittedBy,
              recordUse: true, // the gate sentence covers noting tool use; LEAD_GATE_RECORD_USE still applies per request
            },
            replacePassHash: access.pass?.passHash ?? null,
            assignNew: config.assignNew,
            account: access.account ? { userId: access.account.userId, role: access.account.role } : null,
          },
          now,
        );
      } catch (error) {
        unstable_rethrow(error);
        log({ outcome: "store_failed", tool: body.tool, reason: leadGateExceptionReason(error) });
        return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.storeFailed);
      }

      if (!result.ok) {
        if (result.error === "no_lead") {
          log({ outcome: "phone_rate_limited", tool: body.tool, reason: "no_lead" });
          return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.phoneCapped, {
            headers: retryAfter(cap.retryAfterSeconds, { [LEAD_GATE_LIMIT_HEADER]: "phone" }),
          });
        }
        log({ outcome: "store_failed", tool: body.tool, reason: result.error });
        return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.storeFailed);
      }

      if (result.isNew) limiters.breaker.record(now);
      log({ outcome: result.captured ? "unlocked" : "unlocked_capped", tool: body.tool, isNew: result.isNew });
      return unlocked();
    } catch (error) {
      unstable_rethrow(error);
      log({ outcome: "error", reason: leadGateExceptionReason(error) });
      return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.storeFailed);
    }
  }

  /**
   * DELETE /api/lead-gate: "Not you?" forgets this browser (deletes its pass, expires the cookie).
   * `?withdraw=1` ("Stop Aspire contacting me") also withdraws consent on the family's record
   * (all its passes revoked, open lead → lost). Idempotent; same-origin only.
   */
  async function DELETE(request: NextRequest): Promise<Response> {
    const log = logger("forget");
    try {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) {
        log({ outcome: "forbidden", reason: safeReason(crossOrigin.reason) });
        return crossOrigin.response;
      }
      const limit = deps.limiters().forget.check(ipBucket(getClientIp(request.headers)));
      if (!limit.allowed) {
        log({ outcome: "rate_limited" });
        return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.rateLimited, { headers: retryAfter(limit.retryAfterSeconds) });
      }
      const withdraw = request.nextUrl.searchParams.get("withdraw") === "1";
      const now = deps.now();
      const raw = request.cookies.get(LEAD_GATE_COOKIE)?.value;
      const token = raw ? verifyPassToken(leadGateConfig(deps).secret, raw, now) : null;
      let withdrawn = false;
      if (token) {
        const pass = withdraw ? findGatePass(token.passHash, now) : null;
        if (pass) withdrawn = deps.withdraw(pass.leadId, now).withdrawn;
        else deps.revoke(token.passHash);
      }
      const response = portalApiItem<LeadGateForgetData>({ forgotten: true, withdrawn });
      clearLeadGateCookie(response);
      log({ outcome: withdrawn ? "withdrawn" : "ok" });
      return response;
    } catch (error) {
      unstable_rethrow(error);
      log({ outcome: "error", reason: leadGateExceptionReason(error) });
      return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.serverError);
    }
  }

  /**
   * POST /api/lead-gate/usage. Order: same-origin (403) → per-connection limit (429) → JSON ≤ 1 KB +
   * schema (422; `ask` / `mock-test` are refused: their routes record them) → access → not recorded
   * (200 with a reason: off / session / no_pass / not_recorded) → per-pass limit (429) → record (200).
   */
  async function usagePOST(request: NextRequest): Promise<Response> {
    const log = logger("usage");
    try {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) {
        log({ outcome: "forbidden", reason: safeReason(crossOrigin.reason) });
        return crossOrigin.response;
      }
      const limiters = deps.limiters();
      const limit = limiters.usage.check(ipBucket(getClientIp(request.headers)));
      if (!limit.allowed) {
        log({ outcome: "rate_limited" });
        return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.rateLimited, { headers: retryAfter(limit.retryAfterSeconds) });
      }
      const parsed = await parseJsonBody(request, leadGateUsageSchema, LEAD_GATE_USAGE_MAX_BODY_BYTES);
      if (!parsed.ok) {
        log({ outcome: parsed.response.status === 422 ? "validation_failed" : "bad_request", reason: safeReason(parsed.reason) });
        return parsed.response;
      }
      const usage = parsed.data;
      const access = await resolveLeadGateAccess(deps);

      let reason: LeadGateUsageSkipReason | null = null;
      if (access.via === "off") reason = "off";
      else if (access.via === "session") reason = "session";
      else if (!access.pass) reason = "no_pass";
      else if (!access.pass.recordsUse) reason = "not_recorded";
      if (reason !== null || !access.pass) {
        log({ outcome: "skipped", tool: usage.tool, reason: reason === "no_pass" || reason === "not_recorded" ? reason : undefined });
        return applyLeadGateCookies(portalApiItem<LeadGateUsageData>({ recorded: false, reason: reason ?? "no_pass" }), access);
      }

      const perPass = limiters.usagePerPass.check(access.pass.passHash.slice(0, 32));
      if (!perPass.allowed) {
        log({ outcome: "rate_limited", tool: usage.tool });
        return portalApiError("rate_limited", LEAD_GATE_SERVER_MESSAGES.rateLimited, { headers: retryAfter(perPass.retryAfterSeconds) });
      }
      const page = usage.page && usage.page.startsWith("/") ? stripLocale(usage.page.split(/[?#]/)[0]) : null;
      // A planner feature (the homepage countdown) gets its own daily entry per exam, apart from plans.
      const feature = usage.tool === "planner" ? (usage.key ?? null) : null;
      const result = deps.record(
        access.pass.leadId,
        { tool: usage.tool, key: feature ? `${feature}-${usage.exam}` : usage.exam, exam: usage.exam, band: usage.band ?? null, feature, page },
        deps.now(),
      );
      log({ outcome: result.recorded ? "ok" : "skipped", tool: usage.tool });
      return applyLeadGateCookies(portalApiItem<LeadGateUsageData>({ recorded: result.recorded }), access);
    } catch (error) {
      unstable_rethrow(error);
      log({ outcome: "error", reason: leadGateExceptionReason(error) });
      return portalApiError("server_error", LEAD_GATE_SERVER_MESSAGES.serverError);
    }
  }

  return { GET, POST, DELETE, usagePOST };
}

/** The handlers used by src/app/api/lead-gate/**. */
export const leadGateHandlers = createLeadGateHandlers();
