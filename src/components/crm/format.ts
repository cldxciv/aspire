/**
 * Pure, client-safe helpers for the CRM workspace: labels, phone masking, contact links, dates
 * (Asia/Kolkata), follow-up status and the inbox URL filters. No server imports.
 */
import type { Locale } from "@/i18n/config";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { isLeadStage, type LeadFilters, type LeadStage, type LeadSummary } from "@/lib/crm/types";
import type { LeadCard } from "./types";

export type CrmMessages = Messages<"crm">;

export const CRM_TIME_ZONE = "Asia/Kolkata";
/** IST has no daylight saving: a fixed offset keeps day maths exact without a tz library. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function pick<T extends Record<string, string>>(labels: T, key: string | null | undefined, fallback: string): string {
  if (!key) return fallback;
  return Object.hasOwn(labels, key) ? labels[key as keyof T] : fallback;
}

export function stageLabel(t: CrmMessages, stage: string): string {
  return pick(t.stages, stage, stage);
}

export function sourceLabel(t: CrmMessages, source: string | null | undefined): string {
  return pick(t.sources, source, t.sources.other);
}

export function toolLabel(t: CrmMessages, tool: string | null | undefined): string | null {
  if (!tool) return null;
  // Stored ids are slugs ("mocktest"); the enquiry contract spells it "mock-test".
  return pick(t.tools, tool === "mock-test" ? "mocktest" : tool, tool);
}

export function topicLabel(t: CrmMessages, topic: string | null | undefined): string | null {
  if (!topic) return null;
  return pick(t.lead.details.topics, topic, topic);
}

export function programLabel(t: CrmMessages, program: string | null | undefined): string | null {
  if (!program) return null;
  return pick(t.programs, program, program);
}

export function classLabel(t: CrmMessages, cls: string | null | undefined): string | null {
  if (!cls) return null;
  return pick(t.classes, cls, cls);
}

export function lostReasonLabel(t: CrmMessages, reason: string | null | undefined): string | null {
  if (!reason) return null;
  return pick(t.lostReasons, reason, reason);
}

export function outcomeLabel(t: CrmMessages, outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  return pick(t.lead.contact.outcomes, outcome, outcome);
}

export function centreLabel(
  t: CrmMessages,
  centres: Readonly<Record<string, string>>,
  slug: string | null | undefined,
): string | null {
  if (!slug) return null;
  if (slug === "not-sure") return t.centreNotSure;
  return Object.hasOwn(centres, slug) ? centres[slug] : slug;
}

/** "Class 11 · IIT JEE" (either part optional). */
export function classProgramLabel(t: CrmMessages, cls: string | null, program: string | null): string | null {
  const parts = [classLabel(t, cls), programLabel(t, program)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------------------------
// Phone

/** Last four digits of a phone string (any format), or null. */
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Masked display: every digit hidden except the last four ("+91 ••••• •" + last four). */
export function maskPhone(last4: string | null | undefined): string {
  if (!last4 || !/^\d{4}$/.test(last4)) return "••••••••••";
  return `+91 ••••• •${last4}`;
}

/** Strictly an E.164 number (`+` and 8–15 digits) or null. */
export function normaliseE164(phone: string | null | undefined): string | null {
  const value = (phone ?? "").replace(/[\s-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

/** Readable Indian number grouped 5 + 5 after "+91"; other numbers as stored. */
export function displayPhone(e164: string | null | undefined): string | null {
  const value = normaliseE164(e164);
  if (!value) return e164 ?? null;
  const match = /^\+91(\d{5})(\d{5})$/.exec(value);
  return match ? `+91 ${match[1]} ${match[2]}` : value;
}

export function telHref(e164: string | null | undefined): string | null {
  const value = normaliseE164(e164);
  return value ? `tel:${value}` : null;
}

/** WhatsApp click-to-chat (D-041): opens the chat on the staff member's own device; nothing is sent. */
export function whatsAppHref(e164: string | null | undefined): string | null {
  const value = normaliseE164(e164);
  return value ? `https://wa.me/${value.slice(1)}` : null;
}

// ---------------------------------------------------------------------------------------------
// Dates (Asia/Kolkata)

function toMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function formatDateTime(value: string | number | null | undefined, locale: Locale): string | null {
  const ms = toMs(value);
  if (ms === null) return null;
  return new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeStyle: "short", timeZone: CRM_TIME_ZONE }).format(ms);
}

export function formatDate(value: string | number | null | undefined, locale: Locale): string | null {
  const ms = toMs(value);
  if (ms === null) return null;
  return new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeZone: CRM_TIME_ZONE }).format(ms);
}

/** Machine-readable value for `<time dateTime>`. */
export function isoOrUndefined(value: string | number | null | undefined): string | undefined {
  const ms = toMs(value);
  return ms === null ? undefined : new Date(ms).toISOString();
}

/** The IST calendar day (`YYYY-MM-DD`) of an instant. */
export function istDayKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start (UTC ms) of the IST day `YYYY-MM-DD`. */
export function istDayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS;
}

export type DueStatus = "overdue" | "today" | "upcoming";

/** Overdue = before now; today = later today (IST); else upcoming. `now` is passed in (no clock reads here). */
export function dueStatus(dueAt: string | number | null | undefined, now: number): DueStatus | null {
  const due = toMs(dueAt);
  if (due === null) return null;
  if (due < now) return "overdue";
  return istDayKey(due) === istDayKey(now) ? "today" : "upcoming";
}

/** ISO timestamp for a date (+ optional time) typed by staff in India. Null when invalid. */
export function istDueAt(date: string, time?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hhmm = time && /^\d{2}:\d{2}$/.test(time) ? time : "10:00";
  const ms = Date.parse(`${date}T${hhmm}:00.000+05:30`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** `YYYY-MM-DD` n days before the IST day of `now` (for date-range presets). */
export function istDaysAgo(now: number, days: number): string {
  return istDayKey(now - days * DAY_MS);
}

// ---------------------------------------------------------------------------------------------
// Inbox filters <-> URL (saved filter = the URL)

export const DUE_FILTERS = ["today", "overdue"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export interface InboxFilters {
  q: string;
  /** A stage, "open" (not enrolled / lost) or "" for any. */
  stage: LeadStage | "open" | "";
  /** A centre slug, "none" (no centre given) or "". */
  centre: string;
  program: string;
  source: string;
  /** "" any, "me", "unassigned" or a user id. */
  assignee: string;
  due: DueFilter | "";
  page: number;
}

export const EMPTY_FILTERS: InboxFilters = { q: "", stage: "", centre: "", program: "", source: "", assignee: "", due: "", page: 1 };

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function first(params: RawParams, key: string): string {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const one = Array.isArray(value) ? value[0] : value;
  return typeof one === "string" ? one.trim() : "";
}

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Untrusted query → filters. Anything malformed is dropped (the server re-validates). */
export function parseInboxFilters(params: RawParams): InboxFilters {
  const stage = first(params, "stage");
  const due = first(params, "due");
  const assignee = first(params, "assignee");
  const page = Number.parseInt(first(params, "page"), 10);
  const slug = (key: string) => {
    const value = first(params, key).toLowerCase();
    return SLUG.test(value) ? value : "";
  };
  return {
    q: first(params, "q").slice(0, 80),
    stage: isLeadStage(stage) || stage === "open" ? stage : "",
    centre: slug("centre"),
    program: slug("program"),
    source: slug("source"),
    assignee: ID.test(assignee) ? assignee : "",
    due: (DUE_FILTERS as readonly string[]).includes(due) ? (due as DueFilter) : "",
    page: Number.isFinite(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

/** Query string for filters (only non-empty values; page only when > 1). Leading "?" or "". */
export function inboxQuery(filters: InboxFilters, overrides: Partial<InboxFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const key of ["q", "stage", "centre", "program", "source", "assignee", "due"] as const) {
    if (merged[key]) params.set(key, merged[key]);
  }
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Filters → the service / API filter object (empty values dropped). */
export function toLeadFilters(filters: InboxFilters): LeadFilters {
  const out: LeadFilters = { sort: "recent_activity" };
  if (filters.q) out.q = filters.q;
  if (filters.stage) out.stage = filters.stage;
  if (filters.centre) out.centre = filters.centre;
  if (filters.program) out.program = filters.program;
  if (filters.source) out.source = filters.source;
  if (filters.assignee) out.assignee = filters.assignee;
  if (filters.due) out.due = filters.due;
  return out;
}

export function hasActiveFilters(filters: InboxFilters): boolean {
  return Boolean(filters.q || filters.stage || filters.centre || filters.program || filters.source || filters.assignee || filters.due);
}

export function leadCountLabel(t: CrmMessages, count: number): string {
  return count === 1 ? t.inbox.countOne : format(t.inbox.count, { count });
}

/** A lead for client components (pipeline): labels resolved, phone reduced to its last four digits. */
export function toLeadCard(
  lead: LeadSummary,
  ctx: { t: CrmMessages; centres: Readonly<Record<string, string>>; viewerId: string },
): LeadCard {
  const { t } = ctx;
  return {
    id: lead.id,
    name: lead.erased ? t.common.erased : lead.displayName?.trim() || t.common.unnamed,
    stage: lead.stage,
    phoneLast4: phoneLast4(lead.phone),
    classProgram: classProgramLabel(t, lead.currentClass, lead.programInterest),
    centre: centreLabel(t, ctx.centres, lead.centreSlug),
    assignee: lead.assignee ? (lead.assignee.userId === ctx.viewerId ? t.common.you : lead.assignee.displayName) : null,
    nextTaskDueAt: lead.nextTaskDueAt,
    overdue: lead.overdue,
  };
}

const MAX_REPORT_DAYS = 3 * 366;

/**
 * Report range from untrusted `from` / `to` (`YYYY-MM-DD`, inclusive IST days). Defaults to the
 * last `days` days ending today; an inverted or over-long range falls back to the default and is
 * flagged `invalid`. `toIso` is exclusive (start of the day after `toDay`).
 */
export function reportDayRange(
  fromRaw: unknown,
  toRaw: unknown,
  now: number,
  days = 30,
): { fromDay: string; toDay: string; fromIso: string; toIso: string; invalid: boolean } {
  const day = (value: unknown) => {
    const one = Array.isArray(value) ? value[0] : value;
    return typeof one === "string" && /^\d{4}-\d{2}-\d{2}$/.test(one) && Number.isFinite(istDayStart(one)) ? one : null;
  };
  const build = (fromDay: string, toDay: string, invalid: boolean) => ({
    fromDay,
    toDay,
    fromIso: new Date(istDayStart(fromDay)).toISOString(),
    toIso: new Date(istDayStart(toDay) + DAY_MS).toISOString(),
    invalid,
  });
  const today = istDayKey(now);
  const fallback = () => build(istDaysAgo(now, days - 1), today, false);
  const from = day(fromRaw);
  const to = day(toRaw);
  if (!from && !to) return fallback();
  const toDay = to ?? today;
  const fromDay = from ?? istDayKey(istDayStart(toDay) - (days - 1) * DAY_MS);
  const span = (istDayStart(toDay) - istDayStart(fromDay)) / DAY_MS;
  if (span < 0 || span >= MAX_REPORT_DAYS) return { ...fallback(), invalid: true };
  return build(fromDay, toDay, false);
}
