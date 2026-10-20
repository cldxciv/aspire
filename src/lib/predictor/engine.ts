import { z } from "zod";
import type { ContentStatus } from "@/lib/types";
import {
  GENDERS,
  HOME_STATES,
  INPUT_MODES,
  PREDICTOR_CATEGORIES,
  PREDICTOR_EXAMS,
  type CutoffRow,
  type CutoffTable,
  type ExamScoreTable,
  type InputMode,
  type PredictorData,
  type PredictorExam,
  type PredictorInstitute,
  type Quota,
  type Range,
  type SeatCategory,
  type SeatPool,
} from "./types";

export * from "./types";

/**
 * Rank & college predictor engine (D-032). PURE and client-safe: no server imports, no content
 * imports, no I/O. Every function takes the data tables as an argument, so placeholder tables
 * never reach a browser bundle unless the server decided to pass them (see ./data.ts).
 *
 * Usage (server):  `const data = getPredictorData();  predictRankBand(input, data)`
 * Usage (client):  receive `data` (or null) via props from the server page, then call the same functions.
 * `data === null` (production with only sample tables) → `{ status: "not-loaded" }`.
 *
 * Output is always a BAND (never one exact rank), rounded outward to two significant figures.
 */

// ---------------------------------------------------------------------------------------------
// Input

export const predictorInputSchema = z.object({
  exam: z.enum(PREDICTOR_EXAMS),
  mode: z.enum(INPUT_MODES).default("score"),
  /** Marks (score mode) or NTA percentile 0–100 (percentile mode). Range-checked against the exam's table. */
  value: z.number(),
  category: z.enum(PREDICTOR_CATEGORIES).default("GEN"),
  pwd: z.boolean().default(false),
  homeState: z.enum(HOME_STATES).default("HP"),
  gender: z.enum(GENDERS).default("other"),
});

/** Validated, normalised input. */
export type PredictorInput = z.output<typeof predictorInputSchema>;
/** What callers may pass (defaults filled in by validation). */
export type PredictorInputLike = z.input<typeof predictorInputSchema>;

export type PredictorIssueCode = "invalid" | "out_of_range" | "unsupported";

export interface PredictorIssue {
  field: keyof PredictorInput;
  code: PredictorIssueCode;
  min?: number;
  max?: number;
}

export interface NotLoaded {
  status: "not-loaded";
  exam?: PredictorExam;
}

export interface Invalid {
  status: "invalid";
  issues: PredictorIssue[];
}

// ---------------------------------------------------------------------------------------------
// Data selection

/** Statuses that may be used: `published` always, `placeholder` only when the caller allows sample data. */
export function isUsableStatus(status: ContentStatus, showPlaceholder: boolean): boolean {
  return status === "published" || (status === "placeholder" && showPlaceholder);
}

/**
 * The tables that may be shown, or null when no exam has a usable score table (→ "coming soon").
 * Server code passes showPlaceholderContent(); never decide this in the browser.
 */
export function selectVisibleData(all: PredictorData, showPlaceholder: boolean): PredictorData | null {
  const scoreTables = all.scoreTables.filter((t) => isUsableStatus(t.status, showPlaceholder));
  const cutoffTables = all.cutoffTables.filter((t) => isUsableStatus(t.status, showPlaceholder));
  return scoreTables.length > 0 ? { scoreTables, cutoffTables } : null;
}

function latestFor<T extends { exam: PredictorExam; year: number }>(tables: readonly T[], exam: PredictorExam): T | undefined {
  return tables.filter((t) => t.exam === exam).sort((a, b) => b.year - a.year)[0];
}

/** Newest score table for `exam`, if loaded. */
export function scoreTableFor(exam: PredictorExam, data: PredictorData | null): ExamScoreTable | undefined {
  return data ? latestFor(data.scoreTables, exam) : undefined;
}

/** Newest cutoff table for `exam`, if loaded. */
export function cutoffTableFor(exam: PredictorExam, data: PredictorData | null): CutoffTable | undefined {
  return data ? latestFor(data.cutoffTables, exam) : undefined;
}

/** Exams with a loaded score table, in PREDICTOR_EXAMS order. */
export function loadedExams(data: PredictorData | null): PredictorExam[] {
  return PREDICTOR_EXAMS.filter((exam) => scoreTableFor(exam, data) !== undefined);
}

/** True when any table in `data` is a sample (placeholder) — render the "Sample data" label. */
export function hasSampleData(data: PredictorData | null): boolean {
  return !!data && [...data.scoreTables, ...data.cutoffTables].some((t) => t.status === "placeholder");
}

/** Allowed range of `value` for `mode` on `table`. */
export function valueRange(table: ExamScoreTable, mode: InputMode): Range {
  return mode === "percentile" ? { low: 0, high: 100 } : { low: table.minScore, high: table.maxScore };
}

type Validation = { ok: true; input: PredictorInput; table: ExamScoreTable } | { ok: false; result: NotLoaded | Invalid };

const ISSUE_FIELDS = new Set<string>(Object.keys(predictorInputSchema.shape));

/**
 * Parses `raw` (zod), checks it against the exam's table and normalises fields the exam does not
 * use (e.g. BOH has no category / PwD / gender pools → GEN / false / "other").
 */
export function validatePredictorInput(raw: unknown, data: PredictorData | null): Validation {
  const parsed = predictorInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map<PredictorIssue>((issue) => {
      const field = String(issue.path[0] ?? "exam");
      return { field: (ISSUE_FIELDS.has(field) ? field : "exam") as keyof PredictorInput, code: "invalid" };
    });
    return { ok: false, result: { status: "invalid", issues } };
  }
  const input = { ...parsed.data };
  const table = scoreTableFor(input.exam, data);
  if (!table) return { ok: false, result: { status: "not-loaded", exam: input.exam } };

  const issues: PredictorIssue[] = [];
  if (input.mode === "percentile" && !table.supports.percentile) issues.push({ field: "mode", code: "unsupported" });
  const range = valueRange(table, input.mode);
  if (!Number.isFinite(input.value) || input.value < range.low || input.value > range.high) {
    issues.push({ field: "value", code: "out_of_range", min: range.low, max: range.high });
  }
  if (issues.length > 0) return { ok: false, result: { status: "invalid", issues } };

  if (!table.supports.category) input.category = "GEN";
  if (!table.supports.pwd) input.pwd = false;
  if (!table.supports.gender) input.gender = "other";
  return { ok: true, input, table };
}

// ---------------------------------------------------------------------------------------------
// Score → percentile → rank

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Percentile band for a score, linearly interpolated between anchors and clamped to the curve's ends. */
export function percentileForScore(table: ExamScoreTable, score: number): Range {
  const anchors = table.anchors;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (score <= first.score) return { low: first.percentileLow, high: first.percentileHigh };
  if (score >= last.score) return { low: last.percentileLow, high: last.percentileHigh };
  const i = anchors.findIndex((a, index) => index < anchors.length - 1 && score >= a.score && score < anchors[index + 1].score);
  const a = anchors[i];
  const b = anchors[i + 1];
  const t = (score - a.score) / (b.score - a.score);
  return { low: lerp(a.percentileLow, b.percentileLow, t), high: lerp(a.percentileHigh, b.percentileHigh, t) };
}

/** Rank implied by a percentile among `candidates` (NTA definition), at least 1. */
export function rankFromPercentile(percentile: number, candidates: number): number {
  const p = Math.min(100, Math.max(0, percentile));
  return Math.max(1, Math.ceil(((100 - p) / 100) * candidates - 1e-9));
}

function niceStep(value: number): number {
  if (value < 100) return value < 10 ? 1 : 5;
  return 10 ** (Math.floor(Math.log10(value)) - 1);
}

/**
 * Rounds a rank band OUTWARD to two significant figures (1–9 exact, 10–99 to 5s) so it reads as
 * an estimate; never returns a single number (high > low). Monotone in both ends.
 */
export function roundRankBand(band: Range): Range {
  const lowRaw = Math.max(1, Math.min(band.low, band.high));
  const highRaw = Math.max(lowRaw, band.low, band.high);
  const lowStep = niceStep(lowRaw);
  const highStep = niceStep(highRaw);
  const low = Math.max(1, Math.floor(lowRaw / lowStep) * lowStep);
  let high = Math.ceil(highRaw / highStep) * highStep;
  if (high <= low) high = low + niceStep(low);
  return { low, high };
}

function scaleBand(band: Range, share: Range): Range {
  return { low: Math.max(1, Math.floor(band.low * share.low)), high: Math.max(1, Math.ceil(band.high * share.high)) };
}

export interface RankBandPrediction {
  status: "ok";
  exam: PredictorExam;
  /** Session of the score table used. */
  year: number;
  /** True when the score table is a sample (placeholder). */
  sample: boolean;
  source: string;
  /** Normalised input the band was computed for. */
  input: PredictorInput;
  /** Percentile band (equal ends in percentile mode). */
  percentile: Range;
  /** Common rank list (JEE Main CRL / NEET AIR / BOH merit) band. */
  crl: Range;
  /** Category rank band (reserved categories, when modelled). */
  categoryRank?: Range;
  /** PwD rank in the common list (CRL-PwD), when PwD is selected. */
  pwdRank?: Range;
  /** PwD rank within the category, when both apply. */
  categoryPwdRank?: Range;
}

export type RankBandResult = RankBandPrediction | NotLoaded | Invalid;

function bandsFor(input: PredictorInput, table: ExamScoreTable): Omit<RankBandPrediction, "status" | "input"> {
  const percentile = input.mode === "percentile" ? { low: input.value, high: input.value } : percentileForScore(table, input.value);
  const rawCrl = {
    low: rankFromPercentile(percentile.high, table.candidates.low),
    high: rankFromPercentile(percentile.low, table.candidates.high),
  };
  const share = input.category !== "GEN" ? table.categoryShare?.[input.category] : undefined;
  const rawCategory = share ? scaleBand(rawCrl, share) : undefined;
  const pwd = input.pwd && table.pwdShare ? table.pwdShare : undefined;
  return {
    exam: table.exam,
    year: table.year,
    sample: table.status === "placeholder",
    source: table.source,
    percentile,
    crl: roundRankBand(rawCrl),
    ...(rawCategory ? { categoryRank: roundRankBand(rawCategory) } : {}),
    ...(pwd ? { pwdRank: roundRankBand(scaleBand(rawCrl, pwd)) } : {}),
    ...(pwd && rawCategory ? { categoryPwdRank: roundRankBand(scaleBand(rawCategory, pwd)) } : {}),
  };
}

/**
 * Predicted rank band for `input` (score or percentile). Returns `not-loaded` when no table for the
 * exam may be shown and `invalid` (with zod / range issues) for bad input.
 */
export function predictRankBand(input: PredictorInputLike, data: PredictorData | null): RankBandResult {
  const checked = validatePredictorInput(input, data);
  if (!checked.ok) return checked.result;
  return { status: "ok", input: checked.input, ...bandsFor(checked.input, checked.table) };
}

// ---------------------------------------------------------------------------------------------
// College / program matching

export const OPTION_TAGS = ["likely", "borderline", "reach"] as const;
/** likely: whole band within the closing rank; borderline: the band straddles it; reach: just beyond it. */
export type OptionTag = (typeof OPTION_TAGS)[number];

export type RankType = "crl" | "category" | "pwd" | "category-pwd";

export interface CollegeOption {
  /** Cutoff row id. */
  id: string;
  institute: PredictorInstitute;
  program: string;
  programHi?: string;
  quota: Quota;
  seatCategory: SeatCategory;
  pwd: boolean;
  pool: SeatPool;
  openingRank?: number;
  closingRank: number;
  /** Which of the student's rank bands was compared with the closing rank. */
  rankType: RankType;
  rankUsed: Range;
  tag: OptionTag;
}

export interface CutoffInfo {
  year: number;
  counselling: string;
  sample: boolean;
  source: string;
}

export interface CollegeMatchPrediction {
  status: "ok";
  band: RankBandPrediction;
  /** Null when the exam's cutoff table is not loaded (the band can still be shown). */
  cutoffs: CutoffInfo | null;
  /** One option per institute + program (the student's most favourable seat type), likely first. */
  options: CollegeOption[];
}

export type CollegeMatchResult = CollegeMatchPrediction | NotLoaded | Invalid;

type RankSet = Pick<RankBandPrediction, "crl" | "categoryRank" | "pwdRank" | "categoryPwdRank">;
type MatchProfile = Pick<PredictorInput, "category" | "pwd" | "homeState" | "gender">;

function rankForRow(row: CutoffRow, ranks: RankSet, basis: CutoffTable["categoryRankBasis"]): { type: RankType; band: Range } | null {
  // MCC / state counselling publish every closing rank (reserved and PwD rows too) as AIR.
  if (basis === "crl") return { type: "crl", band: ranks.crl };
  if (row.seatCategory === "OPEN") {
    if (!row.pwd) return { type: "crl", band: ranks.crl };
    return ranks.pwdRank ? { type: "pwd", band: ranks.pwdRank } : null;
  }
  if (!row.pwd) return ranks.categoryRank ? { type: "category", band: ranks.categoryRank } : null;
  return ranks.categoryPwdRank ? { type: "category-pwd", band: ranks.categoryPwdRank } : null;
}

function isEligible(row: CutoffRow, institute: PredictorInstitute, profile: MatchProfile): boolean {
  if (row.pwd && !profile.pwd) return false;
  if ((row.pool ?? "neutral") === "female" && profile.gender !== "female") return false;
  if (row.seatCategory !== "OPEN" && row.seatCategory !== profile.category) return false;
  const homeStateCandidate = institute.state === "HP" && profile.homeState === "HP";
  if (row.quota === "HS" && !homeStateCandidate) return false;
  if (row.quota === "OS" && homeStateCandidate) return false;
  return true;
}

/** Tag for a band against a closing rank, or null when the option is out of reach. */
export function tagForBand(band: Range, closingRank: number, reachFactor: number): OptionTag | null {
  if (band.high <= closingRank) return "likely";
  if (band.low <= closingRank) return "borderline";
  if (band.low <= closingRank * reachFactor) return "reach";
  return null;
}

const tagOrder = (tag: OptionTag) => OPTION_TAGS.indexOf(tag);
/** How close the band's worst rank is to the closing rank (higher = more competitive for this student). */
const pressure = (option: CollegeOption) => option.rankUsed.high / option.closingRank;

function matchRows(ranks: RankSet, profile: MatchProfile, table: CutoffTable): CollegeOption[] {
  const institutes = new Map(table.institutes.map((i) => [i.id, i]));
  const best = new Map<string, CollegeOption>();
  for (const row of table.rows) {
    const institute = institutes.get(row.instituteId);
    if (!institute || !isEligible(row, institute, profile)) continue;
    const rank = rankForRow(row, ranks, table.categoryRankBasis);
    if (!rank) continue;
    const tag = tagForBand(rank.band, row.closingRank, table.reachFactor);
    if (!tag) continue;
    const option: CollegeOption = {
      id: row.id,
      institute,
      program: row.program,
      ...(row.programHi ? { programHi: row.programHi } : {}),
      quota: row.quota,
      seatCategory: row.seatCategory,
      pwd: !!row.pwd,
      pool: row.pool ?? "neutral",
      ...(row.openingRank !== undefined ? { openingRank: row.openingRank } : {}),
      closingRank: row.closingRank,
      rankType: rank.type,
      rankUsed: rank.band,
      tag,
    };
    const key = `${row.instituteId}|${row.program}`;
    const current = best.get(key);
    if (
      !current ||
      tagOrder(tag) < tagOrder(current.tag) ||
      (tag === current.tag && pressure(option) < pressure(current))
    ) {
      best.set(key, option);
    }
  }
  return [...best.values()].sort((a, b) => tagOrder(a.tag) - tagOrder(b.tag) || pressure(b) - pressure(a) || a.id.localeCompare(b.id));
}

function cutoffInfo(table: CutoffTable): CutoffInfo {
  return { year: table.year, counselling: table.counselling, sample: table.status === "placeholder", source: table.source };
}

/**
 * Rank band plus the institute/program options it may reach in the newest loaded cutoff table,
 * each tagged likely / borderline / reach. Options depend on category, PwD, home state (HS/OS
 * quotas) and gender pool. Never claims an outcome — the tables are cutoffs, not Aspire results.
 */
export function matchColleges(input: PredictorInputLike, data: PredictorData | null): CollegeMatchResult {
  const band = predictRankBand(input, data);
  if (band.status !== "ok") return band;
  const table = cutoffTableFor(band.exam, data);
  if (!table) return { status: "ok", band, cutoffs: null, options: [] };
  return { status: "ok", band, cutoffs: cutoffInfo(table), options: matchRows(band, band.input, table) };
}

/** `input` with `marks` added (or removed), clamped to the exam's score range ("what if I add 20 marks"). */
export function withExtraMarks(input: PredictorInput, marks: number, table: ExamScoreTable): PredictorInput {
  if (input.mode !== "score") return input;
  const value = Math.min(table.maxScore, Math.max(table.minScore, input.value + marks));
  return { ...input, value };
}

// ---------------------------------------------------------------------------------------------
// Share card — only exam + a score/percentile BUCKET travel in the URL (no category, state or name).

export interface ShareBucket {
  exam: PredictorExam;
  mode: InputMode;
  /** Lower bound of the bucket (marks, or whole percentile). */
  from: number;
}

/** Bucket shown on the share card for `input` (e.g. 170–179 marks, or 98–99 percentile). */
export function shareBucketFor(input: Pick<PredictorInput, "exam" | "mode" | "value">, table: ExamScoreTable): ShareBucket {
  const width = input.mode === "percentile" ? 1 : Math.max(1, table.shareBucket);
  const range = valueRange(table, input.mode);
  const from = Math.max(range.low, Math.min(range.high, Math.floor(input.value / width) * width));
  return { exam: input.exam, mode: input.mode, from };
}

/** Inclusive display range of a bucket: score buckets end one mark below the next; percentile buckets at the next whole point. */
export function bucketRange(bucket: ShareBucket, table: ExamScoreTable): Range {
  const range = valueRange(table, bucket.mode);
  const to = bucket.mode === "percentile" ? bucket.from + 1 : bucket.from + Math.max(1, table.shareBucket) - 1;
  return { low: bucket.from, high: Math.min(range.high, Math.max(bucket.from, to)) };
}

export interface ShareCardPrediction {
  status: "ok";
  exam: PredictorExam;
  mode: InputMode;
  bucket: Range;
  year: number;
  /** CRL / AIR band covering the whole bucket. */
  crl: Range;
  /** Top options for OPEN, gender-neutral, non-PwD seats in the all-India / other-state quota (no personal data assumed). */
  options: CollegeOption[];
  sample: boolean;
}

export type ShareCardResult = ShareCardPrediction | NotLoaded | Invalid;

const shareBucketSchema = z.object({
  exam: z.enum(PREDICTOR_EXAMS),
  mode: z.enum(INPUT_MODES).default("score"),
  // Query strings arrive as text: "" / null / missing is invalid (not 0), "abc" → NaN → invalid.
  from: z.preprocess(
    (value) => (value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
    z.coerce.number(),
  ),
});

/**
 * Prediction for a share card: the band covering the whole bucket, with OPEN / other-state options
 * (category, home state, gender and PwD are deliberately not in the URL). `limit` options at most.
 */
export function predictShareCard(raw: unknown, data: PredictorData | null, limit = 3): ShareCardResult {
  const parsed = shareBucketSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", issues: [{ field: "value", code: "invalid" }] };
  const table = scoreTableFor(parsed.data.exam, data);
  if (!table) return { status: "not-loaded", exam: parsed.data.exam };
  const allowed = valueRange(table, parsed.data.mode);
  if (
    (parsed.data.mode === "percentile" && !table.supports.percentile) ||
    parsed.data.from < allowed.low ||
    parsed.data.from > allowed.high
  ) {
    return { status: "invalid", issues: [{ field: "value", code: "out_of_range", min: allowed.low, max: allowed.high }] };
  }
  const bucket = shareBucketFor({ exam: parsed.data.exam, mode: parsed.data.mode, value: parsed.data.from }, table);
  const range = bucketRange(bucket, table);
  const base = { exam: bucket.exam, mode: bucket.mode, category: "GEN", pwd: false, homeState: "OTHER", gender: "other" } as const;
  const worse = predictRankBand({ ...base, value: range.low }, data);
  const better = predictRankBand({ ...base, value: range.high }, data);
  if (worse.status !== "ok") return worse;
  if (better.status !== "ok") return better;
  const crl = { low: better.crl.low, high: worse.crl.high };
  const cutoffs = cutoffTableFor(bucket.exam, data);
  const options = cutoffs ? matchRows({ crl }, worse.input, cutoffs).slice(0, Math.max(0, limit)) : [];
  return {
    status: "ok",
    exam: bucket.exam,
    mode: bucket.mode,
    bucket: range,
    year: table.year,
    crl,
    options,
    sample: table.status === "placeholder" || cutoffs?.status === "placeholder",
  };
}
