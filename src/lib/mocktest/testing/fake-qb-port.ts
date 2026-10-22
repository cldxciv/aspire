import { randomBytes } from "node:crypto";
import type {
  QbAnswer,
  QbPaperComposition,
  QbPaperView,
  QbReportKind,
  QbReviewItem,
  QbServedQuestion,
  QbServedSection,
  QbSlot,
  QbSourceKind,
  QbTieBreakStep,
} from "@/lib/qb/types";
import type { PaperStatsOutcome, QbCreatePaperInput, QbCreatePaperResult, QbLockSummary, QbPaperPort, QbPaperRecord, QbSlotReadiness } from "../generated";
import { blueprintTestIdFor } from "../resolve";
import { monthWindowAt, monthWindowFromId } from "../timing";
import type { BlueprintMockSummary, TestWindow } from "../types";

/**
 * In-memory stand-in for the question bank behind `QbPaperPort` (tests only). Every question is an
 * ORIGINAL synthetic item written for these tests ("Synthetic item …"), never text from a real paper.
 *
 * A paper of the fake has six questions in three sections, covering every scoring rule:
 *   physics  single ×3 (+4 / −1)          — keys B, C, D
 *   chemistry one-or-more-correct ×1 (+4 / −1, partial +1 per option) — key {A, C, D}
 *   maths    numerical integer ×1 (+4 / −1) — key 12;  numerical decimal2 ×1 (+4 / 0) — key range 2.30–2.35
 */

export const FAKE_KEYS: readonly QbAnswer[] = [
  { kind: "single", index: 1 },
  { kind: "single", index: 2 },
  { kind: "single", index: 3 },
  { kind: "multiple", indices: [0, 2, 3] },
  { kind: "numerical", value: 12, integer: true },
  { kind: "numerical", value: 2.33, low: 2.3, high: 2.35, integer: false },
];
/** All-correct answers in the request format. */
export const FAKE_CORRECT_ANSWERS: readonly (number | string | number[])[] = [1, 2, 3, [0, 2, 3], "12", "2.33"];
export const FAKE_MAX_SCORE = 24;
export const FAKE_DURATION_MINUTES = 60;

const SECTIONS: { id: string; subject: QbServedQuestion["subject"]; type: QbServedQuestion["type"]; answerFormat: QbServedSection["answerFormat"]; marking: QbServedQuestion["marking"]; count: number }[] = [
  { id: "phy-a", subject: "physics", type: "single", answerFormat: null, marking: { correct: 4, wrong: -1 }, count: 3 },
  { id: "chem-m", subject: "chemistry", type: "multiple", answerFormat: null, marking: { correct: 4, wrong: -1, partial: "per_correct_option" }, count: 1 },
  { id: "math-int", subject: "maths", type: "numerical", answerFormat: "integer", marking: { correct: 4, wrong: -1 }, count: 1 },
  { id: "math-dec", subject: "maths", type: "numerical", answerFormat: "decimal2", marking: { correct: 4, wrong: 0 }, count: 1 },
];

const NEET_TIE_BREAK: QbTieBreakStep[] = [
  { by: "subject_score", subject: "physics" },
  { by: "wrong_correct_ratio", subject: "all" },
];

const randomId = (bytes: number) => randomBytes(bytes).toString("base64url");

interface StoredPaper {
  record: QbPaperRecord;
  token: string | null;
  questionIds: string[];
  answersHash: string | null;
  summary: QbLockSummary | null;
  recorded: number;
}

export interface FakeQbPortOptions {
  /** Slots whose bank is too thin even for a shorter set. */
  thin?: QbSlot[];
  /** Slots without monthly ranked papers. */
  rankedOff?: QbSlot[];
  /** Slots whose ranked template cannot be made this month. */
  rankedUnavailable?: QbSlot[];
  /** Papers are short practice sets (half length) / made from sample questions. */
  short?: boolean;
  sample?: boolean;
  officialShare?: number;
}

export class FakeQbPort implements QbPaperPort {
  readonly papers = new Map<string, StoredPaper>();
  readonly reports: Record<string, unknown>[] = [];
  readonly recordCalls: string[] = [];
  /** What each `recordOutcome` call carried (per-question outcomes for the statistics). */
  readonly recordInputs: { questions: PaperStatsOutcome[]; score: number; maxScore: number; now: number }[] = [];
  readonly createCalls: QbCreatePaperInput[] = [];
  /** questionId → correction (applies to every paper). */
  readonly corrections = new Map<string, { kind: "answer"; answer: QbAnswer; at: number } | { kind: "dropped"; at: number }>();
  /** figure id → bytes + the highest version referencing it (0 = working copy only). */
  readonly figures = new Map<string, { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp"; refVersion: number }>();
  /** Ranked templates: `${slot}|${windowId}` → question ids (the same paper for everyone in the month). */
  private readonly templates = new Map<string, string[]>();
  private counter = 0;

  constructor(readonly options: FakeQbPortOptions = {}) {}

  private nextQuestionIds(): string[] {
    this.counter += 1;
    return SECTIONS.flatMap((s) => Array.from({ length: s.count }, (_, i) => `q_${s.id.replace(/-/g, "")}${i}x${this.counter}`));
  }

  private composition(language: "en" | "hi"): QbPaperComposition {
    const sample = this.options.sample === true;
    const officialShare = sample ? 0 : (this.options.officialShare ?? 0.5);
    const official = Math.round(6 * officialShare);
    return {
      total: 6,
      full: this.options.short ? 12 : 6,
      ratio: this.options.short ? 0.5 : 1,
      bySource: sample ? { official: 0, aspire: 0, sample: 6 } : { official, aspire: 6 - official, sample: 0 },
      officialYears: sample ? [] : [2025],
      officialShare,
      adapted: 0,
      crossExam: 0,
      byDifficulty: { easy: 2, medium: 3, hard: 1 },
      byFormat: { standard: 6 },
      language,
      hindiShortfall: 0,
      shortfall: [],
      relaxed: this.options.short ? ["shortened"] : [],
    };
  }

  private buildView(input: { slot: QbSlot; kind: "practice" | "ranked"; language: "en" | "hi"; compensatory: boolean; now: number; windowId: string | null; ids: string[] }): QbPaperView {
    let index = 0;
    const sections: QbServedSection[] = [];
    const questions: QbServedQuestion[] = [];
    for (const section of SECTIONS) {
      sections.push({
        id: section.id,
        subject: section.subject,
        label: { en: section.id, hi: section.id },
        type: section.type,
        answerFormat: section.answerFormat,
        format: null,
        marking: section.marking,
        instructions: { en: "Synthetic instructions.", hi: "कृत्रिम निर्देश।" },
        start: index,
        count: section.count,
        fullCount: this.options.short ? section.count * 2 : section.count,
      });
      for (let i = 0; i < section.count; i += 1) {
        const id = input.ids[index];
        questions.push({
          id,
          index,
          sectionId: section.id,
          subject: section.subject,
          chapterId: `${section.subject}-synthetic-${i % 2}`,
          type: section.type,
          format: "standard",
          answerFormat: section.answerFormat,
          stem: { en: `Synthetic item ${index + 1}: choose the listed value.`, hi: `कृत्रिम प्रश्न ${index + 1}` },
          options: section.type === "numerical" ? [] : ["A", "B", "C", "D"].map((o) => ({ en: `Option ${o}`, hi: `विकल्प ${o}` })),
          ...(section.type === "numerical" ? { unit: { en: "m", hi: "मी" } } : {}),
          figures: [],
          passage: null,
          marking: section.marking,
          hiAvailable: true,
          hiMachine: false,
        });
        index += 1;
      }
    }
    const kind = input.kind;
    return {
      id: randomId(16),
      kind,
      slot: input.slot,
      testId: blueprintTestIdFor(input.slot, kind),
      exam: input.slot === "neet-ug" ? "NEET" : input.slot === "jee-adv" ? "JEE_ADV" : input.slot === "boh-class-10" ? "BOH" : "JEE_MAIN",
      setId: null,
      setPart: null,
      title: { en: "Synthetic paper", hi: "कृत्रिम प्रश्नपत्र" },
      partLabel: null,
      language: input.language,
      durationMinutes: FAKE_DURATION_MINUTES,
      compensatoryMinutes: input.compensatory ? 20 : 0,
      maxScore: FAKE_MAX_SCORE,
      questionCount: 6,
      short: this.options.short === true,
      sample: this.options.sample === true,
      windowId: input.windowId,
      createdAt: input.now,
      expiresAt: input.now + 14 * 24 * 60 * 60 * 1000,
      scored: false,
      composition: this.composition(input.language),
      sections,
      questions,
      patternNote: { en: "Synthetic pattern note.", hi: "कृत्रिम पैटर्न टिप्पणी।" },
    };
  }

  async readiness(input: { slot: QbSlot; language: "en" | "hi"; placeholderMode: boolean; now: number }): Promise<QbSlotReadiness> {
    const thin = this.options.thin?.includes(input.slot) ?? false;
    const level = thin ? "thin" : this.options.short ? "short" : "full";
    return {
      slot: input.slot,
      exam: "JEE_MAIN",
      available: true,
      reason: null,
      readiness: {
        level,
        servable: thin ? 1 : 6,
        full: 6,
        variety: thin ? 0 : 3,
        byLanguage: { en: level, hi: level },
        sections: [],
        ranked: { available: !thin, windowId: monthWindowAt(input.now).id, closesAt: Date.parse(monthWindowAt(input.now).endsAt) },
      },
      full: { questionCount: 6, maxScore: FAKE_MAX_SCORE, durationMinutes: FAKE_DURATION_MINUTES },
      languages: ["en", "hi"],
      compensatoryMinutes: 20,
      composition: thin ? null : this.composition(input.language),
      sample: this.options.sample === true,
      pattern: { year: 2026, note: { en: "Synthetic.", hi: "कृत्रिम।" }, sourceUrls: [], verifiedAt: "2026-10-22", reviewDueAt: "2026-11-15" },
      ranked: { mode: this.options.rankedOff?.includes(input.slot) ? "off" : "monthly", available: !thin, windowId: monthWindowAt(input.now).id, closesAt: null },
    };
  }

  async createPaper(input: QbCreatePaperInput): Promise<QbCreatePaperResult> {
    this.createCalls.push(input);
    if (this.options.thin?.includes(input.slot)) {
      return { ok: false, reason: "thin", readiness: (await this.readiness({ ...input })).readiness };
    }
    if (input.mode === "ranked") {
      if (input.userId === null) throw new Error("fake: ranked papers need a student");
      if (this.options.rankedOff?.includes(input.slot)) return { ok: false, reason: "ranked_off" };
      if (this.options.rankedUnavailable?.includes(input.slot)) return { ok: false, reason: "ranked_unavailable" };
      const windowId = monthWindowAt(input.now).id;
      const existing = [...this.papers.values()].find(
        (p) => p.record.view.kind === "ranked" && p.record.userId === input.userId && p.record.view.slot === input.slot && p.record.view.windowId === windowId,
      );
      if (existing) return { ok: true, papers: [existing.record], token: null, resumed: true };
      const key = `${input.slot}|${windowId}`;
      const ids = this.templates.get(key) ?? this.nextQuestionIds();
      this.templates.set(key, ids);
      const view = this.buildView({ slot: input.slot, kind: "ranked", language: input.language, compensatory: false, now: input.now, windowId, ids });
      const record: QbPaperRecord = { view, userId: input.userId, tieBreak: NEET_TIE_BREAK, fullQuestionCount: 6 };
      this.papers.set(view.id, { record, token: null, questionIds: ids, answersHash: null, summary: null, recorded: 0 });
      return { ok: true, papers: [record], token: null, resumed: false };
    }
    const ids = this.nextQuestionIds();
    const view = this.buildView({ slot: input.slot, kind: "practice", language: input.language, compensatory: input.compensatory, now: input.now, windowId: null, ids });
    const token = randomId(32);
    const record: QbPaperRecord = { view, userId: input.userId, tieBreak: null, fullQuestionCount: this.options.short ? 12 : 6 };
    this.papers.set(view.id, { record, token, questionIds: ids, answersHash: null, summary: null, recorded: 0 });
    return { ok: true, papers: [record], token, resumed: false };
  }

  private current(stored: StoredPaper): QbPaperRecord {
    return { ...stored.record, view: { ...stored.record.view, scored: stored.answersHash !== null } };
  }

  async loadPaper(id: string, access: { token?: string | null; userId?: string | null }, now: number): Promise<QbPaperRecord | null> {
    const stored = this.papers.get(id);
    if (!stored || stored.record.view.expiresAt < now) return null;
    const ownerOk = access.userId !== null && access.userId !== undefined && stored.record.userId === access.userId;
    const tokenOk = stored.token !== null && access.token !== null && access.token !== undefined && access.token === stored.token;
    return ownerOk || tokenOk ? this.current(stored) : null;
  }

  async loadPaperTrusted(id: string): Promise<QbPaperRecord | null> {
    const stored = this.papers.get(id);
    return stored ? this.current(stored) : null;
  }

  async reviewItems(paper: QbPaperRecord): Promise<QbReviewItem[]> {
    return paper.view.questions.map((q, i) => {
      const correction = this.corrections.get(q.id);
      const sourceKind: QbSourceKind = paper.view.sample ? "sample" : i % 2 === 0 ? "official" : "aspire";
      return {
        id: q.id,
        index: i,
        answer: correction?.kind === "answer" ? correction.answer : correction?.kind === "dropped" ? null : FAKE_KEYS[i],
        dropped: correction?.kind === "dropped",
        correctedAt: correction?.at ?? null,
        solution: { en: `Synthetic solution ${i + 1}.`, hi: `कृत्रिम हल ${i + 1}।` },
        solutionSource: "staff",
        sourceLabel:
          sourceKind === "official"
            ? { en: "JEE Main 2025 · Synthetic shift · Q 1 (NTA)", hi: "JEE Main 2025 · कृत्रिम पाली · प्र 1 (NTA)" }
            : sourceKind === "sample"
              ? { en: "Sample question (written for this demo)", hi: "सैंपल प्रश्न" }
              : { en: "Aspire question bank", hi: "Aspire प्रश्न बैंक" },
        sourceKind,
        adapted: false,
        difficulty: (["easy", "medium", "hard"] as const)[i % 3],
      };
    });
  }

  async lockAnswers(paperId: string, input: { answersHash: string; summary: QbLockSummary; now: number }): Promise<"first" | "same" | "different"> {
    const stored = this.papers.get(paperId);
    if (!stored) throw new Error("fake: unknown paper");
    if (stored.answersHash === null) {
      stored.answersHash = input.answersHash;
      stored.summary = input.summary;
      return "first";
    }
    return stored.answersHash === input.answersHash ? "same" : "different";
  }

  async recordOutcome(paper: QbPaperRecord, input: { questions: PaperStatsOutcome[]; score: number; maxScore: number; now: number }): Promise<boolean> {
    const stored = this.papers.get(paper.view.id);
    if (!stored) return false;
    this.recordCalls.push(paper.view.id);
    this.recordInputs.push(input);
    stored.recorded += 1;
    return stored.recorded === 1;
  }

  async createReport(input: { paper: QbPaperRecord; questionId: string; kind: QbReportKind; note: string | null; now: number }): Promise<boolean> {
    // Like the bank: the paper and the question must still be there.
    const stored = this.papers.get(input.paper.view.id);
    if (!stored || !stored.questionIds.includes(input.questionId)) return false;
    // Mirrors qb_reports: question, version, paper, kind, note, time — nothing about the reporter.
    this.reports.push({
      questionId: input.questionId,
      version: 1,
      paperId: input.paper.view.id,
      kind: input.kind,
      note: input.note,
      createdAt: input.now,
      ...Object.fromEntries(Object.entries(input).filter(([k]) => !["paper", "questionId", "kind", "note", "now"].includes(k))),
    });
    return true;
  }

  async figure(id: string): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp" } | null> {
    const figure = this.figures.get(id);
    return figure && figure.refVersion >= 1 ? { bytes: figure.bytes, mime: figure.mime } : null;
  }

  async paperIdsContaining(questionId: string, paperIds: readonly string[]): Promise<string[]> {
    return paperIds.filter((id) => this.papers.get(id)?.questionIds.includes(questionId));
  }

  async rankedBoard(slot: QbSlot): Promise<{ windows: { window: TestWindow; maxScore: number }[] } | null> {
    if (this.options.rankedOff?.includes(slot)) return null;
    const windows = [...this.templates.keys()]
      .filter((key) => key.startsWith(`${slot}|`))
      .map((key) => monthWindowFromId(key.split("|")[1]))
      .filter((w): w is TestWindow => w !== null)
      .map((window) => ({ window, maxScore: FAKE_MAX_SCORE }));
    return { windows };
  }

  async publicMocks(): Promise<BlueprintMockSummary[]> {
    return [];
  }
}
