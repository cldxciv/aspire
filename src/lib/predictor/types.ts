import type { ContentStatus } from "@/lib/types";

/**
 * Rank & college predictor — data-table schema (D-032). Client-safe (no server imports).
 *
 * The predictor is driven ONLY by these tables (src/content/predictor/*.ts). Aspire supplies the
 * official versions; until then every table is a `status: "placeholder"` SAMPLE, shown only while
 * showPlaceholderContent() is on and always labelled "Sample data — not official".
 *
 * Nothing here comes from Aspire's ranker records: those have no scores, so the predictor never
 * links a score to an Aspire student's outcome.
 */

export const PREDICTOR_EXAMS = ["jee-main", "neet-ug", "boh"] as const;
/** jee-main = JEE Main (JoSAA: NITs, IIITs, GFTIs); neet-ug = NEET-UG (MCC + state quota); boh = Brain of Himachal (Aspire's scholarship test). */
export type PredictorExam = (typeof PREDICTOR_EXAMS)[number];

export const INPUT_MODES = ["score", "percentile"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

/** Candidate category. GEN competes for OPEN seats only; the others also for their own category's seats. */
export const PREDICTOR_CATEGORIES = ["GEN", "EWS", "OBC-NCL", "SC", "ST"] as const;
export type PredictorCategory = (typeof PREDICTOR_CATEGORIES)[number];

/** Domicile as modelled: Himachal Pradesh or any other state (other states' home quotas are not modelled). */
export const HOME_STATES = ["HP", "OTHER"] as const;
export type HomeState = (typeof HOME_STATES)[number];

/** Female candidates are also eligible for JoSAA's female-only (supernumerary) seat pool. */
export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** Seat category of a cutoff row. "OPEN" = unreserved. */
export type SeatCategory = "OPEN" | Exclude<PredictorCategory, "GEN">;

/**
 * Quota of a cutoff row:
 * - `AI` all-India (anyone: IIITs, AIIMS, MCC 15 % AIQ, Aspire's scholarship tiers);
 * - `HS` home state — only domicile candidates of the institute's state (NIT Hamirpur HS, HP 85 % state quota);
 * - `OS` other state — candidates who are NOT home-state for that institute.
 */
export type Quota = "AI" | "HS" | "OS";

/** JoSAA seat pool. Absent = gender-neutral. */
export type SeatPool = "neutral" | "female";

/** Inclusive numeric range. For ranks `low` is the better (smaller) rank. */
export interface Range {
  low: number;
  high: number;
}

/** One point of the score → percentile curve. Percentiles are linearly interpolated between anchors. */
export interface ScoreAnchor {
  score: number;
  /** Pessimistic percentile at this score. */
  percentileLow: number;
  /** Optimistic percentile at this score (≥ percentileLow). */
  percentileHigh: number;
}

/**
 * Score → percentile → rank table for one exam session.
 * Rank ≈ (100 − percentile) / 100 × candidates (the NTA percentile definition), so the band's best
 * rank uses percentileHigh with candidates.low and its worst rank percentileLow with candidates.high.
 */
export interface ExamScoreTable {
  exam: PredictorExam;
  /** Session the curve describes, e.g. 2025. */
  year: number;
  /** Lowest / highest possible score (marks). */
  minScore: number;
  maxScore: number;
  /** Candidates who appeared; a range absorbs year-to-year change. */
  candidates: Range;
  /** Ascending by `score`; both percentile columns non-decreasing; 0 ≤ percentileLow ≤ percentileHigh ≤ 100. */
  anchors: ScoreAnchor[];
  /**
   * Category rank ≈ common-rank-list (CRL / AIR) rank × share, per reserved category.
   * Absent when the exam has no category ranks (e.g. BOH).
   */
  categoryShare?: Partial<Record<Exclude<SeatCategory, "OPEN">, Range>>;
  /** PwD rank ≈ (category or CRL) rank × share. Absent = PwD seats not modelled. */
  pwdShare?: Range;
  /** Which inputs apply to this exam (the form hides the rest; the engine ignores them). */
  supports: { percentile: boolean; category: boolean; pwd: boolean; homeState: boolean; gender: boolean };
  /** Width of the score bucket the share card shows instead of the exact score (marks; percentile buckets are 1 point). */
  shareBucket: number;
  status: ContentStatus;
  /** "Sample data — not official…" or the official source (URL + date). */
  source: string;
}

export type InstituteKind = "NIT" | "IIIT" | "GFTI" | "AIIMS" | "Medical college" | "Dental college" | "Scholarship";

export interface PredictorInstitute {
  id: string;
  /** Official name as listed by the counselling body (Latin script in every locale). */
  name: string;
  /** Hindi display name, when Aspire supplies one. */
  nameHi?: string;
  /** HP institutes have HS quotas for HP domicile candidates. */
  state: HomeState;
  kind: InstituteKind;
}

/**
 * One opening/closing-rank row (one institute · program · quota · seat category · pool).
 * `closingRank` is the final-round closing rank in the table's `categoryRankBasis`:
 * CRL for OPEN rows; category rank (JoSAA) or AIR (MCC) for reserved rows; PwD rank for `pwd` rows.
 */
export interface CutoffRow {
  /** Stable id, e.g. "nit-hamirpur-cse-hs-obc-ncl-neutral". */
  id: string;
  instituteId: string;
  /** Program exactly as listed, e.g. "B.Tech Computer Science and Engineering", "MBBS". */
  program: string;
  /** Hindi display name, when Aspire supplies one. */
  programHi?: string;
  quota: Quota;
  seatCategory: SeatCategory;
  /** PwD sub-category row. */
  pwd?: boolean;
  pool?: SeatPool;
  openingRank?: number;
  closingRank: number;
}

/** Opening/closing ranks for one exam session's counselling. */
export interface CutoffTable {
  exam: PredictorExam;
  year: number;
  /** Counselling body, e.g. "JoSAA", "MCC + HP state counselling", "Aspire BOH". */
  counselling: string;
  /**
   * How reserved-category rows are ranked: `category` = category rank (JoSAA), `crl` = the common
   * list / AIR (MCC and most state counselling).
   */
  categoryRankBasis: "category" | "crl";
  /** An option is a "reach" while the best rank of the band is within closingRank × reachFactor. */
  reachFactor: number;
  institutes: PredictorInstitute[];
  rows: CutoffRow[];
  status: ContentStatus;
  source: string;
}

/** Everything the engine needs. Pass only tables that may be shown (see selectVisibleData). */
export interface PredictorData {
  scoreTables: ExamScoreTable[];
  cutoffTables: CutoffTable[];
}
