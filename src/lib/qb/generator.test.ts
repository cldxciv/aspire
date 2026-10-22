import { describe, expect, it } from "vitest";

import { generatePaper, largestRemainder, previewStats, readiness, type GenerateInput } from "./generator";
import { blueprintTotals, defaultBlueprint } from "./patterns";
import type { QbBlueprint, QbChapterWeights, QbDifficulty, QbFormat, QbLevel, QbPoolItem, QbQuestionType, QbSubject } from "./types";

// Synthetic pools only: ids, chapters and clusters are invented labels, no question text.

let nextN = 1;

function item(partial: Partial<QbPoolItem> & { subject: QbSubject; chapterId: string }): QbPoolItem {
  const n = nextN++;
  const id = partial.id ?? `q${n}`;
  return {
    id,
    n,
    version: 1,
    level: "class_11",
    type: "single",
    format: "standard",
    integer: false,
    difficulty: "medium",
    sourceKind: "aspire",
    sourceYear: null,
    crossExam: false,
    hiOk: true,
    clusterId: id,
    passageId: null,
    passageOrder: null,
    exposures: 0,
    ...partial,
  };
}

interface CellSpec {
  subject: QbSubject;
  chapters: string[];
  type?: QbQuestionType;
  integer?: boolean;
  perDifficulty: number;
  level?: QbLevel;
  extra?: Partial<QbPoolItem>;
}

function cells(spec: CellSpec): QbPoolItem[] {
  const out: QbPoolItem[] = [];
  for (const chapterId of spec.chapters) {
    for (const difficulty of ["easy", "medium", "hard"] as QbDifficulty[]) {
      for (let i = 0; i < spec.perDifficulty; i += 1) {
        out.push(
          item({
            subject: spec.subject,
            chapterId,
            difficulty,
            type: spec.type ?? "single",
            integer: spec.integer ?? false,
            level: spec.level ?? "class_11",
            ...spec.extra,
          }),
        );
      }
    }
  }
  return out;
}

const chaptersOf = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-c${i + 1}`);

function jeeMainPool(options: { singlePer?: number; intPer?: number; decimalPer?: number } = {}): QbPoolItem[] {
  const pool: QbPoolItem[] = [];
  for (const subject of ["maths", "physics", "chemistry"] as const) {
    const chapters = chaptersOf(subject, 5);
    pool.push(...cells({ subject, chapters, perDifficulty: options.singlePer ?? 4 }));
    pool.push(...cells({ subject, chapters, type: "numerical", integer: true, perDifficulty: options.intPer ?? 2 }));
    if (options.decimalPer) pool.push(...cells({ subject, chapters, type: "numerical", integer: false, perDifficulty: options.decimalPer }));
  }
  return pool;
}

function uniformWeights(pool: readonly QbPoolItem[]): QbChapterWeights {
  const weights: QbChapterWeights = {};
  for (const item of pool) {
    const map = (weights[item.subject] ??= {});
    map[item.chapterId] = 1;
  }
  for (const map of Object.values(weights)) {
    const keys = Object.keys(map!);
    for (const k of keys) map![k] = 1 / keys.length;
  }
  return weights;
}

function publishedBlueprint(slot: Parameters<typeof defaultBlueprint>[0], patch: Partial<QbBlueprint> = {}): QbBlueprint {
  return { ...defaultBlueprint(slot), status: "published", ...patch };
}

function input(blueprint: QbBlueprint, pool: QbPoolItem[], patch: Partial<GenerateInput> = {}): GenerateInput {
  return {
    blueprint,
    pool,
    weights: uniformWeights(pool),
    formatTargets: {},
    softExclude: new Set(),
    mode: "practice",
    seed: "seed-1",
    ...patch,
  };
}

function itemsOf(result: ReturnType<typeof generatePaper>): QbPoolItem[] {
  if (!result.ok) throw new Error("expected a paper");
  return result.parts.flatMap((p) => p.sections.flatMap((s) => s.items));
}

function sectionItems(result: ReturnType<typeof generatePaper>, sectionId: string): QbPoolItem[] {
  if (!result.ok) throw new Error("expected a paper");
  for (const part of result.parts) for (const s of part.sections) if (s.sectionId === sectionId) return s.items;
  throw new Error(`no section ${sectionId}`);
}

function difficultyTarget(count: number, mix: { easy: number; medium: number; hard: number }) {
  const [easy, medium, hard] = largestRemainder(count, [mix.easy, mix.medium, mix.hard]);
  return { easy, medium, hard };
}

describe("largestRemainder", () => {
  it("apportions exactly, respects caps and redistributes overflow", () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(largestRemainder(10, [5, 3, 2], [2, 10, 10]).reduce((a, b) => a + b, 0)).toBe(10);
    expect(largestRemainder(10, [5, 3, 2], [2, 10, 10])[0]).toBe(2);
    expect(largestRemainder(10, [1, 1], [2, 3])).toEqual([2, 3]);
    expect(largestRemainder(3, [0, 0, 0])).toEqual([1, 1, 1]);
  });
});

describe("generatePaper: JEE Main", () => {
  const blueprint = publishedBlueprint("jee-main");
  const pool = jeeMainPool();

  it("gives the identical paper for the same seed and pool, and a different one for another seed", () => {
    const a = generatePaper(input(blueprint, pool));
    const b = generatePaper(input(blueprint, pool));
    const c = generatePaper(input(blueprint, pool, { seed: "seed-2" }));
    expect(itemsOf(a).map((i) => i.id)).toEqual(itemsOf(b).map((i) => i.id));
    expect(itemsOf(c).map((i) => i.id)).not.toEqual(itemsOf(a).map((i) => i.id));
  });

  it("fills every section exactly when supply suffices (75 questions, 300 marks, 180 minutes)", () => {
    const result = generatePaper(input(blueprint, pool));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.short).toBe(false);
    for (const part of blueprint.parts) {
      for (const section of part.sections) expect(sectionItems(result, section.id)).toHaveLength(section.count);
    }
    expect(result.composition.total).toBe(75);
    expect(result.composition.full).toBe(75);
    expect(result.parts[0].maxScore).toBe(300);
    expect(result.parts[0].durationMinutes).toBe(180);
    expect(result.composition.relaxed).toEqual([]);
  });

  it("keeps each section's difficulty within ±1 of the mix target", () => {
    for (const seed of ["s1", "s2", "s3", "s4"]) {
      const result = generatePaper(input(blueprint, pool, { seed }));
      for (const section of blueprint.parts[0].sections) {
        const items = sectionItems(result, section.id);
        const target = difficultyTarget(section.count, blueprint.difficultyMix);
        for (const d of ["easy", "medium", "hard"] as const) {
          expect(Math.abs(items.filter((i) => i.difficulty === d).length - target[d])).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("keeps chapter counts per subject within ±1 of the weighted quota", () => {
    const weights: QbChapterWeights = {};
    for (const subject of ["maths", "physics", "chemistry"] as const) {
      const c = chaptersOf(subject, 5);
      weights[subject] = { [c[0]]: 0.4, [c[1]]: 0.3, [c[2]]: 0.15, [c[3]]: 0.1, [c[4]]: 0.05 };
    }
    const bigPool = jeeMainPool({ singlePer: 6, intPer: 3 });
    for (const seed of ["w1", "w2", "w3"]) {
      const items = itemsOf(generatePaper(input(blueprint, bigPool, { weights, seed })));
      for (const subject of ["maths", "physics", "chemistry"] as const) {
        for (const [chapter, w] of Object.entries(weights[subject]!)) {
          const count = items.filter((i) => i.chapterId === chapter).length;
          expect(Math.abs(count - 25 * w)).toBeLessThanOrEqual(1.5);
        }
      }
    }
  });

  it("never repeats a question or a cluster", () => {
    // Pairs of variants share a cluster.
    const variantPool = jeeMainPool().map((q, i) => ({ ...q, clusterId: `cl-${Math.floor(i / 2)}` }));
    const items = itemsOf(generatePaper(input(blueprint, variantPool, { seed: "variants" })));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.clusterId)).size).toBe(items.length);
  });

  it("never puts a non-integer numerical into an integer section", () => {
    const mixed = jeeMainPool({ intPer: 2, decimalPer: 4 });
    for (const seed of ["i1", "i2", "i3"]) {
      const result = generatePaper(input(blueprint, mixed, { seed }));
      for (const subject of ["maths", "physics", "chemistry"]) {
        const items = sectionItems(result, `${subject}-b`);
        expect(items).toHaveLength(5);
        expect(items.every((i) => i.type === "numerical" && i.integer)).toBe(true);
      }
    }
  });

  it("respects soft exclusions while supply allows, and records the relaxation when it must use them", () => {
    const excluded = new Set(pool.filter((_, i) => i % 4 === 0).map((q) => q.clusterId));
    const result = generatePaper(input(blueprint, jeeMainPool({ singlePer: 6, intPer: 3 }), { softExclude: excluded, seed: "soft" }));
    expect(itemsOf(result).some((i) => excluded.has(i.clusterId))).toBe(false);
    if (result.ok) expect(result.composition.relaxed).not.toContain("recent_seen");

    // Exclude almost everything: the paper can only be made from recently seen questions.
    const tight = jeeMainPool({ singlePer: 2, intPer: 1 });
    const allButFew = new Map(tight.map((q, i) => [q.clusterId, i] as [string, number]));
    const relaxed = generatePaper(input(blueprint, tight, { softExclude: allButFew, seed: "soft2" }));
    expect(relaxed.ok).toBe(true);
    if (relaxed.ok) {
      expect(itemsOf(relaxed).some((i) => allButFew.has(i.clusterId))).toBe(true);
      expect(relaxed.composition.relaxed).toContain("recent_seen");
    }
  });

  it("fills scarce sections first without inflating other chapters", () => {
    // Integer numericals only in chapters c1 and c2; single MCQs everywhere; uniform weights.
    const scarce: QbPoolItem[] = [];
    for (const subject of ["maths", "physics", "chemistry"] as const) {
      const chapters = chaptersOf(subject, 5);
      scarce.push(...cells({ subject, chapters, perDifficulty: 5 }));
      scarce.push(...cells({ subject, chapters: chapters.slice(0, 2), type: "numerical", integer: true, perDifficulty: 3 }));
    }
    const weights = uniformWeights(scarce);
    for (const seed of ["sc1", "sc2", "sc3"]) {
      const items = itemsOf(generatePaper(input(blueprint, scarce, { weights, seed })));
      for (const subject of ["maths", "physics", "chemistry"] as const) {
        for (const chapter of chaptersOf(subject, 5)) {
          const count = items.filter((i) => i.chapterId === chapter).length;
          expect(count).toBeGreaterThanOrEqual(4);
          expect(count).toBeLessThanOrEqual(6);
        }
        expect(items.filter((i) => i.subject === subject && i.type === "numerical")).toHaveLength(5);
      }
    }
  });

  it("uses only questions with official or staff Hindi in Hindi mode", () => {
    const halfHindi = jeeMainPool({ singlePer: 8, intPer: 4 }).map((q, i) => ({ ...q, hiOk: i % 2 === 0 }));
    const result = generatePaper(input(blueprint, halfHindi, { language: "hi", seed: "hindi" }));
    expect(result.ok).toBe(true);
    expect(itemsOf(result).every((i) => i.hiOk)).toBe(true);
    if (result.ok) expect(result.composition.language).toBe("hi");
  });

  it("holds the crossExamMaxShare and officialMaxShare caps", () => {
    const capped = publishedBlueprint("jee-main", {
      crossExamMaxShare: 0.2,
      sourcePolicy: { official: true, aspire: true, sample: "never", officialMaxShare: 0.5 },
    });
    const many = jeeMainPool({ singlePer: 8, intPer: 4 }).map((q, i) => ({
      ...q,
      crossExam: i % 2 === 0,
      sourceKind: i % 3 === 0 ? ("aspire" as const) : ("official" as const),
      sourceYear: i % 3 === 0 ? null : 2024 + (i % 3),
    }));
    for (const seed of ["cap1", "cap2", "cap3"]) {
      const result = generatePaper(input(capped, many, { seed }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.composition.crossExam).toBeLessThanOrEqual(15);
      expect(result.composition.bySource.official).toBeLessThanOrEqual(37);
      expect(result.composition.relaxed).not.toContain("source_mix");
    }
  });

  it("excludes samples unless the blueprint allows them and placeholder mode is on", () => {
    const samples = jeeMainPool().map((q) => ({ ...q, sourceKind: "sample" as const }));
    expect(generatePaper(input(blueprint, samples, { placeholderMode: false })).ok).toBe(false);
    const result = generatePaper(input(blueprint, samples, { placeholderMode: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.composition.bySource.sample).toBe(75);
  });
});

describe("generatePaper: shortening and thin banks", () => {
  const blueprint = publishedBlueprint("jee-main");

  it("shortens every section by the same ratio, with the time, when one section is short", () => {
    // Physics integer numericals: only 3 of the 5 needed.
    const pool = jeeMainPool({ singlePer: 6, intPer: 2 }).filter(
      (q) => !(q.subject === "physics" && q.type === "numerical") ,
    );
    pool.push(...cells({ subject: "physics", chapters: ["physics-c1"], type: "numerical", integer: true, perDifficulty: 1 }));
    const result = generatePaper(input(blueprint, pool, { seed: "short" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.short).toBe(true);
    expect(result.composition.relaxed).toContain("shortened");
    const r = 3 / 5;
    for (const section of blueprint.parts[0].sections) {
      expect(sectionItems(result, section.id)).toHaveLength(Math.max(1, Math.floor(section.count * r)));
    }
    expect(result.parts[0].durationMinutes).toBe(Math.round((180 * r) / 5) * 5);
    expect(result.composition.shortfall).toContainEqual({ sectionId: "physics-b", needed: 5, served: 3 });
    expect(result.composition.ratio).toBeCloseTo(result.composition.total / 75);
  });

  it("returns thin below minShortRatio", () => {
    const pool = jeeMainPool({ singlePer: 6, intPer: 2 }).filter((q) => !(q.subject === "physics" && q.type === "numerical"));
    pool.push(item({ subject: "physics", chapterId: "physics-c1", type: "numerical", integer: true }));
    const result = generatePaper(input(blueprint, pool, { seed: "thin" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("thin");
      expect(result.readiness.level).toBe("thin");
    }
  });
});

describe("generatePaper: ranked templates", () => {
  const blueprint = publishedBlueprint("jee-main");

  it("refuses every relaxation except difficulty_borrowed", () => {
    // A paper that needs recently seen questions: thin for a ranked template.
    const tight = jeeMainPool({ singlePer: 2, intPer: 1 });
    const soft = new Set(tight.map((q) => q.clusterId));
    expect(generatePaper(input(blueprint, tight, { softExclude: soft, mode: "ranked_template" })).ok).toBe(false);

    // A paper that needs shortening: thin.
    const short = jeeMainPool().filter((q) => !(q.subject === "physics" && q.type === "numerical"));
    expect(generatePaper(input(blueprint, short, { mode: "ranked_template" })).ok).toBe(false);

    // Only medium questions: the difficulty mix must be borrowed, which ranked templates allow.
    const mediumOnly = jeeMainPool({ singlePer: 6, intPer: 3 }).map((q) => ({ ...q, difficulty: "medium" as const }));
    const result = generatePaper(input(blueprint, mediumOnly, { mode: "ranked_template" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.composition.relaxed).toEqual(["difficulty_borrowed"]);
  });
});

describe("generatePaper: JEE Advanced pair", () => {
  const blueprint = publishedBlueprint("jee-adv");

  function advPool(): QbPoolItem[] {
    const pool: QbPoolItem[] = [];
    for (const subject of ["physics", "chemistry", "maths"] as const) {
      const chapters = chaptersOf(`${subject}-adv`, 4);
      pool.push(...cells({ subject, chapters, perDifficulty: 4 }));
      pool.push(...cells({ subject, chapters, perDifficulty: 2, extra: { format: "match_list" as QbFormat } }));
      pool.push(...cells({ subject, chapters, type: "multiple", perDifficulty: 3 }));
      pool.push(...cells({ subject, chapters, type: "numerical", integer: false, perDifficulty: 3 }));
      // Passages of three numerical questions each.
      for (let p = 0; p < 6; p += 1) {
        const passageId = `${subject}-passage-${p}`;
        for (let k = 1; k <= 3; k += 1) {
          pool.push(
            item({
              subject,
              chapterId: chapters[p % chapters.length],
              type: "numerical",
              format: "passage",
              passageId,
              passageOrder: k,
              difficulty: (["easy", "medium", "hard"] as const)[(p + k) % 3],
            }),
          );
        }
      }
    }
    return pool;
  }

  it("makes both papers (48 and 54 questions, 180 marks each) with no cluster in both", () => {
    const pool = advPool();
    const result = generatePaper(input(blueprint, pool, { seed: "adv" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const totals = blueprintTotals(blueprint);
    expect(result.parts.map((p) => p.sections.reduce((s, x) => s + x.items.length, 0))).toEqual(totals.parts.map((p) => p.questions));
    expect(result.parts.map((p) => p.maxScore)).toEqual([180, 180]);
    const items = itemsOf(result);
    expect(new Set(items.map((i) => i.clusterId)).size).toBe(items.length);
    const p1 = new Set(result.parts[0].sections.flatMap((s) => s.items.map((i) => i.clusterId)));
    expect(result.parts[1].sections.flatMap((s) => s.items).some((i) => p1.has(i.clusterId))).toBe(false);
  });

  it("keeps passage units intact and in order, including 2 of a 3-question passage", () => {
    const result = generatePaper(input(blueprint, advPool(), { seed: "passages" }));
    for (const subject of ["phy", "chem", "math"]) {
      const items = sectionItems(result, `p2-${subject}-s4`);
      expect(items).toHaveLength(4);
      for (let i = 0; i < items.length; i += 2) {
        expect(items[i].passageId).not.toBeNull();
        expect(items[i].passageId).toBe(items[i + 1].passageId);
        expect(items[i].passageOrder!).toBeLessThan(items[i + 1].passageOrder!);
      }
      expect(new Set(items.map((i) => i.passageId)).size).toBe(2);
    }
  });

  it("readiness agrees with generation when match-list or passage supply is scarce (no shared-supply overcount)", () => {
    const withMatchList = (perSubject: number) => {
      const pool = advPool().filter((q) => q.format !== "match_list");
      for (const subject of ["physics", "chemistry", "maths"] as const) {
        for (let k = 0; k < perSubject; k += 1) {
          pool.push(item({ subject, chapterId: `${subject}-adv-c${(k % 4) + 1}`, format: "match_list", difficulty: (["easy", "medium", "hard"] as const)[k % 3] }));
        }
      }
      return pool;
    };
    const withPassages = (perSubject: number) =>
      advPool().filter((q) => q.format !== "passage" || Number(q.passageId!.split("-passage-")[1]) < perSubject);
    const scenarios: [string, QbPoolItem[]][] = [
      ["no match-list", withMatchList(0)],
      ["1 match-list", withMatchList(1)],
      ["2 match-list", withMatchList(2)],
      ["4 match-list", withMatchList(4)],
      ["10 single + 1 match-list", withMatchList(1).filter((q) => !(q.type === "single" && q.format === "standard") || Number(q.id.slice(1)) % 5 === 0)],
      ["no passages", withPassages(0)],
      ["1 passage", withPassages(1)],
      ["2 passages", withPassages(2)],
    ];
    for (const [name, pool] of scenarios) {
      const ready = readiness({ blueprint, pool, weights: uniformWeights(pool), formatTargets: {} });
      const result = generatePaper(input(blueprint, pool, { seed: `scarce-${name}` }));
      expect({ name, thin: ready.level === "thin" }).toEqual({ name, thin: !result.ok });
      if (result.ok) expect({ name, short: result.short }).toEqual({ name, short: ready.level === "short" });
    }
    // With no match-list questions the match-list sections can serve nothing.
    const none = readiness({ blueprint, pool: withMatchList(0), weights: {}, formatTargets: {} });
    expect(none.level).toBe("thin");
    for (const subject of ["phy", "chem", "math"]) expect(none.sections.find((s) => s.sectionId === `p1-${subject}-s4`)?.servable).toBe(0);
    const two = readiness({ blueprint, pool: withMatchList(2), weights: {}, formatTargets: {} });
    expect(two.level).toBe("short");
    expect(two.sections.find((s) => s.sectionId === "p1-phy-s4")?.servable).toBe(2);
  });

  it("puts only match-list questions in the match-list sections and none in passage-free sections", () => {
    const result = generatePaper(input(blueprint, advPool(), { seed: "formats" }));
    for (const subject of ["phy", "chem", "math"]) {
      expect(sectionItems(result, `p1-${subject}-s4`).every((i) => i.format === "match_list")).toBe(true);
      expect(sectionItems(result, `p1-${subject}-s2`).every((i) => i.type === "multiple")).toBe(true);
      expect(sectionItems(result, `p1-${subject}-s3`).every((i) => i.type === "numerical" && i.format !== "passage")).toBe(true);
    }
  });
});

describe("generatePaper: chapter levels (BOH)", () => {
  it("never gives a BOH paper class 11/12 chapters", () => {
    const blueprint = publishedBlueprint("boh-class-10", { placeholder: false, patternConfirmedBy: "admin" });
    const pool: QbPoolItem[] = [];
    for (const subject of ["physics", "chemistry", "maths", "mental_ability"] as const) {
      pool.push(...cells({ subject, chapters: chaptersOf(`${subject}-10`, 4), perDifficulty: 4, level: "class_9_10" }));
      pool.push(...cells({ subject, chapters: chaptersOf(`${subject}-11`, 4), perDifficulty: 4, level: "class_11" }));
      pool.push(...cells({ subject, chapters: chaptersOf(`${subject}-12`, 2), perDifficulty: 4, level: "class_12" }));
    }
    const result = generatePaper(input(blueprint, pool, { seed: "boh" }));
    expect(result.ok).toBe(true);
    expect(itemsOf(result).every((i) => i.level === "class_9_10" || i.level === "general")).toBe(true);
    expect(itemsOf(result)).toHaveLength(100);
  });
});

describe("readiness and previewStats", () => {
  const blueprint = publishedBlueprint("jee-main");

  it("reports full, short and thin from supply, per language", () => {
    const full = readiness({ blueprint, pool: jeeMainPool(), weights: {}, formatTargets: {} });
    expect(full.level).toBe("full");
    expect(full.full).toBe(75);
    expect(full.servable).toBe(75);
    expect(full.variety).toBeGreaterThanOrEqual(1);

    const noHindi = jeeMainPool().map((q) => ({ ...q, hiOk: false }));
    const r = readiness({ blueprint, pool: noHindi, weights: {}, formatTargets: {} });
    expect(r.byLanguage).toEqual({ en: "full", hi: "thin" });

    const short = jeeMainPool().filter((q) => !(q.subject === "physics" && q.type === "numerical"));
    short.push(...cells({ subject: "physics", chapters: ["physics-c1"], type: "numerical", integer: true, perDifficulty: 1 }));
    const s = readiness({ blueprint, pool: short, weights: {}, formatTargets: {} });
    expect(s.level).toBe("short");
    expect(s.sections.find((x) => x.sectionId === "physics-b")).toMatchObject({ needed: 5, servable: 3 });
    expect(readiness({ blueprint, pool: [], weights: {}, formatTargets: {} }).level).toBe("thin");
  });

  it("summarises 100 seeds for the admin preview", async () => {
    const pool = jeeMainPool();
    const stats = await previewStats(input(blueprint, pool), 20);
    expect(stats.papers).toBe(20);
    expect(stats.thinRate).toBe(0);
    expect(stats.difficulty.medium.avg).toBeGreaterThan(0);
    expect(Object.keys(stats.chapters).length).toBe(15);
    expect(stats.mostUsed.length).toBeGreaterThan(0);
    expect(stats.mostUsed[0].share).toBeLessThanOrEqual(1);
  });
});
