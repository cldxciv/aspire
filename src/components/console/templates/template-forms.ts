/**
 * Pure helpers of the WhatsApp templates page (docs/admin-phase-1b-plan.md §5.D; owner: 1B-CALLS).
 * Client-safe and unit-tested.
 */
import { formatDate } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { TEMPLATE_BODY_MAX, templateBodyIssues } from "@/lib/crm/console/templates/fill";
import { CONSOLE_URL_MAX, TEMPLATE_SLOTS, type TemplateSlotValues, type TemplateStatus, type WaTemplate } from "@/lib/crm/console/types";
import type { CallsMessages } from "../calls/messages";

/** Preview values: every slot as "‹parent's name›" — never an invented name, date or link. */
export function sampleSlotValues(c: Pick<CallsMessages, "templates" | "whatsapp">): TemplateSlotValues {
  const values: TemplateSlotValues = {};
  for (const slot of TEMPLATE_SLOTS) values[slot] = format(c.templates.sample, { slot: c.whatsapp.slots[slot] ?? slot });
  return values;
}

/** The status chip's text: "Awaiting approval" / "Approved on 23 Oct 2026 by …" / "Retired". */
export function templateStatusText(template: Pick<WaTemplate, "status" | "approvedAt" | "approvedBy">, locale: Locale, c: Pick<CallsMessages, "templates">): string {
  const s = c.templates.status;
  if (template.status === "approved") {
    const date = formatDate(template.approvedAt, locale) ?? "";
    return template.approvedBy ? format(s.approved, { date, name: template.approvedBy }) : format(s.approvedNoName, { date });
  }
  return template.status === "retired" ? s.retired : s.draft;
}

/** The status actions a super admin is offered for a template in `status`. */
export function statusActions(status: TemplateStatus): TemplateStatus[] {
  if (status === "draft") return ["approved", "retired"];
  if (status === "approved") return ["draft", "retired"];
  return ["draft", "approved"];
}

/** Localised problems with an edited body (empty list = fine to save). */
export function bodyIssueMessages(body: string, c: Pick<CallsMessages, "templates">): string[] {
  const { issues, unknown } = templateBodyIssues(body);
  const i = c.templates.issues;
  return issues.map((issue) => {
    switch (issue) {
      case "empty":
        return i.empty;
      case "tooLong":
        return format(i.tooLong, { max: TEMPLATE_BODY_MAX });
      case "unknownSlot":
        return format(i.unknownSlot, { slots: unknown.map((name) => `{${name}}`).join(", ") });
      case "edgeSlot":
        return i.edgeSlot;
    }
  });
}

/** A prospectus link the server will accept: empty (remove) or https ≤ 300 characters. */
export function prospectusLinkValid(value: string): boolean {
  const text = value.trim();
  if (text === "") return true;
  if (text.length > CONSOLE_URL_MAX) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** "{parent_name}, {student_first_name}, …" for the edit help. */
export function slotList(): string {
  return TEMPLATE_SLOTS.map((slot) => `{${slot}}`).join(", ");
}
