import { rmSync } from "node:fs";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportDeps } from "@/lib/qb/import/deps";
import type { ImportViewer } from "@/lib/qb/import/types";
import type { QbCapability } from "@/lib/qb/types";

/*
 * /api/admin/qb/imports/** against an in-memory database, a fake Claude client and fake QB-CORE-B
 * hooks. Only QB-IMPORT's adapter (core.ts) is mocked: its guard stands in for QB-CORE-B's
 * `requireQbApi` (signed out → 401, no QB membership → 403, capability per the §B6 matrix).
 */
const state = vi.hoisted(() => ({
  deps: null as unknown as ImportDeps,
  viewer: null as ImportViewer | "no_membership" | null,
}));

vi.mock("@/lib/qb/import/core", async () => {
  const { rejectCrossOrigin } = await import("@/lib/auth/request");
  const { portalApiError } = await import("@/lib/auth/responses");
  return {
    importDeps: () => state.deps,
    requireImportApi: async (request: Request, capability: QbCapability, options: { write: boolean }) => {
      if (options.write) {
        const rejection = rejectCrossOrigin(request);
        if (rejection) return { ok: false, response: rejection.response };
      }
      if (state.viewer === null) return { ok: false, response: portalApiError("unauthenticated") };
      if (state.viewer === "no_membership" || !state.viewer.can(capability)) return { ok: false, response: portalApiError("forbidden") };
      return { ok: true, viewer: state.viewer };
    },
  };
});

const { resetDatabaseForTests } = await import("@/lib/db/connection");
const { makeKit, syntheticPdf, viewer } = await import("@/lib/qb/import/import-test-kit");
const { toCsv } = await import("@/lib/qb/import/csv");
const imports = await import("./route");
const job = await import("./[id]/route");
const source = await import("./[id]/source/route");
const template = await import("./template/route");
const { resetImportRateLimitersForTests } = await import("./shared");

vi.setConfig({ testTimeout: 30_000 });

const ORIGIN = "http://localhost:3000";
const JEE_META = { sourceKind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", session: "January", shift: "Shift 1", language: "en" };
let kit: ReturnType<typeof makeKit>;

beforeEach(() => {
  resetDatabaseForTests();
  resetImportRateLimitersForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  kit = makeKit();
  state.deps = kit.deps;
  state.viewer = viewer("reviewer");
});

afterEach(() => {
  rmSync(kit.dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function multipart(fields: Record<string, string | Blob>, options: { contentLength?: number | null; origin?: string } = {}): Promise<NextRequest> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value instanceof Blob) form.append(name, value, name === "file" ? "upload.bin" : undefined);
    else form.append(name, value);
  }
  const encoded = new Request(`${ORIGIN}/api/admin/qb/imports`, { method: "POST", body: form });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const headers = new Headers({ "content-type": encoded.headers.get("content-type") ?? "", origin: options.origin ?? ORIGIN, "x-forwarded-for": "203.0.113.5" });
  if (options.contentLength !== null) headers.set("content-length", String(options.contentLength ?? bytes.byteLength));
  return new NextRequest(`${ORIGIN}/api/admin/qb/imports`, { method: "POST", headers, body: bytes });
}

function jsonRequest(path: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function uploadPdf(meta: Record<string, unknown> = JEE_META, pages = 2): Promise<Response> {
  const pdf = await syntheticPdf(pages);
  return imports.POST(await multipart({ file: new Blob([pdf as BlobPart], { type: "application/pdf" }), kind: "pdf_paper", meta: JSON.stringify(meta), licenceAck: "true" }));
}

describe("POST /api/admin/qb/imports", () => {
  it("lets an author import a CSV bank file but not a PDF read by AI", async () => {
    state.viewer = viewer("author");
    const csv = toCsv([
      ["exams", "subject", "type", "stem_en", "option_a_en", "option_b_en", "answer"],
      ["JEE_MAIN", "physics", "single", "Synthetic: which is a scalar?", "Mass", "Force", "A"],
    ]);
    const created = await imports.POST(await multipart({ file: new Blob([csv], { type: "text/csv" }), kind: "csv_bank", meta: JSON.stringify({ sourceKind: "aspire", language: "en" }), licenceAck: "true" }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.data).toMatchObject({ kind: "csv_bank", status: "ready", mode: "none", report: { valid: 1 } });

    const pdf = await uploadPdf();
    expect(pdf.status).toBe(403);

    // An official key sets official answers: like a key PDF, it needs import_ai even as a CSV.
    const keyCsv = toCsv([["qno", "answer"], ["1", "B"]]);
    const officialKey = await imports.POST(
      await multipart({ file: new Blob([keyCsv], { type: "text/csv" }), kind: "csv_key", meta: JSON.stringify({ ...JEE_META, keyStage: "final" }), licenceAck: "true" }),
    );
    expect(officialKey.status).toBe(403);
    const aspireKey = await imports.POST(
      await multipart({ file: new Blob([keyCsv], { type: "text/csv" }), kind: "csv_key", meta: JSON.stringify({ sourceKind: "aspire", language: "en", keyFor: [body.data.id] }), licenceAck: "true" }),
    );
    expect(aspireKey.status).toBe(201);
  });

  it("answers 401 signed out, 403 without QB membership, 403 cross-origin", async () => {
    state.viewer = null;
    expect((await uploadPdf()).status).toBe(401);
    state.viewer = "no_membership";
    expect((await imports.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports`))).status).toBe(403);
    state.viewer = viewer("reviewer");
    const pdf = await syntheticPdf(1);
    const crossOrigin = await imports.POST(await multipart({ file: new Blob([pdf as BlobPart]), kind: "pdf_paper", meta: JSON.stringify(JEE_META), licenceAck: "true" }, { origin: "https://evil.example" }));
    expect(crossOrigin.status).toBe(403);
  });

  it("detects a truncated upload, requires Content-Length, and refuses files over the cap unread", async () => {
    const pdf = await syntheticPdf(1);
    const fields = { file: new Blob([pdf as BlobPart]), kind: "pdf_paper", meta: JSON.stringify(JEE_META), licenceAck: "true" };
    const declared = await multipart(fields);
    const truncated = await imports.POST(await multipart(fields, { contentLength: Number(declared.headers.get("content-length")) + 500 }));
    expect(truncated.status).toBe(400);
    expect(await truncated.json()).toMatchObject({ reason: "upload_truncated" });
    const missing = await imports.POST(await multipart(fields, { contentLength: null }));
    expect(await missing.json()).toMatchObject({ reason: "upload_length_required" });
    const huge = await imports.POST(await multipart(fields, { contentLength: 10 * 1024 * 1024 + 1 }));
    expect(huge.status).toBe(413);
    const json = await imports.POST(jsonRequest("/api/admin/qb/imports", { kind: "pdf_paper" }));
    expect(json.status).toBe(415);
  });

  it("returns 409 taxonomy_unconfirmed and validates the metadata with the shared schema", async () => {
    kit.store.confirmed.delete("JEE_MAIN");
    const gated = await uploadPdf();
    expect(gated.status).toBe(409);
    expect(await gated.json()).toMatchObject({ ok: false, error: "bad_request", reason: "taxonomy_unconfirmed" });
    const invalid = await uploadPdf({ ...JEE_META, year: undefined });
    expect(invalid.status).toBe(422);
  });
});

describe("/api/admin/qb/imports/[id]", () => {
  it("shows a job and runs it with import_ai; an author may not run it", async () => {
    const created = await (await uploadPdf()).json();
    const id = created.data.id as string;
    const shown = await job.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/${id}`), ctx(id));
    expect(shown.status).toBe(200);
    expect((await shown.json()).data).toMatchObject({ job: { id, status: "ready", estimate: { aiRequired: true } }, summary: { ai: { enabled: true } }, viewer: { can: { importAi: true } } });

    state.viewer = viewer("author");
    expect((await job.POST(jsonRequest(`/api/admin/qb/imports/${id}`, { action: "run" }), ctx(id))).status).toBe(403);
    state.viewer = viewer("reviewer");
    const run = await job.POST(jsonRequest(`/api/admin/qb/imports/${id}`, { action: "run" }), ctx(id));
    expect(run.status).toBe(200);
    await vi.waitFor(async () => {
      const latest = await (await job.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/${id}`), ctx(id))).json();
      expect(latest.data.job.status).toBe("done");
    });
    expect(kit.store.drafts.size).toBe(4);
  });

  it("validates actions and ids, and refuses closing a busy job", async () => {
    const id = (await (await uploadPdf()).json()).data.id as string;
    expect((await job.POST(jsonRequest(`/api/admin/qb/imports/${id}`, { action: "explode" }), ctx(id))).status).toBe(422);
    expect((await job.POST(jsonRequest(`/api/admin/qb/imports/imp_0000000000000000`, { action: "pause" }), ctx("imp_0000000000000000"))).status).toBe(404);
    expect((await job.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/../x`), ctx("../x"))).status).toBe(404);
    const pause = await job.POST(jsonRequest(`/api/admin/qb/imports/${id}`, { action: "pause" }), ctx(id));
    expect(pause.status).toBe(409);
    expect(await pause.json()).toMatchObject({ reason: "status_ready" });
  });

  it("serves the source PDF with safe headers until the import is closed", async () => {
    const id = (await (await uploadPdf()).json()).data.id as string;
    const pdf = await source.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/${id}/source`), ctx(id));
    expect(pdf.status).toBe(200);
    expect(Object.fromEntries(pdf.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${id}.pdf"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "cross-origin-resource-policy": "same-origin",
    });
    expect(pdf.headers.get("content-security-policy")).toBeNull();
    const closed = await job.POST(jsonRequest(`/api/admin/qb/imports/${id}`, { action: "close" }), ctx(id));
    expect((await closed.json()).data.job).toMatchObject({ status: "closed", fileAvailable: false });
    expect((await source.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/${id}/source`), ctx(id))).status).toBe(404);
  });
});

describe("GET /api/admin/qb/imports and the template", () => {
  it("lists imports with the AI status and today's spend", async () => {
    await uploadPdf();
    const listed = await (await imports.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports`))).json();
    expect(listed.data).toMatchObject({ summary: { dailyCapUsd: 10, spentTodayUsd: 0, confirmedExams: ["JEE_MAIN", "NEET", "JEE_ADV"] }, viewer: { role: "reviewer" } });
    expect(listed.data.imports).toHaveLength(1);
  });

  it("downloads the CSV templates", async () => {
    const bank = await template.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/template?kind=csv_bank`));
    expect(bank.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(bank.headers.get("content-disposition")).toContain("attachment;");
    const bytes = Buffer.from(await bank.arrayBuffer());
    // A UTF-8 byte-order mark, so spreadsheet programs read Hindi correctly.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.subarray(3).toString("utf8");
    expect(text.startsWith("id,exams,subject,chapter")).toBe(true);
    expect(text).toContain("TEMPLATE-EXAMPLE-1");
    const key = await template.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/template?kind=csv_key`));
    expect((await key.text()).startsWith("qno,question_id,subject,booklet,answer,status")).toBe(true);
    expect((await template.GET(new NextRequest(`${ORIGIN}/api/admin/qb/imports/template?kind=pdf`))).status).toBe(400);
  });
});
