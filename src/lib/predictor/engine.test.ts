import { afterEach, describe, expect, it, vi } from "vitest";
import { predictorTables } from "@/content/predictor";
import { getPredictorData } from "./data";
import {
  OPTION_TAGS,
  PREDICTOR_EXAMS,
  bucketRange,
  cutoffTableFor,
  hasSampleData,
  loadedExams,
  matchColleges,
  predictRankBand,
  predictShareCard,
  predictorInputSchema,
  rankFromPercentile,
  roundRankBand,
  scoreTableFor,
  selectVisibleData,
  shareBucketFor,
  tagForBand,
  withExtraMarks,
  type CollegeMatchPrediction,
  type CollegeOption,
  type PredictorInputLike,
  type RankBandPrediction,
} from "./engine";

const data = predictorTables;

afterEach(() => {
  vi.unstubAllEnvs();
});

function band(input: PredictorInputLike): RankBandPrediction {
  const result = predictRankBand(input, data);
  if (result.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
}

function match(input: PredictorInputLike): CollegeMatchPrediction {
  const result = matchColleges(input, data);
  if (result.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
}

const key = (o: CollegeOption) => `${o.institute.id}|${o.program}`;
const tagIndex = (o: CollegeOption) => OPTION_TAGS.indexOf(o.tag);

describe("predictor tables (schema)", () => {
  it("ship every exam as a labelled SAMPLE (placeholder) with a valid curve", () => {
    for (const exam of PREDICTOR_EXAMS) {
      const table = scoreTableFor(exam, data);
      expect(table, exam).toBeDefined();
      if (!table) continue;
      expect(table.status).toBe("placeholder");
      expect(table.source).toMatch(/^Sample data — not official/);
      expect(table.minScore).toBeLessThan(table.maxScore);
      expect(table.candidates.low).toBeLessThanOrEqual(table.candidates.high);
      const anchors = table.anchors;
      expect(anchors[0].score).toBe(table.minScore);
      expect(anchors[anchors.length - 1].score).toBe(table.maxScore);
      anchors.forEach((a, i) => {
        expect(a.percentileLow).toBeGreaterThanOrEqual(0);
        expect(a.percentileHigh).toBeLessThanOrEqual(100);
        expect(a.percentileLow).toBeLessThanOrEqual(a.percentileHigh);
        if (i > 0) {
          expect(a.score).toBeGreaterThan(anchors[i - 1].score);
          expect(a.percentileLow).toBeGreaterThanOrEqual(anchors[i - 1].percentileLow);
          expect(a.percentileHigh).toBeGreaterThanOrEqual(anchors[i - 1].percentileHigh);
        }
      });
    }
  });

  it("cutoff rows reference known institutes, have unique ids and positive closing ranks", () => {
    for (const table of data.cutoffTables) {
      expect(table.status).toBe("placeholder");
      expect(table.source).toMatch(/^Sample data — not official/);
      const institutes = new Set(table.institutes.map((i) => i.id));
      const ids = table.rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const row of table.rows) {
        expect(institutes.has(row.instituteId), row.id).toBe(true);
        expect(row.closingRank).toBeGreaterThan(0);
        if (row.openingRank !== undefined) expect(row.openingRank).toBeLessThanOrEqual(row.closingRank);
      }
    }
  });

  it("include the Himachal institutes named in the brief (names only)", () => {
    const names = data.cutoffTables.flatMap((t) => t.institutes.map((i) => i.name));
    for (const name of ["NIT Hamirpur", "IIIT Una", "AIIMS Bilaspur", "IGMC Shimla", "Dr. RPGMC Tanda"]) {
      expect(names).toContain(name);
    }
  });
});

describe("rank band", () => {
  it("is a band (high > low), never one exact rank, for every exam and edge score", () => {
    for (const exam of PREDICTOR_EXAMS) {
      const table = scoreTableFor(exam, data)!;
      for (const value of [table.minScore, 0, Math.round(table.maxScore / 2), table.maxScore]) {
        const result = band({ exam, value });
        expect(result.crl.low).toBeGreaterThanOrEqual(1);
        expect(result.crl.high).toBeGreaterThan(result.crl.low);
      }
    }
  });

  it("is monotone: a higher score never gives a worse band (CRL, category, PwD)", () => {
    for (const exam of PREDICTOR_EXAMS) {
      const table = scoreTableFor(exam, data)!;
      for (const category of ["GEN", "OBC-NCL", "SC"] as const) {
        let previous: RankBandPrediction | null = null;
        for (let value = table.minScore; value <= table.maxScore; value += 1) {
          const current = band({ exam, value, category, pwd: true });
          if (previous) {
            expect(current.crl.low, `${exam} ${value}`).toBeLessThanOrEqual(previous.crl.low);
            expect(current.crl.high, `${exam} ${value}`).toBeLessThanOrEqual(previous.crl.high);
            if (current.categoryRank && previous.categoryRank) {
              expect(current.categoryRank.high).toBeLessThanOrEqual(previous.categoryRank.high);
            }
            if (current.pwdRank && previous.pwdRank) expect(current.pwdRank.high).toBeLessThanOrEqual(previous.pwdRank.high);
          }
          previous = current;
        }
      }
    }
  });

  it("is monotone in percentile mode too", () => {
    let previous: RankBandPrediction | null = null;
    for (let p = 0; p <= 100; p += 0.25) {
      const current = band({ exam: "jee-main", mode: "percentile", value: p });
      if (previous) expect(current.crl.high).toBeLessThanOrEqual(previous.crl.high);
      previous = current;
    }
    expect(band({ exam: "jee-main", mode: "percentile", value: 100 }).crl.low).toBe(1);
  });

  it("adds category and PwD ranks only where they apply; BOH ignores them", () => {
    const gen = band({ exam: "jee-main", value: 150, category: "GEN" });
    expect(gen.categoryRank).toBeUndefined();
    expect(gen.pwdRank).toBeUndefined();
    const obc = band({ exam: "jee-main", value: 150, category: "OBC-NCL", pwd: true });
    expect(obc.categoryRank!.high).toBeLessThan(obc.crl.high);
    expect(obc.pwdRank).toBeDefined();
    expect(obc.categoryPwdRank).toBeDefined();
    const boh = band({ exam: "boh", value: 80, category: "SC", pwd: true, gender: "female" });
    expect(boh.input.category).toBe("GEN");
    expect(boh.input.pwd).toBe(false);
    expect(boh.input.gender).toBe("other");
    expect(boh.categoryRank).toBeUndefined();
  });

  it("validates input with zod and the exam's range", () => {
    const issue = (input: unknown) => {
      const result = predictRankBand(input as PredictorInputLike, data);
      return result.status === "invalid" ? result.issues : null;
    };
    expect(issue({ exam: "jee-main", value: 301 })).toEqual([{ field: "value", code: "out_of_range", min: -75, max: 300 }]);
    expect(issue({ exam: "jee-main", value: -76 })?.[0].code).toBe("out_of_range");
    expect(issue({ exam: "jee-main", mode: "percentile", value: 100.1 })?.[0].code).toBe("out_of_range");
    expect(issue({ exam: "jee-main", value: Number.NaN })?.[0].field).toBe("value");
    expect(issue({ exam: "jee-main", value: Number.POSITIVE_INFINITY })?.[0].field).toBe("value");
    expect(issue({ exam: "jee-main", value: "180" })?.[0]).toEqual({ field: "value", code: "invalid" });
    expect(issue({ exam: "jee-advanced", value: 180 })?.[0]).toEqual({ field: "exam", code: "invalid" });
    expect(issue({ exam: "jee-main", value: 180, category: "XYZ" })?.[0].field).toBe("category");
    expect(issue({ exam: "boh", mode: "percentile", value: 90 })).toEqual([{ field: "mode", code: "unsupported" }]);
    expect(issue(null)?.length).toBeGreaterThan(0);
    // Defaults fill the optional fields.
    expect(predictorInputSchema.parse({ exam: "neet-ug", value: 600 })).toEqual({
      exam: "neet-ug",
      mode: "score",
      value: 600,
      category: "GEN",
      pwd: false,
      homeState: "HP",
      gender: "other",
    });
  });

  it("rounds outward to two significant figures and never collapses to one number", () => {
    expect(roundRankBand({ low: 2734, high: 5987 })).toEqual({ low: 2700, high: 6000 });
    expect(roundRankBand({ low: 1, high: 1 })).toEqual({ low: 1, high: 2 });
    expect(roundRankBand({ low: 42, high: 42 })).toEqual({ low: 40, high: 45 });
    expect(roundRankBand({ low: 9000, high: 10_000 })).toEqual({ low: 9000, high: 10_000 });
    expect(rankFromPercentile(100, 1_000_000)).toBe(1);
    expect(rankFromPercentile(99, 1_000_000)).toBe(10_000);
    expect(rankFromPercentile(0, 1_000)).toBe(1_000);
  });
});

describe("college matching", () => {
  it("is monotone: more marks never lose an option or worsen its tag", () => {
    const profiles: PredictorInputLike[] = [
      { exam: "jee-main", value: 0, category: "GEN", homeState: "HP" },
      { exam: "jee-main", value: 0, category: "OBC-NCL", homeState: "OTHER", gender: "female" },
      { exam: "jee-main", value: 0, category: "SC", homeState: "HP", pwd: true },
      { exam: "neet-ug", value: 0, category: "GEN", homeState: "HP" },
      { exam: "neet-ug", value: 0, category: "ST", homeState: "OTHER" },
      { exam: "boh", value: 0 },
    ];
    for (const profile of profiles) {
      const table = scoreTableFor(profile.exam, data)!;
      let previous: Map<string, number> | null = null;
      for (let value = table.minScore; value <= table.maxScore; value += 2) {
        const current = new Map(match({ ...profile, value }).options.map((o) => [key(o), tagIndex(o)]));
        if (previous) {
          for (const [k, tag] of previous) {
            expect(current.has(k), `${profile.exam} ${value} lost ${k}`).toBe(true);
            expect(current.get(k)!, `${profile.exam} ${value} ${k}`).toBeLessThanOrEqual(tag);
          }
        }
        previous = current;
      }
    }
  });

  it("tags likely / borderline / reach from the band and the closing rank", () => {
    expect(tagForBand({ low: 100, high: 200 }, 200, 1.25)).toBe("likely");
    expect(tagForBand({ low: 100, high: 201 }, 200, 1.25)).toBe("borderline");
    expect(tagForBand({ low: 201, high: 300 }, 200, 1.25)).toBe("reach");
    expect(tagForBand({ low: 251, high: 300 }, 200, 1.25)).toBeNull();
  });

  it("lists options likely → borderline → reach, one per institute + program", () => {
    const result = match({ exam: "jee-main", value: 140, category: "OBC-NCL" });
    const order = result.options.map(tagIndex);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const keys = result.options.map(key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.cutoffs).toMatchObject({ counselling: "JoSAA", sample: true });
  });

  it("GEN candidates only get OPEN seats; reserved categories also get their own", () => {
    for (const value of [60, 100, 140, 200]) {
      const gen = match({ exam: "jee-main", value, category: "GEN" });
      expect(gen.options.every((o) => o.seatCategory === "OPEN")).toBe(true);
      const sc = match({ exam: "jee-main", value, category: "SC" });
      expect(sc.options.every((o) => o.seatCategory === "OPEN" || o.seatCategory === "SC")).toBe(true);
      expect(sc.options.length).toBeGreaterThanOrEqual(gen.options.length);
    }
    const sc = match({ exam: "jee-main", value: 100, category: "SC" });
    expect(sc.options.some((o) => o.seatCategory === "SC" && o.rankType === "category")).toBe(true);
  });

  it("applies the Himachal home-state quota: HS for HP domicile at HP institutes, OS otherwise", () => {
    const hp = match({ exam: "jee-main", value: 150, homeState: "HP" });
    const other = match({ exam: "jee-main", value: 150, homeState: "OTHER" });
    const nitH = (r: CollegeMatchPrediction) => r.options.filter((o) => o.institute.id === "nit-hamirpur");
    expect(nitH(hp).length).toBeGreaterThan(0);
    expect(nitH(hp).every((o) => o.quota === "HS")).toBe(true);
    expect(nitH(other).every((o) => o.quota === "OS")).toBe(true);
    // Non-HP institutes: everyone is an other-state candidate.
    expect(hp.options.filter((o) => o.institute.state === "OTHER").every((o) => o.quota === "OS")).toBe(true);
    // NEET: the HP 85 % state quota only for HP domicile.
    const neetHp = match({ exam: "neet-ug", value: 600, homeState: "HP" });
    const neetOther = match({ exam: "neet-ug", value: 600, homeState: "OTHER" });
    expect(neetHp.options.some((o) => o.quota === "HS")).toBe(true);
    expect(neetOther.options.some((o) => o.quota === "HS")).toBe(false);
    expect(neetHp.options.length).toBeGreaterThan(neetOther.options.length);
  });

  it("female-only pool only for female candidates; PwD seats only with PwD", () => {
    const female = match({ exam: "jee-main", value: 120, gender: "female" });
    const male = match({ exam: "jee-main", value: 120, gender: "male" });
    expect(female.options.some((o) => o.pool === "female")).toBe(true);
    expect(male.options.some((o) => o.pool === "female")).toBe(false);
    expect(female.options.length).toBeGreaterThanOrEqual(male.options.length);
    const pwd = match({ exam: "jee-main", value: 60, pwd: true });
    const noPwd = match({ exam: "jee-main", value: 60, pwd: false });
    expect(pwd.options.some((o) => o.pwd)).toBe(true);
    expect(noPwd.options.some((o) => o.pwd)).toBe(false);
  });

  it("NEET compares every row with the AIR (MCC basis)", () => {
    const result = match({ exam: "neet-ug", value: 450, category: "SC", homeState: "HP" });
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options.every((o) => o.rankType === "crl")).toBe(true);
  });

  it("returns the band with no options when a cutoff table is missing", () => {
    const partial = { scoreTables: data.scoreTables, cutoffTables: [] };
    const result = matchColleges({ exam: "jee-main", value: 150 }, partial);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.cutoffs).toBeNull();
      expect(result.options).toEqual([]);
    }
  });

  it("what-if: extra marks are clamped to the paper and never make things worse", () => {
    const base = band({ exam: "jee-main", value: 290 });
    const table = scoreTableFor("jee-main", data)!;
    expect(withExtraMarks(base.input, 20, table).value).toBe(300);
    expect(withExtraMarks(base.input, -400, table).value).toBe(-75);
    const percentile = band({ exam: "jee-main", mode: "percentile", value: 95 });
    expect(withExtraMarks(percentile.input, 20, table)).toBe(percentile.input);
    const before = match({ exam: "jee-main", value: 120 });
    const after = match(withExtraMarks(before.band.input, 20, table));
    expect(after.band.crl.high).toBeLessThanOrEqual(before.band.crl.high);
  });
});

describe("visibility (D-005 / D-032)", () => {
  it("production: sample tables are not loaded → not-loaded, never numbers", () => {
    expect(selectVisibleData(data, false)).toBeNull();
    expect(predictRankBand({ exam: "jee-main", value: 150 }, null)).toEqual({ status: "not-loaded", exam: "jee-main" });
    expect(matchColleges({ exam: "neet-ug", value: 600 }, null)).toEqual({ status: "not-loaded", exam: "neet-ug" });
    expect(predictShareCard({ exam: "boh", mode: "score", from: "80" }, null)).toEqual({ status: "not-loaded", exam: "boh" });
    expect(loadedExams(null)).toEqual([]);
    expect(hasSampleData(null)).toBe(false);
  });

  it("getPredictorData() follows showPlaceholderContent()", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(getPredictorData()).toBeNull();
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const visible = getPredictorData();
    expect(visible && loadedExams(visible)).toEqual(["jee-main", "neet-ug", "boh"]);
    expect(hasSampleData(visible)).toBe(true);
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getPredictorData()).toBeNull();
  });

  it("published tables are always usable; drafts never", () => {
    const published = {
      scoreTables: data.scoreTables.map((t) => ({ ...t, status: "published" as const })),
      cutoffTables: data.cutoffTables.map((t) => ({ ...t, status: "draft" as const })),
    };
    const visible = selectVisibleData(published, false);
    expect(visible?.scoreTables).toHaveLength(3);
    expect(visible?.cutoffTables).toHaveLength(0);
    expect(hasSampleData(visible)).toBe(false);
    expect(cutoffTableFor("jee-main", visible)).toBeUndefined();
  });
});

describe("share card", () => {
  it("buckets the score; the URL data is exam + bucket only", () => {
    const table = scoreTableFor("jee-main", data)!;
    expect(shareBucketFor({ exam: "jee-main", mode: "score", value: 187 }, table)).toEqual({ exam: "jee-main", mode: "score", from: 180 });
    expect(bucketRange({ exam: "jee-main", mode: "score", from: 180 }, table)).toEqual({ low: 180, high: 189 });
    expect(bucketRange({ exam: "jee-main", mode: "score", from: 300 }, table)).toEqual({ low: 300, high: 300 });
    expect(shareBucketFor({ exam: "jee-main", mode: "percentile", value: 98.7 }, table)).toEqual({ exam: "jee-main", mode: "percentile", from: 98 });
  });

  it("covers the whole bucket and lists OPEN, gender-neutral, non-PwD, non-HS options", () => {
    const card = predictShareCard({ exam: "jee-main", mode: "score", from: "180" }, data);
    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    const atLow = band({ exam: "jee-main", value: 180 });
    const atHigh = band({ exam: "jee-main", value: 189 });
    expect(card.crl).toEqual({ low: atHigh.crl.low, high: atLow.crl.high });
    expect(card.options.length).toBeLessThanOrEqual(3);
    for (const o of card.options) {
      expect(o.seatCategory).toBe("OPEN");
      expect(o.pool).toBe("neutral");
      expect(o.pwd).toBe(false);
      expect(o.quota).not.toBe("HS");
    }
    expect(card.sample).toBe(true);
  });

  it("rejects bad buckets", () => {
    for (const raw of [
      { exam: "jee-main", mode: "score", from: "" },
      { exam: "jee-main", mode: "score", from: null },
      { exam: "jee-main", mode: "score", from: "abc" },
      { exam: "jee-main", mode: "score", from: "301" },
      { exam: "jee-main", mode: "percentile", from: "101" },
      { exam: "boh", mode: "percentile", from: "50" },
      { exam: "iit", mode: "score", from: "10" },
    ]) {
      expect(predictShareCard(raw, data).status, JSON.stringify(raw)).toBe("invalid");
    }
  });
});
