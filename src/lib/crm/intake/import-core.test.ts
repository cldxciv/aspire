import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The CSV import END TO END through LR-CORE, with nothing in between: the production wiring
// (`importDeps`) → CORE `captureLead` (§14.2: refs, attach, suppression) → the arrival pipeline
// (§14.1) → the routing / SLA seams. The seams are test-defined (`fixtures/seams.ts`): these tests
// check the CALLS an import causes, never a stub's answers (P5). Synthetic people only; no network.
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("./fixtures/seams")).slaSeam() }));

import { consentHistory } from "@/components/crm/format";
import { pickAssigneeForLead, previewPlace, routeLead } from "@/lib/crm/routing";
import { startSlaClock } from "@/lib/crm/sla";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { captureLead, changeStage, eraseLead, getLead, resolveCrmViewer } from "../index";
import { findLeadById, findLeadByPhone } from "../repo/leads";
import { fixtureRows, TEST_INTEGRATIONS_SECRET } from "./fixtures/import-kit";
import { finishImportBatch, importBatchRows, previewImportRows, startImportBatch, type ImportDeps } from "./import";
import { importDeps } from "./import-backend";
import { chunkImportRows, type ImportConsentBasis, type ImportRowInput } from "./rows";

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const HOUR = 60 * 60 * 1000;

let saId: string;
let deps: ImportDeps;

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  resetDatabaseForTests();
  vi.mocked(startSlaClock).mockClear();
  vi.mocked(routeLead).mockClear();
  vi.mocked(previewPlace).mockClear();
  vi.mocked(pickAssigneeForLead).mockReset().mockReturnValue(null);
  saId = insertUser(getDb(), { role: "admin", loginId: "sa.core", displayName: "Super Admin", passwordHash: "scrypt$test", mustChangePassword: false, now: NOW }).id;
  deps = importDeps(getDb());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function admin() {
  const viewer = resolveCrmViewer({ userId: saId, role: "admin", displayName: "SA" });
  if (!viewer) throw new Error("no viewer");
  return viewer;
}

function staffUser(loginId: string): string {
  return insertUser(getDb(), { role: "staff", loginId, displayName: loginId, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW }).id;
}

function importAll(rows: ImportRowInput[], basis: ImportConsentBasis = "meta_lead_form", startClock = true, now = NOW) {
  const batch = startImportBatch(deps, saId, { consentBasis: basis, startClock, rowsTotal: rows.length }, now);
  if (!batch.ok) throw new Error(batch.reason);
  let offset = 0;
  const results = chunkImportRows(rows).flatMap((rowsOfChunk) => {
    const result = importBatchRows(deps, saId, batch.data.id, { rows: rowsOfChunk, offset }, now);
    if (!result.ok) throw new Error(result.reason);
    offset += rowsOfChunk.length;
    return result.data.results;
  });
  const finished = finishImportBatch(deps, saId, batch.data.id, now);
  if (!finished.ok) throw new Error(finished.reason);
  return { results, batch: finished.data };
}

const statuses = (results: { status: string }[]) => results.map((r) => r.status);

function detail(phone: string) {
  const lead = findLeadByPhone(getDb(), phone);
  if (!lead) throw new Error(`no lead for ${phone}`);
  const result = getLead(admin(), lead.id, NOW, { audit: false });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("a Meta Leads Center download, end to end", () => {
  it("creates leads with the Meta source, consent version, origin and attribution", () => {
    const { batch } = importAll(fixtureRows("meta-utf8-comma.csv"));
    expect(batch).toMatchObject({ kind: "meta_csv", created: 4 });

    const ticked = detail("+916000010001");
    expect(ticked).toMatchObject({ source: "meta_lead_ad", consentTextVersion: "meta:900000000000001:cb", confirmConsent: false, stage: "new" });
    expect(ticked.consentAt).toBe("2026-10-21T04:45:30.000Z");
    expect(ticked.utm).toMatchObject({ source: "facebook", medium: "lead_ad", campaign: "NEET 2027 admissions" });
    expect(ticked.origins).toEqual([{ provider: "meta", metaLeadId: "1234567890123451", createdAt: new Date(NOW).toISOString() }]);
    const submission = ticked.activities.find((activity) => activity.type === "submission");
    expect(submission?.meta).toMatchObject({ source: "meta_lead_ad", consentMethod: "meta_lead_form", importBatch: batch.id, formId: "900000000000001", submittedBy: "parent" });

    // No consent tick box on the form: staff confirm consent on the first call (H4).
    expect(detail("+916000010004")).toMatchObject({ consentTextVersion: "meta:900000000000002", confirmConsent: true });
  });

  it("hands the family's place to the routing seam and previews it read-only", () => {
    const rows = fixtureRows("meta-utf8-comma.csv");
    const preview = previewImportRows(deps, rows, "meta_lead_form", NOW);
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.data.map((row) => [row.areaId, row.place])).toEqual([
      [null, "unknown"],
      ["kangra", "area"],
      [null, "unknown"],
      [null, "unknown"],
    ]);
    expect(vi.mocked(previewPlace).mock.calls[1][1]).toEqual({ districtInput: "Dharamshala", stateInput: null, centreSlug: null });
    expect(vi.mocked(routeLead)).not.toHaveBeenCalled();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 0 });

    importAll(rows);
    expect(vi.mocked(routeLead).mock.calls.map((call) => call[2].districtInput)).toEqual(["Shimla", "Dharamshala", "Manali, HP", "Nahan"]);
  });

  it("starts the first-call clock with the import reason only for new families, as the batch asked", () => {
    importAll(fixtureRows("daily-1.csv"), "meta_lead_form", true);
    const calls = vi.mocked(startSlaClock).mock.calls.map((call) => call[1]);
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call).toMatchObject({ reason: "import", override: true, source: "meta_lead_ad", arrivedAt: NOW, gate: false, manual: false });

    vi.mocked(startSlaClock).mockClear();
    importAll(fixtureRows("excel-semicolon.csv"), "phone", false);
    expect(vi.mocked(startSlaClock).mock.calls.map((call) => call[1])).toEqual(
      Array(3).fill(expect.objectContaining({ reason: "import", override: false, source: "csv_import" })),
    );

    // Families already in the CRM are only attached: no clock at all.
    vi.mocked(startSlaClock).mockClear();
    const known = [{ row: 2, phone: "+916000010051", createdTime: "2026-10-21T01:00:00.000Z" }];
    expect(statuses(importAll(known, "phone").results)).toEqual(["attached"]);
    expect(vi.mocked(startSlaClock)).not.toHaveBeenCalled();
  });
});

describe("a staff-kept list, end to end", () => {
  it("stores csv_import, staff-recorded and HOW the families agreed, and the lead page shows it", () => {
    const { batch } = importAll(fixtureRows("excel-semicolon.csv"), "in_person", false);
    expect(batch).toMatchObject({ kind: "csv", created: 3 });
    const lead = detail("+916000010021");
    expect(lead).toMatchObject({ source: "csv_import", consentTextVersion: "staff-recorded" });
    const submission = lead.activities.find((activity) => activity.type === "submission");
    // CORE writes `consentMethod: "csv_import"` first; the import's submissionMeta must replace it
    // with the staff choice (§17 / §23: "staff-recorded plus the method").
    expect(submission?.meta).toMatchObject({ source: "csv_import", consentTextVersion: "staff-recorded", consentMethod: "in_person", importBatch: batch.id });
    expect(consentHistory(lead.activities)).toEqual([expect.objectContaining({ kind: "import", version: "staff-recorded", method: "in_person" })]);

    const written = importAll([{ row: 2, phone: "+916000010029" }], "written").batch;
    expect(written.created).toBe(1);
    expect(consentHistory(detail("+916000010029").activities)[0]).toMatchObject({ kind: "import", method: "written" });
  });
});

describe("existing families (attach, never reopen)", () => {
  it("keeps a lost family's stage, consent, lost reason and assignee, adds history, and lists it", () => {
    const first = staffUser("exec.first");
    vi.mocked(pickAssigneeForLead).mockReturnValue({ userId: first, via: "rule" });
    const lost = captureLead({ source: "contact", contactName: "Day One A", phone: "+916000010051", consent: { textVersion: "2026-10-20.v1" } }, NOW - 72 * HOUR);
    if (!lost.ok) throw new Error();
    expect(changeStage(admin(), lost.leadId, "lost", "not_interested", NOW - 24 * HOUR).ok).toBe(true);
    const before = findLeadById(getDb(), lost.leadId);

    // Someone else would be picked now: a new family gets them, the attached family does not.
    const second = staffUser("exec.second");
    vi.mocked(pickAssigneeForLead).mockReturnValue({ userId: second, via: "rule" });
    vi.mocked(startSlaClock).mockClear();
    const { results, batch } = importAll(fixtureRows("daily-1.csv"));
    expect(results.map((r) => [r.status, r.lostLeadId ?? null])).toEqual([
      ["attached", lost.leadId],
      ["created", null],
      ["created", null],
    ]);
    expect(batch).toMatchObject({ created: 2, attached: 1 });

    const after = findLeadById(getDb(), lost.leadId);
    expect(after).toMatchObject({
      stage: "lost",
      lostReason: "not_interested",
      assignedTo: first,
      consentTextVersion: "2026-10-20.v1",
      consentAt: before?.consentAt,
      submissionCount: (before?.submissionCount ?? 0) + 1,
    });
    const history = detail("+916000010051").activities;
    expect(history.filter((a) => a.type === "submission")[0].meta).toMatchObject({ attached: true, importBatch: batch.id });
    expect(history.filter((a) => a.type === "stage_change" && a.meta.to === "new")).toEqual([]);
    expect(findLeadByPhone(getDb(), "+916000010052")?.assignedTo).toBe(second);
    expect(vi.mocked(startSlaClock).mock.calls.map((call) => call[1].leadId)).not.toContain(lost.leadId);
  });
});

describe("idempotency", () => {
  it("the same file twice creates nothing the second time", () => {
    const rows = fixtureRows("meta-utf16le-tab.csv");
    expect(importAll(rows).batch).toMatchObject({ created: 3 });
    expect(importAll(rows).batch).toMatchObject({ created: 0, skipped: 3 });
    expect(importAll(fixtureRows("excel-semicolon.csv"), "phone").batch).toMatchObject({ created: 3 });
    expect(importAll(fixtureRows("excel-semicolon.csv"), "phone").batch).toMatchObject({ created: 0, skipped: 3 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 6 });
  });

  it("overlapping daily files only add the new rows", () => {
    importAll(fixtureRows("daily-1.csv"));
    expect(statuses(importAll(fixtureRows("daily-2.csv")).results)).toEqual(["already_imported", "already_imported", "already_imported", "created", "created"]);
  });

  it("skips ids the webhook already imported", () => {
    getDb().prepare("INSERT INTO crm_external_refs (provider, external_id, lead_id, batch_id, created_at) VALUES ('meta', ?, NULL, NULL, ?)").run("1234567890123481", NOW - HOUR);
    expect(statuses(importAll(fixtureRows("daily-1.csv")).results)).toEqual(["already_imported", "created", "created"]);
  });
});

describe("erased families stay erased", () => {
  it("a family erased in the CRM is not brought back by its Meta id or by an older list", () => {
    importAll(fixtureRows("daily-1.csv"));
    const lead = findLeadByPhone(getDb(), "+916000010051");
    if (!lead) throw new Error();
    expect(eraseLead(admin(), lead.id, NOW + HOUR, { reason: "family_request" }).ok).toBe(true);

    // The same download again: its ref survives the erase, nothing is recreated.
    expect(statuses(importAll(fixtureRows("daily-1.csv"), "meta_lead_form", true, NOW + 2 * HOUR).results)).toEqual(Array(3).fill("already_imported"));
    expect(findLeadByPhone(getDb(), "+916000010051")).toBeNull();

    // A staff list with the same number: dated before the erase (or undated) → skipped; a new
    // enquiry made after the erase → a new lead (D-042, M5).
    const later = NOW + 2 * HOUR;
    const list: ImportRowInput[] = [
      { row: 2, phone: "6000010051", createdTime: new Date(NOW).toISOString() },
      { row: 3, phone: "6000010051" },
    ];
    const preview = previewImportRows(deps, list, "phone", later);
    expect(preview.ok && preview.data.map((r) => r.status)).toEqual(["erased_family", "erased_family"]);
    expect(statuses(importAll(list, "phone", true, later).results)).toEqual(["erased_family", "erased_family"]);
    expect(findLeadByPhone(getDb(), "+916000010051")).toBeNull();
    const fresh = importAll([{ row: 2, phone: "6000010051", createdTime: new Date(NOW + 90 * 60 * 1000).toISOString() }], "phone", true, later);
    expect(statuses(fresh.results)).toEqual(["created"]);
  });

  it("without the server key nothing is imported (503 not_configured upstream)", () => {
    vi.stubEnv("INTEGRATIONS_SECRET", "");
    expect(startImportBatch(deps, saId, { consentBasis: "phone", startClock: true, rowsTotal: 1 }, NOW)).toMatchObject({ ok: false, error: "not_configured" });
    expect(previewImportRows(deps, fixtureRows("daily-1.csv"), "phone", NOW)).toMatchObject({ ok: false, error: "not_configured" });
  });
});
