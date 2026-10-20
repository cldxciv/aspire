import type { CutoffRow, PredictorCategory, Quota, SeatCategory } from "@/lib/predictor/types";

/**
 * Helpers for the SAMPLE predictor tables only (D-032). Official tables are plain row lists
 * (e.g. converted from the JoSAA / MCC / HP counselling opening-closing-rank files) and do not
 * need these generators.
 */

/** Shown wherever a sample table is used. Kept in the data so it travels with the table. */
export const SAMPLE_SOURCE =
  "Sample data — not official. Illustrative numbers only; Aspire must replace them with the official JoSAA / MCC / HP counselling tables.";

/** Round to two significant figures so sample cutoffs read as illustrative, never as official values. */
export function sampleRound(value: number): number {
  if (value < 100) return Math.max(1, Math.round(value));
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / step) * step;
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface SampleProgram {
  instituteId: string;
  program: string;
  programHi?: string;
  /** Short id part, e.g. "cse". */
  code: string;
  /** Quotas offered, with the OPEN gender-neutral closing rank of each (illustrative). */
  open: Partial<Record<Quota, number>>;
}

export interface SampleFactors {
  /** Reserved-category closing rank = OPEN closing × factor (in the table's categoryRankBasis). */
  category: Record<Exclude<PredictorCategory, "GEN">, number>;
  /** Female-only pool closing = gender-neutral closing × factor; absent = no female pool rows. */
  female?: number;
  /** OPEN-PwD closing = OPEN closing × factor; absent = no PwD rows. */
  pwd?: number;
}

const RESERVED: Exclude<SeatCategory, "OPEN">[] = ["EWS", "OBC-NCL", "SC", "ST"];

/** Expands a compact program spec into cutoff rows (every quota × seat category × pool, plus OPEN-PwD). */
export function sampleRows(programs: SampleProgram[], factors: SampleFactors): CutoffRow[] {
  const rows: CutoffRow[] = [];
  for (const p of programs) {
    for (const [quota, open] of Object.entries(p.open) as [Quota, number][]) {
      const seats: [SeatCategory, number][] = [["OPEN", open], ...RESERVED.map((c): [SeatCategory, number] => [c, open * factors.category[c]])];
      for (const [seatCategory, closing] of seats) {
        const pools = factors.female ? (["neutral", "female"] as const) : (["neutral"] as const);
        for (const pool of pools) {
          rows.push({
            id: [p.instituteId, p.code, quota, seatCategory, pool].map(slug).join("-"),
            instituteId: p.instituteId,
            program: p.program,
            ...(p.programHi ? { programHi: p.programHi } : {}),
            quota,
            seatCategory,
            ...(pool === "female" ? { pool } : {}),
            closingRank: sampleRound(pool === "female" ? closing * (factors.female ?? 1) : closing),
          });
        }
      }
      if (factors.pwd) {
        rows.push({
          id: [p.instituteId, p.code, quota, "open", "pwd"].map(slug).join("-"),
          instituteId: p.instituteId,
          program: p.program,
          ...(p.programHi ? { programHi: p.programHi } : {}),
          quota,
          seatCategory: "OPEN",
          pwd: true,
          closingRank: sampleRound(open * factors.pwd),
        });
      }
    }
  }
  return rows;
}
