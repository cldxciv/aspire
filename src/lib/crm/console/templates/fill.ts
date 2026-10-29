/**
 * Staff WhatsApp templates — slot filling and checks (docs/admin-phase-1b-plan.md §5.D; owner:
 * 1B-CALLS). PURE and client-safe: the composer, the templates page and the server share these.
 *
 * Auto-filled slots (`AUTO_FILLED_SLOTS`): parent_name = guardian name, else the contact-form name;
 * student_first_name = the first word of the student's name; counsellor_name = the staff member;
 * centre = the centre's name in the chosen language; centre_map_link = the centre's Google Maps link
 * (`centre_links`); prospectus_link = `wa_links`. Every other slot is typed by staff. Values have
 * control characters and braces removed and are at most 120 characters. The two LINK slots are
 * never shortened (a cut link is a broken link the family would receive): a link is used whole when
 * it is a plain https link of at most 300 characters (`CONSOLE_URL_MAX`, the limit the saved links
 * already have), else the slot stays unfilled and the composer asks staff to fill it in. Nothing is
 * sent by Aspire: the text only pre-fills a wa.me link that opens on the staff member's own device
 * (D-041).
 */
import { AUTO_FILLED_SLOTS, CONSOLE_URL_MAX, TEMPLATE_SLOTS, type TemplateSlot, type TemplateSlotValues } from "../types";

/** A slot value is at most this long (links excepted: see `LINK_VALUE_MAX`). */
export const SLOT_VALUE_MAX = 120;
/** The slots that hold a link: filled whole or not at all. */
export const LINK_SLOTS = ["centre_map_link", "prospectus_link"] as const satisfies readonly TemplateSlot[];
/** A link slot value is at most this long (the same limit as the saved Maps and prospectus links). */
export const LINK_VALUE_MAX = CONSOLE_URL_MAX;
/** A template body (one language) is at most this long. */
export const TEMPLATE_BODY_MAX = 700;
/** The composer's text is at most this long before WhatsApp opens. */
export const WA_TEXT_MAX = 1000;

/** `{slot_name}` occurrences (lower-case names; anything else is plain text). */
const SLOT_TOKEN = /\{([a-z_]+)\}/g;
/** Any brace pair, to catch `{Unknown Slot}` typed by an editor. */
const BRACE_TOKEN = /\{([^{}]*)\}/g;
// C0 and C1 control characters (incl. newlines and tabs, which become spaces in a slot value).
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
/** What a usable link may not contain: whitespace, braces, control characters. */
const LINK_UNSAFE = /[\s{}\u0000-\u001f\u007f-\u009f]/;

export function isTemplateSlot(value: unknown): value is TemplateSlot {
  return typeof value === "string" && (TEMPLATE_SLOTS as readonly string[]).includes(value);
}

export function isLinkSlot(value: string): value is (typeof LINK_SLOTS)[number] {
  return (LINK_SLOTS as readonly string[]).includes(value);
}

/** A safe slot value: control characters and braces removed, whitespace collapsed, ≤ 120; null when empty. */
export function cleanSlotValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(CONTROL, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim().slice(0, SLOT_VALUE_MAX).trim();
  return clean.length > 0 ? clean : null;
}

/**
 * A link slot value, never shortened: a plain https link of at most 300 characters (no spaces,
 * braces or control characters) is kept whole; anything else is null, so the slot stays unfilled.
 */
export function cleanLinkValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (link.length === 0 || link.length > LINK_VALUE_MAX || LINK_UNSAFE.test(link)) return null;
  return /^https:\/\/[^/?#]+/i.test(link) ? link : null;
}

/** The value a slot gets from a raw value (links whole or not at all; other slots cleaned and ≤ 120). */
export function slotValue(slot: TemplateSlot, value: unknown): string | null {
  return isLinkSlot(slot) ? cleanLinkValue(value) : cleanSlotValue(value);
}

/** The first word of a name ("Riya Sharma" → "Riya"), or null. */
export function firstWord(name: string | null | undefined): string | null {
  const clean = cleanSlotValue(name);
  return clean ? (clean.split(" ")[0] ?? null) : null;
}

export interface SlotSources {
  guardianName?: string | null;
  contactName?: string | null;
  studentName?: string | null;
  counsellorName?: string | null;
  centreLabel?: string | null;
  centreMapLink?: string | null;
  prospectusLink?: string | null;
}

/** The auto-filled slot values (only those with a value). */
export function buildSlotValues(sources: SlotSources): TemplateSlotValues {
  const values: TemplateSlotValues = {};
  const set = (slot: (typeof AUTO_FILLED_SLOTS)[number], value: string | null) => {
    if (value) values[slot] = value;
  };
  set("parent_name", cleanSlotValue(sources.guardianName) ?? cleanSlotValue(sources.contactName));
  set("student_first_name", firstWord(sources.studentName));
  set("counsellor_name", cleanSlotValue(sources.counsellorName));
  set("centre", cleanSlotValue(sources.centreLabel));
  set("centre_map_link", cleanLinkValue(sources.centreMapLink));
  set("prospectus_link", cleanLinkValue(sources.prospectusLink));
  return values;
}

/** Replaces every `{slot}` that has a value; unfilled slots stay as they are (`{test_date}`). */
export function fillTemplate(body: string, values: TemplateSlotValues): string {
  return body.replace(SLOT_TOKEN, (token, name: string) => {
    if (!isTemplateSlot(name)) return token;
    return slotValue(name, values[name]) ?? token;
  });
}

/** The slot names still in a text, in order of first appearance (each once). */
export function leftoverSlots(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(SLOT_TOKEN)) if (!names.includes(match[1])) names.push(match[1]);
  return names;
}

export type TemplateBodyIssue = "empty" | "tooLong" | "unknownSlot" | "edgeSlot";

/**
 * Checks one template body as a super admin edits it: 1–700 characters; only `TEMPLATE_SLOTS`
 * names between braces; it must not start or end with a slot (a message opens and closes with words).
 */
export function templateBodyIssues(body: string): { issues: TemplateBodyIssue[]; unknown: string[] } {
  const value = body.trim();
  const issues: TemplateBodyIssue[] = [];
  if (value.length === 0) return { issues: ["empty"], unknown: [] };
  if (value.length > TEMPLATE_BODY_MAX) issues.push("tooLong");
  const unknown: string[] = [];
  for (const match of value.matchAll(BRACE_TOKEN)) {
    if (!isTemplateSlot(match[1]) && !unknown.includes(match[1])) unknown.push(match[1]);
  }
  if (unknown.length > 0) issues.push("unknownSlot");
  if (/^\{[a-z_]+\}/.test(value) || /\{[a-z_]+\}$/.test(value)) issues.push("edgeSlot");
  return { issues, unknown };
}

/** Why the composer cannot open WhatsApp yet (empty list = ready). */
export type ComposerIssue = "empty" | "slots" | "tooLong";

export function composerIssues(text: string): ComposerIssue[] {
  const issues: ComposerIssue[] = [];
  if (text.trim().length === 0) issues.push("empty");
  if (leftoverSlots(text).length > 0) issues.push("slots");
  if (text.length > WA_TEXT_MAX) issues.push("tooLong");
  return issues;
}

/**
 * `https://wa.me/<digits>?text=<encoded>` for an E.164 number (`+91…`) or its digits; null when the
 * number is not usable. Opening it sends nothing: WhatsApp shows the text and the person presses send.
 */
export function waMeHref(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
