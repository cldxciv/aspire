import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseSync } from "node:sqlite";

import { applyFeatureSchemas, MEMORY_DB_PATH, openDatabase, SCHEMA_VERSION } from "./connection";
import { FEATURE_SCHEMAS } from "./features/index";
import { insertUser } from "./users";

// The lead-routing feature schemas (docs/lead-routing-plan.md §12): `superadmin` and `crm_intake`.
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

describe("feature order and core migrations", () => {
  it("applies superadmin, then crm_intake, right after crm; core migrations stay at version 2", () => {
    const names = FEATURE_SCHEMAS.map((feature) => feature.name);
    const crm = names.indexOf("crm");
    expect(names.slice(crm, crm + 3)).toEqual(["crm", "superadmin", "crm_intake"]);
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("only uses CREATE … IF NOT EXISTS (no ALTER, no data) and re-applies cleanly", () => {
    for (const name of ["superadmin", "crm_intake"]) {
      const sql = FEATURE_SCHEMAS.find((feature) => feature.name === name)?.sql ?? "";
      const statements = sql.split(";").map((part) => part.trim()).filter(Boolean);
      for (const statement of statements) expect(statement, name).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS/);
    }
    expect(() => applyFeatureSchemas(db)).not.toThrow();
    expect(() => applyFeatureSchemas(db)).not.toThrow();
  });
});

describe("tables", () => {
  it("creates every lead-routing table with the §12 columns", () => {
    expect(columns("superadmin_grants")).toEqual(["user_id", "granted_at", "granted_by", "granted_via", "revoked_at", "revoked_by"]);
    expect(columns("crm_settings")).toEqual(["key", "value", "version", "updated_at", "updated_by"]);
    expect(columns("crm_lead_routing")).toEqual(["lead_id", "area_id", "match", "outcome", "place_input", "place_key", "gate_only", "routed_at", "routed_by"]);
    expect(columns("crm_sla_clocks")).toContain("assignee_at_due");
    expect(columns("crm_sla_clocks")).toContain("reached_at");
    expect(columns("crm_external_refs")).toEqual(["provider", "external_id", "lead_id", "batch_id", "created_at"]);
    expect(columns("crm_erase_suppressions")).toEqual(["phone_hash", "key_id", "erased_at"]);
    expect(columns("crm_meta_inbox")).toContain("lease_until");
    expect(columns("crm_integration_secrets")).toEqual(["provider", "name", "sealed", "key_id", "updated_at", "updated_by"]);
    for (const table of ["crm_areas", "crm_area_centres", "crm_area_aliases", "crm_area_members", "crm_staff_scope", "crm_staff_availability", "crm_import_batches"]) {
      expect(columns(table).length, table).toBeGreaterThan(0);
    }
  });

  it("enforces the CHECK constraints", () => {
    const user = insertUser(db, { role: "admin", loginId: "admin.schema", displayName: "Admin", passwordHash: "scrypt$x", mustChangePassword: false, now: NOW });
    expect(() => db.prepare("INSERT INTO superadmin_grants (user_id, granted_at, granted_via) VALUES (?, ?, 'magic')").run(user.id, NOW)).toThrow();
    lead("lead-a");
    expect(() =>
      db.prepare("INSERT INTO crm_lead_routing (lead_id, outcome, routed_at) VALUES ('lead-a', 'somewhere', ?)").run(NOW),
    ).toThrow();
    expect(() => db.prepare("INSERT INTO crm_external_refs (provider, external_id, created_at) VALUES ('zapier', 'x', ?)").run(NOW)).toThrow();
    expect(() =>
      db.prepare("INSERT INTO crm_integration_secrets (provider, name, sealed, key_id, updated_at) VALUES ('meta', 'password', 'v1', 'k', ?)").run(NOW),
    ).toThrow();
    expect(() => db.prepare("INSERT INTO crm_meta_inbox (leadgen_id, via, next_attempt_at, received_at) VALUES ('1', 'webhook', ?, ?)").run(NOW, NOW)).toThrow();
  });

  it("allows only one OPEN clock per lead, any number of resolved ones", () => {
    lead("lead-b");
    const insert = db.prepare(
      "INSERT INTO crm_sla_clocks (lead_id, reason, source, started_at, due_at, policy_version, resolved_at) VALUES ('lead-b', 'new', 'hero', ?, ?, 1, ?)",
    );
    insert.run(NOW, NOW + 3600_000, NOW + 60_000);
    insert.run(NOW, NOW + 3600_000, null);
    expect(() => insert.run(NOW, NOW + 3600_000, null)).toThrow();
  });

  it("follows the lead: routing and clocks go with a deleted lead; refs are kept with lead_id NULL", () => {
    lead("lead-c");
    db.prepare("INSERT INTO crm_lead_routing (lead_id, outcome, routed_at) VALUES ('lead-c', 'empty', ?)").run(NOW);
    db.prepare("INSERT INTO crm_sla_clocks (lead_id, reason, source, started_at, due_at, policy_version) VALUES ('lead-c', 'new', 'hero', ?, ?, 1)").run(NOW, NOW);
    db.prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, created_at) VALUES ('meta', '123456789012345', 'lead-c', ?)").run(NOW);
    db.prepare("DELETE FROM crm_leads WHERE id = 'lead-c'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM crm_lead_routing").get()?.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM crm_sla_clocks").get()?.n).toBe(0);
    expect(db.prepare("SELECT lead_id FROM crm_external_refs").get()).toEqual({ lead_id: null });
  });
});
