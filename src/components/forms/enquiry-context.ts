/**
 * Attribution for enquiries (D-039): which page an enquiry was sent from, the campaign tags
 * (`utm_*`) of the link the visitor arrived by, the external site they came from (host only),
 * and the tool whose "Talk to a counsellor" CTA brought them (`?from=<tool>`).
 *
 * - Pure helpers + guarded `window` / `sessionStorage` access; client-safe, no React.
 * - The visit's landing attribution lives in sessionStorage (this tab, this visit; no cookies),
 *   so a visitor who lands on a program page from an ad and enquires later still carries the tags.
 * - Everything is validated with the contract's `enquiryContextSchema`, which the server applies
 *   again. Attribution never blocks an enquiry: anything invalid is simply left out.
 * - The predictor's exam + score band are only attached when the current URL carries them (the
 *   CTA link), where EnquiryForm tells the visitor so. They are never stored for the visit.
 */

import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import {
  CONTEXT_LIMITS,
  ENQUIRY_TOOLS,
  ENQUIRY_UTM_KEYS,
  enquiryContextSchema,
  type EnquiryContext,
  type EnquiryTool,
  type EnquiryUtmKey,
} from "@/lib/contracts/enquiry";

export const VISIT_STORAGE_KEY = "aspire.enquiry.visit.v1";

/** Where every tool CTA sends visitors: the admissions enquiry form. */
export const ENQUIRY_FORM_PATH = "/admissions";
export const ENQUIRY_FORM_HASH = "#enquiry";

const EXAM_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BAND_PATTERN = /^(?:score|percentile)-\d{1,4}-\d{1,4}$/;

/** Landing attribution kept for the visit. */
export interface VisitAttribution {
  utm?: Partial<Record<EnquiryUtmKey, string>>;
  /** Host of the external page the visit started from. */
  referrer?: string;
  /** Last tool CTA followed during the visit. */
  tool?: EnquiryTool;
}

/** A tool CTA in the current URL (`?from=predictor&exam=…&band=…`). */
export interface ToolArrival {
  tool: EnquiryTool;
  /** Predictor only. */
  exam?: string;
  /** Predictor only, e.g. "score-180-189". */
  band?: string;
}

export function parseTool(value: string | null | undefined): EnquiryTool | undefined {
  return (ENQUIRY_TOOLS as readonly string[]).includes(value ?? "") ? (value as EnquiryTool) : undefined;
}

/** The tool CTA the current URL carries, if any. */
export function toolArrivalFrom(search: string): ToolArrival | null {
  const params = new URLSearchParams(search);
  const tool = parseTool(params.get("from"));
  if (!tool) return null;
  if (tool !== "predictor") return { tool };
  const exam = params.get("exam") ?? "";
  const band = params.get("band") ?? "";
  return {
    tool,
    ...(exam.length <= CONTEXT_LIMITS.toolExam && EXAM_PATTERN.test(exam) ? { exam } : {}),
    ...(band.length <= CONTEXT_LIMITS.toolBand && BAND_PATTERN.test(band) ? { band } : {}),
  };
}

const clip = (value: string, max: number) => value.trim().slice(0, max).trim();

/** Attribution carried by one page load: utm_* of its URL, the external referrer host, its tool CTA. */
export function landingAttribution(search: string, referrer: string, ownHost: string): VisitAttribution {
  const params = new URLSearchParams(search);
  const utm: Partial<Record<EnquiryUtmKey, string>> = {};
  for (const key of ENQUIRY_UTM_KEYS) {
    const value = clip(params.get(key) ?? "", CONTEXT_LIMITS.utm);
    if (value) utm[key] = value;
  }
  let referrerHost: string | undefined;
  try {
    const host = referrer ? new URL(referrer).host.toLowerCase() : "";
    if (host && host !== ownHost.toLowerCase() && host.length <= CONTEXT_LIMITS.referrer) referrerHost = host;
  } catch {
    // not a URL: no referrer
  }
  const tool = parseTool(params.get("from"));
  return {
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
    ...(referrerHost ? { referrer: referrerHost } : {}),
    ...(tool ? { tool } : {}),
  };
}

/**
 * Merges a page load into the visit: a new set of utm_* tags replaces the old set (a new campaign
 * link is a new landing), the first external referrer is kept, the latest tool CTA wins.
 */
export function mergeAttribution(stored: VisitAttribution | null, landing: VisitAttribution): VisitAttribution {
  const utm = landing.utm ?? stored?.utm;
  const referrer = stored?.referrer ?? landing.referrer;
  const tool = landing.tool ?? stored?.tool;
  return { ...(utm ? { utm } : {}), ...(referrer ? { referrer } : {}), ...(tool ? { tool } : {}) };
}

/** Reads the stored visit, accepting only the expected shape. */
export function parseStoredAttribution(raw: string | null): VisitAttribution | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const utm: Partial<Record<EnquiryUtmKey, string>> = {};
    if (typeof record.utm === "object" && record.utm !== null) {
      for (const key of ENQUIRY_UTM_KEYS) {
        const item = (record.utm as Record<string, unknown>)[key];
        if (typeof item === "string" && item.trim()) utm[key] = clip(item, CONTEXT_LIMITS.utm);
      }
    }
    const referrer = typeof record.referrer === "string" ? record.referrer.slice(0, CONTEXT_LIMITS.referrer) : undefined;
    const tool = parseTool(typeof record.tool === "string" ? record.tool : undefined);
    return { ...(Object.keys(utm).length > 0 ? { utm } : {}), ...(referrer ? { referrer } : {}), ...(tool ? { tool } : {}) };
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // blocked storage (privacy mode, sandboxed frame)
  }
}

/**
 * Records this page load's attribution for the visit and returns the visit's attribution.
 * Safe to call on every page (AttributionCapture) and before every submit; never throws.
 */
export function captureVisitAttribution(): VisitAttribution {
  if (typeof window === "undefined") return {};
  const store = sessionStore();
  let stored: VisitAttribution | null = null;
  try {
    stored = parseStoredAttribution(store?.getItem(VISIT_STORAGE_KEY) ?? null);
  } catch {
    stored = null;
  }
  const landing = landingAttribution(window.location.search, document.referrer, window.location.host);
  const visit = mergeAttribution(stored, landing);
  try {
    store?.setItem(VISIT_STORAGE_KEY, JSON.stringify(visit));
  } catch {
    // storage full or blocked: attribution is best effort
  }
  return visit;
}

/** The `context` sent with an enquiry: validated by the contract, `undefined` when empty. */
export function buildEnquiryContext({
  pathname,
  search,
  locale,
  visit,
}: {
  pathname: string;
  search: string;
  locale: Locale;
  visit: VisitAttribution;
}): EnquiryContext | undefined {
  const arrival = toolArrivalFrom(search);
  const raw: Record<string, string | undefined> = {
    page: pathname.slice(0, CONTEXT_LIMITS.page),
    locale,
    ...visit.utm,
    referrer: visit.referrer,
    tool: arrival?.tool ?? visit.tool,
    toolExam: arrival?.exam,
    toolBand: arrival?.band,
  };
  return enquiryContextSchema.parse(raw);
}

/** Context for a submit from the current page (window); `undefined` on the server. */
export function collectEnquiryContext(locale: Locale): EnquiryContext | undefined {
  if (typeof window === "undefined") return undefined;
  const visit = captureVisitAttribution();
  return buildEnquiryContext({ pathname: window.location.pathname, search: window.location.search, locale, visit });
}

/** Query string for a tool CTA. Predictor: exam + score/percentile band only — never the exact score or any personal data. */
function toolQuery(tool: EnquiryTool, detail?: { exam?: string; band?: string }): string {
  const params = new URLSearchParams({ from: tool });
  if (tool === "predictor" && detail) {
    if (detail.exam && EXAM_PATTERN.test(detail.exam)) params.set("exam", detail.exam);
    if (detail.band && BAND_PATTERN.test(detail.band)) params.set("band", detail.band);
  }
  return params.toString();
}

/** "Talk to a counsellor" link for a tool, in the visitor's language: `/admissions?from=<tool>#enquiry`. */
export function toolEnquiryHref(tool: EnquiryTool, locale: Locale, detail?: { exam?: string; band?: string }): string {
  return localePath(`${ENQUIRY_FORM_PATH}?${toolQuery(tool, detail)}${ENQUIRY_FORM_HASH}`, locale);
}

/** Adds `from=<tool>` to an enquiry link a page already built (keeps its path, locale and hash). */
export function withEnquiryTool(href: string, tool: EnquiryTool): string {
  const hashIndex = href.indexOf("#");
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("from", tool);
  return `${path}?${params.toString()}${hash}`;
}

/** Predictor band for a bucket: "score-180-189" / "percentile-98-99"; undefined when it can't be expressed. */
export function predictorBand(mode: "score" | "percentile", low: number, high: number): string | undefined {
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high < low) return undefined;
  const band = `${mode}-${low}-${high}`;
  return BAND_PATTERN.test(band) ? band : undefined;
}
