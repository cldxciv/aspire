import { existsSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QbImportMeta } from "@/lib/qb/types";

import { syntheticDocx, writeZip } from "./__fixtures__/zip-writer";
import { toCsv } from "./csv";
import { keyHeaderMismatches, renormalizeJob } from "./ingest";
import {
  documentBlock,
  encryptedPdf,
  type Kit,
  makeKit,
  paperReply,
  requestPagesOf,
  syntheticPdf,
  usage,
  viewer,
} from "./import-test-kit";
import { createImport, importAction, pruneImports, startRunner, tickImport, type UploadInput } from "./jobs";
import { acquireLease, extendLease, releaseLease, withHeartbeat } from "./lease";
import { getImport, listItems } from "./repo";

const { resetDatabaseForTests } = await import("@/lib/db/connection");

vi.setConfig({ testTimeout: 30_000 });

const JEE_PAPER: QbImportMeta = { sourceKind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", session: "January", shift: "Shift 1", language: "en" };
const NEET_PAPER: QbImportMeta = { sourceKind: "official", exam: "NEET", year: 2025, date: "2025-05-04", booklet: "Q1", language: "en" };

const kits: Kit[] = [];
function kit(options: Parameters<typeof makeKit>[0] = {}): Kit {
  const created = makeKit(options);
  kits.push(created);
  return created;
}

beforeEach(() => {
  resetDatabaseForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const created of kits.splice(0)) rmSync(created.dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function upload(k: Kit, input: Partial<UploadInput> & { bytes: Uint8Array }, who = viewer()) {
  return createImport(k.deps, who, { kind: "pdf_paper", meta: JEE_PAPER, fileName: "paper.pdf", licenceAck: true, licenceNote: null, ...input });
}

async function uploaded(k: Kit, input: Partial<UploadInput> & { bytes: Uint8Array }) {
  const result = await upload(k, input);
  if (!result.ok) throw new Error(`upload failed: ${result.reason}`);
  return result.data;
}

async function act(k: Kit, id: string, body: Parameters<typeof importAction>[3], who = viewer()) {
  const result = await importAction(k.deps, who, id, body);
  if (result.ok && result.data.runner) await result.data.runner;
  return result;
}

describe("sync extraction", () => {
  it("batches pages with a lookahead page, keeps only questions starting on own pages, and upserts idempotently", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(7) });
    expect(job).toMatchObject({ status: "ready", mode: "sync", pages: 7, progress: { done: 0, total: 2 } });
    expect(job.estimate).toMatchObject({ aiRequired: true, mode: "sync", batches: 2 });

    const run = await act(k, job.id, { action: "run" });
    expect(run.ok).toBe(true);
    expect(k.client.calls).toHaveLength(2);
    // Request 1: pages 1–6 plus page 7 as lookahead (7 pages attached); request 2: page 7 alone.
    const first = k.client.calls[0].params;
    expect(requestPagesOf(first)).toMatchObject({ lookahead: { orig: 7, pos: 7 } });
    const attached = await PDFDocument.load(Buffer.from(documentBlock(first).source.data, "base64"));
    expect(attached.getPageCount()).toBe(7);
    expect(first).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", max_tokens: 64_000 });
    expect(first.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });

    // 14 questions (2 per page), none duplicated although page 7 was read twice.
    const drafts = [...k.store.drafts.values()];
    expect(drafts).toHaveLength(14);
    // Numbering restarts per subject: keys stay distinct.
    expect(drafts.map((draft) => draft.sourceKey)).toEqual(expect.arrayContaining(["physics:a:1", "chemistry:a:1", "chemistry:a:8"]));
    expect(drafts.every((draft) => draft.source.year === 2025 && draft.source.shift === "Shift 1" && draft.content.answer === null)).toBe(true);
    expect(drafts.find((draft) => draft.sourceKey === "physics:a:1")?.content.stem.en).toContain("\\(x\\)");

    const done = getImport(k.deps.db, job.id);
    expect(done).toMatchObject({ status: "done", progressDone: 2, draftsCreated: 14 });
    expect(done?.usage.calls).toBe(2);
    expect(done?.usage.usd).toBeGreaterThan(0);
    expect(done?.patternSnapshot?.sections.length).toBe(1);

    // Re-running ingestion upserts the same keys: nothing new is created.
    expect(renormalizeJob(k.deps, job.id)).toBe(0);
    expect(k.store.drafts.size).toBe(14);
  });

  it("halves the pages on max_tokens and retries, at most twice", async () => {
    const k = kit({
      responder: (params) => (requestPagesOf(params).own.length > 3 ? { stopReason: "max_tokens", text: '{"questions": [', usage: usage(1000, 64_000), model: "claude-opus-5-5" } : paperReply(params, { physicsPages: 3 })),
    });
    const job = await uploaded(k, { bytes: await syntheticPdf(6) });
    await act(k, job.id, { action: "run" });
    expect(k.client.calls.map((call) => requestPagesOf(call.params).own.length)).toEqual([6, 3, 3]);
    expect(k.store.drafts.size).toBe(12);
    expect(getImport(k.deps.db, job.id)?.usage.calls).toBe(3);

    const stuck = kit({ responder: () => ({ stopReason: "max_tokens", text: null, usage: usage(10, 10), model: "claude-opus-5-5" }) });
    const second = await uploaded(stuck, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(6, "B") });
    await act(stuck, second.id, { action: "run" });
    // 6 pages → 3 + 3 → the first half once more (depth 2 is the limit) → the item fails.
    expect(stuck.client.calls.map((call) => requestPagesOf(call.params).own.length)).toEqual([6, 3, 2]);
    expect(listItems(stuck.deps.db, second.id)[0]).toMatchObject({ status: "failed", error: "max_tokens" });
    expect(getImport(stuck.deps.db, second.id)).toMatchObject({ status: "failed", error: "items_failed:1" });
  });

  it("marks an item refused when the refusal survives the fallback, and retries it on request", async () => {
    let refuse = true;
    const k = kit({ responder: (params) => (refuse ? { stopReason: "refusal", text: null, usage: usage(500, 20), model: "claude-opus-4-8" } : paperReply(params, { physicsPages: 3 })) });
    const job = await uploaded(k, { bytes: await syntheticPdf(2) });
    await act(k, job.id, { action: "run" });
    expect(listItems(k.deps.db, job.id)[0]).toMatchObject({ status: "refused", error: "refusal" });
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "failed" });
    refuse = false;
    const retried = await act(k, job.id, { action: "retry_failed" });
    expect(retried.ok).toBe(true);
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "done", draftsCreated: 4 });
  });

  it("sends an encrypted PDF whole, as one cached document block, and names the page range", async () => {
    const k = kit({ responder: (params) => paperReply(params, { physicsPages: 3 }) });
    const bytes = await encryptedPdf(7);
    const job = await uploaded(k, { bytes });
    expect(job).toMatchObject({ encrypted: true, warnings: ["pdf_encrypted"] });
    await act(k, job.id, { action: "run" });
    const block = documentBlock(k.client.calls[0].params);
    expect(block.cache_control).toEqual({ type: "ephemeral" });
    expect(block.source.data).toBe(Buffer.from(bytes).toString("base64"));
    expect(requestPagesOf(k.client.calls[1].params)).toEqual({ own: [{ orig: 7, pos: 7 }], lookahead: null });
    expect(k.store.drafts.size).toBe(14);
  });

  it("flags every draft third-party when a coaching watermark appears on a later page", async () => {
    const k = kit({ responder: (params) => paperReply(params, { physicsPages: 3, pageMarks: (orig) => (orig === 7 ? [{ kind: "watermark", text: "Example Coaching Classes" }] : [{ kind: "url", text: "jeemain.nta.nic.in" }]) }) });
    const job = await uploaded(k, { bytes: await syntheticPdf(7) });
    await act(k, job.id, { action: "run" });
    const drafts = [...k.store.drafts.values()];
    expect(drafts).toHaveLength(14);
    expect(drafts.every((draft) => draft.flags.includes("third_party_source"))).toBe(true);
    expect(getImport(k.deps.db, job.id)?.pageMarks.map((mark) => mark.text)).toEqual(["jeemain.nta.nic.in", "Example Coaching Classes"]);
  });

  it("takes source fields from the job details only and flags a header that disagrees", async () => {
    const k = kit({ responder: (params) => paperReply(params, { physicsPages: 3, header: { exam: "JEE (Main)", year: "2019" } }) });
    const job = await uploaded(k, { bytes: await syntheticPdf(2) });
    await act(k, job.id, { action: "run" });
    const drafts = [...k.store.drafts.values()];
    expect(drafts.every((draft) => draft.source.year === 2025 && draft.flags.includes("source_mismatch"))).toBe(true);
  });

  it("records a runner crash on the job (no unhandled rejection) and releases the lease", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(2) });
    k.store.chapterError = new Error("chapters_unavailable");
    await act(k, job.id, { action: "run" });
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "failed", error: "chapters_unavailable", runnerId: null });
  });
});

describe("batch mode", () => {
  it("submits fresh items as one batch, ingests results by custom_id, and retries a refused item in sync", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(10) });
    expect(job.mode).toBe("batch");
    await act(k, job.id, { action: "run" });
    expect(k.client.calls).toHaveLength(0);
    const [batchId, batch] = [...k.client.batches.entries()][0];
    expect(batch.requests.map((request) => request.customId)).toEqual([`${job.id}-0`, `${job.id}-1`]);
    for (const request of batch.requests) {
      expect(request.params).not.toHaveProperty("betas");
      expect(request.params).not.toHaveProperty("fallbacks");
    }
    expect(getImport(k.deps.db, job.id)?.status).toBe("waiting_batch");
    // The reservation counts against today's spend until the results arrive.
    expect(listItems(k.deps.db, job.id).every((item) => item.status === "submitted" && item.usd > 0)).toBe(true);

    await tickImport(k.deps, job.id);
    expect(getImport(k.deps.db, job.id)?.status).toBe("waiting_batch");

    // Results arrive in reverse order; the second request was refused.
    await k.client.endBatch(batchId, (customId) => (customId.endsWith("-1") ? { customId, type: "succeeded", reply: { stopReason: "refusal", text: null, usage: usage(100, 5), model: "claude-opus-5-5" } } : null));
    await tickImport(k.deps, job.id);
    // The refused item went back to sync, with the server-side fallback.
    expect(k.client.calls).toHaveLength(1);
    expect(k.client.calls[0].params).toMatchObject({ fallbacks: "default" });
    const done = getImport(k.deps.db, job.id);
    expect(done).toMatchObject({ status: "done", draftsCreated: 20 });
    expect(listItems(k.deps.db, job.id).map((item) => [item.status, item.attempts])).toEqual([
      ["done", 1],
      ["done", 2],
    ]);
  });

  it("puts errored and expired requests back for a sync retry", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(10), options: { mode: "batch" } });
    await act(k, job.id, { action: "run" });
    const [batchId] = [...k.client.batches.keys()];
    await k.client.endBatch(batchId, (customId) => ({ customId, type: customId.endsWith("-0") ? "errored" : "expired", errorType: "overloaded_error" }));
    await tickImport(k.deps, job.id);
    expect(k.client.calls).toHaveLength(2);
    expect(getImport(k.deps.db, job.id)?.status).toBe("done");
  });
});

describe("lease", () => {
  it("never takes over a 10-minute call whose heartbeat keeps running, but takes a stale lease", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(1) });
    const db = k.deps.db;
    let now = k.clock.now;
    let beat: (() => void) | null = null;
    const timers = { setInterval: (fn: () => void) => ((beat = fn), 1), clearInterval: () => undefined };
    expect(acquireLease(db, job.id, "runner_a", now)).toBe(true);
    await withHeartbeat({ db, importId: job.id, runnerId: "runner_a", now: () => now, timers }, async () => {
      for (let second = 30; second <= 600; second += 30) {
        now += 30_000;
        beat?.();
        expect(acquireLease(db, job.id, "runner_b", now)).toBe(false);
      }
    });
    releaseLease(db, job.id, "runner_a");

    expect(acquireLease(db, job.id, "runner_a", now)).toBe(true);
    // No heartbeat: three minutes later the lease is stale and another runner takes it.
    expect(acquireLease(db, job.id, "runner_b", now + 3 * 60_000 - 1)).toBe(false);
    expect(acquireLease(db, job.id, "runner_b", now + 3 * 60_000 + 1)).toBe(true);
    expect(extendLease(db, job.id, "runner_a", now + 3 * 60_000 + 2)).toBe(false);
  });

  it("does not start a second runner while the lease is held", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(1) });
    acquireLease(k.deps.db, job.id, "other_process", k.clock.now);
    await act(k, job.id, { action: "run" });
    expect(k.client.calls).toHaveLength(0);
    expect(getImport(k.deps.db, job.id)?.status).toBe("running");
  });
});

describe("controls", () => {
  it("pauses at the daily cap before calling the API", async () => {
    const k = kit({ config: { dailyUsd: 0.05 } });
    const job = await uploaded(k, { bytes: await syntheticPdf(2) });
    await act(k, job.id, { action: "run" });
    expect(k.client.calls).toHaveLength(0);
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "paused", pauseReason: "daily_cap" });
    expect(k.audits.map((entry) => entry.action)).toContain("qb.import_daily_cap");
  });

  it("pauses after the current call and resumes; cancel aborts the call in flight", async () => {
    let pauseDuringCall: (() => Promise<unknown>) | null = null;
    const k = kit({
      responder: async (params) => {
        if (pauseDuringCall) {
          const pause = pauseDuringCall;
          pauseDuringCall = null;
          await pause();
        }
        return paperReply(params, { physicsPages: 3 });
      },
    });
    const job = await uploaded(k, { bytes: await syntheticPdf(7) });
    pauseDuringCall = () => importAction(k.deps, viewer(), job.id, { action: "pause" });
    await act(k, job.id, { action: "run" });
    expect(k.client.calls).toHaveLength(1);
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "paused", pauseReason: "staff", progressDone: 1 });
    await act(k, job.id, { action: "run" });
    expect(getImport(k.deps.db, job.id)?.status).toBe("done");

    const c = kit({
      responder: (_params, index) =>
        new Promise((resolve, reject) => {
          const signal = c.client.calls[index].signal;
          signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
        }),
    });
    const second = await uploaded(c, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(2, "B") });
    const started = await importAction(c.deps, viewer(), second.id, { action: "run" });
    await vi.waitFor(() => expect(c.client.calls).toHaveLength(1));
    const cancelled = await act(c, second.id, { action: "cancel" });
    expect(cancelled.ok).toBe(true);
    if (started.ok) await started.data.runner;
    expect(getImport(c.deps.db, second.id)?.status).toBe("cancelled");
    expect(listItems(c.deps.db, second.id).every((item) => item.status !== "running")).toBe(true);
  });

  it("lets the env kill switch override the admin setting", async () => {
    const k = kit({ config: { envEnabled: false } });
    const job = await uploaded(k, { bytes: await syntheticPdf(1) });
    expect(await act(k, job.id, { action: "run" })).toEqual({ ok: false, status: 409, reason: "ai_disabled:env_off" });
    k.deps.config.envEnabled = true;
    k.store.setting = false;
    expect(await act(k, job.id, { action: "run" })).toEqual({ ok: false, status: 409, reason: "ai_disabled:setting_off" });
    k.store.setting = true;
    expect((await act(k, job.id, { action: "run" })).ok).toBe(true);
  });

  it("refuses imports for an exam whose taxonomy is not confirmed (409)", async () => {
    const k = kit();
    k.store.confirmed.delete("JEE_MAIN");
    expect(await upload(k, { bytes: await syntheticPdf(1) })).toEqual({ ok: false, status: 409, reason: "taxonomy_unconfirmed" });
    k.store.confirmed.add("JEE_MAIN");
    const job = await uploaded(k, { bytes: await syntheticPdf(1) });
    k.store.confirmed.delete("JEE_MAIN");
    expect(await act(k, job.id, { action: "run" })).toEqual({ ok: false, status: 409, reason: "taxonomy_unconfirmed" });
  });
});

describe("uploads", () => {
  it("enforces the size cap, magic bytes, the zip guard and the licence acknowledgement", async () => {
    const k = kit({ config: { maxFileBytes: 9 * 1024 * 1024 } });
    expect(await upload(k, { bytes: new Uint8Array(9 * 1024 * 1024 + 1) })).toEqual({ ok: false, status: 413, reason: "file_too_large" });
    expect(await upload(k, { bytes: syntheticDocx(["not a pdf"]) })).toEqual({ ok: false, status: 415, reason: "file_type_mismatch" });
    expect(await upload(k, { bytes: await syntheticPdf(1), licenceAck: false })).toEqual({ ok: false, status: 422, reason: "licence_required" });
    const bomb = writeZip([{ name: "word/document.xml", data: "x", declaredSize: 60 * 1024 * 1024 }]);
    expect(await upload(k, { kind: "docx_bank", meta: { sourceKind: "aspire", exam: "NEET", language: "en" }, bytes: bomb })).toEqual({ ok: false, status: 413, reason: "zip_too_large" });
    expect(await upload(k, { kind: "csv_bank", meta: { sourceKind: "official", exam: "NEET", year: 2025, language: "en" }, bytes: Buffer.from("exams,type,stem_en\n") })).toEqual({
      ok: false,
      status: 422,
      reason: "bank_must_be_aspire",
    });
  });

  it("refuses a second NEET booklet of the same sitting (its key may still be imported) and a duplicate file", async () => {
    const k = kit();
    const neet = await syntheticPdf(2);
    const first = await uploaded(k, { meta: NEET_PAPER, bytes: neet });
    expect(await upload(k, { meta: { ...NEET_PAPER, booklet: "Q2" }, bytes: await syntheticPdf(3) })).toEqual({ ok: false, status: 409, reason: "booklet_duplicate" });
    expect(await upload(k, { meta: NEET_PAPER, bytes: neet })).toEqual({ ok: false, status: 409, reason: "duplicate_file" });
    expect(await upload(k, { meta: NEET_PAPER, bytes: await syntheticPdf(4) })).toEqual({ ok: false, status: 409, reason: "paper_duplicate" });
    const key = await upload(k, {
      kind: "csv_key",
      meta: { ...NEET_PAPER, booklet: "Q2", keyStage: "final" },
      bytes: Buffer.from(toCsv([["qno", "booklet", "answer"], ["1", "Q2", "B"]])),
    });
    expect(key.ok).toBe(true);
    expect(first.status).toBe("ready");
  });

  it("refuses uploads over the storage quota, prunes old jobs and orphans, and close deletes the file and wipes output", async () => {
    const k = kit();
    const pdf = await syntheticPdf(2);
    k.deps.config.storageBytes = pdf.byteLength + 100;
    const job = await uploaded(k, { bytes: pdf });
    expect(await upload(k, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(3) })).toEqual({ ok: false, status: 409, reason: "storage_quota" });

    await act(k, job.id, { action: "run" });
    expect(listItems(k.deps.db, job.id).every((item) => item.output !== null)).toBe(true);
    const closed = await act(k, job.id, { action: "close" });
    expect(closed.ok && closed.data.job).toMatchObject({ status: "closed", fileAvailable: false });
    expect(readdirSync(k.dir)).toEqual([]);
    expect(listItems(k.deps.db, job.id).every((item) => item.output === null && item.usd > 0)).toBe(true);

    // A job untouched for 14 days is closed; an unreferenced old file is removed.
    k.deps.config.storageBytes = 100 * 1024 * 1024;
    const stale = await uploaded(k, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(3) });
    writeFileSync(join(k.dir, "imp_zzzzzzzzzzzzzzzz.pdf"), "orphan");
    const old = (Date.now() - 2 * 60 * 60_000) / 1000;
    utimesSync(join(k.dir, "imp_zzzzzzzzzzzzzzzz.pdf"), old, old);
    k.clock.now += 15 * 86_400_000;
    const pruned = pruneImports(k.deps, { force: true });
    expect(pruned).toMatchObject({ closed: 1, orphans: 1 });
    expect(getImport(k.deps.db, stale.id)).toMatchObject({ status: "closed", error: "retention", tempPath: null });
    expect(existsSync(join(k.dir, "imp_zzzzzzzzzzzzzzzz.pdf"))).toBe(false);
  });
});

describe("keys, Hindi and tabular files", () => {
  it("applies a key PDF (provisional or final) to the paper's questions", async () => {
    const k = kit();
    const paper = await uploaded(k, { bytes: await syntheticPdf(2) });
    await act(k, paper.id, { action: "run" });
    k.client.responder = () => ({
      stopReason: "end_turn",
      text: JSON.stringify({
        header: { exam: null, year: null, date: null, session: null, shift: null, paper: null, booklet: null },
        pageMarks: [],
        rows: [
          { qno: "1", questionRef: null, subject: "Physics", booklet: null, answer: "C", status: "normal" },
          { qno: "2", questionRef: null, subject: "Physics", booklet: null, answer: "", status: "dropped" },
          { qno: "3", questionRef: null, subject: "Physics", booklet: null, answer: "B", status: "normal" },
          { qno: "99", questionRef: null, subject: "Physics", booklet: null, answer: "B", status: "normal" },
        ],
      }),
      usage: usage(1000, 200),
      model: "claude-opus-5-5",
    });
    const key = await uploaded(k, { kind: "pdf_key", meta: { ...JEE_PAPER, keyStage: "provisional", keyFor: [paper.id] }, bytes: await syntheticPdf(1) });
    await act(k, key.id, { action: "run" });
    expect(k.store.keyMatches.map((match) => [match.keyStatus, match.keyStage, match.answer])).toEqual([
      ["matched", "provisional", { kind: "single", index: 2 }],
      ["dropped", "provisional", null],
      ["matched", "provisional", { kind: "single", index: 1 }],
    ]);
    expect(getImport(k.deps.db, key.id)?.options.apply).toMatchObject({ matched: 3, dropped: 1, unmatched: [{ qno: "99", reason: "qno_not_found" }] });
  });

  it("keeps official Hindi from a bilingual paper and pairs a Hindi paper with its English import", async () => {
    const k = kit({ responder: (params) => paperReply(params, { physicsPages: 3, bilingual: true }) });
    const bilingual = await uploaded(k, { meta: { ...NEET_PAPER, language: "bilingual" }, bytes: await syntheticPdf(1) });
    await act(k, bilingual.id, { action: "run" });
    expect([...k.store.drafts.values()].every((draft) => draft.content.hiSource === "official" && draft.content.stem.hi !== "")).toBe(true);

    const english = await uploaded(k, { bytes: await syntheticPdf(2) });
    k.client.responder = (params) => paperReply(params, { physicsPages: 3 });
    await act(k, english.id, { action: "run" });
    const before = k.store.drafts.size;
    k.client.responder = (params) => paperReply(params, { physicsPages: 3, hindi: true });
    const hindi = await uploaded(k, { meta: { ...JEE_PAPER, language: "hi", pairsWith: english.id }, bytes: await syntheticPdf(2, "HI") });
    await act(k, hindi.id, { action: "run" });
    expect(k.store.drafts.size).toBe(before);
    expect(k.store.pairs).toHaveLength(4);
    expect(k.store.pairs[0]).toMatchObject({ hindiImportId: hindi.id, optionsHi: ["क", "ख", "ग", "घ"], hiSource: "official" });
    expect(await upload(k, { meta: { ...JEE_PAPER, language: "hi" }, bytes: await syntheticPdf(4) })).toEqual({ ok: false, status: 422, reason: "pairs_with_required" });
  });

  it("dry-runs a CSV bank file at upload and creates drafts idempotently; an author may do this but not run AI", async () => {
    const k = kit();
    const csv = toCsv([
      ["id", "exams", "subject", "type", "stem_en", "option_a_en", "option_b_en", "answer"],
      ["S1", "JEE_MAIN", "physics", "single", "Synthetic: which is a vector?", "Speed", "Velocity", "B"],
      ["S2", "BOH", "physics", "single", "Synthetic: unit of force?", "Newton", "Joule", "A"],
    ]);
    const author = viewer("author");
    const result = await upload(k, { kind: "csv_bank", meta: { sourceKind: "aspire", language: "en" }, bytes: Buffer.from(csv) }, author);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.report).toMatchObject({ rows: 2, valid: 1, errors: [{ row: 3, column: "exams", code: "taxonomy_unconfirmed" }] });
    const created = await act(k, result.data.id, { action: "create_drafts" }, author);
    expect(created.ok && created.data.job).toMatchObject({ status: "done", draftsCreated: 1 });
    expect(k.store.drafts.get(`${result.data.id}|id:S1`)?.source).toMatchObject({ kind: "aspire" });
    await act(k, result.data.id, { action: "create_drafts" }, author);
    expect(k.store.upserts.at(-1)).toMatchObject({ created: 0, updated: 1 });
    expect(k.client.calls).toHaveLength(0);
  });

  it("starts nothing when a runner tick finds a finished job", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(1) });
    expect(tickImport(k.deps, job.id)).toBeNull();
    await startRunner(k.deps, job.id, null);
    expect(k.client.calls).toHaveLength(0);
  });
});

describe("review fixes", () => {
  it("starts no second runner when Resume is clicked while the paused call is still in flight", async () => {
    let jobId = "";
    let second: Promise<void> | null = null;
    const k = kit({
      responder: async (params, index) => {
        if (index === 0) {
          await importAction(k.deps, viewer(), jobId, { action: "pause" });
          const resumed = await importAction(k.deps, viewer(), jobId, { action: "run" });
          expect(resumed.ok).toBe(true);
          second = resumed.ok ? resumed.data.runner : null;
          // The lease is held by the first runner: the second returns without calling the API.
          await second;
        }
        return paperReply(params, { physicsPages: 3 });
      },
    });
    const job = await uploaded(k, { bytes: await syntheticPdf(7) });
    jobId = job.id;
    await act(k, job.id, { action: "run" });
    expect(second).not.toBeNull();
    // One call per item (pages 1–6, then page 7): nothing was read or paid for twice.
    expect(k.client.calls.map((call) => requestPagesOf(call.params).own.length)).toEqual([6, 1]);
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "done", runnerId: null, usage: { calls: 2 } });
  });

  it("checks the daily cap again before each extra call that max_tokens halving makes", async () => {
    const k = kit({ responder: () => ({ stopReason: "max_tokens", text: null, usage: usage(1000, 64_000), model: "claude-opus-5-5" }) });
    const job = await uploaded(k, { bytes: await syntheticPdf(6) });
    const reserve = (job.estimate?.usd[1] ?? 0) / (job.estimate?.batches ?? 1);
    k.deps.config.dailyUsd = reserve * 1.5;
    await act(k, job.id, { action: "run" });
    expect(k.client.calls).toHaveLength(1);
    expect(getImport(k.deps.db, job.id)).toMatchObject({ status: "paused", pauseReason: "daily_cap", usage: { calls: 1 } });
    expect(listItems(k.deps.db, job.id)[0]).toMatchObject({ status: "pending", attempts: 0, error: "daily_cap" });
    expect(listItems(k.deps.db, job.id)[0].usd).toBeGreaterThan(1);
  });

  it("counts another job's call in flight against the daily cap", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const k = kit({
      responder: async (params, index) => {
        if (index === 0) await gate;
        return paperReply(params, { physicsPages: 3 });
      },
    });
    const first = await uploaded(k, { bytes: await syntheticPdf(2) });
    const second = await uploaded(k, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(2, "B") });
    const reserve = (first.estimate?.usd[1] ?? 0) / (first.estimate?.batches ?? 1);
    k.deps.config.dailyUsd = reserve * 1.5;
    const started = await importAction(k.deps, viewer(), first.id, { action: "run" });
    await vi.waitFor(() => expect(k.client.calls).toHaveLength(1));
    await act(k, second.id, { action: "run" });
    expect(getImport(k.deps.db, second.id)).toMatchObject({ status: "paused", pauseReason: "daily_cap" });
    release();
    if (started.ok) await started.data.runner;
    expect(getImport(k.deps.db, first.id)?.status).toBe("done");
    expect(k.client.calls).toHaveLength(1);
  });

  it("keeps a cancelled batch's reservations in today's spend", async () => {
    const k = kit();
    const job = await uploaded(k, { bytes: await syntheticPdf(10) });
    await act(k, job.id, { action: "run" });
    await act(k, job.id, { action: "cancel" });
    expect([...k.client.batches.values()][0].cancelled).toBe(true);
    expect(listItems(k.deps.db, job.id).every((item) => item.status === "failed" && item.usd > 0 && item.finishedAt !== null)).toBe(true);
  });

  it("reads an encrypted PDF in sync mode only, prices every whole-file copy, and refuses one over 100 pages", async () => {
    const k = kit();
    const encrypted = await uploaded(k, { bytes: await encryptedPdf(10), options: { mode: "batch" } });
    expect(encrypted).toMatchObject({ encrypted: true, mode: "sync" });
    const plain = await uploaded(k, { meta: { ...JEE_PAPER, shift: "Shift 2" }, bytes: await syntheticPdf(10, "P"), options: { mode: "sync" } });
    expect(encrypted.estimate?.usd[1]).toBeGreaterThan(plain.estimate?.usd[1] ?? Infinity);
    await act(k, encrypted.id, { action: "run", options: { mode: "batch" } });
    expect(k.client.batches.size).toBe(0);
    expect(k.client.calls).toHaveLength(2);
    expect(await upload(k, { meta: { ...JEE_PAPER, shift: "Shift 3" }, bytes: await encryptedPdf(101) })).toEqual({ ok: false, status: 413, reason: "pdf_encrypted_too_many_pages" });
  });

  it("does not apply a key PDF whose printed header names another shift", async () => {
    const k = kit();
    const paper = await uploaded(k, { bytes: await syntheticPdf(2) });
    await act(k, paper.id, { action: "run" });
    k.client.responder = () => ({
      stopReason: "end_turn",
      text: JSON.stringify({
        header: { exam: "JEE (Main)", year: "2025", date: null, session: null, shift: "Shift 2", paper: null, booklet: null },
        pageMarks: [],
        rows: [{ qno: "1", questionRef: null, subject: "Physics", booklet: null, answer: "C", status: "normal" }],
      }),
      usage: usage(1000, 200),
      model: "claude-opus-5-5",
    });
    const key = await uploaded(k, { kind: "pdf_key", meta: { ...JEE_PAPER, keyStage: "final", keyFor: [paper.id] }, bytes: await syntheticPdf(1, "K") });
    await act(k, key.id, { action: "run" });
    expect(k.store.keyMatches).toEqual([]);
    expect(getImport(k.deps.db, key.id)).toMatchObject({ status: "failed", error: "key_header_mismatch:shift" });

    // Matched by NTA question ID the header does not matter (one NTA key covers every shift).
    const ids = kit({ responder: (params) => paperReply(params, { physicsPages: 3, questionRefs: true }) });
    const shift3 = { ...JEE_PAPER, shift: "Shift 3" };
    const withIds = await uploaded(ids, { meta: shift3, bytes: await syntheticPdf(2, "ID") });
    await act(ids, withIds.id, { action: "run" });
    ids.client.responder = () => ({
      stopReason: "end_turn",
      text: JSON.stringify({
        header: { exam: "JEE (Main)", year: "2025", date: null, session: null, shift: "Shift 2", paper: null, booklet: null },
        pageMarks: [],
        rows: [
          { qno: null, questionRef: "77101", subject: null, booklet: null, answer: "C", status: "normal" },
          { qno: null, questionRef: "55501", subject: null, booklet: null, answer: "A", status: "normal" },
        ],
      }),
      usage: usage(1000, 200),
      model: "claude-opus-5-5",
    });
    const idKey = await uploaded(ids, { kind: "pdf_key", meta: { ...shift3, keyStage: "final", keyFor: [withIds.id] }, bytes: await syntheticPdf(1, "IDK") });
    await act(ids, idKey.id, { action: "run" });
    expect(ids.store.keyMatches).toHaveLength(1);
    expect(getImport(ids.deps.db, idKey.id)).toMatchObject({ status: "done", options: { apply: { matched: 1, unmatched: [{ reason: "question_id_not_found" }] } } });
  });

  it("compares a key's header with the job and its papers, allowing a key that lists every booklet", () => {
    const header = (fields: Partial<Record<"exam" | "year" | "shift" | "booklet", string>>) => ({ exam: null, year: null, date: null, session: null, shift: null, paper: null, booklet: null, ...fields });
    expect(keyHeaderMismatches([header({ booklet: "Q1, Q2, Q3, Q4" })], NEET_PAPER, [])).toEqual([]);
    expect(keyHeaderMismatches([header({ booklet: "Q3" })], NEET_PAPER, [])).toEqual(["booklet"]);
    expect(keyHeaderMismatches([header({ year: "2024" })], { ...NEET_PAPER, year: undefined }, [NEET_PAPER])).toEqual(["year"]);
    expect(keyHeaderMismatches([null, header({ exam: "NEET (UG)" })], NEET_PAPER, [NEET_PAPER])).toEqual([]);
  });

  it("applies an Aspire key only to Aspire files, with Aspire's own stage, and pairs Hindi only for official papers", async () => {
    const k = kit();
    const official = await uploaded(k, { bytes: await syntheticPdf(2) });
    const aspire = await uploaded(k, { meta: { sourceKind: "aspire", exam: "JEE_MAIN", language: "en" }, bytes: await syntheticPdf(2, "ASP") });
    await act(k, aspire.id, { action: "run" });
    const author = viewer("author");
    const keyCsv = Buffer.from(toCsv([["qno", "subject", "answer"], ["1", "physics", "B"]]));
    const aspireKey = (meta: Partial<QbImportMeta>) => upload(k, { kind: "csv_key", meta: { sourceKind: "aspire", language: "en", ...meta }, bytes: keyCsv }, author);

    expect(await aspireKey({ keyFor: [official.id] })).toEqual({ ok: false, status: 422, reason: "key_source_mismatch" });
    expect(await aspireKey({ keyFor: [aspire.id], keyStage: "final" })).toEqual({ ok: false, status: 422, reason: "key_stage_official_only" });
    expect(await upload(k, { kind: "csv_key", meta: { ...JEE_PAPER, keyStage: "final", keyFor: [aspire.id] }, bytes: keyCsv })).toEqual({ ok: false, status: 422, reason: "key_source_mismatch" });
    expect(await upload(k, { kind: "csv_key", meta: { ...JEE_PAPER, shift: "Shift 2", keyStage: "final", keyFor: [official.id] }, bytes: keyCsv })).toEqual({
      ok: false,
      status: 422,
      reason: "key_for_other_paper",
    });

    const key = await aspireKey({ keyFor: [aspire.id] });
    if (!key.ok) throw new Error(key.reason);
    await act(k, key.data.id, { action: "create_drafts" }, author);
    expect(k.store.keyMatches).toEqual([expect.objectContaining({ keyStage: "aspire", keyStatus: "matched", answer: { kind: "single", index: 1 } })]);

    expect(await upload(k, { meta: { sourceKind: "aspire", exam: "JEE_MAIN", language: "hi", pairsWith: aspire.id }, bytes: await syntheticPdf(3, "HI") })).toEqual({
      ok: false,
      status: 422,
      reason: "hindi_pair_official_only",
    });
  });

  it("warns on the job when a late watermark cannot reach drafts staff already edited", async () => {
    let jobId = "";
    const k = kit({
      responder: (params, index) => {
        // A reviewer edits a draft from the first part while the second part is being read.
        if (index === 1) k.store.locked.add(`${jobId}|physics:a:1`);
        return paperReply(params, { physicsPages: 3, pageMarks: (orig) => (orig === 7 ? [{ kind: "watermark", text: "Vedantu JEE Main 2025" }] : []) });
      },
    });
    const job = await uploaded(k, { bytes: await syntheticPdf(7) });
    jobId = job.id;
    await act(k, job.id, { action: "run" });
    expect(getImport(k.deps.db, job.id)?.options.warnings).toContain("third_party_after_edit");
    const drafts = [...k.store.drafts.entries()];
    expect(drafts.find(([key]) => key.endsWith("|physics:a:1"))?.[1].flags).not.toContain("third_party_source");
    expect(drafts.filter(([key]) => !key.endsWith("|physics:a:1")).every(([, draft]) => draft.flags.includes("third_party_source"))).toBe(true);
  });
});
