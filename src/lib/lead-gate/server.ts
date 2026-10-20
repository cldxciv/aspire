import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { setSessionCookie } from "@/lib/auth/cookie";
import { privateApiHeaders } from "@/lib/auth/responses";
import { getCurrentSession, type CurrentSession } from "@/lib/auth/session";
import { showPlaceholderContent } from "@/lib/content-mode";
import type { ApiError } from "@/lib/contracts/api";
import { CONSENT_VERSIONS } from "@/lib/contracts/enquiry";
import {
  findGatePass,
  GATE_PASS_TTL_MS,
  issueGatePassForLead,
  recordToolUse,
  revokeGatePass,
  type GateSubmitter,
  type ToolUseInput,
} from "@/lib/crm";
import type { Env } from "@/lib/server/env";

import { parseLeadGateConfig, type LeadGateConfig } from "./config";
import {
  LEAD_GATE_BODY_MARKER,
  LEAD_GATE_CONSENT_VERSIONS,
  LEAD_GATE_HEADER,
  LEAD_GATE_HEADER_REQUIRED,
  type LeadGateMode,
  type LeadGateStatusData,
  type LeadGateVia,
} from "./contract";
import { sharedLeadGateLimiters, type LeadGateLimiters } from "./limits";
import { leadGateConfigWarning, leadGateExceptionReason, leadGateLog } from "./log";
import { generatePassId, hashPassId, signPassToken, verifyPassToken } from "./token";

/**
 * Consent versions that keep a pass valid: the gate's own (records use when allowed) and the
 * enquiry forms' (a pass issued after a stored enquiry; never records use). Dropping a version
 * here re-asks every browser that holds a pass made under it (critique 0.2).
 */
export const ACCEPTED_PASS_CONSENT_VERSIONS: readonly string[] = [...LEAD_GATE_CONSENT_VERSIONS, ...CONSENT_VERSIONS];

/**
 * Server helpers of the lead gate (docs/lead-gate-plan.md §4–§5), for the /api/lead-gate routes and
 * for the tool owners' server routes (/api/ask, /api/mocktest/score):
 *
 *   const gate = await resolveLeadGateAccess();             // session + pass cookie, per request
 *   if (gate.enforce) return applyLeadGateCookies(leadGateRequiredResponse(MESSAGE), gate);
 *   …produce the result…
 *   recordLeadGateToolUse(gate, { tool: "ask", key: "rancho" });   // never throws
 *   return applyLeadGateCookies(response, gate);               // refreshed session / stale pass cookie
 *
 * Request-time only (cookies + database). Never call it from a Server Component: pages stay static.
 */

/** The pass cookie: HttpOnly, SameSite=Lax, Path=/, Secure in production; value = signed token (token.ts). */
export const LEAD_GATE_COOKIE = "aspire_tool_pass";

export function leadGateCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

export function setLeadGateCookie(response: NextResponse, token: string, expiresAt: number, now: number): void {
  response.cookies.set(LEAD_GATE_COOKIE, token, leadGateCookieOptions((expiresAt - now) / 1000));
}

export function clearLeadGateCookie(response: NextResponse): void {
  response.cookies.set(LEAD_GATE_COOKIE, "", leadGateCookieOptions(0));
}

/** Injectable runtime (tests); the real routes use `defaultLeadGateRuntime`. */
export interface LeadGateRuntime {
  getEnv: () => Env;
  now: () => number;
  sampleData: () => boolean;
  limiters: () => LeadGateLimiters;
}

export const defaultLeadGateRuntime: LeadGateRuntime = {
  getEnv: () => process.env,
  now: () => Date.now(),
  sampleData: showPlaceholderContent,
  limiters: sharedLeadGateLimiters,
};

/** The live configuration (config warnings logged once per process). */
export function leadGateConfig(runtime: LeadGateRuntime = defaultLeadGateRuntime): LeadGateConfig {
  const config = parseLeadGateConfig(runtime.getEnv(), { sampleData: runtime.sampleData() });
  for (const code of config.warnings) leadGateConfigWarning(code);
  return config;
}

export interface LeadGatePass {
  /** SHA-256 of the pass id: the row key. Never log or return it. */
  passHash: string;
  leadId: string;
  expiresAt: number;
  submittedBy: GateSubmitter | null;
  /** Tool use on this browser is noted on the lead (consent + LEAD_GATE_RECORD_USE + mode). */
  recordsUse: boolean;
}

export interface LeadGateAccess {
  /** Effective mode (`required` degrades to `optional` while the flood breaker is tripped). */
  mode: LeadGateMode;
  /** Results may be shown. */
  unlocked: boolean;
  via: LeadGateVia | null;
  /** `required` and not unlocked: server-enforced tools answer leadGateRequiredResponse(). */
  enforce: boolean;
  /** Verified portal session (any role, including one that must still change its password). */
  session: CurrentSession | null;
  /** This browser's live pass (also set when signed in or off, so sign-out / "Not you?" can revoke it). */
  pass: LeadGatePass | null;
  /** A pass cookie was sent but is not a live pass (expired, revoked, tampered, old consent): clear it. */
  staleCookie: boolean;
  /** LEAD_GATE_SINCE (epoch ms) or null: work started before it is never gated (mock-test attempts). */
  since: number | null;
}

function recordsUse(config: LeadGateConfig, mode: LeadGateMode, pass: { recordUse: boolean; submittedBy: GateSubmitter | null }): boolean {
  if (mode === "off" || !pass.recordUse || config.recordUse === "off") return false;
  return config.recordUse === "all" || pass.submittedBy === "parent";
}

/**
 * Who may see results on this request, in order: gate off → open (`off`); any verified session →
 * open (`session`; nothing is stored for account holders); a live pass → open (`pass`); else
 * locked. A database error while reading the pass counts as "no pass" (fail closed for the
 * enforced tools; the browser-only tools fail open on their side). Prerender bail-outs re-throw.
 */
export async function resolveLeadGateAccess(runtime: LeadGateRuntime = defaultLeadGateRuntime): Promise<LeadGateAccess> {
  const session = await getCurrentSession();
  const raw = (await cookies()).get(LEAD_GATE_COOKIE)?.value;
  const now = runtime.now();
  const config = leadGateConfig(runtime);
  let mode = config.mode;
  if (mode === "required" && runtime.limiters().breaker.tripped(now, config.maxNewLeadsPerHour)) mode = "optional";

  let pass: LeadGatePass | null = null;
  let staleCookie = false;
  if (raw !== undefined && raw !== "") {
    const token = verifyPassToken(config.secret, raw, now);
    if (!token) {
      staleCookie = true;
    } else {
      try {
        const row = findGatePass(token.passHash, now);
        if (row && ACCEPTED_PASS_CONSENT_VERSIONS.includes(row.consentVersion)) {
          pass = {
            passHash: token.passHash,
            leadId: row.leadId,
            expiresAt: row.expiresAt,
            submittedBy: row.submittedBy,
            recordsUse: recordsUse(config, mode, row),
          };
        } else {
          staleCookie = true;
        }
      } catch (error) {
        unstable_rethrow(error);
        leadGateLog({ action: "status", outcome: "error", reason: leadGateExceptionReason(error) });
      }
    }
  }

  let via: LeadGateVia | null = null;
  if (mode === "off") via = "off";
  else if (session) via = "session";
  else if (pass) via = "pass";
  const unlocked = via !== null;
  return { mode, unlocked, via, enforce: mode === "required" && !unlocked, session, pass, staleCookie, since: config.since };
}

/** The GET /api/lead-gate body for an access result. No lead field is ever included. */
export function leadGateStatusData(access: LeadGateAccess): LeadGateStatusData {
  const viaPass = access.via === "pass" && access.pass !== null;
  return {
    mode: access.mode,
    unlocked: access.unlocked,
    via: access.via,
    recordsUse: viaPass ? (access.pass?.recordsUse ?? false) : false,
    expiresAt: viaPass && access.pass ? new Date(access.pass.expiresAt).toISOString() : null,
  };
}

/** Re-issues a session cookie whose expiry was just extended, and clears a dead pass cookie. Returns `response`. */
export function applyLeadGateCookies<T extends NextResponse>(response: T, access: LeadGateAccess): T {
  if (access.session?.refreshed) setSessionCookie(response, access.session.token, access.session.expiresAt);
  if (access.staleCookie) clearLeadGateCookie(response);
  return response;
}

/** Default message of a gate 401 (English, D-007 `message`; the UI shows its own localised copy). */
export const LEAD_GATE_REQUIRED_MESSAGE = "Share a contact number once to see results from Aspire's free tools.";

export type LeadGateRequiredBody = ApiError & { gate: typeof LEAD_GATE_BODY_MARKER };

/**
 * The gate 401: frozen code `unauthenticated` + header `X-Lead-Gate: required` + body `gate: "lead"`.
 * Clients treat a 401 as the gate ONLY with that header (critique 1.12); other 401s keep meaning
 * "session gone". Private headers (no-store, noindex).
 */
export function leadGateRequiredResponse(message: string = LEAD_GATE_REQUIRED_MESSAGE): NextResponse<LeadGateRequiredBody> {
  return NextResponse.json<LeadGateRequiredBody>(
    { ok: false, error: "unauthenticated", message, gate: LEAD_GATE_BODY_MARKER },
    { status: 401, headers: privateApiHeaders({ [LEAD_GATE_HEADER]: LEAD_GATE_HEADER_REQUIRED }) },
  );
}

/**
 * Notes one use of a tool on the family's lead when this request carries a pass that records use
 * (never for sessions, never when off). Swallows and logs database errors: recording must never
 * change a tool's response. True when an entry was written or merged.
 */
export function recordLeadGateToolUse(access: LeadGateAccess, input: ToolUseInput, now: number = Date.now()): boolean {
  if (access.via !== "pass" || !access.pass?.recordsUse) return false;
  try {
    const result = recordToolUse(access.pass.leadId, input, now);
    return result.recorded;
  } catch (error) {
    unstable_rethrow(error);
    leadGateLog({ action: "record", outcome: "error", tool: input.tool, reason: leadGateExceptionReason(error) });
    return false;
  }
}

function requestCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * After a STORED public enquiry (POST /api/enquiries, critique 1.8): a `Set-Cookie` value that
 * unlocks the tools on this browser too, so a family that just enquired is not asked again. The
 * pass keeps the enquiry's consent version and never records tool use. Null (no cookie) when the
 * gate is off, the browser already holds a signed pass, or anything fails: the enquiry's own
 * answer never depends on it. The enquiry response body stays exactly as frozen.
 */
export function enquiryLeadGateCookie(
  request: Request,
  input: { leadId: string; consentVersion: string },
  runtime: LeadGateRuntime = defaultLeadGateRuntime,
): string | null {
  try {
    const config = leadGateConfig(runtime);
    if (config.mode === "off" || !config.secret) return null;
    const now = runtime.now();
    if (verifyPassToken(config.secret, requestCookie(request, LEAD_GATE_COOKIE), now)) return null;
    const expiresAt = Math.floor((now + GATE_PASS_TTL_MS) / 1000) * 1000;
    const passId = generatePassId();
    const issued = issueGatePassForLead(
      input.leadId,
      { passHash: hashPassId(passId), expiresAt, consentVersion: input.consentVersion, submittedBy: null, recordUse: false },
      now,
    );
    if (!issued) return null;
    const options = leadGateCookieOptions((expiresAt - now) / 1000);
    return [
      `${LEAD_GATE_COOKIE}=${signPassToken(config.secret, passId, expiresAt)}`,
      `Path=${options.path}`,
      `Max-Age=${options.maxAge}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(options.secure ? ["Secure"] : []),
    ].join("; ");
  } catch (error) {
    leadGateLog({ action: "unlock", outcome: "error", reason: leadGateExceptionReason(error) });
    return null;
  }
}

/**
 * Sign-out (POST /api/auth/logout): forgets this browser's pass too (shared devices, plan §3) and
 * expires the cookie. Never throws.
 */
export function clearLeadGateOnSignOut(request: NextRequest, response: NextResponse, runtime: LeadGateRuntime = defaultLeadGateRuntime): void {
  const raw = request.cookies.get(LEAD_GATE_COOKIE)?.value;
  if (raw === undefined) return;
  try {
    const token = verifyPassToken(leadGateConfig(runtime).secret, raw, runtime.now());
    if (token) revokeGatePass(token.passHash);
  } catch (error) {
    leadGateLog({ action: "sign_out", outcome: "error", reason: leadGateExceptionReason(error) });
  }
  clearLeadGateCookie(response);
}
