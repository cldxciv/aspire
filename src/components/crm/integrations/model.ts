/**
 * Pure helpers of the Meta Lead Ads screen (LR-META; docs/lead-routing-plan.md §6–7, §18, §20):
 * the live checklist ticks, dates in IST, and the localised text for fixed codes. Client-safe.
 */
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { ImportTarget, MetaSecretState } from "@/lib/crm/lead-ops-types";
import { META_REQUIRED_SCOPES, type MetaActionResult, type MetaIntegrationView } from "@/lib/crm/meta/types";
import type { CrmMessages } from "../format";

export type MetaMessages = CrmMessages["metaAds"];
/** What the islands need: the Meta texts and the shared CRM error texts. */
export type MetaIslandMessages = { m: MetaMessages; errors: CrmMessages["errors"] };

/** LOCALE-FREE path of the page (sign-in return, refresh). */
export const INTEGRATIONS_PATH = "/crm/settings/integrations";
export const IMPORT_PATH = "/crm/settings/import";

export const CHECKLIST_STEPS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13"] as const;
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];
export type StepState = "done" | "todo" | "manual";

/**
 * Live ticks (§24 "with live ticks"): a step is `done` only when the CRM can confirm it from what
 * it has seen; steps it can never see (Live mode, Leads access, the Page apps setting) are
 * `manual` until a lead was actually read, which proves them.
 */
export function checklistStates(view: MetaIntegrationView): { step0: StepState; steps: Record<ChecklistStep, StepState> } {
  const { readiness, status } = view;
  const config = view.admin?.config.value ?? null;
  const scopes = status.tokenInfo?.scopes ?? [];
  const leadRead = status.lastImportAt !== null;
  const when = (done: boolean, otherwise: StepState = "todo"): StepState => (done ? "done" : otherwise);
  return {
    step0: when(readiness.keyConfigured),
    steps: {
      s1: when(readiness.appId),
      s2: when(readiness.appId && readiness.appSecret && readiness.pageId),
      s3: when(status.lastVerifyAt !== null),
      s4: when(status.tokenInfo !== null && META_REQUIRED_SCOPES.every((scope) => scopes.includes(scope))),
      s5: when(readiness.accessToken),
      s6: when(leadRead, "manual"),
      s7: when(status.tokenInfo !== null && status.paused === null),
      s8: when(status.pageSubscribed === true),
      s9: when(leadRead, "manual"),
      s10: when(leadRead, "manual"),
      s11: when(status.lastTestAt !== null),
      s12: config ? when(config.forms.length > 0 && config.forms.every((form) => form.consentCheckboxKey !== null)) : "manual",
      s13: "manual",
    },
  };
}

/** A date-time in India time, in the page's language; null → the "never" text. */
export function formatWhen(iso: string | null, locale: Locale, never: string): string {
  if (!iso) return never;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return never;
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(ms);
}

/** A date in India time (token expiry). */
export function formatDay(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(ms);
}

/** A fixed action / Graph code → a sentence (never Meta's own text). */
export function codeText(code: string | null, m: MetaMessages): string {
  const codes = m.actions.codes as Record<string, string>;
  if (code && Object.hasOwn(codes, code) && code !== "fallback") return codes[code];
  return format(m.actions.codes.fallback, { code: code ?? "?" });
}

/** The status line after an action. */
export function actionSummary(result: MetaActionResult, m: MetaMessages): string {
  const d = m.actions.done;
  if (!result.ok && result.action !== "check") return format(m.actions.failed, { reason: codeText(result.code, m) });
  switch (result.action) {
    case "check":
      return result.ok ? d.check : result.checks && result.checks.length > 0 ? d.checkProblems : format(m.actions.failed, { reason: codeText(result.code, m) });
    case "subscribe_page":
      return d.subscribe;
    case "process_now":
      return format(d.processNow, { imported: result.processed?.imported ?? 0, failed: result.processed?.failed ?? 0, retried: result.processed?.retried ?? 0 });
    case "sync_leads":
      return format(d.syncLeads, { enqueued: result.enqueued ?? 0 });
    case "retry_failed":
      return format(d.retryFailed, { retried: result.retried ?? 0 });
    case "reseal":
      return format(d.reseal, { count: result.resealed ?? 0 });
    case "sync_forms":
      return format(m.forms.synced, { count: result.forms ?? 0 });
    case "regenerate_verify_token":
      return m.credentials.verifyTokenMade;
    case "test_mode":
      return result.testMode?.active ? m.testLeads.turnedOn : m.testLeads.turnedOff;
  }
}

/** An inbox item's fixed error code → a sentence. */
export function inboxErrorText(code: string | null, m: MetaMessages): string {
  if (!code) return "";
  const errors = m.inbox.errors as Record<string, string>;
  if (Object.hasOwn(errors, code) && code !== "fallback") return errors[code];
  return format(m.inbox.errors.fallback, { code });
}

/** One secret's state line ("Saved 22 Oct 2026, 10:15 am", "Not saved", …). */
export function secretStateText(state: MetaSecretState, m: MetaMessages, locale: Locale): string {
  if (!state.set) return m.credentials.stateNotSet;
  if (state.keyOk === "previous") return m.credentials.statePrevious;
  if (state.keyOk === false) return m.credentials.stateBroken;
  return format(m.credentials.stateSet, { date: formatWhen(state.updatedAt, locale, "") });
}

/** The field map as sorted rows (question key, target). */
export function fieldMapRows(fieldMap: Readonly<Record<string, ImportTarget>>): { question: string; target: ImportTarget }[] {
  return Object.entries(fieldMap)
    .map(([question, target]) => ({ question, target }))
    .sort((a, b) => a.question.localeCompare(b.question));
}

/** A question key a super admin types: trimmed, 1–120 characters, no control characters. */
export function cleanQuestionKey(raw: string): string | null {
  const key = raw.trim();
  return key.length >= 1 && key.length <= 120 && !/[\u0000-\u001f\u007f]/.test(key) ? key : null;
}

/** Digits-only Meta ids (App ID, Page ID) as typed; null when malformed, "" when cleared. */
export function cleanMetaId(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "";
  return /^\d{5,20}$/.test(value) ? value : null;
}
