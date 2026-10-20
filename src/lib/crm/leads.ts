import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";

import { assignableMember, canSeeLead, CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, leadScopeFor, ok } from "./access";
import { pickAssignee } from "./assignment";
import { canonicalTool, cleanMultiline, cleanSlug, cleanText, istDayBounds, maskPhone, parseTime, phoneLastDigits, toIso } from "./pure";
import { insertActivity, listActivities, listActivitiesOfTypes, type ActivityRow } from "./repo/activities";
import { findLeadById, queryLeads, updateLead as updateLeadRow, type LeadQuery, type LeadRow, type LeadUpdate } from "./repo/leads";
import { findDisplayNames } from "./repo/staff";
import { listLeadTasks, type TaskRow } from "./repo/tasks";
import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  EDITABLE_LEAD_FIELDS,
  isLeadStage,
  isLostReason,
  LEAD_SORTS,
  stageOrdinal,
  type ContactChannel,
  type ContactOutcome,
  type CrmResult,
  type CrmViewer,
  type EditableLeadField,
  type LeadActivity,
  type LeadDetail,
  type LeadFilters,
  type LeadPage,
  type LeadStage,
  type LeadSummary,
  type LeadTask,
  type LostReason,
} from "./types";

// ---------------------------------------------------------------------------
// Row → API shape
// ---------------------------------------------------------------------------

export function leadDisplayName(row: Pick<LeadRow, "studentName" | "contactName" | "guardianName">): string | null {
  return row.studentName ?? row.contactName ?? row.guardianName ?? null;
}

/**
 * Row → inbox shape. The phone is MASKED (last four digits only) unless `fullPhone` — the full
 * number is only handed out by the audited lead view (`getLead`).
 */
export function toLeadSummary(row: LeadRow, now: number, options: { fullPhone?: boolean } = {}): LeadSummary {
  return {
    id: row.id,
    stage: row.stage,
    lostReason: row.lostReason,
    displayName: leadDisplayName(row),
    studentName: row.studentName,
    guardianName: row.guardianName,
    phone: options.fullPhone ? row.phoneE164 : maskPhone(row.phoneE164),
    phoneLast4: phoneLastDigits(row.phoneE164),
    centreSlug: row.centreSlug,
    programInterest: row.programInterest,
    currentClass: row.currentClass,
    source: row.source,
    tool: canonicalTool(row.tool),
    assignee: row.assignedTo ? { userId: row.assignedTo, displayName: row.assigneeName ?? "" } : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lastActivityAt: toIso(row.lastActivityAt),
    nextTaskDueAt: toIso(row.nextTaskDueAt),
    overdue: row.nextTaskDueAt !== null && row.nextTaskDueAt < now,
    submissionCount: row.submissionCount,
    erased: row.erasedAt !== null,
  };
}

export function toLeadActivity(row: ActivityRow, names: ReadonlyMap<string, string> = new Map()): LeadActivity {
  const meta = { ...row.meta };
  if (typeof meta.tool === "string") meta.tool = canonicalTool(meta.tool);
  // Staff display names for the user ids in assignment / task entries (resolved at read time).
  const named = (key: string, nameKey: string) => {
    const id = meta[key];
    if (typeof id === "string" && names.has(id)) meta[nameKey] = names.get(id) ?? null;
  };
  if (row.type === "assignment") {
    named("from", "fromName");
    named("to", "toName");
  } else if (row.type === "task_created") {
    named("assigneeId", "assigneeName");
  }
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    meta,
    actorId: row.actorId,
    actorName: row.actorName,
    at: toIso(row.at),
  };
}

export function toLeadTask(row: TaskRow, now: number): LeadTask {
  return {
    id: row.id,
    leadId: row.leadId,
    title: row.title,
    dueAt: toIso(row.dueAt),
    doneAt: toIso(row.doneAt),
    assignee: row.assigneeId ? { userId: row.assigneeId, displayName: row.assigneeName ?? "" } : null,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    overdue: row.doneAt === null && row.dueAt < now,
  };
}

/** Timeline rows read for a lead page (newest first). */
const TIMELINE_LIMIT = 200;
/** Entries that carry a consent (or its withdrawal) or who filled a form in: always read in full. */
const CONSENT_ACTIVITY_TYPES = ["submission", "created", "consent_withdrawn"] as const;

/**
 * The lead's timeline: the latest TIMELINE_LIMIT entries, plus — when that window is full — every
 * older consent-bearing entry, so free-tool notes (one per tool per day, kept 90 days) can never
 * push the first consent, its sentence or who submitted it out of the consent list / parent flag.
 */
function timelineRows(db: DatabaseSync, leadId: string): ActivityRow[] {
  const rows = listActivities(db, leadId, TIMELINE_LIMIT);
  if (rows.length < TIMELINE_LIMIT) return rows;
  const seen = new Set(rows.map((activity) => activity.id));
  const older = listActivitiesOfTypes(db, leadId, CONSENT_ACTIVITY_TYPES).filter((activity) => !seen.has(activity.id));
  if (older.length === 0) return rows;
  return [...rows, ...older].sort((a, b) => b.at - a.at || b.id - a.id);
}

function toLeadDetail(db: DatabaseSync, row: LeadRow, now: number): LeadDetail {
  const activityRows = timelineRows(db, row.id);
  const ids = new Set<string>();
  for (const activity of activityRows) {
    for (const key of ["from", "to", "assigneeId"]) {
      const id = activity.meta[key];
      if (typeof id === "string") ids.add(id);
    }
  }
  const names = findDisplayNames(db, [...ids]);
  const activities = activityRows.map((activity) => toLeadActivity(activity, names));
  // The sentence behind the lead's own consent version (a lead-gate capture keeps an earlier enquiry
  // consent on the lead while its submission records the gate sentence), else the latest one.
  const withText = activities.filter((activity) => activity.type === "submission" && typeof activity.meta.consentText === "string");
  const consent = withText.find((activity) => activity.meta.consentTextVersion === row.consentTextVersion) ?? withText[0];
  return {
    ...toLeadSummary(row, now, { fullPhone: true }),
    contactName: row.contactName,
    email: row.email,
    message: row.message,
    page: row.page,
    referrer: row.referrer,
    utm: {
      source: row.utmSource,
      medium: row.utmMedium,
      campaign: row.utmCampaign,
      term: row.utmTerm,
      content: row.utmContent,
    },
    consentTextVersion: row.consentTextVersion,
    consentAt: toIso(row.consentAt),
    consentLocale: typeof consent?.meta.consentLocale === "string" ? consent.meta.consentLocale : null,
    consentText: typeof consent?.meta.consentText === "string" ? consent.meta.consentText : null,
    staffEditedFields: row.staffEdited.filter((field): field is EditableLeadField =>
      (EDITABLE_LEAD_FIELDS as readonly string[]).includes(field),
    ),
    furthestStage: row.furthestStage,
    erasedAt: toIso(row.erasedAt),
    activities,
    tasks: listLeadTasks(db, row.id).map((task) => toLeadTask(task, now)),
  };
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Turns inbox filters into a repository query (also used by the CSV export). */
export function buildLeadQuery(
  viewer: CrmViewer,
  filters: LeadFilters,
  now: number,
): Omit<LeadQuery, "limit" | "offset"> {
  const query: Omit<LeadQuery, "limit" | "offset"> = { scope: leadScopeFor(viewer) };
  if (filters.stage === "open" || isLeadStage(filters.stage)) query.stage = filters.stage;
  if (filters.centre === "none") query.centre = "none";
  else {
    const centre = cleanSlug(filters.centre);
    if (centre) query.centre = centre;
  }
  const program = cleanSlug(filters.program);
  if (program) query.program = program;
  const source = cleanSlug(filters.source, 32);
  if (source) query.source = source;
  if (filters.assignee === "me") query.assignee = viewer.userId;
  else if (filters.assignee === "unassigned") query.assignee = "unassigned";
  else if (typeof filters.assignee === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(filters.assignee)) {
    query.assignee = filters.assignee;
  }
  if (filters.due === "today") {
    const { start, end } = istDayBounds(now);
    query.dueFrom = start;
    query.dueBefore = end;
  } else if (filters.due === "overdue") {
    query.dueBefore = now;
  }
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, 80) : "";
  if (q) {
    const digits = q.replace(/[\s\-+().]/g, "");
    if (/^\d{4,12}$/.test(digits)) query.phoneEndsWith = digits.length > 10 ? digits.slice(-10) : digits;
    else if (q.length >= 2) query.nameContains = q;
  }
  const createdFrom = parseTime(filters.createdFrom);
  if (createdFrom !== null) query.createdFrom = createdFrom;
  const createdTo = parseTime(filters.createdTo);
  if (createdTo !== null) query.createdTo = createdTo;
  if (filters.includeErased === true && viewer.role === "admin") query.includeErased = true;
  if (filters.sort && LEAD_SORTS.includes(filters.sort)) query.sort = filters.sort;
  return query;
}

/** The leads inbox: only leads the viewer may see (D-038), newest activity first by default. */
export function listLeads(
  viewer: CrmViewer,
  filters: LeadFilters = {},
  paging: { page?: number; pageSize?: number } = {},
  now: number = Date.now(),
): LeadPage {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(paging.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
  const page = Math.max(1, Math.trunc(paging.page ?? 1) || 1);
  const { rows, total } = queryLeads(getDb(), {
    ...buildLeadQuery(viewer, filters, now),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { items: rows.map((row) => toLeadSummary(row, now)), total, page, pageSize };
}

/** One lead with its timeline and tasks. Audited (`crm.lead_view`) unless `audit: false`. */
export function getLead(
  viewer: CrmViewer,
  leadId: string,
  now: number = Date.now(),
  options: { audit?: boolean } = {},
): CrmResult<LeadDetail> {
  const db = getDb();
  const row = findLeadById(db, leadId);
  if (!row || !canSeeLead(viewer, row)) return fail("not_found", CRM_MESSAGES.notFound);
  if (options.audit !== false) {
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.leadView, target: row.id, now });
  }
  return ok(toLeadDetail(db, row, now));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface LeadPatch {
  stage?: LeadStage;
  lostReason?: LostReason | null;
  /** `null` unassigns. Admin / manager only. */
  assigneeId?: string | null;
  fields?: Partial<Record<EditableLeadField, string | null>>;
}

type Loaded = { ok: true; row: LeadRow } | { ok: false; result: CrmResult<never> };

/** Loads a lead the viewer may change (visible, not erased). */
function loadWritable(db: DatabaseSync, viewer: CrmViewer, leadId: string): Loaded {
  const row = findLeadById(db, leadId);
  if (!row || !canSeeLead(viewer, row)) return { ok: false, result: fail("not_found", CRM_MESSAGES.notFound) };
  if (row.erasedAt !== null) return { ok: false, result: fail("conflict", CRM_MESSAGES.erased) };
  return { ok: true, row };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Validates one editable field. `undefined` = invalid. */
function cleanField(field: EditableLeadField, value: string | null): string | null | undefined {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") return undefined;
  switch (field) {
    case "studentName":
    case "guardianName":
    case "contactName": {
      const name = cleanText(value, 80);
      return name && name.length >= 2 ? name : undefined;
    }
    case "email": {
      const email = value.trim().toLowerCase();
      return email.length <= 254 && EMAIL.test(email) ? email : undefined;
    }
    case "currentClass":
    case "programInterest":
    case "centreSlug":
      return cleanSlug(value) ?? undefined;
  }
}

const FIELD_COLUMN: Readonly<Record<EditableLeadField, keyof LeadRow>> = {
  studentName: "studentName",
  guardianName: "guardianName",
  contactName: "contactName",
  email: "email",
  currentClass: "currentClass",
  programInterest: "programInterest",
  centreSlug: "centreSlug",
};

/**
 * Stage, assignment and field edits in one transaction. Rules: `lost` needs a `lostReason`;
 * leaving `lost` clears it; `assigneeId` needs admin / manager and an assignable staff member;
 * edited fields are marked staff-edited (later submissions never overwrite them). Every change
 * is a timeline activity and an audit row (field names only).
 */
export function updateLead(
  viewer: CrmViewer,
  leadId: string,
  patch: LeadPatch,
  now: number = Date.now(),
): CrmResult<LeadDetail> {
  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadDetail> => {
    const loaded = loadWritable(db, viewer, leadId);
    if (!loaded.ok) return loaded.result;
    const row = loaded.row;
    const fieldErrors: Record<string, string[]> = {};
    const update: LeadUpdate = {};
    const afterWrites: (() => void)[] = [];

    // Assignment.
    if (patch.assigneeId !== undefined) {
      if (viewer.role === "counsellor") return fail("forbidden", CRM_MESSAGES.forbidden);
      const target = patch.assigneeId;
      const centre = patch.fields?.centreSlug !== undefined ? cleanSlug(patch.fields.centreSlug) : row.centreSlug;
      if (target !== null && !assignableMember(db, viewer, target, centre)) {
        fieldErrors.assigneeId = ["Choose an active staff member who covers this lead's centre."];
      } else if (target !== row.assignedTo) {
        update.assignedTo = target;
        afterWrites.push(() => {
          insertActivity(db, {
            leadId: row.id,
            type: "assignment",
            meta: { from: row.assignedTo, to: target },
            actorId: viewer.userId,
            at: now,
          });
          crmAudit(db, {
            actorId: viewer.userId,
            action: CRM_AUDIT.assign,
            target: row.id,
            details: { from: row.assignedTo, to: target },
            now,
          });
        });
      }
    }

    // Stage.
    if (patch.stage !== undefined) {
      if (!isLeadStage(patch.stage)) fieldErrors.stage = ["Choose a valid stage."];
      else if (patch.stage === "lost" && !isLostReason(patch.lostReason)) {
        fieldErrors.lostReason = ["Choose why this lead was lost."];
      } else {
        const to = patch.stage;
        const reason: LostReason | null = to === "lost" ? (patch.lostReason as LostReason) : null;
        if (to !== row.stage || reason !== row.lostReason) {
          update.stage = to;
          update.lostReason = reason;
          if (stageOrdinal(to) > stageOrdinal(row.furthestStage)) update.furthestStage = to;
          afterWrites.push(() => recordStageChange(db, viewer.userId, row.id, row.stage, to, reason, now));
        }
      }
    } else if (patch.lostReason !== undefined && patch.lostReason !== null) {
      if (row.stage !== "lost") fieldErrors.lostReason = ["A lost reason only applies to lost leads."];
      else if (!isLostReason(patch.lostReason)) fieldErrors.lostReason = ["Choose why this lead was lost."];
      else if (patch.lostReason !== row.lostReason) {
        update.lostReason = patch.lostReason;
        const reason = patch.lostReason;
        afterWrites.push(() => recordStageChange(db, viewer.userId, row.id, "lost", "lost", reason, now));
      }
    }

    // Fields.
    const changedFields: EditableLeadField[] = [];
    for (const [key, raw] of Object.entries(patch.fields ?? {})) {
      if (!(EDITABLE_LEAD_FIELDS as readonly string[]).includes(key)) continue;
      const field = key as EditableLeadField;
      const value = cleanField(field, raw ?? null);
      if (value === undefined) {
        fieldErrors[field] = [field === "email" ? "Enter a valid email address." : "Enter a valid value."];
        continue;
      }
      if (value !== row[FIELD_COLUMN[field]]) {
        (update as Record<string, unknown>)[FIELD_COLUMN[field]] = value;
        changedFields.push(field);
      }
    }
    if (Object.keys(fieldErrors).length > 0) return fail("validation", CRM_MESSAGES.validation, fieldErrors);
    if (changedFields.length > 0) {
      update.staffEdited = [...new Set([...row.staffEdited, ...changedFields])];
      afterWrites.push(() => {
        insertActivity(db, { leadId: row.id, type: "field_update", meta: { fields: changedFields }, actorId: viewer.userId, at: now });
        crmAudit(db, {
          actorId: viewer.userId,
          action: CRM_AUDIT.leadUpdate,
          target: row.id,
          details: { fields: changedFields.join(",") },
          now,
        });
      });
    }

    if (afterWrites.length > 0) {
      updateLeadRow(db, row.id, { ...update, updatedAt: now, lastActivityAt: now });
      for (const write of afterWrites) write();
    }
    const fresh = findLeadById(db, row.id);
    if (!fresh) return fail("not_found", CRM_MESSAGES.notFound);
    return ok(toLeadDetail(db, fresh, now));
  });
}

function recordStageChange(
  db: DatabaseSync,
  actorId: string | null,
  leadId: string,
  from: LeadStage,
  to: LeadStage,
  lostReason: LostReason | null,
  now: number,
): void {
  insertActivity(db, {
    leadId,
    type: "stage_change",
    meta: lostReason ? { from, to, lostReason } : { from, to },
    actorId,
    at: now,
  });
  crmAudit(db, {
    actorId,
    action: CRM_AUDIT.stageChange,
    target: leadId,
    details: lostReason ? { from, to, lostReason } : { from, to },
    now,
  });
}

/** Moves a lead to `stage` (`lost` needs a reason). */
export function changeStage(
  viewer: CrmViewer,
  leadId: string,
  stage: LeadStage,
  lostReason?: LostReason | null,
  now: number = Date.now(),
): CrmResult<LeadDetail> {
  return updateLead(viewer, leadId, { stage, lostReason: lostReason ?? null }, now);
}

/** Assigns (or with `null` unassigns) a lead. Admin / manager only. */
export function assignLead(
  viewer: CrmViewer,
  leadId: string,
  assigneeId: string | null,
  now: number = Date.now(),
): CrmResult<LeadDetail> {
  return updateLead(viewer, leadId, { assigneeId }, now);
}

export const NOTE_MAX = 2000;

/** Adds a staff note to the timeline. Audited without the text. */
export function addNote(viewer: CrmViewer, leadId: string, body: string, now: number = Date.now()): CrmResult<LeadActivity> {
  const text = cleanMultiline(body, NOTE_MAX);
  if (!text) return fail("validation", CRM_MESSAGES.validation, { body: ["Write a note."] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadActivity> => {
    const loaded = loadWritable(db, viewer, leadId);
    if (!loaded.ok) return loaded.result;
    const activity = insertActivity(db, { leadId, type: "note", body: text, actorId: viewer.userId, at: now });
    updateLeadRow(db, leadId, { updatedAt: now, lastActivityAt: now });
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.noteAdd, target: leadId, now });
    return ok(toLeadActivity(activity));
  });
}

/**
 * Logs a call or WhatsApp message the staff member made themselves (D-041: nothing is sent by the
 * system). A `connected` outcome moves a `new` lead to `contacted`.
 */
export function logContact(
  viewer: CrmViewer,
  leadId: string,
  input: { channel: ContactChannel; outcome: ContactOutcome; body?: string | null },
  now: number = Date.now(),
): CrmResult<LeadActivity> {
  const fieldErrors: Record<string, string[]> = {};
  if (!(CONTACT_CHANNELS as readonly string[]).includes(input.channel)) fieldErrors.channel = ["Choose call or WhatsApp."];
  if (!(CONTACT_OUTCOMES as readonly string[]).includes(input.outcome)) fieldErrors.outcome = ["Choose an outcome."];
  if (Object.keys(fieldErrors).length > 0) return fail("validation", CRM_MESSAGES.validation, fieldErrors);
  const body = cleanMultiline(input.body, NOTE_MAX);
  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadActivity> => {
    const loaded = loadWritable(db, viewer, leadId);
    if (!loaded.ok) return loaded.result;
    const activity = insertActivity(db, {
      leadId,
      type: input.channel,
      body,
      meta: { outcome: input.outcome },
      actorId: viewer.userId,
      at: now,
    });
    const update: LeadUpdate = { updatedAt: now, lastActivityAt: now };
    if (input.outcome === "connected" && loaded.row.stage === "new") {
      update.stage = "contacted";
      if (stageOrdinal("contacted") > stageOrdinal(loaded.row.furthestStage)) update.furthestStage = "contacted";
    }
    updateLeadRow(db, leadId, update);
    if (update.stage) recordStageChange(db, viewer.userId, leadId, "new", "contacted", null, now);
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.contactLog,
      target: leadId,
      details: { channel: input.channel, outcome: input.outcome },
      now,
    });
    return ok(toLeadActivity(activity));
  });
}

/** Re-runs auto-assignment for an unassigned lead (used by capture). Inside a transaction. */
export function autoAssign(db: DatabaseSync, row: LeadRow, now: number): string | null {
  if (row.assignedTo) return row.assignedTo;
  const picked = pickAssignee(db, { centreSlug: row.centreSlug, programInterest: row.programInterest }, now);
  if (!picked) return null;
  updateLeadRow(db, row.id, { assignedTo: picked.userId });
  insertActivity(db, {
    leadId: row.id,
    type: "assignment",
    meta: { from: null, to: picked.userId, auto: true, via: picked.via },
    actorId: null,
    at: now,
  });
  return picked.userId;
}
