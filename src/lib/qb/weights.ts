import type {
  QbBlueprint,
  QbBlueprintSection,
  QbChapterWeights,
  QbFormat,
  QbFormatTargets,
  QbQuestionType,
  QbSubject,
} from "./types";

/**
 * Chapter weights and format targets from past official papers (owner: QB-CORE-A; §B9.2). Pure.
 *
 * - Data: every official question of the exam with a chapter (the staff chapter, else the AI
 *   suggestion), drafts and dropped questions included, rejected rows excluded (the caller filters).
 * - Window: papers from `fromYear` (default: the exam's syllabus revision year). With fewer than three
 *   papers inside it, the last `fallbackYears` years with a `halfLifeYears` recency decay.
 * - Per-paper normalisation: within each paper and subject, chapter shares sum to 1; a year's share is
 *   the mean over its papers, so a year with 20 shifts weighs the same as a year with one paper.
 * - Smoothing: w_c ∝ α + Σ_years factor × yearShare_c, α = 0.02 for chapters with eligible questions.
 * - No official data for a subject: uniform over its eligible chapters.
 * - Manual overrides (percentages) replace the derived shares; the rest is renormalised.
 */

export const WEIGHT_ALPHA = 0.02;
export const MIN_PAPERS_IN_WINDOW = 3;

export interface OfficialQuestionRecord {
  subject: QbSubject;
  chapterId: string;
  /** `source_paper_key`, one per official paper (shift / booklet / paper). */
  paperKey: string;
  year: number;
  /** True when the chapter is only the AI's suggestion (shown to admins as a share). */
  fromAi?: boolean;
  type?: QbQuestionType;
  format?: QbFormat;
  integer?: boolean;
}

export type WeightsMode = "past_papers" | "fallback_decay" | "uniform" | "manual";

export interface ChapterWeightsResult {
  weights: QbChapterWeights;
  meta: {
    mode: WeightsMode;
    fromYear: number | null;
    papersInWindow: number;
    /** Share of the counted questions whose chapter came from an AI suggestion. */
    aiShare: number;
    /** Subjects with no official data in the window (uniform weights). */
    uniformSubjects: QbSubject[];
  };
}

export interface ChapterWeightsInput {
  records: readonly OfficialQuestionRecord[];
  /** Chapters with eligible questions, per subject (current for the exam). */
  eligibleChapters: Partial<Record<QbSubject, readonly string[]>>;
  settings: QbBlueprint["chapterWeights"];
  syllabusRevisionYear: number | null;
  currentYear: number;
  alpha?: number;
}

interface WindowChoice {
  mode: "past_papers" | "fallback_decay";
  fromYear: number | null;
  factor: (year: number) => number;
  inWindow: (year: number) => boolean;
  papers: number;
}

function chooseWindow(input: ChapterWeightsInput): WindowChoice {
  const fromYear = input.settings.fromYear ?? input.syllabusRevisionYear;
  const paperYears = new Map<string, number>();
  for (const record of input.records) paperYears.set(record.paperKey, record.year);
  if (fromYear !== null) {
    const papers = [...paperYears.values()].filter((year) => year >= fromYear).length;
    if (papers >= MIN_PAPERS_IN_WINDOW) {
      return { mode: "past_papers", fromYear, factor: () => 1, inWindow: (year) => year >= fromYear, papers };
    }
  }
  const firstYear = input.currentYear - Math.max(1, input.settings.fallbackYears) + 1;
  const halfLife = input.settings.halfLifeYears;
  const papers = [...paperYears.values()].filter((year) => year >= firstYear && year <= input.currentYear).length;
  return {
    mode: "fallback_decay",
    fromYear: firstYear,
    factor: (year) => (halfLife && halfLife > 0 ? Math.pow(0.5, Math.max(0, input.currentYear - year) / halfLife) : 1),
    inWindow: (year) => year >= firstYear && year <= input.currentYear,
    papers,
  };
}

/** Per-paper normalised, per-year averaged shares, combined over years with `factor`. */
function aggregateShares<K extends string>(
  records: readonly { paperKey: string; year: number; key: K }[],
  factor: (year: number) => number,
): Map<K, number> {
  // paper → key → count
  const perPaper = new Map<string, { year: number; counts: Map<K, number>; total: number }>();
  for (const r of records) {
    let paper = perPaper.get(r.paperKey);
    if (!paper) {
      paper = { year: r.year, counts: new Map(), total: 0 };
      perPaper.set(r.paperKey, paper);
    }
    paper.counts.set(r.key, (paper.counts.get(r.key) ?? 0) + 1);
    paper.total += 1;
  }
  // year → key → summed paper shares, and paper count
  const perYear = new Map<number, { sums: Map<K, number>; papers: number }>();
  for (const paper of perPaper.values()) {
    let year = perYear.get(paper.year);
    if (!year) {
      year = { sums: new Map(), papers: 0 };
      perYear.set(paper.year, year);
    }
    year.papers += 1;
    for (const [key, count] of paper.counts) year.sums.set(key, (year.sums.get(key) ?? 0) + count / paper.total);
  }
  const combined = new Map<K, number>();
  for (const [yearValue, year] of perYear) {
    const f = factor(yearValue);
    for (const [key, sum] of year.sums) combined.set(key, (combined.get(key) ?? 0) + f * (sum / year.papers));
  }
  return combined;
}

function normalise(values: Record<string, number>): Record<string, number> {
  const total = Object.values(values).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) out[key] = total > 0 ? Math.max(0, value) / total : 0;
  return out;
}

function uniform(chapters: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const chapter of chapters) out[chapter] = chapters.length > 0 ? 1 / chapters.length : 0;
  return out;
}

/** Applies percentage overrides to one subject's normalised weights. */
export function applyOverrides(base: Record<string, number>, overrides: Record<string, number>): Record<string, number> {
  const chapters = Object.keys(base);
  const overridden = chapters.filter((c) => typeof overrides[c] === "number" && Number.isFinite(overrides[c]));
  if (overridden.length === 0) return { ...base };
  const fixed: Record<string, number> = {};
  let fixedTotal = 0;
  for (const c of overridden) {
    fixed[c] = Math.max(0, overrides[c]) / 100;
    fixedTotal += fixed[c];
  }
  if (fixedTotal >= 1) {
    const out: Record<string, number> = {};
    for (const c of chapters) out[c] = overridden.includes(c) ? fixed[c] / fixedTotal : 0;
    return out;
  }
  const rest = chapters.filter((c) => !overridden.includes(c));
  const restBase = rest.reduce((sum, c) => sum + base[c], 0);
  const out: Record<string, number> = {};
  for (const c of chapters) {
    if (overridden.includes(c)) out[c] = fixed[c];
    else out[c] = restBase > 0 ? (base[c] / restBase) * (1 - fixedTotal) : rest.length > 0 ? (1 - fixedTotal) / rest.length : 0;
  }
  return out;
}

export function computeChapterWeights(input: ChapterWeightsInput): ChapterWeightsResult {
  const alpha = input.alpha ?? WEIGHT_ALPHA;
  const subjects = Object.keys(input.eligibleChapters) as QbSubject[];
  const weights: QbChapterWeights = {};
  const uniformSubjects: QbSubject[] = [];
  const mode = input.settings.mode;
  const window = chooseWindow(input);
  const inWindow = input.records.filter((r) => window.inWindow(r.year));
  const aiShare = inWindow.length > 0 ? inWindow.filter((r) => r.fromAi).length / inWindow.length : 0;

  for (const subject of subjects) {
    const chapters = [...(input.eligibleChapters[subject] ?? [])];
    if (chapters.length === 0) continue;
    let base: Record<string, number>;
    if (mode === "uniform") {
      base = uniform(chapters);
    } else {
      const subjectRecords = inWindow
        .filter((r) => r.subject === subject && chapters.includes(r.chapterId))
        .map((r) => ({ paperKey: r.paperKey, year: r.year, key: r.chapterId }));
      if (subjectRecords.length === 0) {
        base = uniform(chapters);
        uniformSubjects.push(subject);
      } else {
        const shares = aggregateShares(subjectRecords, window.factor);
        const raw: Record<string, number> = {};
        for (const chapter of chapters) raw[chapter] = alpha + (shares.get(chapter) ?? 0);
        base = normalise(raw);
      }
    }
    weights[subject] = applyOverrides(base, input.settings.overrides ?? {});
  }

  return {
    weights,
    meta: {
      mode: mode === "past_papers" ? window.mode : mode,
      fromYear: window.fromYear,
      papersInWindow: window.papers,
      aiShare,
      uniformSubjects,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Format targets (`formatMix: "past_papers"`)

function sectionAccepts(section: QbBlueprintSection, record: OfficialQuestionRecord): boolean {
  if (record.subject !== section.subject) return false;
  if (record.type !== undefined && record.type !== section.type) return false;
  if (section.answerFormat === "integer" && record.integer === false) return false;
  return true;
}

/** Format shares per section: explicit mixes as given, `past_papers` from official data, null = none. */
export function computeFormatTargets(input: {
  blueprint: Pick<QbBlueprint, "parts" | "chapterWeights">;
  records: readonly OfficialQuestionRecord[];
  syllabusRevisionYear: number | null;
  currentYear: number;
}): QbFormatTargets {
  const targets: QbFormatTargets = {};
  const window = chooseWindow({
    records: input.records,
    eligibleChapters: {},
    settings: input.blueprint.chapterWeights,
    syllabusRevisionYear: input.syllabusRevisionYear,
    currentYear: input.currentYear,
  });
  for (const part of input.blueprint.parts) {
    for (const section of part.sections) {
      if (section.format || !section.formatMix) continue;
      if (section.formatMix !== "past_papers") {
        targets[section.id] = normalise(section.formatMix as Record<string, number>) as Partial<Record<QbFormat, number>>;
        continue;
      }
      const records = input.records
        .filter((r) => window.inWindow(r.year) && r.format !== undefined && r.format !== "passage" && sectionAccepts(section, r))
        .map((r) => ({ paperKey: r.paperKey, year: r.year, key: r.format as QbFormat }));
      if (records.length === 0) continue;
      const shares = aggregateShares(records, window.factor);
      targets[section.id] = normalise(Object.fromEntries(shares)) as Partial<Record<QbFormat, number>>;
    }
  }
  return targets;
}
