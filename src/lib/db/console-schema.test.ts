import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { applyFeatureSchemas, MEMORY_DB_PATH, openDatabase, SCHEMA_VERSION } from "./connection";
import { FEATURE_SCHEMAS } from "./features/index";
import { insertUser } from "./users";

// The admin console Phase 1b feature schema `crm_console` (docs/admin-phase-1b-plan.md §3).
// Synthetic rows only.

const NOW = Date.UTC(2026, 9, 22, 6, 0, 0);
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(MEMORY_DB_PATH);
});

afterEach(() => {
  db.close();
});

const columns = (table: string) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row.name));

function lead(id: string) {
  db.prepare("INSERT INTO crm_leads (id, created_at, updated_at, source, last_activity_at) VALUES (?, ?, ?, 'hero', ?)").run(id, NOW, NOW, NOW);
}

const count = (table: string) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);

/** Inserts one `crm_lead_details` row for `lead-1` with `column = value` (other columns null). */
function details(column: string, value: SQLInputValue) {
  db.prepare(`INSERT INTO crm_lead_details (lead_id, ${column}, updated_at) VALUES ('lead-1', ?, ?)`).run(value, NOW);
  db.prepare("DELETE FROM crm_lead_details WHERE lead_id = 'lead-1'").run();
}

function target(overrides: Partial<Record<"period" | "centre_slug" | "program" | "metric", string>> & { value?: number } = {}) {
  const row = { period: "S2026", centre_slug: "shimla", program: "jee", metric: "admissions", value: 10, ...overrides };
  db.prepare("INSERT INTO crm_targets (period, centre_slug, program, metric, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    row.period,
    row.centre_slug,
    row.program,
    row.metric,
    row.value,
    NOW,
  );
  db.prepare("DELETE FROM crm_targets").run();
}

function template(overrides: Partial<Record<"key" | "context" | "status" | "body_en", string>> & { seeded?: number } = {}) {
  const row = { key: "missed_call", context: "general", status: "draft", body_en: "Hello {parent_name}", seeded: 1, ...overrides };
  db.prepare(
    `INSERT INTO crm_wa_templates (key, context, status, body_en, body_hi, body_hinglish, seeded, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'नमस्ते', 'Namaste', ?, ?, ?)`,
  ).run(row.key, row.context, row.status, row.body_en, row.seeded, NOW, NOW);
  db.prepare("DELETE FROM crm_wa_templates").run();
}

describe("feature order and idempotence", () => {
  it("applies crm_console right after crm_intake; core migrations stay at version 2", () => {
    const names = FEATURE_SCHEMAS.map((feature) => feature.name);
    expect(names.slice(names.indexOf("crm_intake"), names.indexOf("crm_intake") + 2)).toEqual(["crm_intake", "crm_console"]);
    expect(names.indexOf("crm_console")).toBeLessThan(names.indexOf("qb"));
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("only uses CREATE … IF NOT EXISTS (no ALTER, no data) and re-applies cleanly with data in place", () => {
    const sql = FEATURE_SCHEMAS.find((feature) => feature.name === "crm_console")?.sql ?? "";
    const statements = sql.split(";").map((part) => part.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(5);
    for (const statement of statements) expect(statement).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS crm_/);
    lead("lead-1");
    db.prepare("INSERT INTO crm_lead_details (lead_id, school, updated_at) VALUES ('lead-1', 'Synthetic School', ?)").run(NOW);
    expect(() => applyFeatureSchemas(db)).not.toThrow();
    expect(() => applyFeatureSchemas(db)).not.toThrow();
    expect(count("crm_lead_details")).toBe(1);
  });
});

describe("tables", () => {
  it("creates every 1b table with the §3 columns", () => {
    expect(columns("crm_lead_details")).toEqual([
      "lead_id",
      "alt_phone_e164",
      "school",
      "board",
      "hostel",
      "target_exam",
      "target_year",
      "heard_via",
      "referred_by",
      "intake_session",
      "preferred_time",
      "decision_maker",
      "updated_at",
      "updated_by",
    ]);
    expect(columns("crm_lead_attribution")).toEqual(["lead_id", "referrer_host", "kept_at"]);
    expect(columns("crm_targets")).toEqual(["period", "centre_slug", "program", "metric", "value", "updated_at", "updated_by"]);
    expect(columns("crm_wa_templates")).toEqual([
      "key",
      "context",
      "position",
      "status",
      "body_en",
      "body_hi",
      "body_hinglish",
      "version",
      "seeded",
      "created_at",
      "updated_at",
      "updated_by",
      "approved_at",
      "approved_by",
    ]);
    expect(columns("crm_duplicate_dismissals")).toEqual(["lead_a", "lead_b", "dismissed_at", "dismissed_by"]);
    expect(columns("crm_lost_reviews")).toEqual(["lead_id", "lost_at", "decision", "reviewed_at", "reviewed_by"]);
  });

  it("crm_lead_details: closed and format CHECKs reject bad values", () => {
    lead("lead-1");
    expect(() => details("alt_phone_e164", "+919876500001")).not.toThrow();
    for (const bad of ["9876500001", "+0123456789", "+91", "+9198765000011234567"]) expect(() => details("alt_phone_e164", bad), bad).toThrow();
    expect(() => details("hostel", "maybe")).not.toThrow();
    expect(() => details("hostel", "sometimes")).toThrow();
    expect(() => details("target_year", 2040)).not.toThrow();
    for (const bad of [2023, 2041]) expect(() => details("target_year", bad)).toThrow();
    expect(() => details("intake_session", "S2026")).not.toThrow();
    for (const bad of ["S26", "2026", "S2026-27", "M2026-11"]) expect(() => details("intake_session", bad), bad).toThrow();
    expect(() => details("school", "")).toThrow();
    expect(() => details("school", "x".repeat(121))).toThrow();
    expect(() => details("referred_by", "x".repeat(81))).toThrow();
  });

  it("crm_lead_details: open vocabularies take a NEW value up to 40 characters (length CHECK only)", () => {
    lead("lead-1");
    const fresh = "a-brand-new-value-".padEnd(40, "x");
    for (const column of ["board", "target_exam", "heard_via", "preferred_time", "decision_maker"]) {
      expect(() => details(column, fresh), column).not.toThrow();
      expect(() => details(column, `${fresh}y`), column).toThrow();
      expect(() => details(column, ""), column).toThrow();
    }
  });

  it("crm_lead_attribution keeps a host of at most 100 characters", () => {
    lead("lead-1");
    const insert = (host: string) => {
      db.prepare("INSERT INTO crm_lead_attribution (lead_id, referrer_host, kept_at) VALUES ('lead-1', ?, ?)").run(host, NOW);
      db.prepare("DELETE FROM crm_lead_attribution").run();
    };
    expect(() => insert("chatgpt.com")).not.toThrow();
    expect(() => insert(`${"a".repeat(97)}.io`)).not.toThrow();
    expect(() => insert(`${"a".repeat(98)}.io`)).toThrow();
  });

  it("crm_targets: session and month periods, open programme / metric, bounded values", () => {
    expect(() => target()).not.toThrow();
    expect(() => target({ period: "M2026-11" })).not.toThrow();
    expect(() => target({ program: "a-new-programme" })).not.toThrow();
    for (const period of ["X2026", "S26", "M2026-1", "2026"]) expect(() => target({ period }), period).toThrow();
    for (const value of [-1, 100001]) expect(() => target({ value }), String(value)).toThrow();
    expect(() => target({ centre_slug: "" })).toThrow();
    expect(() => target({ program: "x".repeat(41) })).toThrow();
    expect(() => target({ metric: "" })).toThrow();
  });

  it("crm_wa_templates: key format, closed status, body lengths, 0/1 seeded, open context", () => {
    expect(() => template()).not.toThrow();
    expect(() => template({ context: "a-future-context".padEnd(40, "x") })).not.toThrow();
    for (const key of ["Bad", "1abc", "a-b", "a b", "", "x".repeat(41)]) expect(() => template({ key }), key).toThrow();
    expect(() => template({ status: "live" })).toThrow();
    expect(() => template({ body_en: "" })).toThrow();
    expect(() => template({ body_en: "x".repeat(701) })).toThrow();
    expect(() => template({ seeded: 2 })).toThrow();
    expect(() => template({ context: "" })).toThrow();
  });

  it("crm_duplicate_dismissals keeps an ordered pair; crm_lost_reviews a closed decision", () => {
    lead("lead-a");
    lead("lead-b");
    expect(() => db.prepare("INSERT INTO crm_duplicate_dismissals (lead_a, lead_b, dismissed_at) VALUES ('lead-b', 'lead-a', ?)").run(NOW)).toThrow();
    expect(() => db.prepare("INSERT INTO crm_duplicate_dismissals (lead_a, lead_b, dismissed_at) VALUES ('lead-a', 'lead-a', ?)").run(NOW)).toThrow();
    expect(() => db.prepare("INSERT INTO crm_duplicate_dismissals (lead_a, lead_b, dismissed_at) VALUES ('lead-a', 'lead-b', ?)").run(NOW)).not.toThrow();
    expect(() =>
      db.prepare("INSERT INTO crm_lost_reviews (lead_id, lost_at, decision, reviewed_at) VALUES ('lead-a', ?, 'maybe', ?)").run(NOW, NOW),
    ).toThrow();
    expect(() =>
      db.prepare("INSERT INTO crm_lost_reviews (lead_id, lost_at, decision, reviewed_at) VALUES ('lead-a', ?, 'kept', ?)").run(NOW, NOW),
    ).not.toThrow();
  });

  it("follows the lead: deleting a crm_leads row cascades to every 1b table; a deleted user only clears its id", () => {
    const user = insertUser(db, { role: "admin", loginId: "admin.schema", displayName: "Admin", passwordHash: "scrypt$x", mustChangePassword: false, now: NOW });
    lead("lead-a");
    lead("lead-b");
    db.prepare("INSERT INTO crm_lead_details (lead_id, heard_via, updated_at, updated_by) VALUES ('lead-a', 'poster', ?, ?)").run(NOW, user.id);
    db.prepare("INSERT INTO crm_lead_attribution (lead_id, referrer_host, kept_at) VALUES ('lead-a', 'claude.ai', ?)").run(NOW);
    db.prepare("INSERT INTO crm_duplicate_dismissals (lead_a, lead_b, dismissed_at, dismissed_by) VALUES ('lead-a', 'lead-b', ?, ?)").run(NOW, user.id);
    db.prepare("INSERT INTO crm_lost_reviews (lead_id, lost_at, decision, reviewed_at, reviewed_by) VALUES ('lead-a', ?, 'kept', ?, ?)").run(NOW, NOW, user.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    expect(db.prepare("SELECT updated_by FROM crm_lead_details").get()).toEqual({ updated_by: null });
    db.prepare("DELETE FROM crm_leads WHERE id = 'lead-a'").run();
    for (const table of ["crm_lead_details", "crm_lead_attribution", "crm_duplicate_dismissals", "crm_lost_reviews"]) expect(count(table), table).toBe(0);
  });
});
