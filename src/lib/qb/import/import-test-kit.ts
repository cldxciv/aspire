/**
 * Test-only kit for the import job tests (never imported by app code): a fake Claude client that
 * answers like a reader of SYNTHETIC papers, fake QB-CORE-B hooks backed by a Map, and deps
 * wiring. No test using this kit can reach the Claude API.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { getDb } from "@/lib/db/connection";
import { normaliseDollarMath } from "@/lib/qb/rich-text";
import type { QbExam } from "@/lib/qb/types";

import type { BatchRequest, BatchResult, CallUsage, ModelReply, QbImportClient } from "./client";
import { getImportConfig, type QbImportConfig } from "./config";
import type { AuditInput, ImportDeps, ImportHooks } from "./deps";
import type { TimerApi } from "./lease";
import type { HindiPair, ImportChapter, ImportDraft, ImportQuestionRef, ImportViewer, KeyMatch } from "./types";

export const CHAPTERS: ImportChapter[] = [
  { id: "phy-kinematics", subject: "physics", label: "Kinematics" },
  { id: "che-mole", subject: "chemistry", label: "Mole concept" },
  { id: "bot-cell", subject: "botany", label: "Cell" },
];

export interface FakeStore {
  drafts: Map<string, ImportDraft & { importId: string }>;
  upserts: { importId: string; created: number; updated: number }[];
  keyMatches: KeyMatch[];
  pairs: HindiPair[];
  confirmed: Set<QbExam>;
  setting: boolean;
  chapterError: Error | null;
  /** `importId|sourceKey` of drafts staff "edited": the upsert leaves them alone, like QB-CORE-B. */
  locked: Set<string>;
}

export function fakeHooks(): { hooks: ImportHooks; store: FakeStore } {
  const store: FakeStore = {
    drafts: new Map(),
    upserts: [],
    keyMatches: [],
    pairs: [],
    confirmed: new Set<QbExam>(["JEE_MAIN", "NEET", "JEE_ADV"]),
    setting: true,
    chapterError: null,
    locked: new Set(),
  };
  const hooks: ImportHooks = {
    upsertImportDrafts(importId, drafts) {
      let created = 0;
      let updated = 0;
      for (const draft of drafts) {
        const key = `${importId}|${draft.sourceKey}`;
        if (store.locked.has(key)) continue;
        if (store.drafts.has(key)) updated += 1;
        else created += 1;
        store.drafts.set(key, { ...draft, importId });
      }
      store.upserts.push({ importId, created, updated });
      return { created, updated };
    },
    applyAnswerKey(matches) {
      store.keyMatches.push(...matches);
      return { applied: matches.length };
    },
    applyHindiPairing(pairs) {
      store.pairs.push(...pairs);
      return { applied: pairs.length };
    },
    chapterListFor() {
      if (store.chapterError) throw store.chapterError;
      return CHAPTERS;
    },
    taxonomyConfirmed: (exam) => store.confirmed.has(exam),
    importSettingEnabled: () => store.setting,
    listImportQuestions(importIds): ImportQuestionRef[] {
      return [...store.drafts.entries()]
        .filter(([, draft]) => importIds.includes(draft.importId))
        .map(([key, draft]) => ({
          id: `q:${key}`,
          importId: draft.importId,
          sourceKey: draft.sourceKey,
          subject: draft.subject ?? "physics",
          type: draft.content.type,
          qno: draft.source.qno ?? null,
          questionRef: draft.source.questionRef ?? null,
          optionRefs: draft.source.optionRefs ?? [],
          booklet: draft.source.booklet ?? null,
          optionCount: draft.content.options.length,
          answer: draft.content.answer,
          keyStage: null,
          status: "draft",
        }));
    },
  };
  return { hooks, store };
}

// ---------------------------------------------------------------------------------------------
// Fake client

export type Responder = (params: BetaMessageStreamParams, index: number) => ModelReply | Promise<ModelReply>;

export class FakeClient implements QbImportClient {
  calls: { params: BetaMessageStreamParams; signal?: AbortSignal }[] = [];
  batches = new Map<string, { requests: BatchRequest[]; status: "in_progress" | "ended"; results: BatchResult[]; cancelled: boolean }>();

  constructor(public responder: Responder) {}

  async extract(params: BetaMessageStreamParams, options: { signal?: AbortSignal; timeoutMs: number }): Promise<ModelReply> {
    this.calls.push({ params, signal: options.signal });
    if (options.signal?.aborted) throw new Anthropic.APIUserAbortError();
    return this.responder(params, this.calls.length - 1);
  }

  async createBatch(requests: readonly BatchRequest[]) {
    const id = `msgbatch_${this.batches.size + 1}`;
    this.batches.set(id, { requests: [...requests], status: "in_progress", results: [], cancelled: false });
    return { id };
  }

  async retrieveBatch(id: string) {
    const batch = this.batches.get(id);
    if (!batch) throw Object.assign(new Error("not_found"), { status: 404 });
    return { id, processingStatus: batch.status };
  }

  async *batchResults(id: string): AsyncIterable<BatchResult> {
    for (const result of this.batches.get(id)?.results ?? []) yield result;
  }

  async cancelBatch(id: string) {
    const batch = this.batches.get(id);
    if (batch) batch.cancelled = true;
  }

  /** Ends a batch with replies produced by `responder` (or the given override per custom id). */
  async endBatch(id: string, override: (customId: string, params: BatchRequest["params"]) => BatchResult | null = () => null, reverse = true) {
    const batch = this.batches.get(id);
    if (!batch) throw new Error("no batch");
    const results: BatchResult[] = [];
    for (const request of batch.requests) {
      const forced = override(request.customId, request.params);
      results.push(forced ?? { customId: request.customId, type: "succeeded", reply: await this.responder(request.params as unknown as BetaMessageStreamParams, -1) });
    }
    batch.results = reverse ? results.reverse() : results;
    batch.status = "ended";
  }
}

export function instructionText(params: { messages: unknown }): string {
  const messages = params.messages as { content: { type: string; text?: string }[] }[];
  return messages[0].content.find((block) => block.type === "text")?.text ?? "";
}

export function documentBlock(params: { messages: unknown }): { source: { type: string; data: string }; cache_control?: unknown } {
  const messages = params.messages as { content: { type: string }[] }[];
  return messages[0].content.find((block) => block.type === "document") as never;
}

/** Original page ↔ attachment position for one request, read back from its instructions. */
export function requestPagesOf(params: { messages: unknown }): { own: { orig: number; pos: number }[]; lookahead: { orig: number; pos: number } | null } {
  const text = instructionText(params);
  const slice = /holds pages (\d+)–(\d+) of the original file as attachment pages 1–(\d+)(?:, then page (\d+) as attachment page (\d+))?/.exec(text);
  if (slice) {
    const from = Number(slice[1]);
    const to = Number(slice[2]);
    const own = Array.from({ length: to - from + 1 }, (_, i) => ({ orig: from + i, pos: i + 1 }));
    return { own, lookahead: slice[4] ? { orig: Number(slice[4]), pos: Number(slice[5]) } : null };
  }
  const whole = /whole file\. Work only on pages (\d+)–(\d+)(?:, and use page (\d+))?/.exec(text);
  if (whole) {
    const from = Number(whole[1]);
    const to = Number(whole[2]);
    const own = Array.from({ length: to - from + 1 }, (_, i) => ({ orig: from + i, pos: from + i }));
    return { own, lookahead: whole[3] ? { orig: Number(whole[3]), pos: Number(whole[3]) } : null };
  }
  throw new Error(`unrecognised instructions: ${text.slice(0, 80)}`);
}

export interface PaperShape {
  /** Pages ≤ this are Physics, later pages Chemistry (numbering restarts per subject). */
  physicsPages: number;
  header?: Record<string, string | null>;
  pageMarks?: (orig: number) => { kind: string; text: string }[];
  bilingual?: boolean;
  hindi?: boolean;
  questionRefs?: boolean;
}

/** A SYNTHETIC paper: two questions per page; the fake "reader" also reports the lookahead page. */
export function paperReply(params: { messages: unknown }, shape: PaperShape): ModelReply {
  const { own, lookahead } = requestPagesOf(params);
  const pages = lookahead ? [...own, lookahead] : own;
  const questions = pages.flatMap(({ orig, pos }) =>
    [1, 2].map((j) => {
      const physics = orig <= shape.physicsPages;
      const qno = physics ? (orig - 1) * 2 + j : (orig - shape.physicsPages - 1) * 2 + j;
      return {
        startPage: pos,
        qno: String(qno),
        questionRef: shape.questionRefs ? `77${orig}0${j}` : null,
        optionRefs: [],
        subject: physics ? "Physics" : "Chemistry",
        section: "Section A",
        type: "single",
        format: "standard",
        stem: shape.hindi ? `कृत्रिम प्रश्न ${orig}.${j}` : `Synthetic question on page ${orig}, item ${j}: find $x$.`,
        options: shape.hindi ? ["क", "ख", "ग", "घ"] : ["1", "2", "3", "4"],
        stemHi: shape.bilingual ? `कृत्रिम प्रश्न ${orig}.${j}` : null,
        optionsHi: shape.bilingual ? ["१", "२", "३", "४"] : [],
        answer: null,
        solution: null,
        unit: null,
        passageRef: null,
        passage: null,
        figures: [],
        chapterId: physics ? "phy-kinematics" : "che-mole",
        difficulty: "medium",
        difficultyReason: "two steps",
        confidence: 0.92,
        claimedSource: null,
        issues: [],
      };
    }),
  );
  const marks = shape.pageMarks ? own.flatMap(({ orig, pos }) => shape.pageMarks?.(orig).map((mark) => ({ page: pos, ...mark })) ?? []) : [];
  const header = { exam: null, year: null, date: null, session: null, shift: null, paper: null, booklet: null, ...(shape.header ?? {}) };
  const text = JSON.stringify({ header, pageMarks: marks, instructions: [{ page: own[0].pos, subject: "Physics", section: "Section A", text: "Synthetic instruction: +4 for a correct answer, -1 for a wrong one." }], questions });
  return { stopReason: "end_turn", text, usage: usage(pages.length * 2000, questions.length * 700), model: "claude-opus-5-5" };
}

export function usage(input: number, output: number): CallUsage {
  return { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

// ---------------------------------------------------------------------------------------------
// Files and deps

/** A SYNTHETIC PDF; `label` makes files with the same page count differ (distinct SHA-256). */
export async function syntheticPdf(pages: number, label = "A"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= pages; page += 1) {
    doc.addPage([300, 400]).drawText(`Synthetic paper ${label}, page ${page}`, { x: 20, y: 360, size: 10, font });
  }
  return doc.save({ useObjectStreams: false });
}

export async function encryptedPdf(pages: number): Promise<Uint8Array> {
  const plain = Buffer.from(await syntheticPdf(pages)).toString("latin1");
  return Buffer.from(plain.replace(/trailer\s*<</, "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>"), "latin1");
}

export const NOOP_TIMERS: TimerApi = { setInterval: () => 0, clearInterval: () => undefined };

export interface Kit {
  deps: ImportDeps;
  store: FakeStore;
  client: FakeClient;
  audits: AuditInput[];
  clock: { now: number };
  dir: string;
}

export function makeKit(options: { responder?: Responder; config?: Partial<QbImportConfig>; timers?: TimerApi } = {}): Kit {
  const dir = mkdtempSync(join(tmpdir(), "qb-import-test-"));
  const { hooks, store } = fakeHooks();
  const client = new FakeClient(options.responder ?? ((params) => paperReply(params, { physicsPages: 3 })));
  const audits: AuditInput[] = [];
  const clock = { now: Date.UTC(2026, 9, 22, 6, 0) };
  const base = getImportConfig({ NODE_ENV: "test", ANTHROPIC_API_KEY: "test-key-not-real" }, dir);
  const deps: ImportDeps = {
    db: getDb(),
    now: () => clock.now,
    config: { ...base, dir, ...options.config },
    client: () => client,
    hooks,
    text: { normaliseDollarMath, mathIssues: (text) => (/\\frac\{[^}]*$/.test(text) ? ["bad"] : []) },
    patterns: { patternTag: (exam, year) => `${exam}:${year}`, originalMarking: () => ({ correct: 4, wrong: -1 }) },
    runnerId: "runner_test",
    timers: options.timers ?? NOOP_TIMERS,
    audit: (entry) => audits.push(entry),
  };
  return { deps, store, client, audits, clock, dir };
}

export function viewer(role: "admin" | "reviewer" | "author" = "reviewer"): ImportViewer {
  const allowed = role === "author" ? ["view", "edit_draft", "import_tabular"] : null;
  return { userId: `u_${role}`, displayName: `Test ${role}`, role, can: (capability) => allowed === null || allowed.includes(capability) };
}
