import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { blueprintIdFor, blueprintTotals, defaultBlueprint, QB_SLOT_META, summaryIsPlaceholderNote } from "./patterns";
import { parseJson } from "./repo/json";
import { conflict, forbidden, invalid, notFound, ok, type QbConflictCode, type QbResult } from "./result";
import { blueprintDefinitionSchema } from "./schemas";
import { bumpBankRevision, isTaxonomyConfirmed } from "./settings";
import type { Bilingual, QbBlueprint, QbSlot, QbViewer } from "./types";
import { QB_SLOT_EXAM, QB_SLOTS } from "./types";

/**
 * Blueprints (owner: QB-CORE-B; §B1.3, §B9). Rows of `qb_blueprints` hold the whole blueprint as JSON
 * (`definition`); id, slot, version and status come from the row's own columns. Drafts are edited by
 * reviewers; only an admin publishes (one published version per slot; the previous one is archived),
 * and publishing is blocked while the definition has issues, the exam's taxonomy is unconfirmed, or
 * the blueprint is a placeholder (BOH) whose pattern nobody confirmed.
 */

export type QbBlueprintEditable = Omit<QbBlueprint, "id" | "slot" | "version" | "status" | "exam" | "placeholder" | "patternConfirmedBy" | "signoff">;

interface BlueprintRow {
  blueprint: QbBlueprint;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

function mapRow(row: Record<string, unknown>): BlueprintRow {
  const slot = row.slot as QbSlot;
  const stored = parseJson<Partial<QbBlueprint>>(row.definition, {});
  const base = defaultBlueprint(slot);
  const blueprint: QbBlueprint = {
    ...base,
    ...stored,
    id: String(row.id),
    slot,
    version: Number(row.version),
    status: row.status as QbBlueprint["status"],
    exam: QB_SLOT_EXAM[slot],
  };
  return {
    blueprint,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    publishedAt: row.published_at === null ? null : Number(row.published_at),
  };
}

export function getBlueprintRow(db: DatabaseSync, id: string): BlueprintRow | null {
  const row = db.prepare("SELECT * FROM qb_blueprints WHERE id = ?").get(id);
  return row ? mapRow(row) : null;
}

/** Any version by id (papers pin the version they were made from). */
export function getBlueprintById(db: DatabaseSync, id: string): QbBlueprint | null {
  return getBlueprintRow(db, id)?.blueprint ?? null;
}

export function getPublishedBlueprint(db: DatabaseSync, slot: QbSlot): QbBlueprint | null {
  const row = db.prepare("SELECT * FROM qb_blueprints WHERE slot = ? AND status = 'published'").get(slot);
  return row ? mapRow(row).blueprint : null;
}

export function publishedBlueprints(db: DatabaseSync): QbBlueprint[] {
  return db
    .prepare("SELECT * FROM qb_blueprints WHERE status = 'published' ORDER BY slot")
    .all()
    .map((row) => mapRow(row).blueprint);
}

// ---------------------------------------------------------------------------------------------
// Validation

export interface BlueprintIssue {
  path: string;
  message: string;
}

export function editableOf(blueprint: QbBlueprint): QbBlueprintEditable {
  const { id, slot, version, status, exam, placeholder, patternConfirmedBy, signoff, ...rest } = blueprint;
  void id;
  void slot;
  void version;
  void status;
  void exam;
  void placeholder;
  void patternConfirmedBy;
  void signoff;
  return rest;
}

/** Shape (zod) plus the rules zod cannot express. */
export function validateBlueprint(blueprint: QbBlueprint): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const parsed = blueprintDefinitionSchema.safeParse(editableOf(blueprint));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) issues.push({ path: issue.path.map(String).join(".") || "definition", message: issue.message });
  }
  const sectionIds = new Set<string>();
  blueprint.parts.forEach((part, p) => {
    part.sections.forEach((section, s) => {
      const path = `parts.${p}.sections.${s}`;
      if (sectionIds.has(section.id)) issues.push({ path: `${path}.id`, message: "Section ids must be unique across the blueprint." });
      sectionIds.add(section.id);
      if (section.answerFormat && section.type !== "numerical") issues.push({ path: `${path}.answerFormat`, message: "Only numerical sections have an answer format." });
      if (section.marking.partial && section.type !== "multiple") issues.push({ path: `${path}.marking.partial`, message: "Partial marking is for one-or-more-correct sections." });
      if (section.format === "passage") {
        const g = section.passageGroupSize ?? 0;
        if (g < 2) issues.push({ path: `${path}.passageGroupSize`, message: "Passage sections need a group size of at least 2." });
        else if (section.count % g !== 0) issues.push({ path: `${path}.count`, message: "The count must be a whole number of passage groups." });
      } else if (section.passageGroupSize && section.passageGroupSize > 1) {
        issues.push({ path: `${path}.passageGroupSize`, message: "Only passage sections take a group size." });
      }
      if (section.format === "match_list" && section.type !== "single") issues.push({ path: `${path}.format`, message: "Match-the-list sections are single-correct." });
    });
  });
  if (blueprint.parts.length > 1 && new Set(blueprint.parts.map((p) => p.id)).size !== blueprint.parts.length) {
    issues.push({ path: "parts", message: "Part ids must be unique." });
  }
  if (blueprint.parts.flatMap((p) => p.sections).length > 255) issues.push({ path: "parts", message: "At most 255 sections." });
  return issues;
}

export function publishBlockers(db: DatabaseSync, blueprint: QbBlueprint): { code: QbConflictCode; message: string }[] {
  const blockers: { code: QbConflictCode; message: string }[] = [];
  if (blueprint.status !== "draft") blockers.push({ code: "not_allowed_in_status", message: "Only a draft can be published." });
  if (validateBlueprint(blueprint).length > 0) blockers.push({ code: "blueprint_invalid", message: "Fix the blueprint's issues first." });
  if (blueprint.placeholder && !blueprint.patternConfirmedBy) {
    blockers.push({ code: "placeholder_blueprint", message: "This pattern is a placeholder: an admin must confirm the pattern with Aspire first." });
  }
  if (summaryIsPlaceholderNote(blueprint.summary)) {
    blockers.push({ code: "placeholder_blueprint", message: "The summary still says this mock is not available: rewrite it before publishing." });
  }
  if (!isTaxonomyConfirmed(db, blueprint.exam)) {
    blockers.push({ code: "taxonomy_unconfirmed", message: "An admin must confirm this exam's syllabus list (taxonomy) first." });
  }
  return blockers;
}

// ---------------------------------------------------------------------------------------------
// Views

export interface QbBlueprintSummary {
  id: string;
  slot: QbSlot;
  version: number;
  status: QbBlueprint["status"];
  exam: QbBlueprint["exam"];
  title: Bilingual;
  placeholder: boolean;
  patternConfirmed: boolean;
  signedOff: boolean;
  reviewDueAt: string | null;
  updatedAt: number;
  publishedAt: number | null;
  totals: { questions: number; marks: number; minutes: number };
}

export interface QbBlueprintDetail {
  blueprint: QbBlueprint;
  updatedAt: number;
  issues: BlueprintIssue[];
  taxonomyConfirmed: boolean;
  publishBlockers: string[];
}

function summaryOf(row: BlueprintRow): QbBlueprintSummary {
  const b = row.blueprint;
  const totals = blueprintTotals(b);
  return {
    id: b.id,
    slot: b.slot,
    version: b.version,
    status: b.status,
    exam: b.exam,
    title: b.title,
    placeholder: b.placeholder,
    patternConfirmed: b.patternConfirmedBy !== null,
    signedOff: b.signoff !== null,
    reviewDueAt: b.pattern.reviewDueAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    totals: { questions: totals.questions, marks: totals.marks, minutes: totals.minutes },
  };
}

function detailOf(db: DatabaseSync, row: BlueprintRow): QbBlueprintDetail {
  return {
    blueprint: row.blueprint,
    updatedAt: row.updatedAt,
    issues: validateBlueprint(row.blueprint),
    taxonomyConfirmed: isTaxonomyConfirmed(db, row.blueprint.exam),
    publishBlockers: row.blueprint.status === "draft" ? publishBlockers(db, row.blueprint).map((b) => b.code) : [],
  };
}

export function listBlueprints(viewer: QbViewer, db: DatabaseSync = qbDb()): QbResult<QbBlueprintSummary[]> {
  if (!qbCan(viewer, "view")) return forbidden();
  const rows = db.prepare("SELECT * FROM qb_blueprints ORDER BY slot, version DESC").all().map(mapRow);
  return ok(rows.map(summaryOf));
}

export function getBlueprintDetail(viewer: QbViewer, id: string, db: DatabaseSync = qbDb()): QbResult<QbBlueprintDetail> {
  if (!qbCan(viewer, "view")) return forbidden();
  const row = getBlueprintRow(db, id);
  return row ? ok(detailOf(db, row)) : notFound("No such blueprint.");
}

// ---------------------------------------------------------------------------------------------
// Writes

function store(db: DatabaseSync, blueprint: QbBlueprint, actorId: string, now: number, insert: boolean): void {
  if (insert) {
    db.prepare(
      `INSERT INTO qb_blueprints (id, slot, version, status, definition, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(blueprint.id, blueprint.slot, blueprint.version, blueprint.status, JSON.stringify(blueprint), actorId, now, actorId, now);
  } else {
    db.prepare("UPDATE qb_blueprints SET definition = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(blueprint),
      blueprint.status,
      actorId,
      now,
      blueprint.id,
    );
  }
}

function nextVersion(db: DatabaseSync, slot: QbSlot): number {
  return Number(db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM qb_blueprints WHERE slot = ?").get(slot)?.v ?? 1);
}

/** A new draft for a slot: a copy of its newest version (or the §B1.3 default). An open draft is returned as is. */
export function createDraft(viewer: QbViewer, input: { slot: QbSlot }, now: number, db: DatabaseSync = qbDb()): QbResult<QbBlueprintDetail> {
  if (!qbCan(viewer, "edit_blueprint")) return forbidden();
  if (!(QB_SLOTS as readonly string[]).includes(input.slot)) return invalid("Unknown exam slot.");
  const open = db.prepare("SELECT * FROM qb_blueprints WHERE slot = ? AND status = 'draft' ORDER BY version DESC LIMIT 1").get(input.slot);
  if (open) return ok(detailOf(db, mapRow(open)));
  const latest = db.prepare("SELECT * FROM qb_blueprints WHERE slot = ? ORDER BY version DESC LIMIT 1").get(input.slot);
  const version = nextVersion(db, input.slot);
  const source = latest ? mapRow(latest).blueprint : defaultBlueprint(input.slot);
  const blueprint: QbBlueprint = { ...source, id: blueprintIdFor(input.slot, version), version, status: "draft", signoff: null };
  store(db, blueprint, viewer.userId, now, true);
  return ok(detailOf(db, getBlueprintRow(db, blueprint.id)!));
}

/** Saves a draft's editable definition (identity, status, placeholder, confirmations stay server-owned). */
export function saveDraft(
  viewer: QbViewer,
  id: string,
  input: { definition: QbBlueprintEditable; baseUpdatedAt?: number },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBlueprintDetail> {
  if (!qbCan(viewer, "edit_blueprint")) return forbidden();
  const row = getBlueprintRow(db, id);
  if (!row) return notFound("No such blueprint.");
  if (row.blueprint.status !== "draft") return conflict("not_allowed_in_status", "Only drafts can be edited. Make a new version.");
  if (input.baseUpdatedAt !== undefined && input.baseUpdatedAt !== row.updatedAt) return conflict("stale", "Someone changed this blueprint meanwhile. Reload it.");
  const parsed = blueprintDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[issue.path.map(String).join(".") || "definition"] ??= []).push(issue.message);
    return invalid("Please check the highlighted fields.", fieldErrors);
  }
  const blueprint: QbBlueprint = { ...row.blueprint, ...(parsed.data as QbBlueprintEditable) };
  const issues = validateBlueprint(blueprint);
  if (issues.length > 0) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of issues) (fieldErrors[issue.path] ??= []).push(issue.message);
    return invalid("The blueprint has problems.", fieldErrors);
  }
  store(db, blueprint, viewer.userId, now, false);
  return ok(detailOf(db, getBlueprintRow(db, id)!));
}

export interface QbBlueprintAction {
  action: "publish" | "archive" | "new_version" | "confirm_pattern" | "signoff";
  note?: string;
  label?: Bilingual;
}

/** publish / archive (admin), new_version (reviewer), confirm_pattern (admin), signoff (reviewer). */
export function blueprintAction(
  viewer: QbViewer,
  id: string,
  action: QbBlueprintAction,
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBlueprintDetail> {
  const row = getBlueprintRow(db, id);
  if (!row) return notFound("No such blueprint.");
  const blueprint = row.blueprint;
  switch (action.action) {
    case "publish": {
      if (!qbCan(viewer, "publish_blueprint")) return forbidden();
      const blockers = publishBlockers(db, blueprint);
      if (blockers.length > 0) return conflict(blockers[0].code, blockers.map((b) => b.message).join(" "));
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = db.prepare("SELECT id, definition FROM qb_blueprints WHERE slot = ? AND status = 'published'").all(blueprint.slot);
        for (const prev of current) {
          const def = { ...parseJson<QbBlueprint>(prev.definition, blueprint), status: "archived" };
          db.prepare("UPDATE qb_blueprints SET status = 'archived', definition = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
            JSON.stringify(def),
            viewer.userId,
            now,
            prev.id,
          );
        }
        const published: QbBlueprint = { ...blueprint, status: "published" };
        db.prepare(
          "UPDATE qb_blueprints SET status = 'published', definition = ?, published_by = ?, published_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(published), viewer.userId, now, viewer.userId, now, id);
        bumpBankRevision(db, now);
        db.exec("COMMIT");
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
      }
      break;
    }
    case "archive": {
      if (!qbCan(viewer, "publish_blueprint")) return forbidden();
      if (blueprint.status === "archived") return conflict("not_allowed_in_status", "Already archived.");
      store(db, { ...blueprint, status: "archived" }, viewer.userId, now, false);
      bumpBankRevision(db, now);
      break;
    }
    case "new_version": {
      if (!qbCan(viewer, "edit_blueprint")) return forbidden();
      const open = db.prepare("SELECT id FROM qb_blueprints WHERE slot = ? AND status = 'draft'").get(blueprint.slot);
      if (open) return conflict("not_allowed_in_status", "This exam already has an open draft.");
      const version = nextVersion(db, blueprint.slot);
      const draft: QbBlueprint = { ...blueprint, id: blueprintIdFor(blueprint.slot, version), version, status: "draft", signoff: null };
      store(db, draft, viewer.userId, now, true);
      return ok(detailOf(db, getBlueprintRow(db, draft.id)!));
    }
    case "confirm_pattern": {
      if (!qbCan(viewer, "publish_blueprint")) return forbidden();
      if (blueprint.status !== "draft") return conflict("not_allowed_in_status", "Confirm the pattern on a draft.");
      if (!action.note || action.note.trim().length < 3) return invalid("Say how the pattern was confirmed.", { note: ["required"] });
      // A summary that still carries the old "not confirmed, not available" wording becomes the neutral one.
      const summary = summaryIsPlaceholderNote(blueprint.summary) ? { ...QB_SLOT_META[blueprint.slot].summary } : blueprint.summary;
      store(db, { ...blueprint, summary, patternConfirmedBy: viewer.userId }, viewer.userId, now, false);
      break;
    }
    case "signoff": {
      if (!qbCan(viewer, "edit_blueprint")) return forbidden();
      if (blueprint.status === "archived") return conflict("not_allowed_in_status", "Archived blueprints cannot be signed off.");
      const label = action.label ?? { en: "Pattern reviewed by Aspire faculty", hi: "पैटर्न की समीक्षा Aspire फैकल्टी द्वारा" };
      if (!label.en.trim()) return invalid("Give the sign-off wording.", { label: ["required"] });
      store(db, { ...blueprint, signoff: { label, at: now } }, viewer.userId, now, false);
      break;
    }
    default:
      return invalid("Unknown action.");
  }
  return ok(detailOf(db, getBlueprintRow(db, id)!));
}
