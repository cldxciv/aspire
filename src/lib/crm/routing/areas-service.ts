import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { centres as centreContent } from "@/content/centres";
import { getDb, withTransaction } from "@/lib/db/connection";

import { canSeeLead, canSetAvailability, CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "../access";
import {
  ALIAS_KINDS,
  AVAILABILITY_MAX_DAYS,
  AVAILABILITY_NOTE_MAX,
  PLACE_INPUT_MAX,
  ROUTING_MODES,
  type AliasKind,
  type AreaResolution,
  type CrmArea,
  type CrmAreaAlias,
  type CrmAreaMember,
  type ReassignScope,
  type RoutingMode,
  type RoutingResult,
  type RoutingSettings,
  type SettingEnvelope,
  type StaffAvailability,
} from "../lead-ops-types";
import { cleanText, toIso } from "../pure";
import { findLeadRouting, listMemberAreaIds, upsertLeadRouting } from "../repo/areas-core";
import {
  countAreas,
  deleteAlias,
  deleteMember,
  findAlias,
  findAreaRow,
  findMember,
  insertAlias,
  insertArea,
  listAliasRows,
  listAreaMemberRows,
  listAreaRows,
  listAssignedLeadIds,
  listCentreAreas,
  listMemberRows,
  listOpenLeadsByPlaceKey,
  listRerouteCandidates,
  moveAliases,
  moveCentres,
  moveRoutingRows,
  nextAreaPosition,
  setAreaCentres,
  updateAreaRow,
  upsertMember,
  type AreaRow,
  type MemberRow,
} from "../repo/areas";
import { findLeadById, type LeadRow } from "../repo/leads";
import { findStaff, listStaffRows } from "../repo/staff";
import { findAvailability, listLegacyScopeManagerIds, setAvailability as writeAvailability, setScopeMode } from "../repo/staff-ops";
import { getRoutingSettings, writeSetting } from "../settings";
import type { CrmResult, CrmRole, CrmViewer } from "../types";
import { computeRouting, setUserAreas } from "./index";
import { assignable, pickForLead, recordAssignment, routingMode, servesArea, servingAreaOf } from "./pool";
import { normaliseAlias, resolveDistrict } from "./resolve";
import { ensureAreasSeeded, ensureAreasSeededForRead, invalidateAliasIndex, loadAliasIndex } from "./seed";

/**
 * Area administration (docs/lead-routing-plan.md §13.5 – §13.7, §21; owner LR-ROUTING). Every
 * service takes the viewer, decides access itself (the routes add `requireCrmSuperAdmin` on top),
 * runs its writes in ONE transaction and audits without personal data (ids, counts, slugs only).
 *
 * Reads: managers (area heads) and admins. Writes: super admins — except "Away until …"
 * (self, an area head for their members, a super admin), bulk reassign (a head for their own
 * members, a super admin) and a lead's area (a super admin, or a manager who can see the lead).
 */

const MAX_AREAS = 60;
const MAX_MEMBERS = 200;
const REROUTE_LIMIT = 2000;
const REASSIGN_LIMIT = 1000;
const NAME_MAX = 60;
const DAY_MS = 86_400_000;
/** Ids that collide with the routes under /api/crm/areas/ or the inbox filter values. */
const RESERVED_AREA_IDS = new Set(["merge", "setup-from-centre", "resolve", "unmatched", "reroute", "reassign", "people", "none", "tool-signups"]);
const AREA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const AREA_MESSAGES = {
  areaNotFound: "No such area.",
  aliasTaken: "Another area already uses that place name.",
  areaIdTaken: "An area with that id already exists.",
  inactiveArea: "That area is switched off.",
  peopleRequired: "Choose move or remove for every person in the area.",
} as const;

function isSuperAdmin(viewer: CrmViewer): boolean {
  return viewer.role === "admin" && viewer.superAdmin === true;
}

function canRead(viewer: CrmViewer): boolean {
  return viewer.role === "admin" || viewer.role === "manager";
}

/** Centre slugs Aspire publishes (src/content/centres.ts). */
export function knownCentreSlugs(): Set<string> {
  return new Set(centreContent.map((centre) => centre.slug));
}

// ---------------------------------------------------------------------------------------------
// Reads

function memberView(row: MemberRow, now: number): CrmAreaMember {
  return {
    userId: row.userId,
    displayName: row.displayName,
    crmRole: row.crmRole,
    centreSlug: row.centreSlug,
    takesLeads: row.crmRole === "manager" ? row.takesLeads : true,
    active: row.active,
    disabled: row.disabled,
    awayUntil: row.awayUntil !== null && row.awayUntil > now ? toIso(row.awayUntil) : null,
  };
}

/** Every area with its centres, aliases, people and coverage badges (A1). */
export function buildAreas(db: DatabaseSync, now: number): CrmArea[] {
  const rows = listAreaRows(db);
  const centres = listCentreAreas(db);
  const aliases = listAliasRows(db);
  const members = listMemberRows(db);
  const byArea = new Map<string, MemberRow[]>();
  for (const member of members) byArea.set(member.areaId, [...(byArea.get(member.areaId) ?? []), member]);
  const usable = (member: MemberRow) => member.active && !member.disabled;
  const coverage = (areaId: string) => {
    const people = byArea.get(areaId) ?? [];
    return {
      hasExecutive: people.some((member) => usable(member) && (member.crmRole === "counsellor" || member.takesLeads)),
      hasHead: people.some((member) => usable(member) && member.crmRole === "manager"),
    };
  };
  return rows.map((row): CrmArea => {
    const own = coverage(row.id);
    const serving = !own.hasExecutive || !own.hasHead ? servingAreaOf(db, row.id) : null;
    const servingCovers = serving ? coverage(serving.areaId) : null;
    return {
      id: row.id,
      nameEn: row.nameEn,
      nameHi: row.nameHi,
      kind: row.kind,
      defaultCentreSlug: row.defaultCentreSlug,
      active: row.active,
      mergedInto: row.mergedInto,
      position: row.position,
      centres: [...centres.entries()].filter(([, areaId]) => areaId === row.id).map(([slug]) => slug),
      aliases: aliases.filter((alias) => alias.areaId === row.id).map((alias): CrmAreaAlias => ({ key: alias.key, label: alias.label, kind: alias.kind })),
      members: (byArea.get(row.id) ?? []).map((member) => memberView(member, now)),
      coverage: {
        ...own,
        coveredBy: serving && servingCovers && (servingCovers.hasExecutive || servingCovers.hasHead) ? serving.areaId : null,
      },
    };
  });
}

/** GET /api/crm/areas — managers and admins (read-only for everyone but super admins). */
export function listAreas(viewer: CrmViewer, now: number = Date.now()): CrmResult<CrmArea[]> {
  if (!canRead(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  ensureAreasSeededForRead(db, now);
  return ok(buildAreas(db, now));
}

/** A CRM staff member as the people pickers list them (no login id, no contact data). */
export interface AreaPerson {
  userId: string;
  displayName: string;
  crmRole: CrmRole;
  active: boolean;
  disabled: boolean;
  areaIds: string[];
  awayUntil: string | null;
  /** Managers only: explicit `areas` scope (false = legacy "sees all their centres"). */
  areaScope: boolean;
}

/** Everything the "Areas & people" page shows (managers and admins; unmatched places are separate). */
export interface AreasPageData {
  areas: CrmArea[];
  people: AreaPerson[];
  routing: SettingEnvelope<RoutingSettings>;
  /** Area heads still on the legacy see-all scope (§13.5 review list). */
  legacyManagerIds: string[];
}

export function areasPageData(viewer: CrmViewer, now: number = Date.now()): CrmResult<AreasPageData> {
  if (!canRead(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  ensureAreasSeededForRead(db, now);
  const legacy = new Set(listLegacyScopeManagerIds(db));
  const memberships = new Map<string, string[]>();
  for (const member of listMemberRows(db)) memberships.set(member.userId, [...(memberships.get(member.userId) ?? []), member.areaId]);
  const people = listStaffRows(db).map((staff): AreaPerson => {
    const away = findAvailability(db, staff.userId);
    return {
      userId: staff.userId,
      displayName: staff.displayName,
      crmRole: staff.crmRole,
      active: staff.active,
      disabled: staff.disabled || staff.userRole !== "staff",
      areaIds: memberships.get(staff.userId) ?? [],
      awayUntil: away && away.awayUntil > now ? toIso(away.awayUntil) : null,
      areaScope: staff.crmRole === "manager" && !legacy.has(staff.userId),
    };
  });
  return ok({ areas: buildAreas(db, now), people, routing: getRoutingSettings(db), legacyManagerIds: [...legacy] });
}

/** GET /api/crm/areas/resolve — "Test a place name" (managers and admins). */
export function resolvePlace(viewer: CrmViewer, q: string, state: string | null, now: number = Date.now()): CrmResult<AreaResolution> {
  if (!canRead(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  ensureAreasSeededForRead(db, now);
  return ok(resolveDistrict(cleanText(q, PLACE_INPUT_MAX), cleanText(state, PLACE_INPUT_MAX), loadAliasIndex(db)));
}

// ---------------------------------------------------------------------------------------------
// Validation helpers

type FieldErrors = Record<string, string[]>;

function cleanName(value: unknown): string | null {
  const name = cleanText(value, NAME_MAX + 1);
  return name && name.length <= NAME_MAX ? name : null;
}

function validCentre(value: unknown, known: Set<string>): value is string {
  return typeof value === "string" && known.has(value);
}

function slugifyAreaId(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function superAdminOnly<T>(viewer: CrmViewer): CrmResult<T> | null {
  return isSuperAdmin(viewer) ? null : fail<T>("forbidden", CRM_MESSAGES.superAdminOnly);
}

function loadActiveArea(db: DatabaseSync, areaId: string): AreaRow | CrmResult<never> {
  const area = findAreaRow(db, areaId);
  if (!area) return fail("not_found", AREA_MESSAGES.areaNotFound);
  return area;
}

function isResult<T>(value: unknown): value is CrmResult<T> {
  return typeof value === "object" && value !== null && "ok" in value;
}

// ---------------------------------------------------------------------------------------------
// Create / edit areas (super admin)

export interface AreaCreateInput {
  id?: string;
  nameEn: string;
  nameHi: string;
  defaultCentreSlug?: string | null;
}

export function createArea(viewer: CrmViewer, input: AreaCreateInput, now: number = Date.now()): CrmResult<CrmArea> {
  const denied = superAdminOnly<CrmArea>(viewer);
  if (denied) return denied;
  const errors: FieldErrors = {};
  const nameEn = cleanName(input.nameEn);
  const nameHi = cleanName(input.nameHi);
  if (!nameEn) errors.nameEn = ["Enter the English name (1–60 characters)."];
  if (!nameHi) errors.nameHi = ["Enter the Hindi name (1–60 characters)."];
  const id = input.id?.trim() || (nameEn ? slugifyAreaId(nameEn) : "");
  if (!id || id.length > 48 || !AREA_ID.test(id) || RESERVED_AREA_IDS.has(id)) errors.id = ["Use lower-case letters, digits and hyphens."];
  const centre = input.defaultCentreSlug ?? null;
  if (centre !== null && !validCentre(centre, knownCentreSlugs())) errors.defaultCentreSlug = ["Choose a centre from the list."];
  if (Object.keys(errors).length > 0) return fail("validation", CRM_MESSAGES.validation, errors);
  const db = getDb();
  const result = withTransaction(db, (): CrmResult<CrmArea> => {
    ensureAreasSeeded(db, now);
    if (countAreas(db) >= MAX_AREAS) return fail("validation", CRM_MESSAGES.validation, { id: [`At most ${MAX_AREAS} areas.`] });
    const inserted = insertArea(db, {
      id,
      nameEn: nameEn as string,
      nameHi: nameHi as string,
      kind: "custom",
      defaultCentreSlug: centre,
      position: nextAreaPosition(db),
      actorId: viewer.userId,
      now,
    });
    if (!inserted) return fail("conflict", AREA_MESSAGES.areaIdTaken);
    // Its names become aliases too, so families typing them are routed here.
    for (const label of [nameEn as string, nameHi as string]) {
      const key = normaliseAlias(label);
      if (key && !findAlias(db, key)) insertAlias(db, { key, areaId: id, label, kind: label === nameEn ? "district" : "hindi", actorId: viewer.userId, now });
    }
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.areaCreate, target: id, details: { kind: "custom", centre }, now });
    const area = buildAreas(db, now).find((item) => item.id === id);
    return area ? ok(area) : fail("not_found", AREA_MESSAGES.areaNotFound);
  });
  invalidateAliasIndex(db);
  return result;
}

export interface AreaPatchInput {
  nameEn?: string;
  nameHi?: string;
  defaultCentreSlug?: string | null;
  centres?: string[];
  active?: boolean;
  position?: number;
}

/** PATCH /api/crm/areas/:areaId — rename, serving centre, centres (moved from other areas), on/off, order. */
export function updateArea(viewer: CrmViewer, areaId: string, patch: AreaPatchInput, now: number = Date.now()): CrmResult<CrmArea> {
  const denied = superAdminOnly<CrmArea>(viewer);
  if (denied) return denied;
  const errors: FieldErrors = {};
  const known = knownCentreSlugs();
  const nameEn = patch.nameEn === undefined ? undefined : cleanName(patch.nameEn);
  const nameHi = patch.nameHi === undefined ? undefined : cleanName(patch.nameHi);
  if (nameEn === null) errors.nameEn = ["Enter the English name (1–60 characters)."];
  if (nameHi === null) errors.nameHi = ["Enter the Hindi name (1–60 characters)."];
  if (patch.defaultCentreSlug !== undefined && patch.defaultCentreSlug !== null && !validCentre(patch.defaultCentreSlug, known)) {
    errors.defaultCentreSlug = ["Choose a centre from the list."];
  }
  const centres = patch.centres === undefined ? undefined : [...new Set(patch.centres)];
  if (centres && !centres.every((slug) => validCentre(slug, known))) errors.centres = ["Choose centres from the list."];
  if (patch.position !== undefined && (!Number.isInteger(patch.position) || patch.position < 0 || patch.position > 1000)) errors.position = ["Use 0–1000."];
  if (Object.keys(errors).length > 0) return fail("validation", CRM_MESSAGES.validation, errors);
  const db = getDb();
  const result = withTransaction(db, (): CrmResult<CrmArea> => {
    ensureAreasSeeded(db, now);
    const area = loadActiveArea(db, areaId);
    if (isResult<never>(area)) return area;
    if (patch.active === true && area.mergedInto !== null) return fail("conflict", AREA_MESSAGES.inactiveArea);
    updateAreaRow(
      db,
      area.id,
      {
        ...(nameEn ? { nameEn } : {}),
        ...(nameHi ? { nameHi } : {}),
        ...(patch.defaultCentreSlug !== undefined ? { defaultCentreSlug: patch.defaultCentreSlug } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
      },
      now,
    );
    let moved = 0;
    if (centres) {
      const before = listCentreAreas(db);
      moved = centres.filter((slug) => before.has(slug) && before.get(slug) !== area.id).length;
      setAreaCentres(db, area.id, centres, now);
    }
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.areaUpdate,
      target: area.id,
      details: {
        renamed: nameEn !== undefined || nameHi !== undefined,
        centre: patch.defaultCentreSlug === undefined ? null : patch.defaultCentreSlug,
        centres: centres ? centres.join(",") : null,
        movedCentres: moved,
        active: patch.active ?? null,
      },
      now,
    });
    const updated = buildAreas(db, now).find((item) => item.id === area.id);
    return updated ? ok(updated) : fail("not_found", AREA_MESSAGES.areaNotFound);
  });
  invalidateAliasIndex(db);
  return result;
}

// ---------------------------------------------------------------------------------------------
// People (super admin)

export interface AreaMemberInput {
  userId: string;
  centreSlug?: string | null;
  takesLeads?: boolean;
}

/** Replaces an area's people. Managers added here get the explicit `areas` scope (H2). */
export function setAreaMembers(viewer: CrmViewer, areaId: string, members: AreaMemberInput[], now: number = Date.now()): CrmResult<CrmArea> {
  const denied = superAdminOnly<CrmArea>(viewer);
  if (denied) return denied;
  if (members.length > MAX_MEMBERS) return fail("validation", CRM_MESSAGES.validation, { members: [`At most ${MAX_MEMBERS} people.`] });
  const known = knownCentreSlugs();
  const db = getDb();
  return withTransaction(db, (): CrmResult<CrmArea> => {
    ensureAreasSeeded(db, now);
    const area = loadActiveArea(db, areaId);
    if (isResult<never>(area)) return area;
    if (!area.active) return fail("conflict", AREA_MESSAGES.inactiveArea);
    const wanted = new Map<string, { centreSlug: string | null; takesLeads: boolean; role: CrmRole }>();
    for (const member of members) {
      const staff = findStaff(db, member.userId);
      if (!staff || staff.userRole !== "staff") return fail("validation", CRM_MESSAGES.validation, { members: [CRM_MESSAGES.notStaff] });
      const centre = member.centreSlug ?? null;
      if (centre !== null && !validCentre(centre, known)) return fail("validation", CRM_MESSAGES.validation, { members: ["Choose centres from the list."] });
      wanted.set(member.userId, { centreSlug: centre, takesLeads: staff.crmRole === "manager" && member.takesLeads === true, role: staff.crmRole });
    }
    const before = listAreaMemberRows(db, area.id);
    let removed = 0;
    for (const row of before) if (!wanted.has(row.userId) && deleteMember(db, area.id, row.userId)) removed += 1;
    for (const [userId, member] of wanted) {
      upsertMember(db, { areaId: area.id, userId, centreSlug: member.centreSlug, takesLeads: member.takesLeads, actorId: viewer.userId, now });
      if (member.role === "manager") setScopeMode(db, { userId, mode: "areas", actorId: viewer.userId, now });
    }
    const roles = [...wanted.values()];
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.areaMembers,
      target: area.id,
      details: {
        via: "area",
        heads: roles.filter((member) => member.role === "manager").length,
        executives: roles.filter((member) => member.role === "counsellor").length,
        removed,
      },
      now,
    });
    const updated = buildAreas(db, now).find((item) => item.id === area.id);
    return updated ? ok(updated) : fail("not_found", AREA_MESSAGES.areaNotFound);
  });
}

/** PUT /api/crm/areas/people/:userId — one person's areas (also "Switch to areas" for a legacy head). */
export function setPersonAreas(viewer: CrmViewer, userId: string, areaIds: string[], now: number = Date.now()): CrmResult<AreaPerson> {
  const denied = superAdminOnly<AreaPerson>(viewer);
  if (denied) return denied;
  const db = getDb();
  return withTransaction(db, (): CrmResult<AreaPerson> => {
    const result = setUserAreas(db, userId, areaIds, { actorId: viewer.userId, now });
    if (!result.ok) {
      if (result.error === "not_staff") return fail("not_found", CRM_MESSAGES.notStaff);
      return fail("validation", CRM_MESSAGES.validation, { areaIds: [result.error === "unknown_area" ? AREA_MESSAGES.areaNotFound : AREA_MESSAGES.inactiveArea] });
    }
    const staff = findStaff(db, userId);
    if (!staff) return fail("not_found", CRM_MESSAGES.notStaff);
    const away = findAvailability(db, userId);
    return ok({
      userId,
      displayName: staff.displayName,
      crmRole: staff.crmRole,
      active: staff.active,
      disabled: staff.disabled,
      areaIds: listMemberAreaIds(db, userId),
      awayUntil: away && away.awayUntil > now ? toIso(away.awayUntil) : null,
      areaScope: staff.crmRole === "manager",
    });
  });
}

export interface SetupFromCentreInput {
  centreSlug: string;
  headIds: string[];
  executiveIds: string[];
  headsTakeCalls: boolean;
}

/**
 * "Set up from centre" (A1): the heads and executives join the centre's own area AND every area
 * whose serving centre is this centre, in one step. Executives are tied to the centre. Additive:
 * nobody is removed. Managers get the explicit `areas` scope.
 */
export function setupFromCentre(
  viewer: CrmViewer,
  input: SetupFromCentreInput,
  now: number = Date.now(),
): CrmResult<{ areaIds: string[]; heads: number; executives: number }> {
  const denied = superAdminOnly<{ areaIds: string[]; heads: number; executives: number }>(viewer);
  if (denied) return denied;
  if (!validCentre(input.centreSlug, knownCentreSlugs())) return fail("validation", CRM_MESSAGES.validation, { centreSlug: ["Choose a centre from the list."] });
  const headIds = [...new Set(input.headIds)];
  const executiveIds = [...new Set(input.executiveIds)];
  if (headIds.length + executiveIds.length === 0) return fail("validation", CRM_MESSAGES.validation, { executiveIds: ["Choose at least one person."] });
  if (headIds.length + executiveIds.length > MAX_MEMBERS) return fail("validation", CRM_MESSAGES.validation, { executiveIds: [`At most ${MAX_MEMBERS} people.`] });
  if (headIds.some((id) => executiveIds.includes(id))) return fail("validation", CRM_MESSAGES.validation, { headIds: ["A person is either a head or an executive."] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ areaIds: string[]; heads: number; executives: number }> => {
    ensureAreasSeeded(db, now);
    for (const [ids, role] of [
      [headIds, "manager"],
      [executiveIds, "counsellor"],
    ] as const) {
      for (const id of ids) {
        const staff = findStaff(db, id);
        if (!staff || staff.userRole !== "staff") return fail("validation", CRM_MESSAGES.validation, { [role === "manager" ? "headIds" : "executiveIds"]: [CRM_MESSAGES.notStaff] });
        if (staff.crmRole !== role) {
          return fail("validation", CRM_MESSAGES.validation, {
            [role === "manager" ? "headIds" : "executiveIds"]: [role === "manager" ? "Area heads must have the manager role." : "Executives must have the counsellor role."],
          });
        }
      }
    }
    const centreArea = listCentreAreas(db).get(input.centreSlug) ?? null;
    const areas = listAreaRows(db).filter(
      (area) => area.active && (area.id === centreArea || area.defaultCentreSlug === input.centreSlug),
    );
    if (areas.length === 0) return fail("validation", CRM_MESSAGES.validation, { centreSlug: ["This centre is not in any area yet."] });
    for (const area of areas) {
      for (const id of headIds) upsertMember(db, { areaId: area.id, userId: id, centreSlug: findMember(db, area.id, id)?.centreSlug ?? null, takesLeads: input.headsTakeCalls, actorId: viewer.userId, now });
      for (const id of executiveIds) upsertMember(db, { areaId: area.id, userId: id, centreSlug: input.centreSlug, takesLeads: false, actorId: viewer.userId, now });
    }
    for (const id of headIds) setScopeMode(db, { userId: id, mode: "areas", actorId: viewer.userId, now });
    const areaIds = areas.map((area) => area.id);
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.areaSetupFromCentre,
      target: input.centreSlug,
      details: { areas: areaIds.join(","), heads: headIds.length, executives: executiveIds.length, headsTakeCalls: input.headsTakeCalls },
      now,
    });
    return ok({ areaIds, heads: headIds.length, executives: executiveIds.length });
  });
}

// ---------------------------------------------------------------------------------------------
// Aliases (super admin)

export interface AliasInput {
  label: string;
  kind: AliasKind;
  /** "Map to district" from Unmatched places: the open leads stored under this key move here. */
  placeKey?: string | null;
}

/**
 * Adds a place name to an area. The key must be free (409 otherwise). Open leads with no area
 * whose stored place key is `placeKey` (or the new key) are routed to the area and, when nobody
 * has them, assigned (§13.6 "Map to district"). Never moved: a deliberate "No area"; a family
 * outside Himachal (`outside_hp`) unless the alias is a `border` one or the super admin mapped
 * that very unmatched place (`placeKey`), as the resolver would also refuse it.
 */
export function addAreaAlias(
  viewer: CrmViewer,
  areaId: string,
  input: AliasInput,
  now: number = Date.now(),
): CrmResult<{ alias: CrmAreaAlias; rerouted: number; assigned: number }> {
  const denied = superAdminOnly<{ alias: CrmAreaAlias; rerouted: number; assigned: number }>(viewer);
  if (denied) return denied;
  const label = cleanText(input.label, PLACE_INPUT_MAX);
  const key = label ? normaliseAlias(label) : "";
  const errors: FieldErrors = {};
  if (!label || !key) errors.label = ["Enter a place name."];
  if (!(ALIAS_KINDS as readonly string[]).includes(input.kind)) errors.kind = ["Choose a kind."];
  const placeKey = input.placeKey ? cleanText(input.placeKey, PLACE_INPUT_MAX) : null;
  if (Object.keys(errors).length > 0) return fail("validation", CRM_MESSAGES.validation, errors);
  const db = getDb();
  const result = withTransaction(db, (): CrmResult<{ alias: CrmAreaAlias; rerouted: number; assigned: number }> => {
    ensureAreasSeeded(db, now);
    const area = loadActiveArea(db, areaId);
    if (isResult<never>(area)) return area;
    if (!area.active) return fail("conflict", AREA_MESSAGES.inactiveArea);
    const existing = findAlias(db, key);
    if (existing && existing.areaId !== area.id) return fail("conflict", AREA_MESSAGES.aliasTaken);
    if (!existing) insertAlias(db, { key, areaId: area.id, label: label as string, kind: input.kind, actorId: viewer.userId, now });
    invalidateAliasIndex(db);
    // An alias that already existed keeps its kind (re-adding "Bilaspur" as `border` changes nothing).
    const kind = existing?.kind ?? input.kind;
    let rerouted = 0;
    let assigned = 0;
    const keys = [...new Set([key, ...(placeKey ? [placeKey] : [])])];
    for (const leadKey of keys) {
      for (const lead of openLeadsByPlaceKey(db, leadKey)) {
        const routing = findLeadRouting(db, lead.id);
        if (!routing || routing.areaId !== null || routing.routedBy !== null) continue;
        if (routing.outcome === "outside_hp" && kind !== "border" && leadKey !== placeKey) continue;
        upsertLeadRouting(db, { ...routing, areaId: area.id, match: kind, outcome: "area", routedAt: now, routedBy: viewer.userId });
        rerouted += 1;
        if (lead.assignedTo === null && assignFresh(db, { ...lead, areaId: area.id }, now)) assigned += 1;
      }
    }
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.areaAlias,
      target: area.id,
      details: { op: "add", kind, created: !existing, rerouted, assigned },
      now,
    });
    return ok({ alias: { key, label: existing?.label ?? (label as string), kind }, rerouted, assigned });
  });
  invalidateAliasIndex(db);
  return result;
}

function openLeadsByPlaceKey(db: DatabaseSync, key: string): LeadRow[] {
  return listOpenLeadsByPlaceKey(db, key, REROUTE_LIMIT)
    .map((id) => findLeadById(db, id))
    .filter((lead): lead is LeadRow => lead !== null);
}

export function removeAreaAlias(viewer: CrmViewer, areaId: string, key: string, now: number = Date.now()): CrmResult<{ removed: boolean }> {
  const denied = superAdminOnly<{ removed: boolean }>(viewer);
  if (denied) return denied;
  const db = getDb();
  const result = withTransaction(db, (): CrmResult<{ removed: boolean }> => {
    const area = loadActiveArea(db, areaId);
    if (isResult<never>(area)) return area;
    const removed = deleteAlias(db, area.id, key.slice(0, PLACE_INPUT_MAX));
    if (!removed) return fail("not_found", "No such place name in this area.");
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.areaAlias, target: area.id, details: { op: "remove" }, now });
    return ok({ removed });
  });
  invalidateAliasIndex(db);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Merge (super admin; L5)

export interface MergeInput {
  from: string;
  into: string;
  people: { userId: string; action: "move" | "remove" }[];
}

/**
 * Merge A into B: aliases, centres and lead routing move to B; A is switched off with
 * `merged_into = B`; each person in A is moved to B or removed, as chosen (every one must be).
 */
export function mergeAreas(viewer: CrmViewer, input: MergeInput, now: number = Date.now()): CrmResult<CrmArea> {
  const denied = superAdminOnly<CrmArea>(viewer);
  if (denied) return denied;
  if (input.from === input.into) return fail("validation", CRM_MESSAGES.validation, { into: ["Choose two different areas."] });
  const db = getDb();
  const result = withTransaction(db, (): CrmResult<CrmArea> => {
    ensureAreasSeeded(db, now);
    const from = findAreaRow(db, input.from);
    const into = findAreaRow(db, input.into);
    if (!from || !into) return fail("not_found", AREA_MESSAGES.areaNotFound);
    if (!from.active || !into.active) return fail("conflict", AREA_MESSAGES.inactiveArea);
    const choices = new Map(input.people.map((person) => [person.userId, person.action]));
    const members = listAreaMemberRows(db, from.id);
    if (members.some((member) => !choices.has(member.userId))) return fail("validation", CRM_MESSAGES.validation, { people: [AREA_MESSAGES.peopleRequired] });
    let moved = 0;
    let removed = 0;
    for (const member of members) {
      if (choices.get(member.userId) === "move") {
        const there = findMember(db, into.id, member.userId);
        upsertMember(db, {
          areaId: into.id,
          userId: member.userId,
          centreSlug: there ? there.centreSlug : member.centreSlug,
          takesLeads: there ? there.takesLeads || member.takesLeads : member.takesLeads,
          actorId: viewer.userId,
          now,
        });
        moved += 1;
      } else {
        removed += 1;
      }
      deleteMember(db, from.id, member.userId);
    }
    const aliases = moveAliases(db, from.id, into.id);
    const centres = moveCentres(db, from.id, into.id);
    const leads = moveRoutingRows(db, from.id, into.id);
    updateAreaRow(db, from.id, { active: false, mergedInto: into.id }, now);
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.areaMerge,
      target: from.id,
      details: { into: into.id, moved, removed, aliases, centres, leads },
      now,
    });
    const area = buildAreas(db, now).find((item) => item.id === into.id);
    return area ? ok(area) : fail("not_found", AREA_MESSAGES.areaNotFound);
  });
  invalidateAliasIndex(db);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Re-route, reassign, availability, a lead's area

/** Assigns an unassigned open lead (§13.4 step 2) when someone is free. */
function assignFresh(db: DatabaseSync, lead: LeadRow, now: number): boolean {
  const routing: RoutingResult = { areaId: lead.areaId, outcome: lead.areaId ? "area" : "empty", match: null };
  const picked = pickForLead(db, lead, routing, now);
  if (!picked) return false;
  return recordAssignment(db, lead.id, null, picked.userId, { via: picked.via, actorId: null, now });
}

/**
 * "Re-route open unassigned leads" (§13.6): open leads with no area are resolved again from the
 * stored place (and centre); open leads with nobody are assigned when someone is free. Tool
 * sign-ups with no area stay in their list. A deliberate "No area" (`routed_by` set) is never
 * re-resolved, and a place stored as `outside_hp` (its state is not kept) only matches `border`
 * aliases, as on arrival. Audited with counts.
 */
export function rerouteOpenLeads(viewer: CrmViewer, now: number = Date.now()): CrmResult<{ checked: number; routed: number; assigned: number }> {
  const denied = superAdminOnly<{ checked: number; routed: number; assigned: number }>(viewer);
  if (denied) return denied;
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ checked: number; routed: number; assigned: number }> => {
    ensureAreasSeeded(db, now);
    const index = loadAliasIndex(db);
    const ids = listRerouteCandidates(db, REROUTE_LIMIT, routingMode(db) === "areas");
    let routed = 0;
    let assigned = 0;
    for (const id of ids) {
      let lead = findLeadById(db, id);
      if (!lead) continue;
      const routing = findLeadRouting(db, id);
      const manualNoArea = routing !== null && routing.areaId === null && routing.routedBy !== null;
      if (lead.areaId === null && !manualNoArea) {
        const fresh = computeRouting(
          db,
          { centreSlug: lead.centreSlug, districtInput: routing?.placeInput ?? null, stateInput: null, outside: routing?.outcome === "outside_hp" },
          index,
        );
        if (fresh.areaId) {
          upsertLeadRouting(db, {
            leadId: id,
            areaId: fresh.areaId,
            match: fresh.match,
            outcome: "area",
            placeInput: routing?.placeInput ?? null,
            placeKey: routing?.placeKey ?? fresh.key,
            gateOnly: routing?.gateOnly ?? false,
            routedAt: now,
            routedBy: viewer.userId,
          });
          routed += 1;
          lead = findLeadById(db, id) ?? lead;
        }
      }
      if (lead.assignedTo === null && assignFresh(db, lead, now)) assigned += 1;
    }
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.areaReroute, target: null, details: { checked: ids.length, routed, assigned }, now });
    return ok({ checked: ids.length, routed, assigned });
  });
}

/** Whether `viewer` (an area head) answers for `targetId`: they share one of the head's areas. */
function headOf(db: DatabaseSync, viewer: CrmViewer, targetId: string): boolean {
  if (viewer.role !== "manager") return false;
  const theirs = new Set(viewer.areaScope?.areaIds ?? listMemberAreaIds(db, viewer.userId));
  return listMemberAreaIds(db, targetId).some((areaId) => theirs.has(areaId));
}

export interface ReassignInput {
  fromUserId: string;
  scope: ReassignScope;
  toUserId?: string | null;
}

/**
 * "Reassign uncalled leads of X" (A5): a super admin for anyone; an area head only for members of
 * their areas and only leads they can see. Each lead is re-picked (§13.4, never X) or handed to
 * `toUserId`; when nobody is free it moves to its area's queue. Audited with counts.
 */
export function reassignLeads(viewer: CrmViewer, input: ReassignInput, now: number = Date.now()): CrmResult<{ moved: number; unassigned: number }> {
  const sa = isSuperAdmin(viewer);
  if (!sa && viewer.role !== "manager") return fail("forbidden", CRM_MESSAGES.forbidden);
  const to = input.toUserId ?? null;
  if (to !== null && to === input.fromUserId) return fail("validation", CRM_MESSAGES.validation, { toUserId: ["Choose someone else."] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ moved: number; unassigned: number }> => {
    if (!findStaff(db, input.fromUserId)) return fail("not_found", CRM_MESSAGES.userNotFound);
    if (!sa && !headOf(db, viewer, input.fromUserId)) return fail("forbidden", CRM_MESSAGES.forbidden);
    if (to !== null) {
      const target = findStaff(db, to);
      if (!target || !target.active || target.disabled || target.userRole !== "staff") {
        return fail("validation", CRM_MESSAGES.validation, { toUserId: ["Choose an active staff member."] });
      }
      if (!sa && !headOf(db, viewer, to) && to !== viewer.userId) return fail("forbidden", CRM_MESSAGES.forbidden);
    }
    let moved = 0;
    let unassigned = 0;
    for (const id of listAssignedLeadIds(db, input.fromUserId, input.scope, REASSIGN_LIMIT)) {
      const lead = findLeadById(db, id);
      if (!lead || lead.assignedTo !== input.fromUserId) continue;
      if (!sa && !canSeeLead(viewer, lead)) continue;
      let next: string | null = to;
      if (next === null) {
        const routing: RoutingResult = { areaId: lead.areaId, outcome: lead.areaId ? "area" : "empty", match: null };
        next = pickForLead(db, lead, routing, now, { exclude: [input.fromUserId] })?.userId ?? null;
      }
      recordAssignment(db, lead.id, input.fromUserId, next, { via: "bulk", actorId: viewer.userId, now });
      if (next === null) unassigned += 1;
      else moved += 1;
    }
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.bulkReassign,
      target: input.fromUserId,
      details: { scope: input.scope, moved, unassigned, chosen: to !== null },
      now,
    });
    return ok({ moved, unassigned });
  });
}

export interface AvailabilityInput {
  userId: string;
  awayUntil: string | null;
  note?: string | null;
}

/** "Away until …" (A5): self, an area head for their members, a super admin. At most 60 days ahead. */
export function setStaffAvailability(viewer: CrmViewer, input: AvailabilityInput, now: number = Date.now()): CrmResult<StaffAvailability> {
  const db = getDb();
  if (!canSetAvailability(db, viewer, input.userId)) return fail("forbidden", CRM_MESSAGES.forbidden);
  let awayUntil: number | null = null;
  if (input.awayUntil !== null) {
    const ms = Date.parse(input.awayUntil);
    // The day picker sends 00:00 IST of the day they are back: allow that day itself.
    if (!Number.isFinite(ms) || ms <= now || ms > now + (AVAILABILITY_MAX_DAYS + 1) * DAY_MS) {
      return fail("validation", CRM_MESSAGES.validation, { awayUntil: [`Choose a day within the next ${AVAILABILITY_MAX_DAYS} days.`] });
    }
    awayUntil = ms;
  }
  const note = awayUntil === null ? null : cleanText(input.note, AVAILABILITY_NOTE_MAX);
  return withTransaction(db, (): CrmResult<StaffAvailability> => {
    const staff = findStaff(db, input.userId);
    if (!staff || staff.userRole !== "staff") return fail("not_found", CRM_MESSAGES.notStaff);
    writeAvailability(db, { userId: input.userId, awayUntil, note, actorId: viewer.userId, now });
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.availability,
      target: input.userId,
      details: { away: awayUntil !== null, days: awayUntil === null ? 0 : Math.ceil((awayUntil - now) / DAY_MS), self: input.userId === viewer.userId },
      now,
    });
    return ok({ userId: input.userId, awayUntil: toIso(awayUntil), note });
  });
}

/**
 * "Change area" on a lead (§13.7): a super admin, or a manager who can see the lead. When the lead
 * is open and its executive does not serve the new area, someone there is picked (or it waits in
 * that area's queue). Audited `crm.lead_reroute` (area ids only).
 */
export function changeLeadArea(
  viewer: CrmViewer,
  leadId: string,
  areaId: string | null,
  now: number = Date.now(),
): CrmResult<{ leadId: string; areaId: string | null; assigneeId: string | null }> {
  const sa = isSuperAdmin(viewer);
  if (!sa && viewer.role !== "manager") return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ leadId: string; areaId: string | null; assigneeId: string | null }> => {
    ensureAreasSeeded(db, now);
    const lead = findLeadById(db, leadId);
    if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);
    if (areaId !== null) {
      const area = findAreaRow(db, areaId);
      if (!area) return fail("validation", CRM_MESSAGES.validation, { areaId: [AREA_MESSAGES.areaNotFound] });
      if (!area.active) return fail("validation", CRM_MESSAGES.validation, { areaId: [AREA_MESSAGES.inactiveArea] });
    }
    const before = findLeadRouting(db, lead.id);
    const fromArea = before?.areaId ?? null;
    upsertLeadRouting(db, {
      leadId: lead.id,
      areaId,
      match: areaId ? "manual" : null,
      outcome: areaId ? "area" : before && before.outcome !== "area" ? before.outcome : "unknown",
      placeInput: before?.placeInput ?? null,
      placeKey: before?.placeKey ?? null,
      gateOnly: before?.gateOnly ?? false,
      routedAt: now,
      routedBy: viewer.userId,
    });
    let assigneeId = lead.assignedTo;
    const open = lead.stage !== "enrolled" && lead.stage !== "lost";
    if (open && areaId !== null) {
      const keeps = assigneeId !== null && assignable(db, assigneeId, { now, kind: "repeat", firstEnquiry: false, areaId }) && servesArea(db, assigneeId, areaId, now);
      if (!keeps) {
        const routing: RoutingResult = { areaId, outcome: "area", match: "manual" };
        const picked = pickForLead(db, { ...lead, areaId }, routing, now, { exclude: assigneeId ? [assigneeId] : [] });
        const next = picked?.userId ?? null;
        recordAssignment(db, lead.id, assigneeId, next, { via: picked?.via ?? "area_change", actorId: viewer.userId, now });
        assigneeId = next;
      }
    }
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.leadReroute,
      target: lead.id,
      details: { from: fromArea, to: areaId, reassigned: assigneeId !== lead.assignedTo },
      now,
    });
    return ok({ leadId: lead.id, areaId, assigneeId });
  });
}

// ---------------------------------------------------------------------------------------------
// Routing mode (§12 `routing`)

export function getRoutingMode(viewer: CrmViewer): CrmResult<SettingEnvelope<RoutingSettings>> {
  if (!canRead(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  return ok(getRoutingSettings(getDb()));
}

/** Super admin; optimistic lock (`expectedVersion`, 409 on a stale page). Audited by `writeSetting`. */
export function setRoutingMode(viewer: CrmViewer, mode: RoutingMode, expectedVersion: number, now: number = Date.now()): CrmResult<SettingEnvelope<RoutingSettings>> {
  const denied = superAdminOnly<SettingEnvelope<RoutingSettings>>(viewer);
  if (denied) return denied;
  if (!(ROUTING_MODES as readonly string[]).includes(mode)) return fail("validation", CRM_MESSAGES.validation, { mode: ["Choose areas or legacy."] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<SettingEnvelope<RoutingSettings>> => {
    const written = writeSetting<RoutingSettings>(db, "routing", { mode }, { expectedVersion, actorId: viewer.userId, now });
    if (!written.ok) return fail("conflict", "Someone changed this setting meanwhile. Reload and try again.");
    return ok(written.envelope);
  });
}
