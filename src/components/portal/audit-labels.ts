import consoleCommonEn from "@/i18n/messages/en/console-common";

/**
 * Activity-log label registry (docs/admin-phase-1b-plan.md §5.N, §9; owner: 1B-HOUSEKEEPING).
 * ENGLISH ONLY (decision 5, O15): one entry per audit code in use, so the log reads in plain words
 * instead of codes. The log looks a code up in this order: the translated `ACTION_KEYS` of the
 * portal messages (AuditLog.tsx), then this registry, then the raw code.
 *
 * `audit-log.test.ts` imports every audit constant of the codebase (auth, super admin, CRM, lead
 * routing, console, question bank and its import, MCP) and fails when a code has no entry here, so
 * a new code needs a label in the same change. Client-safe: plain data, no I/O.
 *
 * Details are flat, secret-free facts (ids, counts, enum values). `describe` turns the ones worth
 * reading into the sentence; the keys it used are listed in `uses` and are not repeated below it.
 */

export type AuditDetailValue = string | number | boolean | null | undefined;
export type AuditDetailsView = Readonly<Record<string, unknown>>;

/** What an entry's `target` id points at (the log shows "Enquiry · <id>" for anything but accounts). */
export type AuditTargetKind = "account" | "enquiry" | "area" | "token" | "page" | "setting" | "template" | "question_bank" | "import";

export const AUDIT_TARGET_NOUNS: Readonly<Record<Exclude<AuditTargetKind, "account">, string>> = {
  enquiry: "Enquiry",
  area: "Area",
  token: "Access token",
  page: "Page",
  setting: "Setting",
  template: "Template",
  question_bank: "Question bank item",
  import: "Import",
};

export interface AuditLabelEntry {
  /** Plain-words label ("Viewed an enquiry"). */
  label: string;
  /** A fuller sentence from the details, or null to keep `label`. */
  describe?: (details: AuditDetailsView) => string | null;
  /** Detail keys `describe` already says in words (left out of the details list). */
  uses?: readonly string[];
  /** What `target` holds; accounts when absent. */
  target?: AuditTargetKind;
  /** Summary when consecutive entries are grouped (audit-group.ts): "{n}" is the count. */
  group?: string;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return null;
}

/** "no_answer" → "no answer". */
function words(value: unknown): string | null {
  const text = str(value);
  return text ? text.replace(/[_.]+/g, " ") : null;
}

const DETAIL_FIELD_NAMES: Readonly<Record<string, string>> = consoleCommonEn.details.fields;

/** "details.school,details.board" → "school, board". */
function fieldList(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const names = text
    .split(",")
    .map((field) => field.trim().replace(/^details\./, ""))
    .filter(Boolean)
    .map((field) => DETAIL_FIELD_NAMES[field] ?? field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  return names.length ? names.join(", ") : null;
}

const CHANNEL_WORDS: Readonly<Record<string, string>> = { call: "call", whatsapp: "WhatsApp message", sms: "text message", email: "email", visit: "visit" };

function plural(n: string, one: string, many: string): string {
  return n === "1" ? one : many;
}

// ---------------------------------------------------------------------------------------------
// The registry

const MCP_WRITE_TOOLS: Readonly<Record<string, string>> = {
  create_account: "created an account",
  link_parent_student: "linked a parent and a student",
  unlink_parent_student: "unlinked a parent and a student",
  set_account_disabled: "disabled or re-enabled an account",
  add_lead_note: "added a note to an enquiry",
  change_lead_stage: "changed an enquiry's stage",
  assign_lead: "assigned an enquiry",
  create_lead_task: "created a follow-up task",
  complete_lead_task: "completed a follow-up task",
  log_lead_contact: "logged a call or message",
  create_walkin_lead: "added a walk-in enquiry",
};

const ENQUIRY_TOOLS = new Set(["add_lead_note", "change_lead_stage", "assign_lead", "create_lead_task", "complete_lead_task", "log_lead_contact", "create_walkin_lead"]);

function mcpToolEntries(): Record<string, AuditLabelEntry> {
  const entries: Record<string, AuditLabelEntry> = {};
  for (const [tool, text] of Object.entries(MCP_WRITE_TOOLS)) {
    entries[`mcp.${tool}`] = {
      label: `AI assistant ${text}`,
      describe: (d) => {
        const outcome = str(d.outcome);
        if (!outcome || outcome === "changed") return null;
        return outcome === "no_change" ? `AI assistant tried: ${text} (nothing changed)` : `AI assistant tried: ${text} (refused: ${words(outcome)})`;
      },
      uses: ["outcome", "via"],
      target: ENQUIRY_TOOLS.has(tool) ? "enquiry" : "account",
    };
  }
  return entries;
}

export const AUDIT_LABELS: Readonly<Record<string, AuditLabelEntry>> = {
  // Accounts and sign-in (src/lib/auth/accounts.ts AUDIT_ACTIONS, src/lib/db/super-admins.ts)
  "auth.login": { label: "Signed in" },
  "auth.logout": { label: "Signed out" },
  "auth.password_change": { label: "Changed own password" },
  "auth.password_reset": { label: "Password reset with the server command" },
  "auth.super_admin_grant": { label: "Made an admin a super admin" },
  "auth.super_admin_revoke": { label: "Removed super admin rights" },
  "auth.super_admin_bootstrap": { label: "First super admin set automatically" },
  "admin.user_create": { label: "Created an account" },
  "admin.user_disable": { label: "Disabled an account" },
  "admin.user_enable": { label: "Enabled an account" },
  "admin.user_rename": { label: "Renamed an account" },
  "admin.password_reset": { label: "Reset a password" },
  "admin.link_add": { label: "Linked a parent and a student" },
  "admin.link_remove": { label: "Unlinked a parent and a student" },
  "admin.mocktest_profile_remove": { label: "Removed a learner's mock-test data" },
  "seed.user_create": { label: "Development account created" },
  "seed.password_reset": { label: "Development password reset" },
  "seed.link_add": { label: "Development link created" },
  "seed.report": { label: "Question bank starter content loaded" },
  "bootstrap.admin_create": { label: "First admin account created" },

  // Page layout (src/lib/page-layout/store.ts: `layout.${action}`)
  "layout.save_draft": { label: "Page layout draft saved", target: "page" },
  "layout.discard_draft": { label: "Page layout draft discarded", target: "page" },
  "layout.publish": { label: "Page layout published", target: "page" },
  "layout.reset": { label: "Page layout reset to the original order", target: "page" },

  // Enquiries (src/lib/crm/access.ts CRM_AUDIT)
  "crm.lead_capture": {
    label: "Enquiry received",
    describe: (d) => {
      const source = words(d.source);
      const known = d.isNew === false;
      if (!source) return known ? "Enquiry received from a family already on file" : null;
      return known ? `Enquiry received again (${source})` : `Enquiry received (${source})`;
    },
    uses: ["source", "isNew"],
    target: "enquiry",
  },
  "crm.lead_create": { label: "Added an enquiry", target: "enquiry" },
  "crm.lead_duplicate_check": { label: "Checked whether a number is already on file", target: "enquiry" },
  "crm.lead_view": { label: "Viewed an enquiry", target: "enquiry", group: "Viewed {n} enquiries" },
  "crm.lead_update": { label: "Edited an enquiry's details", target: "enquiry" },
  "crm.stage_change": {
    label: "Changed an enquiry's stage",
    describe: (d) => {
      const from = words(d.from);
      const to = words(d.to);
      if (!from || !to) return null;
      const reason = words(d.lostReason);
      return `Moved an enquiry from ${from} to ${to}${reason ? ` (reason: ${reason})` : ""}`;
    },
    uses: ["from", "to", "lostReason"],
    target: "enquiry",
  },
  "crm.assign": { label: "Assigned an enquiry", target: "enquiry" },
  "crm.note_add": { label: "Added a note to an enquiry", target: "enquiry" },
  "crm.contact_log": {
    label: "Logged a call or message",
    describe: (d) => {
      const channel = str(d.channel);
      if (!channel) return null;
      const outcome = words(d.outcome);
      const template = str(d.template);
      return `Logged a ${CHANNEL_WORDS[channel] ?? words(channel)}${outcome ? ` (${outcome})` : ""}${template ? `, template "${template}"` : ""}`;
    },
    uses: ["channel", "outcome", "template"],
    target: "enquiry",
  },
  "crm.task_create": {
    label: "Created a follow-up task",
    describe: (d) => (d.auto === true ? "Follow-up task created automatically" : null),
    uses: ["auto"],
    target: "enquiry",
  },
  "crm.task_done": { label: "Completed a follow-up task", target: "enquiry" },
  "crm.export": {
    label: "Exported enquiries",
    describe: (d) => {
      const rows = str(d.rows);
      return rows ? `Exported ${rows} ${plural(rows, "enquiry", "enquiries")}` : null;
    },
    uses: ["rows"],
  },
  "crm.lead_erase": { label: "Erased a family's personal data", target: "enquiry" },
  "crm.gate_withdraw": { label: "A family asked Aspire to stop contacting them", target: "enquiry" },
  "crm.staff_upsert": { label: "Changed a staff member's CRM access" },
  "crm.rules_set": { label: "Changed the lead assignment rules" },
  // Lead routing, the 1-hour rule, imports and Meta (docs/lead-routing-plan.md §23)
  "crm.area_create": { label: "Created an area", target: "area" },
  "crm.area_update": { label: "Changed an area", target: "area" },
  "crm.area_merge": { label: "Merged two areas", target: "area" },
  "crm.area_members": { label: "Changed the people in an area", target: "area" },
  "crm.area_alias": { label: "Changed an area's place names", target: "area" },
  "crm.area_setup_from_centre": { label: "Set up an area from a centre", target: "setting" },
  "crm.area_reroute": { label: "Re-routed enquiries after an area change" },
  "crm.lead_reroute": { label: "Moved an enquiry to another area", target: "enquiry" },
  "crm.bulk_reassign": {
    label: "Reassigned enquiries in bulk",
    describe: (d) => {
      const moved = str(d.moved);
      return moved ? `Reassigned ${moved} ${plural(moved, "enquiry", "enquiries")} in bulk` : null;
    },
    uses: ["moved"],
  },
  "crm.availability": {
    label: "Changed away status",
    describe: (d) => {
      if (d.away === false) return "Marked as back at work";
      const days = str(d.days);
      return d.away === true ? `Marked as away${days ? ` for ${days} ${plural(days, "day", "days")}` : ""}` : null;
    },
    uses: ["away", "days"],
  },
  "crm.settings_update": {
    label: "Changed CRM settings",
    describe: (d) => {
      const key = words(d.key);
      return key ? `Changed CRM settings (${key})` : null;
    },
    uses: ["key"],
    target: "setting",
  },
  "crm.import_start": { label: "Started an enquiry import", target: "import" },
  "crm.import": { label: "Imported enquiries", target: "import" },
  "crm.meta_config": { label: "Changed the Meta lead ads settings", target: "setting" },
  "crm.meta_secret_set": { label: "Saved a Meta lead ads key", target: "setting" },
  "crm.meta_secret_delete": { label: "Removed a Meta lead ads key", target: "setting" },
  "crm.meta_action": {
    label: "Meta lead ads action",
    describe: (d) => {
      const action = words(d.action);
      return action ? `Meta lead ads: ${action}` : null;
    },
    uses: ["action"],
    target: "setting",
  },

  // Admin console Phase 1b (src/lib/crm/console/audit.ts CONSOLE_AUDIT; plan §9)
  "crm.lead_details_update": {
    label: "Updated enquiry details",
    describe: (d) => {
      const fields = fieldList(d.fields);
      return fields ? `Updated enquiry details (${fields})` : null;
    },
    uses: ["fields"],
    target: "enquiry",
  },
  "crm.duplicate_dismiss": { label: "Marked two enquiries as different families", target: "enquiry" },
  "crm.lost_review": {
    label: "Reviewed a lost enquiry",
    describe: (d) => {
      const decision = str(d.decision);
      if (decision === "keep") return "Reviewed a lost enquiry (kept lost)";
      if (decision === "reopen") return "Reviewed a lost enquiry (reopened)";
      return decision ? `Reviewed a lost enquiry (${words(decision)})` : null;
    },
    uses: ["decision"],
    target: "enquiry",
  },
  "settings.targets_update": {
    label: "Changed targets",
    describe: (d) => {
      const period = str(d.period);
      const cells = str(d.cells);
      if (!period) return null;
      return `Changed targets for ${period}${cells ? ` (${cells} ${plural(cells, "cell", "cells")})` : ""}`;
    },
    uses: ["period", "cells"],
    target: "setting",
  },
  "settings.template_update": {
    label: "Edited a WhatsApp template",
    describe: (d) => {
      const key = str(d.key);
      const lang = str(d.lang);
      return key ? `Edited WhatsApp template "${key}"${lang ? ` (${lang})` : ""}` : null;
    },
    uses: ["key", "lang"],
    target: "template",
  },
  "settings.template_status": {
    label: "Changed a WhatsApp template's status",
    describe: (d) => {
      const key = str(d.key);
      const status = words(d.status);
      return key && status ? `WhatsApp template "${key}" set to ${status}` : null;
    },
    uses: ["key", "status"],
    target: "template",
  },
  "settings.wa_links_update": { label: "Changed the prospectus link", target: "setting" },
  "settings.centre_links_update": {
    label: "Changed Google Maps links",
    describe: (d) => {
      const centres = str(d.centres);
      return centres ? `Changed Google Maps links (${centres} ${plural(centres, "centre", "centres")})` : null;
    },
    uses: ["centres"],
    target: "setting",
  },

  // AI assistant access (src/lib/mcp: tokens.ts, handler.ts, server.ts `mcp.<write tool>`)
  "mcp.token_create": { label: "Created an AI assistant access token", target: "token" },
  "mcp.token_revoke": { label: "Revoked an AI assistant access token", target: "token" },
  "mcp.call": {
    label: "AI assistant used a tool",
    describe: (d) => {
      const tool = str(d.tool);
      return tool ? `AI assistant used ${tool}` : null;
    },
    uses: ["tool", "via"],
    group: "AI assistant made {n} calls",
  },
  ...mcpToolEntries(),

  // Question bank (src/lib/qb/audit.ts QB_AUDIT_ACTIONS, src/app/api/admin/qb/_lib/http.ts QB_AUDIT,
  // src/lib/qb/import/deps.ts IMPORT_AUDIT)
  "qb.import_upload": { label: "Uploaded a file for a question import", target: "import" },
  "qb.import_run": { label: "Started a question import", target: "import" },
  "qb.import_pause": { label: "Paused a question import", target: "import" },
  "qb.import_cancel": { label: "Cancelled a question import", target: "import" },
  "qb.import_close": { label: "Closed a question import", target: "import" },
  "qb.import_retry": { label: "Retried a question import", target: "import" },
  "qb.import_create_drafts": { label: "Created draft questions from an import", target: "import" },
  "qb.import_snapshot_confirm": { label: "Confirmed an import's source snapshot", target: "import" },
  "qb.import_done": { label: "A question import finished", target: "import" },
  "qb.import_daily_cap": { label: "A question import stopped at the daily spending cap", target: "import" },
  "qb.import_spend": { label: "Recorded AI spending for a question import", target: "import" },
  "qb.bulk_approve": { label: "Approved questions in bulk", target: "question_bank" },
  "qb.bulk_labels": { label: "Changed question labels in bulk", target: "question_bank" },
  "qb.bulk_aborted": { label: "A bulk question change was stopped", target: "question_bank" },
  "qb.blueprint_publish": { label: "Published a test blueprint", target: "question_bank" },
  "qb.blueprint_archive": { label: "Archived a test blueprint", target: "question_bank" },
  "qb.blueprint_new_version": { label: "Started a new version of a test blueprint", target: "question_bank" },
  "qb.blueprint_signoff": { label: "Signed off a test blueprint", target: "question_bank" },
  "qb.pattern_confirm": { label: "Confirmed an exam pattern", target: "question_bank" },
  "qb.taxonomy_confirm": { label: "Confirmed the syllabus list", target: "question_bank" },
  "qb.unit_upsert": { label: "Changed a syllabus unit", target: "question_bank" },
  "qb.key_correction": { label: "Corrected an answer key", target: "question_bank" },
  "qb.member_upsert": { label: "Changed someone's question bank access" },
  "qb.settings_change": { label: "Changed question bank settings", target: "setting" },
  "qb.third_party_override": { label: "Cleared a third-party content flag", target: "question_bank" },
};

/** The registry entry of `action`, or null. */
export function auditLabelEntry(action: string): AuditLabelEntry | null {
  return Object.prototype.hasOwnProperty.call(AUDIT_LABELS, action) ? AUDIT_LABELS[action] : null;
}

/** The registry's sentence for an entry (its details read), or null for an unknown code. */
export function registryAuditLabel(action: string, details: AuditDetailsView = {}): string | null {
  const entry = auditLabelEntry(action);
  if (!entry) return null;
  try {
    return entry.describe?.(details) ?? entry.label;
  } catch {
    return entry.label;
  }
}

/** "Viewed 7 enquiries" for a grouped run, or null when the code is never grouped. */
export function auditGroupLabel(action: string, count: number): string | null {
  const group = auditLabelEntry(action)?.group;
  return group ? group.replace("{n}", String(count)) : null;
}
