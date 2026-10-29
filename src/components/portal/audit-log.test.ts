import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { AUDIT_ACTIONS } from "@/lib/auth/accounts";
import { CRM_AUDIT } from "@/lib/crm/access";
import { CONSOLE_AUDIT } from "@/lib/crm/console/audit";
import { IMPORT_AUDIT as CRM_IMPORT_AUDIT } from "@/lib/crm/intake/import";
import { SUPER_ADMIN_AUDIT_ACTIONS } from "@/lib/db/super-admins";
import { AUDIT_MCP_CALL } from "@/lib/mcp/handler";
import { MCP_SERVICES } from "@/lib/mcp/scopes";
import { writeAuditAction } from "@/lib/mcp/server";
import { AUDIT_MCP_TOKEN } from "@/lib/mcp/tokens";
import { LAYOUT_ACTIONS } from "@/lib/page-layout/types";
import { QB_AUDIT_ACTIONS } from "@/lib/qb/audit";
import { IMPORT_AUDIT as QB_IMPORT_AUDIT } from "@/lib/qb/import/deps";
import { QB_AUDIT } from "@/app/api/admin/qb/_lib/http";
import { AUDIT_GROUP_TEXT, AuditLog, auditActionLabel, auditActionText, auditDetails, auditTargetLabel, translatedAuditActions, type AuditRowView } from "./AuditLog";
import { AUDIT_GROUP_WINDOW_MS, AUDIT_GROUPED_ACTIONS, countAuditItems, groupAuditRows } from "./audit-group";
import { AUDIT_LABELS, auditGroupLabel, registryAuditLabel } from "./audit-labels";

// ---------------------------------------------------------------------------------------------
// Registry completeness (plan §5.N): every audit code the codebase writes has a plain-words label.

const ROOT = join(__dirname, "..", "..", "..");

/** Every audit code from the code's own constants. */
function codesFromConstants(): string[] {
  const groups: Record<string, string>[] = [AUDIT_ACTIONS, SUPER_ADMIN_AUDIT_ACTIONS, CRM_AUDIT, CRM_IMPORT_AUDIT, CONSOLE_AUDIT, QB_AUDIT_ACTIONS, QB_AUDIT, QB_IMPORT_AUDIT, AUDIT_MCP_TOKEN];
  const codes = groups.flatMap((group) => Object.values(group));
  codes.push(AUDIT_MCP_CALL);
  for (const service of MCP_SERVICES) for (const tool of service.tools.write) codes.push(writeAuditAction(tool));
  for (const action of LAYOUT_ACTIONS) codes.push(`layout.${action}`);
  return [...new Set(codes)];
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      sourceFiles(path, out);
    } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * Literal audit codes written outside the constants: `action: "x.y"` and `const …ACTION… = "x.y"`
 * in src/ and the server scripts (seed, bootstrap).
 */
function codesFromSource(): Map<string, string> {
  const found = new Map<string, string>();
  const patterns = [/action:\s*["'`]([a-z]+\.[a-z_]+)["'`]/g, /const\s+[A-Z_]*ACTION[A-Z_]*\s*=\s*["'`]([a-z]+\.[a-z_]+)["'`]/g];
  for (const file of [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "scripts"))]) {
    const text = readFileSync(file, "utf8");
    if (!/recordAudit|crmAudit|consoleAudit|qbAudit|audit\(|ACTION/.test(text)) continue;
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.set(match[1], relative(ROOT, file));
  }
  return found;
}

describe("activity-log label registry", () => {
  it("labels every audit code from the constants (auth, super admin, CRM, lead routing, console, question bank, imports, MCP, layout)", () => {
    const codes = codesFromConstants();
    expect(codes.length).toBeGreaterThan(90);
    const missing = codes.filter((code) => !AUDIT_LABELS[code]);
    expect(missing).toEqual([]);
    // Spot checks across the families.
    for (const code of ["auth.super_admin_grant", "crm.bulk_reassign", "crm.meta_action", "crm.lead_details_update", "settings.centre_links_update", "qb.import_daily_cap", "mcp.log_lead_contact", "mcp.token_revoke", "layout.publish"]) {
      expect(codes).toContain(code);
    }
  });

  it("labels every literal audit code in the source and the server scripts", () => {
    const literal = codesFromSource();
    for (const code of ["admin.mocktest_profile_remove", "bootstrap.admin_create", "seed.user_create", "seed.password_reset", "seed.link_add"]) {
      expect([...literal.keys()]).toContain(code);
    }
    const missing = [...literal].filter(([code]) => !AUDIT_LABELS[code]).map(([code, file]) => `${code} (${file})`);
    expect(missing).toEqual([]);
    // Listed by the plan even though it is a question-bank setting key rather than a written code.
    expect(AUDIT_LABELS["seed.report"]).toBeDefined();
  });

  it("every entry has a plain label, groups only where planned, and translated codes are registered too", () => {
    for (const [code, entry] of Object.entries(AUDIT_LABELS)) {
      expect(entry.label.trim(), code).not.toBe("");
      expect(entry.label, code).not.toMatch(/[a-z]+\.[a-z_]+/); // never a code
      expect(entry.label, code).not.toMatch(/Ask Aspire/);
      for (const key of entry.uses ?? []) expect(key, code).not.toMatch(/pass|hash|token|secret|salt|cookie|credential/i);
    }
    expect(Object.entries(AUDIT_LABELS).filter(([, entry]) => entry.group).map(([code]) => code).sort()).toEqual([...AUDIT_GROUPED_ACTIONS].sort());
    for (const code of translatedAuditActions()) expect(AUDIT_LABELS[code], code).toBeDefined();
  });

  it("plan §9 labels read their details", () => {
    expect(registryAuditLabel("crm.lead_details_update", { fields: "details.school,details.altPhone" })).toBe("Updated enquiry details (school, second phone / WhatsApp)");
    expect(registryAuditLabel("crm.duplicate_dismiss", { otherLeadId: "lead-2" })).toBe("Marked two enquiries as different families");
    expect(registryAuditLabel("crm.lost_review", { decision: "reopen" })).toBe("Reviewed a lost enquiry (reopened)");
    expect(registryAuditLabel("crm.lost_review", { decision: "keep" })).toBe("Reviewed a lost enquiry (kept lost)");
    expect(registryAuditLabel("settings.targets_update", { period: "S2026", metric: "admissions", cells: 12 })).toBe("Changed targets for S2026 (12 cells)");
    expect(registryAuditLabel("settings.template_update", { key: "missed_call", lang: "hi", version: 3 })).toBe('Edited WhatsApp template "missed_call" (hi)');
    expect(registryAuditLabel("settings.template_status", { key: "welcome", status: "approved" })).toBe('WhatsApp template "welcome" set to approved');
    expect(registryAuditLabel("settings.wa_links_update", { version: 2 })).toBe("Changed the prospectus link");
    expect(registryAuditLabel("settings.centre_links_update", { centres: 3, version: 4 })).toBe("Changed Google Maps links (3 centres)");
    expect(registryAuditLabel("crm.contact_log", { channel: "call", outcome: "no_answer" })).toBe("Logged a call (no answer)");
    expect(registryAuditLabel("crm.contact_log", { channel: "whatsapp", outcome: "sent", template: "welcome" })).toBe('Logged a WhatsApp message (sent), template "welcome"');
    expect(registryAuditLabel("crm.lead_view")).toBe("Viewed an enquiry");
    expect(registryAuditLabel("mcp.call", { tool: "list_leads" })).toBe("AI assistant used list_leads");
    expect(registryAuditLabel("mcp.log_lead_contact", { outcome: "forbidden" })).toBe("AI assistant tried: logged a call or message (refused: forbidden)");
    // Missing details fall back to the plain label; unknown codes are not invented.
    expect(registryAuditLabel("settings.targets_update", {})).toBe("Changed targets");
    expect(registryAuditLabel("custom.thing")).toBeNull();
    expect(auditGroupLabel("crm.lead_view", 7)).toBe("Viewed 7 enquiries");
    expect(auditGroupLabel("mcp.call", 3)).toBe("AI assistant made 3 calls");
    expect(auditGroupLabel("auth.login", 3)).toBeNull();
  });

  it("lookup order: translated portal label, then the English registry, then the raw code", () => {
    const hi = messagesFor("hi", "portal").admin.audit;
    expect(auditActionLabel("admin.user_create", hi)).toBe(hi.actions.adminUserCreate); // translated wins
    expect(auditActionText("crm.task_done", {}, hi)).toEqual({ text: "Completed a follow-up task", english: true, used: [] });
    expect(auditActionText("crm.lost_review", { decision: "keep" }, hi)).toEqual({ text: "Reviewed a lost enquiry (kept lost)", english: true, used: ["decision"] });
    expect(auditActionLabel("custom.thing", hi)).toBe("custom.thing");
  });

  it("targets: names for accounts, noun and id for enquiries and other records", () => {
    const t = messagesFor("en", "portal").admin.audit;
    const users = new Map([["u1", { displayName: "Office Admin", loginId: "office.admin" }]]);
    expect(auditTargetLabel("admin.user_create", "u1", users, t)).toEqual({ text: "Office Admin (office.admin)", english: false });
    expect(auditTargetLabel("admin.user_create", "gone", users, t).text).toBe(t.unknownUser);
    expect(auditTargetLabel("crm.lead_view", "lead-abc", users, t)).toEqual({ text: "Enquiry · lead-abc", english: true });
    expect(auditTargetLabel("mcp.token_create", "tok-1", users, t).text).toBe("Access token · tok-1");
    expect(auditTargetLabel("crm.lead_view", null, users, t).text).toBe("—");
    // Details: keys the sentence already says are left out; staff ids read as names.
    expect(auditDetails({ decision: "keep", from: "u1" }, users, t, messagesFor("en", "auth").roles, ["decision"])).toEqual(["from: Office Admin (office.admin)"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Grouping (nothing is deleted)

const T0 = Date.UTC(2026, 9, 22, 5, 0); // 10:30 IST
const MIN = 60_000;
let nextId = 1000;
function entry(action: string, actorId: string | null, minutesBefore: number, target: string | null = null, details: Record<string, unknown> = {}): AuditRowView {
  nextId -= 1;
  return { id: nextId, actorId, action, target, createdAt: T0 - minutesBefore * MIN, details };
}

describe("groupAuditRows", () => {
  it("merges consecutive views by the same person; the window edge is inclusive", () => {
    const rows = [entry("crm.lead_view", "u1", 0, "l1"), entry("crm.lead_view", "u1", 10, "l2"), entry("crm.lead_view", "u1", 30, "l3"), entry("crm.lead_view", "u1", 31, "l4")];
    const items = groupAuditRows(rows);
    expect(items.map((item) => (item.kind === "row" ? 1 : item.rows.length))).toEqual([3, 1]);
    const group = items[0];
    expect(group.kind).toBe("group");
    if (group.kind === "group") {
      expect(group.rows.map((row) => row.target)).toEqual(["l1", "l2", "l3"]);
      expect(group.from).toBe(T0 - 30 * MIN);
      expect(group.to).toBe(T0);
    }
    expect(AUDIT_GROUP_WINDOW_MS).toBe(30 * MIN);
  });

  it("a different person or another action breaks the group; other actions are never grouped", () => {
    const rows = [
      entry("crm.lead_view", "u1", 0, "l1"),
      entry("crm.lead_view", "u1", 1, "l2"),
      entry("crm.lead_view", "u2", 2, "l3"), // actor change
      entry("crm.lead_view", "u1", 3, "l4"),
      entry("crm.note_add", "u1", 4, "l4"), // another action
      entry("crm.lead_view", "u1", 5, "l5"),
      entry("crm.lead_view", "u1", 6, "l6"),
      entry("auth.login", "u1", 7),
      entry("auth.login", "u1", 8),
      entry("mcp.call", "u1", 9, null, { tool: "list_leads" }),
      entry("mcp.call", "u1", 10, null, { tool: "get_lead" }),
    ];
    const items = groupAuditRows(rows);
    expect(items.map((item) => (item.kind === "row" ? item.row.action : `${item.action}×${item.rows.length}`))).toEqual([
      "crm.lead_view×2",
      "crm.lead_view",
      "crm.lead_view",
      "crm.note_add",
      "crm.lead_view×2",
      "auth.login",
      "auth.login",
      "mcp.call×2",
    ]);
    // Counts preserved: every row is in exactly one item.
    expect(countAuditItems(items)).toBe(rows.length);
    const ids = items.flatMap((item) => (item.kind === "row" ? [item.row.id] : item.rows.map((row) => row.id)));
    expect(ids).toEqual(rows.map((row) => row.id));
  });

  it("custom options and empty input", () => {
    expect(groupAuditRows([])).toEqual([]);
    const rows = [entry("auth.login", "u1", 0), entry("auth.login", "u1", 1)];
    expect(groupAuditRows(rows, { windowMs: 5 * MIN, actions: ["auth.login"] })[0]).toMatchObject({ kind: "group" });
    expect(groupAuditRows(rows, { windowMs: 0, actions: ["auth.login"] }).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Markup

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

describe("AuditLog markup", () => {
  const users = new Map([
    ["u1", { displayName: "Office Admin", loginId: "office.admin" }],
    ["u2", { displayName: "Kiran Staff", loginId: "kiran.staff" }],
  ]);

  it.each(["en", "hi"] as const)("plain-words actions, grouped views with every entry listed (%s)", (locale) => {
    const t = messagesFor(locale, "portal").admin.audit;
    const entries = [
      entry("crm.lead_view", "u2", 0, "lead-a"),
      entry("crm.lead_view", "u2", 5, "lead-b"),
      entry("crm.lead_view", "u2", 29, "lead-c"),
      entry("crm.lost_review", "u2", 40, "lead-d", { decision: "reopen" }),
      entry("settings.targets_update", "u1", 50, "S2026", { period: "S2026", metric: "admissions", cells: 12 }),
      entry("admin.user_create", "u1", 60, "u2", { role: "staff", loginId: "kiran.staff" }),
    ];
    const html = renderToStaticMarkup(createElement(AuditLog, { entries, users, limit: 50, locale, t, roles: messagesFor(locale, "auth").roles }));
    // The count stays the number of entries (nothing dropped).
    expect(html).toContain(escape(t.showing.replace("{count}", "6")));
    expect(html).toContain("Viewed 3 enquiries · 10:01–10:30");
    expect(html).toContain(`<details class="group">`);
    // The disclosure is a 44 px target with a visible marker; the wide table scrolls in a focusable region.
    expect(html).toMatch(/<summary class="[^"]*min-h-11[^"]*"><svg[^>]*aria-hidden="true"/);
    expect(html).toContain(`role="region" aria-label="${escape(t.listTitle)}" tabindex="0"`);
    expect(html).toContain(AUDIT_GROUP_TEXT.showEntries.replace("{count}", "3"));
    for (const id of ["lead-a", "lead-b", "lead-c"]) expect(html).toContain(`Enquiry · ${id}`);
    expect(html.match(/data-audit-group="3"/g)).toHaveLength(1);
    expect(html).toContain("Reviewed a lost enquiry (reopened)");
    expect(html).toContain("Changed targets for S2026 (12 cells)");
    expect(html).toContain(escape(t.actions.adminUserCreate));
    expect(html).toContain("Kiran Staff (kiran.staff)");
    // The sentence's details are not repeated; the rest still are.
    expect(html).not.toContain("decision: reopen");
    expect(html).toContain("metric: admissions");
    if (locale === "hi") {
      expect(html).toContain('<span lang="en">Reviewed a lost enquiry (reopened)</span>');
      expect(html).toContain('<span lang="en">Viewed 3 enquiries · 10:01–10:30</span>');
    } else {
      expect(html).not.toContain('lang="en"');
    }
    expect(html).not.toMatch(/crm\.lead_view|settings\.targets_update|crm\.lost_review/);
  });
});
