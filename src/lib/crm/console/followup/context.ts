import "server-only";

import type { Locale } from "@/i18n/config";
import { getCentres } from "@/lib/data";
import { getDb } from "@/lib/db/connection";

import { canSeeLead, CRM_MESSAGES, fail, ok } from "../../access";
import { toIso } from "../../pure";
import { lastActivityAt } from "../../repo/activities";
import { findLeadById } from "../../repo/leads";
import { findPreferredTime, latestSubmissionLocale, listContactEntries } from "../../repo/console-followup";
import { listLeadTasks } from "../../repo/tasks";
import { getCallingHours, getSpeedRule } from "../../settings";
import type { CrmResult, CrmViewer } from "../../types";
import { getCentreLinks } from "../centre-links";
import { titleCaseSlug } from "../centres";
import { buildSlotValues } from "../templates/fill";
import { getWaLinks } from "../templates/templates";
import { PREFERRED_TIMES, type PreferredTime, type TemplateLang } from "../types";
import { attemptSummary } from "./attempts";
import { callingHoursLabel, outsideCallingHours, resolvePresets } from "./presets";
import { suggestFollowUp, suggestionToNext } from "./rhythm";
import type { FollowUpContextView, RhythmFacts } from "./types";

/**
 * GET /api/crm/leads/[leadId]/outcome (docs/admin-phase-1b-plan.md §5.C, §5.D; owner: 1B-CALLS):
 * everything the call dialog and the WhatsApp composer need, for a lead the viewer can see. A READ:
 * no transaction, no audit (opening the lead page already audited `crm.lead_view`). Template slot
 * values (names, the centre, links) only ever go to a viewer who can see the lead.
 *
 * `taskId` (the dialog opened from that task's Done button) is left out of `openTask` /
 * `openTaskCount`, so "Keep the existing follow-up" always means ANOTHER open task.
 */
export async function followUpContext(
  viewer: CrmViewer,
  leadId: string,
  now: number = Date.now(),
  options: { taskId?: string | null } = {},
): Promise<CrmResult<FollowUpContextView>> {
  const db = getDb();
  const lead = findLeadById(db, leadId);
  if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
  if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);

  const hours = getCallingHours(db).value;
  const rule = getSpeedRule(db).value;
  const preferredTime = asPreferredTime(findPreferredTime(db, leadId));
  const contacts = listContactEntries(db, leadId);
  const attempts = attemptSummary(contacts);
  const presets = resolvePresets(hours, rule, now, preferredTime);

  const openTasks = listLeadTasks(db, leadId).filter((task) => task.doneAt === null);
  const completing = options.taskId ? (openTasks.find((task) => task.id === options.taskId) ?? null) : null;
  const others = openTasks.filter((task) => task.id !== options.taskId);
  const openTask = others[0] ?? null;

  const visitedAt = lastActivityAt(db, leadId, ["stage_change"], { toStages: ["visited_or_demo"] });
  let firstConnectedAt: number | null = null;
  for (const entry of contacts) if (entry.outcome === "connected") firstConnectedAt = entry.at; // newest first → ends on the oldest
  const rhythm: RhythmFacts = {
    firstConnectedAt,
    visitedAt,
    contactsSinceVisit: visitedAt === null ? 0 : contacts.filter((entry) => entry.at > visitedAt).length,
    preferredTime,
  };
  const suggestion = suggestFollowUp({ outcome: null, stage: lead.stage, now, hours, facts: rhythm });
  const suggestedNext = suggestionToNext(suggestion);

  const centreSlug = lead.centreSlug ?? lead.areaDefaultCentre;
  const [centreEn, centreHi] = await Promise.all([centreName(centreSlug, "en"), centreName(centreSlug, "hi")]);
  const mapsUrl = centreSlug ? (getCentreLinks(db).value.centres[centreSlug]?.mapsUrl ?? null) : null;
  const prospectusUrl = getWaLinks(db).value.prospectusUrl;
  const slots = (centreLabel: string | null) =>
    buildSlotValues({
      guardianName: lead.guardianName,
      contactName: lead.contactName,
      studentName: lead.studentName,
      counsellorName: viewer.displayName,
      centreLabel,
      centreMapLink: mapsUrl,
      prospectusLink: prospectusUrl,
    });
  const slotsByLang: Record<TemplateLang, ReturnType<typeof slots>> = { en: slots(centreEn), hi: slots(centreHi), hinglish: slots(centreEn) };
  const defaultLang: TemplateLang = latestSubmissionLocale(db, leadId) === "hi" ? "hi" : "en";

  return ok({
    leadId,
    now: new Date(now).toISOString(),
    presets: {
      later_today: new Date(presets.later_today).toISOString(),
      tomorrow: new Date(presets.tomorrow).toISOString(),
      in_3_days: new Date(presets.in_3_days).toISOString(),
    },
    suggested: suggestedNext ? { next: suggestedNext, ruleKey: suggestion.ruleKey } : null,
    attempts,
    openTask: openTask ? { id: openTask.id, dueAt: toIso(openTask.dueAt), title: openTask.title } : null,
    openTaskCount: others.length,
    outsideCallingHoursNow: outsideCallingHours(hours, now),
    callingHoursLabel: callingHoursLabel(hours, now),
    stage: lead.stage,
    templateSlots: slotsByLang[defaultLang],
    defaultLang,
    callingHours: hours,
    rhythm,
    slotsByLang,
    completingTask: completing ? { id: completing.id, title: completing.title } : null,
  });
}

function asPreferredTime(value: string | null): PreferredTime | null {
  return value !== null && (PREFERRED_TIMES as readonly string[]).includes(value) ? (value as PreferredTime) : null;
}

/** The centre's name in `locale` (website centres), else the slug in title case; null without a centre. */
async function centreName(slug: string | null, locale: Locale): Promise<string | null> {
  if (!slug) return null;
  const centres = await getCentres(undefined, locale);
  return centres.find((centre) => centre.slug === slug)?.name ?? titleCaseSlug(slug);
}
