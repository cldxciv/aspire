import { createHash } from "node:crypto";

/**
 * Seeded randomness for paper generation (owner: QB-CORE-A; §B9.3). `sfc32` seeded from the SHA-256 of
 * the seed string: the same seed always gives the same sequence, so a paper can be regenerated or
 * checked from its stored seed. Server-side (node:crypto); never used for secrets.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Fisher–Yates shuffle of a copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Index picked with probability proportional to `weights[i]` (≥ 0); -1 when all are 0. */
  weightedIndex(weights: readonly number[]): number;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A seeded generator: sfc32 with its four words taken from SHA-256(seed). */
export function createRng(seed: string): Rng {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  const next = sfc32(digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12));
  // Warm up (sfc32 recommends discarding the first outputs).
  for (let i = 0; i < 12; i += 1) next();
  const rng: Rng = {
    next,
    int(n) {
      if (!(n > 0)) return 0;
      return Math.min(n - 1, Math.floor(next() * n));
    },
    shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = rng.int(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += w > 0 && Number.isFinite(w) ? w : 0;
      if (total <= 0) return -1;
      let r = next() * total;
      for (let i = 0; i < weights.length; i += 1) {
        const w = weights[i] > 0 && Number.isFinite(weights[i]) ? weights[i] : 0;
        if (r < w) return i;
        r -= w;
      }
      for (let i = weights.length - 1; i >= 0; i -= 1) if (weights[i] > 0) return i;
      return -1;
    },
  };
  return rng;
}
