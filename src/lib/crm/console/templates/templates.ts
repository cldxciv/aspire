import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, ok } from "../../access";
import type { SettingEnvelope } from "../../lead-ops-types";
import { toIso } from "../../pure";
import {
  findTemplateRow,
  listTemplateRows,
  updateTemplateBody,
  updateTemplateStatus,
  type TemplateBodyColumn,
  type TemplateRow,
} from "../../repo/console-templates";
import { readSetting, writeSetting } from "../../settings";
import { crmPermissions, type CrmResult, type CrmViewer } from "../../types";
import { CONSOLE_AUDIT, consoleAudit } from "../audit";
import { validateHttpsUrl } from "../centre-links";
import {
  consolePermissions,
  CONSOLE_URL_MAX,
  TEMPLATE_KEY_PATTERN,
  TEMPLATE_LANGS,
  TEMPLATE_STATUSES,
  type TemplateLang,
  type TemplateStatus,
  type WaLinksSetting,
  type WaTemplate,
} from "../types";
import { templateBodyIssues } from "./fill";
import { ensureTemplatesSeeded } from "./seed";

/**
 * Staff WhatsApp templates (docs/admin-phase-1b-plan.md §5.D, O4, O5, D-080; owner: 1B-CALLS).
 * - Everyone in the CRM reads the APPROVED templates of a context (the composer offers only those).
 * - `all`: every template with its status, for area heads, admins and super admins (the page).
 * - Super admins edit (one language at a time), approve / retire / send back to draft and set the
 *   prospectus link (`crm_settings.wa_links`). Editing an approved template sends it back to draft.
 * Every write uses the optimistic `version`; audits hold the key, language, status and version only.
 */

export const TEMPLATE_MESSAGES = {
  notFound: "No such template.",
  versionConflict: "Someone else changed this template. Reload the page and try again.",
  linksConflict: "Someone else changed the prospectus link. Reload the page and try again.",
  empty: "Write the message.",
  tooLong: "At most 700 characters.",
  unknownSlot: "Use only the slots listed on the page.",
  edgeSlot: "Start and end the message with words, not a slot.",
  sameStatus: "The template already has this status.",
  invalidUrl: `Paste an https link of at most ${CONSOLE_URL_MAX} characters.`,
  forbidden: "Only area heads and admins can see every template.",
} as const;

export const BODY_COLUMN: Readonly<Record<TemplateLang, TemplateBodyColumn>> = { en: "body_en", hi: "body_hi", hinglish: "body_hinglish" };

export function toWaTemplate(row: TemplateRow): WaTemplate {
  return {
    key: row.key,
    context: row.context,
    position: row.position,
    status: row.status,
    bodies: { en: row.bodyEn, hi: row.bodyHi, hinglish: row.bodyHinglish },
    version: row.version,
    seeded: row.seeded,
    approvedAt: toIso(row.approvedAt),
    // The approver's display name for "Approved on 23 Oct by …" (never a login id).
    approvedBy: row.approvedBy ? (row.approvedByName ?? null) : null,
    updatedAt: toIso(row.updatedAt),
  };
}

function isSuperAdmin(viewer: CrmViewer): boolean {
  return viewer.role === "admin" && viewer.superAdmin === true;
}

/**
 * GET /api/crm/templates: the approved templates of `context` (default `general`) for everyone;
 * with `all`, every template of every context and status (area heads, admins, super admins only).
 * Seeds missing drafts first (`ensureTemplatesSeeded`).
 */
export function listTemplates(
  viewer: CrmViewer,
  query: { context?: string | null; all?: boolean },
  now: number = Date.now(),
  db: DatabaseSync = getDb(),
): CrmResult<WaTemplate[]> {
  if (query.all) {
    if (!consolePermissions(viewer, crmPermissions(viewer)).canViewTemplateAdmin) return fail("forbidden", TEMPLATE_MESSAGES.forbidden);
    ensureTemplatesSeeded(db, now);
    return ok(listTemplateRows(db).map(toWaTemplate));
  }
  ensureTemplatesSeeded(db, now);
  const context = typeof query.context === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(query.context) ? query.context : "general";
  return ok(listTemplateRows(db, { context, status: "approved" }).map(toWaTemplate));
}

/** An approved template by key (the outcome service refuses any other), or null. */
export function findApprovedTemplate(db: DatabaseSync, key: string): WaTemplate | null {
  const row = TEMPLATE_KEY_PATTERN.test(key) ? findTemplateRow(db, key) : null;
  return row && row.status === "approved" ? toWaTemplate(row) : null;
}

/** Field errors for one body, or null when it is fine. */
export function bodyFieldErrors(body: string): Record<string, string[]> | null {
  const { issues } = templateBodyIssues(body);
  if (issues.length === 0) return null;
  const messages = issues.map((issue) => TEMPLATE_MESSAGES[issue]);
  return { body: messages };
}

/**
 * PUT /api/crm/templates/[key] `{ lang, body, expectedVersion }` (super admins). Saves one language;
 * an approved template goes back to `draft` (staff cannot use it until it is approved again).
 * Audited `settings.template_update { key, lang, version }`.
 */
export function editTemplate(
  viewer: CrmViewer,
  key: string,
  input: { lang: TemplateLang; body: string; expectedVersion: number },
  now: number = Date.now(),
): CrmResult<WaTemplate> {
  if (!isSuperAdmin(viewer)) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  if (!(TEMPLATE_LANGS as readonly string[]).includes(input.lang)) return fail("validation", CRM_MESSAGES.validation, { lang: ["Choose English, Hindi or Hinglish."] });
  const body = input.body.trim();
  const errors = bodyFieldErrors(body);
  if (errors) return fail("validation", CRM_MESSAGES.validation, errors);
  const db = getDb();
  return withTransaction(db, (): CrmResult<WaTemplate> => {
    const row = TEMPLATE_KEY_PATTERN.test(key) ? findTemplateRow(db, key) : null;
    if (!row) return fail("not_found", TEMPLATE_MESSAGES.notFound);
    const updated = updateTemplateBody(db, {
      key,
      column: BODY_COLUMN[input.lang],
      body,
      expectedVersion: input.expectedVersion,
      toDraft: row.status === "approved",
      actorId: viewer.userId,
      now,
    });
    if (!updated) return fail("conflict", TEMPLATE_MESSAGES.versionConflict);
    const fresh = findTemplateRow(db, key);
    if (!fresh) return fail("not_found", TEMPLATE_MESSAGES.notFound);
    consoleAudit(db, {
      actorId: viewer.userId,
      action: CONSOLE_AUDIT.templateUpdate,
      target: key,
      details: { key, lang: input.lang, version: fresh.version },
      now,
    });
    return ok(toWaTemplate(fresh));
  });
}

/**
 * POST /api/crm/templates/[key]/status `{ status, expectedVersion }` (super admins): Approve,
 * Retire, Back to draft. Audited `settings.template_status { key, status }`.
 */
export function setTemplateStatus(
  viewer: CrmViewer,
  key: string,
  input: { status: TemplateStatus; expectedVersion: number },
  now: number = Date.now(),
): CrmResult<WaTemplate> {
  if (!isSuperAdmin(viewer)) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  if (!(TEMPLATE_STATUSES as readonly string[]).includes(input.status)) return fail("validation", CRM_MESSAGES.validation, { status: ["Choose a status."] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<WaTemplate> => {
    const row = TEMPLATE_KEY_PATTERN.test(key) ? findTemplateRow(db, key) : null;
    if (!row) return fail("not_found", TEMPLATE_MESSAGES.notFound);
    if (row.version !== input.expectedVersion) return fail("conflict", TEMPLATE_MESSAGES.versionConflict);
    if (row.status === input.status) return fail("validation", CRM_MESSAGES.validation, { status: [TEMPLATE_MESSAGES.sameStatus] });
    if (input.status === "approved") {
      // Never approve a body the editor would refuse (seeds are checked by tests; this guards hand edits).
      for (const lang of TEMPLATE_LANGS) {
        const body = lang === "en" ? row.bodyEn : lang === "hi" ? row.bodyHi : row.bodyHinglish;
        const { issues } = templateBodyIssues(body);
        if (issues.includes("empty") || issues.includes("tooLong") || issues.includes("unknownSlot")) {
          return fail("validation", CRM_MESSAGES.validation, { [`bodies.${lang}`]: issues.map((issue) => TEMPLATE_MESSAGES[issue]) });
        }
      }
    }
    if (!updateTemplateStatus(db, { key, status: input.status, expectedVersion: input.expectedVersion, actorId: viewer.userId, now })) {
      return fail("conflict", TEMPLATE_MESSAGES.versionConflict);
    }
    const fresh = findTemplateRow(db, key);
    if (!fresh) return fail("not_found", TEMPLATE_MESSAGES.notFound);
    consoleAudit(db, { actorId: viewer.userId, action: CONSOLE_AUDIT.templateStatus, target: key, details: { key, status: input.status }, now });
    return ok(toWaTemplate(fresh));
  });
}

// ---------------------------------------------------------------------------------------------
// The prospectus link (`crm_settings.wa_links`)

export const DEFAULT_WA_LINKS: WaLinksSetting = { prospectusUrl: null };

/** Stored document → value (null when unreadable: the default is used). */
export function parseWaLinks(raw: unknown): WaLinksSetting | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = (raw as { prospectusUrl?: unknown }).prospectusUrl;
  if (value === null || value === undefined) return { prospectusUrl: null };
  const url = validateHttpsUrl(value);
  return url ? { prospectusUrl: url.toString() } : null;
}

/** The prospectus link (version 0 and no link until a super admin saves one). Never throws, never writes. */
export function getWaLinks(db: DatabaseSync = getDb()): SettingEnvelope<WaLinksSetting> {
  return readSetting(db, "wa_links", parseWaLinks, DEFAULT_WA_LINKS);
}

/**
 * PUT /api/crm/templates/links `{ prospectusUrl, expectedVersion }` (super admins). https only,
 * ≤ 300 characters; null or "" removes it. Audited `settings.wa_links_update { version }` (never the
 * URL); `crm.settings_update` is not written a second time.
 */
export function putWaLinks(
  viewer: CrmViewer,
  input: { prospectusUrl: string | null; expectedVersion: number },
  now: number = Date.now(),
): CrmResult<SettingEnvelope<WaLinksSetting>> {
  if (!isSuperAdmin(viewer)) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  let prospectusUrl: string | null = null;
  if (input.prospectusUrl !== null && input.prospectusUrl.trim() !== "") {
    const url = validateHttpsUrl(input.prospectusUrl, CONSOLE_URL_MAX);
    if (!url) return fail("validation", CRM_MESSAGES.validation, { prospectusUrl: [TEMPLATE_MESSAGES.invalidUrl] });
    prospectusUrl = url.toString();
  }
  const db = getDb();
  return withTransaction(db, (): CrmResult<SettingEnvelope<WaLinksSetting>> => {
    const written = writeSetting<WaLinksSetting>(db, "wa_links", { prospectusUrl }, { expectedVersion: input.expectedVersion, actorId: viewer.userId, now, audit: false });
    if (!written.ok) return fail("conflict", TEMPLATE_MESSAGES.linksConflict);
    consoleAudit(db, { actorId: viewer.userId, action: CONSOLE_AUDIT.waLinksUpdate, target: "wa_links", details: { version: written.envelope.version }, now });
    return ok(written.envelope);
  });
}
