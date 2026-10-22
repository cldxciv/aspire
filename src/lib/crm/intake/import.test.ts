import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The import service against a fresh in-memory database and the REAL CORE: `captureLead` (§14.2),
// the secret-box keyed hashes and the `crm_intake` schema, through the production wiring
// (`importDeps`) with a spy on the capture call. The routing and SLA seams are test-defined
// (`fixtures/seams.ts`), so nothing depends on a stub's or a sibling package's answers.
// Synthetic people only.
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).slaSeam() }));

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { captureLead, changeStage, resolveCrmViewer } from "../index";
import { findLeadByPhone } from "../repo/leads";
import {
  captureSpy,
  fixtureRows,
  spiedImportDeps,
  TEST_INTEGRATIONS_SECRET,
  TEST_INTEGRATIONS_SECRET_PREVIOUS,
  testHash as hash,
  testPreviousHash as previousHash,
  type CaptureSpy,
} from "./fixtures/import-kit";
import {
  finishImportBatch,
  IMPORT_AUDIT,
  importBatchBodySchema,
  importBatchRows,
  importPreviewBodySchema,
  importRowsBodySchema,
  listImportBatches,
  previewImportRows,
  startImportBatch,
} from "./import";
import { parseCsv } from "./csv";
import { damageSummary, wentThroughExcel } from "./excel-damage";
import { buildImportRows, chunkImportRows, guessMapping, type ImportConsentBasis, type ImportRowInput } from "./rows";

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const HOUR = 60 * 60 * 1000;

let saId: string;
let core: CaptureSpy;
const deps = () => spiedImportDeps(core);

function start(basis: ImportConsentBasis = "meta_lead_form", rowsTotal = 10, startClock = true) {
  const result = startImportBatch(deps(), saId, { consentBasis: basis, startClock, rowsTotal, fileName: String.raw`C:\Users\cmo\Downloads\leads_21-10.csv` }, NOW);
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}

function importAll(rows: ImportRowInput[], basis: ImportConsentBasis = "meta_lead_form", now = NOW) {
  const batch = start(basis, rows.length);
  let offset = 0;
  const results = chunkImportRows(rows).flatMap((chunk) => {
    const result = importBatchRows(deps(), saId, batch.id, { rows: chunk, offset }, now);
    if (!result.ok) throw new Error(result.reason);
    offset += chunk.length;
    return result.data.results;
  });
  const finished = finishImportBatch(deps(), saId, batch.id, now);
  if (!finished.ok) throw new Error(finished.reason);
  return { results, batch: finished.data };
}

const countBy = (results: { status: string }[]) =>
  results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  resetDatabaseForTests();
  saId = insertUser(getDb(), { role: "admin", loginId: "sa.one", displayName: "Super Admin", passwordHash: "scrypt$test", mustChangePassword: false, now: NOW }).id;
  core = captureSpy();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The CRM viewer of the test's admin (an admin needs no CRM membership). */
function adminViewer() {
  const viewer = resolveCrmViewer({ userId: saId, role: "admin", displayName: "SA" });
  if (!viewer) throw new Error("no viewer");
  return viewer;
}

describe("request bodies", () => {
  it("requires a consent basis to start a batch, and caps rows per file", () => {
    expect(importBatchBodySchema.safeParse({ startClock: true, rowsTotal: 3 }).success).toBe(false);
    expect(importBatchBodySchema.safeParse({ consentBasis: "phone", startClock: true, rowsTotal: 3 }).success).toBe(true);
    expect(importBatchBodySchema.safeParse({ consentBasis: "anything", startClock: true, rowsTotal: 3 }).success).toBe(false);
    expect(importBatchBodySchema.safeParse({ consentBasis: "phone", startClock: true, rowsTotal: 5001 }).success).toBe(false);
  });

  it("caps a chunk at 250 rows and rejects unknown fields and oversized cells", () => {
    const row = { row: 2, phone: "+916000010001" };
    expect(importRowsBodySchema.safeParse({ rows: Array.from({ length: 250 }, () => row), offset: 0 }).success).toBe(true);
    expect(importRowsBodySchema.safeParse({ rows: Array.from({ length: 251 }, () => row), offset: 0 }).success).toBe(false);
    expect(importRowsBodySchema.safeParse({ rows: [], offset: 0 }).success).toBe(false);
    expect(importRowsBodySchema.safeParse({ rows: [row] }).success).toBe(false); // the offset is required
    expect(importRowsBodySchema.safeParse({ rows: [row], offset: -1 }).success).toBe(false);
    expect(importRowsBodySchema.safeParse({ rows: [{ ...row, sql: "x" }], offset: 0 }).success).toBe(false);
    expect(importRowsBodySchema.safeParse({ rows: [{ ...row, answers: "x".repeat(1001) }], offset: 0 }).success).toBe(false);
    expect(importPreviewBodySchema.safeParse({ rows: [row], consentBasis: null }).success).toBe(true);
  });
});

describe("preview (dry run)", () => {
  it("returns per-row status, masked phones and areas, and writes nothing", () => {
    const rows = fixtureRows("mixed-quality.csv");
    const result = previewImportRows(deps(), rows, "meta_lead_form", NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.map((r) => [r.row, r.status])).toEqual([
      [2, "created"],
      [3, "consent_mismatch"], // no Meta lead id: the Meta basis cannot cover it
      [4, "invalid_phone"],
      [5, "missing_phone"],
      [6, "invalid_phone"],
      [9, "created"],
    ]);
    expect(result.data[0]).toMatchObject({ phoneMasked: "+91 60•••••061", areaId: "kangra", place: "area" });
    expect(result.data[5]).toMatchObject({ areaId: null, place: "unknown" });
    for (const row of result.data) expect(JSON.stringify(row)).not.toMatch(/6000010061|Valid One|one@example/);
    expect(core.calls).toEqual([]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 0 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_external_refs").get()).toEqual({ n: 0 });
  });

  it("counts one family on two rows (same phone, no Meta id) as new once", () => {
    const rows: ImportRowInput[] = [
      { row: 2, phone: "+916000010081", createdTime: "2026-10-20T04:00:00.000Z", district: "Kangra" },
      { row: 3, phone: "+916000010081", createdTime: "2026-10-20T05:00:00.000Z", district: "Kangra" },
    ];
    const result = previewImportRows(deps(), rows, "phone", NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.map((r) => [r.status, r.areaId])).toEqual([
      ["created", "kangra"],
      ["attached", "kangra"],
    ]);
    expect(countBy(importAll(rows, "phone").results)).toEqual({ created: 1, attached: 1 });
  });

  it("with a staff basis, rows without a Meta id are fine", () => {
    const result = previewImportRows(deps(), fixtureRows("mixed-quality.csv"), "phone", NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data[1].status).toBe("created");
  });

  it("marks known families (attach), lost families, imported ids and erased families", () => {
    const rows = fixtureRows("daily-1.csv");
    importAll(rows.slice(0, 1));
    // Family B is already in the CRM (from the website) and was closed as lost.
    const b = captureLead({ source: "admissions", studentName: "Day One B", phone: "+916000010052", consent: { textVersion: "2026-10-20.v1" } }, NOW - 48 * HOUR);
    if (!b.ok) throw new Error();
    const admin = adminViewer();
    expect(changeStage(admin, b.leadId, "lost", "not_reachable", NOW - 24 * HOUR).ok).toBe(true);
    // Family C was erased; its suppression is newer than the Meta lead.
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'k1', ?)").run(hash("phone", "+916000010053"), NOW - HOUR);
    const result = previewImportRows(deps(), rows, "meta_lead_form", NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.map((r) => [r.row, r.status, r.lost ?? false])).toEqual([
      [2, "already_imported", false],
      [3, "attached", true],
      [4, "erased_family", false],
    ]);
  });

  it("refuses to run without the server key", () => {
    vi.stubEnv("INTEGRATIONS_SECRET", "");
    expect(previewImportRows(deps(), fixtureRows("daily-1.csv"), null, NOW)).toEqual({ ok: false, error: "not_configured", reason: "integrations_secret_missing" });
    expect(startImportBatch(deps(), saId, { consentBasis: "phone", startClock: true, rowsTotal: 1 }, NOW).ok).toBe(false);
  });
});

describe("import", () => {
  it("captures Meta rows through captureLead with the §14.2 options", () => {
    const { results, batch } = importAll(fixtureRows("meta-utf8-comma.csv"));
    expect(countBy(results)).toEqual({ created: 4 });
    expect(batch).toMatchObject({ status: "finished", kind: "meta_csv", created: 4, attached: 0, skipped: 0, invalid: 0, fileName: "leads_21-10.csv", mine: true });
    const first = core.calls[0];
    expect(first.input).toMatchObject({
      source: "meta_lead_ad",
      phone: "+916000010001",
      contactName: "Asha Test",
      district: "Shimla",
      currentClass: "class-11",
      programInterest: "neet",
      submittedBy: "parent",
      message: null,
      consent: { textVersion: "meta:900000000000001:cb", at: Date.parse("2026-10-21T04:45:30Z"), method: "meta_lead_form" },
      context: { utmSource: "facebook", utmMedium: "lead_ad", utmCampaign: "NEET 2027 admissions", utmContent: "Shimla NEET Oct", utmTerm: "Class 11-12 parents" },
    });
    expect(first.options).toEqual({
      origin: { provider: "meta", externalId: "1234567890123451", batchId: batch.id },
      existing: "attach",
      suppression: { createdAt: Date.parse("2026-10-21T04:45:30Z") },
      submissionMeta: {
        importBatch: batch.id,
        metaCreatedAt: "2026-10-21T04:45:30.000Z",
        formId: "900000000000001",
        adId: "120200000000000001",
        campaignId: "120200000000000003",
      },
      answers: null,
      slaClock: true,
      clockReason: "import",
      arrivedAt: NOW,
    });
    // Row 5 did not tick the consent checkbox: version without ":cb", flagged for the first call.
    expect(core.calls[3].input.consent.textVersion).toBe("meta:900000000000002");
    expect(core.calls[3].options.submissionMeta.consentConfirmed).toBe(false);
    expect(core.calls[1].input.context?.utmSource).toBe("instagram");
  });

  it("uses the staff basis for a staff-kept list (csv_import, staff-recorded, keyed refs)", () => {
    const rows = fixtureRows("excel-semicolon.csv");
    const batch = start("in_person", rows.length, false);
    const result = importBatchRows(deps(), saId, batch.id, { rows, offset: 0 }, NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(countBy(result.data.results)).toEqual({ created: 3 });
    expect(core.calls[0].input).toMatchObject({ source: "csv_import", consent: { textVersion: "staff-recorded", at: NOW, method: "csv_import" } });
    expect(core.calls[0].input.context).toBeUndefined();
    expect(core.calls[0].options.submissionMeta).toMatchObject({ consentMethod: "in_person" });
    expect(core.calls[0].options.slaClock).toBe(false);
    expect(core.calls[0].options.origin.provider).toBe("csv");
    expect(core.calls[0].options.origin.externalId).toBe(hash("csv-ref", "+916000010021|2026-10-20T05:30:00.000Z|"));
  });

  it("imports the same file twice: 0 created the second time", () => {
    const rows = fixtureRows("meta-utf16le-tab.csv");
    expect(countBy(importAll(rows).results)).toEqual({ created: 3 });
    const second = importAll(rows);
    expect(countBy(second.results)).toEqual({ already_imported: 3 });
    expect(second.batch).toMatchObject({ created: 0, skipped: 3 });
  });

  it("the same staff list twice is also idempotent (keyed csv refs, no file fingerprint)", () => {
    const rows = fixtureRows("excel-semicolon.csv");
    importAll(rows, "phone");
    expect(countBy(importAll(rows, "phone").results)).toEqual({ already_imported: 3 });
  });

  it("overlapping daily files: only the new rows are created", () => {
    importAll(fixtureRows("daily-1.csv"));
    const day2 = importAll(fixtureRows("daily-2.csv"));
    expect(day2.results.map((r) => [r.row, r.status])).toEqual([
      [2, "already_imported"],
      [3, "already_imported"],
      [4, "already_imported"],
      [5, "created"],
      [6, "created"],
    ]);
    expect(day2.batch).toMatchObject({ created: 2, skipped: 3 });
  });

  it("skips Meta ids the live webhook already imported", () => {
    getDb()
      .prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, batch_id, created_at) VALUES ('meta', ?, NULL, NULL, ?)")
      .run("1234567890123481", NOW - HOUR);
    const { results } = importAll(fixtureRows("daily-1.csv"));
    expect(results.map((r) => [r.status, r.resumed ?? false])).toEqual([
      ["already_imported", false],
      ["created", false],
      ["created", false],
    ]);
  });

  it("skips erased families (suppression newer than the lead)", () => {
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'k1', ?)").run(hash("phone", "+916000010051"), NOW);
    const { results, batch } = importAll(fixtureRows("daily-1.csv"));
    expect(results[0].status).toBe("erased_family");
    expect(batch).toMatchObject({ created: 2, skipped: 1 });
    expect(findLeadByPhone(getDb(), "+916000010051")).toBeNull();
  });

  it("attaches known families and lists lost families that appear again", () => {
    const lost = captureLead({ source: "contact", contactName: "Day One A", phone: "+916000010051", consent: { textVersion: "2026-10-20.v1" } }, NOW - 72 * HOUR);
    const known = captureLead({ source: "contact", contactName: "Day One B", phone: "+916000010052", consent: { textVersion: "2026-10-20.v1" } }, NOW - 72 * HOUR);
    if (!lost.ok || !known.ok) throw new Error();
    const admin = adminViewer();
    expect(changeStage(admin, lost.leadId, "lost", "not_interested", NOW - 24 * HOUR).ok).toBe(true);
    const { results, batch } = importAll(fixtureRows("daily-1.csv"));
    expect(results.map((r) => [r.status, r.lostLeadId ?? null])).toEqual([
      ["attached", lost.leadId],
      ["attached", null],
      ["created", null],
    ]);
    expect(batch).toMatchObject({ created: 1, attached: 2 });
    expect(findLeadByPhone(getDb(), "+916000010051")?.stage).toBe("lost");
  });

  it("blocks damaged rows and rows whose basis does not fit", () => {
    const { results, batch } = importAll(fixtureRows("excel-damaged.csv"));
    expect(results.map((r) => [r.row, r.status])).toEqual([
      [2, "damaged"],
      [3, "damaged"],
      [4, "created"],
      [5, "created"],
    ]);
    expect(batch).toMatchObject({ created: 2, invalid: 2 });
    // The server re-checks values even if the browser did not flag them.
    const sneaky = start("phone", 4);
    const callsBefore = core.calls.length;
    const result = importBatchRows(
      deps(),
      saId,
      sneaky.id,
      {
        rows: [
          { row: 2, phone: "9.19877E+11" },
          { row: 3, phone: "+916000010045", metaLeadId: "1.23457E+15" }, // a scientific id the browser did not flag
          { row: 4, phone: "+916000010046", contactName: "????? ????" }, // Hindi lost to an "ANSI" save
          { row: 5, phone: "+916000010047", district: "\u00e0\u00a4\u00b6\u00e0\u00a4\u00bf" }, // UTF-8 read as 1252
        ],
        offset: 0,
      },
      NOW,
    );
    expect(result.ok && result.data.results.map((r) => r.status)).toEqual(["damaged", "damaged", "damaged", "damaged"]);
    expect(core.calls).toHaveLength(callsBefore);
    // A cut id is only visible across its column: the browser's flag blocks it.
    const flagged = start("meta_lead_form", 1);
    const cut = importBatchRows(deps(), saId, flagged.id, { rows: [{ row: 2, phone: "+916000010048", metaLeadId: "1234567890123450", damaged: ["id_truncated"] }], offset: 0 }, NOW);
    expect(cut.ok && cut.data.results.map((r) => r.status)).toEqual(["damaged"]);
  });

  it("imports a real lead id that ends in 00 from a clean download (no Excel banner)", () => {
    const csv = [
      "id,created_time,form_id,full_name,phone_number,city",
      "1290430178445200,2026-10-21T07:00:00+0000,900000000000001,Zero One,p:+916000010081,Shimla",
      "1290430178445211,2026-10-21T07:05:00+0000,900000000000001,Zero Two,p:+916000010082,Solan",
      "1290430178445223,2026-10-21T07:10:00+0000,900000000000001,Zero Three,p:+916000010083,Kangra",
    ].join("\n");
    const parsed = parseCsv(csv);
    if (!parsed.ok) throw new Error(parsed.issue);
    const built = buildImportRows(parsed.header, parsed.rows, guessMapping(parsed.header), { encoding: "utf-8" });
    expect(built.rows.map((r) => r.damaged ?? [])).toEqual([[], [], []]);
    expect(wentThroughExcel(damageSummary(built.rows))).toBe(false);
    const preview = previewImportRows(deps(), built.rows, "meta_lead_form", NOW);
    expect(preview.ok && preview.data.map((r) => r.status)).toEqual(["created", "created", "created"]);
    const { results } = importAll(built.rows);
    expect(results.map((r) => [r.row, r.status])).toEqual([
      [2, "created"],
      [3, "created"],
      [4, "created"],
    ]);
    expect(core.calls[0].options.origin).toMatchObject({ provider: "meta", externalId: "1290430178445200" });
  });

  it("runs each chunk in its own transaction: a failure rolls back only that chunk", () => {
    const rows = fixtureRows("daily-2.csv");
    const batch = start("meta_lead_form", rows.length);
    const firstChunk = importBatchRows(deps(), saId, batch.id, { rows: rows.slice(0, 2), offset: 0 }, NOW);
    expect(firstChunk.ok).toBe(true);
    core.failOnPhone = "+916000010054";
    expect(() => importBatchRows(deps(), saId, batch.id, { rows: rows.slice(2), offset: 2 }, NOW)).toThrow("database is locked");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_external_refs").get()).toEqual({ n: 2 });
    expect(findLeadByPhone(getDb(), "+916000010053")).toBeNull();
    expect(listImportBatches(deps(), saId)[0]).toMatchObject({ created: 2 });
    // Resume: the client re-sends from the failed chunk.
    core.failOnPhone = null;
    const resumed = importBatchRows(deps(), saId, batch.id, { rows: rows.slice(2), offset: 2 }, NOW);
    if (!resumed.ok) throw new Error(resumed.reason);
    expect(resumed.data.batch).toMatchObject({ created: 5 });
  });

  it("resuming a chunk whose answer was lost neither duplicates leads nor double-counts", () => {
    const rows = fixtureRows("daily-1.csv");
    const batch = start("meta_lead_form", rows.length);
    expect(importBatchRows(deps(), saId, batch.id, { rows, offset: 0 }, NOW).ok).toBe(true);
    const again = importBatchRows(deps(), saId, batch.id, { rows, offset: 0 }, NOW + 1000);
    if (!again.ok) throw new Error(again.reason);
    expect(again.data.results.every((r) => r.status === "already_imported" && r.resumed)).toBe(true);
    expect(again.data.batch).toMatchObject({ created: 3, skipped: 0 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 3 });
  });

  it("resuming after a lost answer keeps the totals exact and still lists the lost family", () => {
    // Family A is in the CRM and closed as lost; family C was erased; the file also has a bad phone.
    const lost = captureLead({ source: "contact", contactName: "Day One A", phone: "+916000010051", consent: { textVersion: "2026-10-20.v1" } }, NOW - 72 * HOUR);
    if (!lost.ok) throw new Error();
    const admin = adminViewer();
    expect(changeStage(admin, lost.leadId, "lost", "not_interested", NOW - 24 * HOUR).ok).toBe(true);
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'k1', ?)").run(hash("phone", "+916000010053"), NOW);
    const rows: ImportRowInput[] = [...fixtureRows("daily-1.csv"), { row: 5, metaLeadId: "1234567890123489", phone: "12345" }];
    const batch = start("meta_lead_form", rows.length);
    const first = importBatchRows(deps(), saId, batch.id, { rows, offset: 0 }, NOW);
    if (!first.ok) throw new Error(first.reason);
    expect(first.data.batch).toMatchObject({ created: 1, attached: 1, skipped: 1, invalid: 1 });
    // The answer never reached the browser: it sends the same chunk again.
    const again = importBatchRows(deps(), saId, batch.id, { rows, offset: 0 }, NOW + 1000);
    if (!again.ok) throw new Error(again.reason);
    expect(again.data.results.map((r) => [r.row, r.status, r.resumed ?? false, r.lostLeadId ?? null])).toEqual([
      [2, "already_imported", true, lost.leadId],
      [3, "already_imported", true, null],
      [4, "erased_family", false, null],
      [5, "invalid_phone", false, null],
    ]);
    expect(again.data.batch).toMatchObject({ created: 1, attached: 1, skipped: 1, invalid: 1 });
    const finished = finishImportBatch(deps(), saId, batch.id, NOW + 2000);
    expect(finished.ok && finished.data).toMatchObject({ created: 1, attached: 1, skipped: 1, invalid: 1 });
  });

  it("refuses a chunk that skips ahead or overlaps the rows already counted", () => {
    const rows = fixtureRows("daily-2.csv");
    const batch = start("meta_lead_form", rows.length);
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows.slice(2), offset: 2 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "chunk_out_of_order" });
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows.slice(0, 2), offset: 0 }, NOW).ok).toBe(true);
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows.slice(1), offset: 1 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "chunk_out_of_order" });
    expect(core.calls).toHaveLength(2);
  });

  it("an erased family with a future or impossible created_time stays erased", () => {
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'k1', ?)").run(hash("phone", "+916000010051"), NOW - HOUR);
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'k1', ?)").run(hash("phone", "+916000010052"), NOW - HOUR);
    const rows: ImportRowInput[] = [
      { row: 2, metaLeadId: "1234567890123561", phone: "+916000010051", createdTime: "2062-10-21T04:00:00.000Z" }, // typo year
      { row: 3, phone: "+916000010052", createdTime: new Date(NOW + 2 * 24 * HOUR).toISOString() }, // a sheet's "Date" in the future
      { row: 4, metaLeadId: "1234567890123563", phone: "+916000010054", createdTime: new Date(NOW + 5 * 60 * 1000).toISOString() }, // clock skew
    ];
    const preview = previewImportRows(deps(), rows, "phone", NOW);
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.data.map((r) => r.status)).toEqual(["erased_family", "erased_family", "created"]);
    const { results } = importAll(rows, "phone");
    expect(results.map((r) => r.status)).toEqual(["erased_family", "erased_family", "created"]);
    expect(core.calls.map((c) => c.options.suppression.createdAt)).toEqual([null, null, NOW + 5 * 60 * 1000]);
    expect(core.calls[0].options.submissionMeta.metaCreatedAt).toBeUndefined();
    // With the Meta basis the consent time is never later than the import.
    core.calls = [];
    importAll([{ row: 2, metaLeadId: "1234567890123564", phone: "+916000010055", createdTime: new Date(NOW + 5 * 60 * 1000).toISOString() }]);
    expect(core.calls[0].input.consent.at).toBe(NOW);
  });

  it("stores only known centres, classes and courses", () => {
    importAll(
      [
        { row: 2, phone: "+916000010071", centre: "shimla", currentClass: "class-11", programInterest: "neet" },
        { row: 3, phone: "+916000010072", centre: "nowhere-centre", currentClass: "class-99", programInterest: "mba" },
      ],
      "phone",
    );
    expect(core.calls.map((c) => [c.input.centreSlug, c.input.currentClass, c.input.programInterest])).toEqual([
      ["shimla", "class-11", "neet"],
      [null, null, null],
    ]);
  });

  it("during a key rotation, refs and erasures under the previous key still count", () => {
    vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", TEST_INTEGRATIONS_SECRET_PREVIOUS);
    const rows = fixtureRows("excel-semicolon.csv");
    // Row 2 was imported before the rotation (its ref is the previous key's hash).
    getDb()
      .prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, batch_id, created_at) VALUES ('csv', ?, NULL, 'old', ?)")
      .run(previousHash("csv-ref", "+916000010021|2026-10-20T05:30:00.000Z|"), NOW - 48 * HOUR);
    // Row 3's family was erased before the rotation.
    getDb().prepare("INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, 'old', ?)").run(previousHash("phone", "+916000010022"), NOW);
    const preview = previewImportRows(deps(), rows, "phone", NOW);
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.data.map((r) => r.status)).toEqual(["already_imported", "erased_family", "created"]);
    const { results } = importAll(rows, "phone");
    expect(results.map((r) => r.status)).toEqual(["already_imported", "erased_family", "created"]);
    // New refs are written under the current key.
    expect(core.calls.at(-1)?.options.origin.externalId).toBe(hash("csv-ref", "+916000010023|2026-10-19T18:30:00.000Z|"));
  });

  it("guards batches: unknown, another user's, finished, full", () => {
    const batch = start("phone", 2);
    const otherId = insertUser(getDb(), { role: "admin", loginId: "sa.two", displayName: "Two", passwordHash: "scrypt$test", mustChangePassword: false, now: NOW }).id;
    const row: ImportRowInput = { row: 2, phone: "+916000010099" };
    expect(importBatchRows(deps(), saId, "nope", { rows: [row], offset: 0 }, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(importBatchRows(deps(), otherId, batch.id, { rows: [row], offset: 0 }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(finishImportBatch(deps(), otherId, batch.id, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(finishImportBatch(deps(), saId, batch.id, NOW).ok).toBe(true);
    expect(importBatchRows(deps(), saId, batch.id, { rows: [row], offset: 0 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "batch_finished" });
  });

  it("takes no more rows than the batch declared (and never more than 5,000)", () => {
    const rows = (n: number, from = 0): ImportRowInput[] => Array.from({ length: n }, (_, i) => ({ row: from + i + 2, phone: `+9160000${String(20100 + from + i)}` }));
    const batch = start("phone", 3);
    // rowsTotal + 1 in one chunk, then in a later chunk.
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows(4), offset: 0 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "batch_full" });
    expect(core.calls).toHaveLength(0);
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows(2), offset: 0 }, NOW).ok).toBe(true);
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows(2, 2), offset: 2 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "batch_full" });
    const last = importBatchRows(deps(), saId, batch.id, { rows: rows(1, 2), offset: 2 }, NOW);
    expect(last.ok && last.data.batch).toMatchObject({ rowsTotal: 3, created: 3 });
    // A re-sent chunk is still answered once the batch is full.
    expect(importBatchRows(deps(), saId, batch.id, { rows: rows(1, 2), offset: 2 }, NOW).ok).toBe(true);
    // The 5,000-row cap holds even for a batch row edited past it.
    const big = start("phone", 2);
    getDb().prepare("UPDATE crm_import_batches SET rows_total = 9000, created = 4999 WHERE id = ?").run(big.id);
    expect(importBatchRows(deps(), saId, big.id, { rows: rows(2, 10), offset: 4999 }, NOW)).toMatchObject({ ok: false, error: "conflict", reason: "batch_full" });
  });

  it("limits batches to 20 per hour per user", () => {
    for (let i = 0; i < 20; i++) expect(startImportBatch(deps(), saId, { consentBasis: "phone", startClock: true, rowsTotal: 1 }, NOW + i).ok).toBe(true);
    expect(startImportBatch(deps(), saId, { consentBasis: "phone", startClock: true, rowsTotal: 1 }, NOW + 30)).toMatchObject({ ok: false, error: "rate_limited" });
    expect(startImportBatch(deps(), saId, { consentBasis: "phone", startClock: true, rowsTotal: 1 }, NOW + HOUR + 30).ok).toBe(true);
  });

  it("audits counts only (no names, phones, places or file names)", () => {
    const { batch } = importAll(fixtureRows("meta-utf8-comma.csv"));
    expect(finishImportBatch(deps(), saId, batch.id, NOW + 5).ok).toBe(true); // finishing twice adds no second row
    const entries = listAudit(getDb(), { limit: 50 }).filter((e) => e.action.startsWith("crm.import"));
    expect(entries.map((e) => e.action).sort()).toEqual([IMPORT_AUDIT.import, IMPORT_AUDIT.importStart].sort());
    const finish = entries.find((e) => e.action === IMPORT_AUDIT.import);
    expect(finish?.details).toEqual({
      kind: "meta_csv",
      consentBasis: "meta_lead_form",
      startClock: true,
      rowsTotal: 4,
      created: 4,
      attached: 0,
      skipped: 0,
      invalid: 0,
    });
    const text = JSON.stringify(entries);
    expect(text).not.toMatch(/6000010001|Asha|Shimla|leads_21|example\.com/);
  });

  it("history lists batches newest first with the viewer's own marked", () => {
    importAll(fixtureRows("daily-1.csv"), "meta_lead_form", NOW);
    const later = startImportBatch(deps(), saId, { consentBasis: "written", startClock: false, rowsTotal: 2 }, NOW + HOUR);
    expect(later.ok).toBe(true);
    const history = listImportBatches(deps(), saId);
    expect(history.map((b) => [b.consentBasis, b.status])).toEqual([
      ["written", "open"],
      ["meta_lead_form", "finished"],
    ]);
    expect(listImportBatches(deps(), "someone-else")[0].mine).toBe(false);
  });
});

describe("no direct lead SQL", () => {
  it("the import code never writes crm_leads itself (only captureLead does)", () => {
    for (const file of ["./import.ts", "./import-backend.ts", "./rows.ts", "./csv.ts", "./decode.ts", "./excel-damage.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source, file).not.toMatch(/crm_leads|crm_lead_activities|INSERT\s+INTO\s+crm_external_refs|INSERT\s+INTO\s+crm_erase/i);
    }
  });
});
