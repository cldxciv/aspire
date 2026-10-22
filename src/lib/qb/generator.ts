import { blueprintTotals } from "./patterns";
import { createRng, type Rng } from "./rng";
import type {
  QbBlueprint,
  QbBlueprintSection,
  QbChapterWeights,
  QbDifficulty,
  QbFormat,
  QbFormatTargets,
  QbPaperComposition,
  QbPoolItem,
  QbReadiness,
  QbReadinessLevel,
  QbRelaxation,
  QbSourceKind,
  QbSubject,
} from "./types";
import { QB_DIFFICULTIES } from "./types";

/**
 * Paper generator (owner: QB-CORE-A; docs/question-bank-plan.md §B9.3). Pure: no database, no clock,
 * no Math.random — the same seed and pool always give the same paper.
 *
 * 1. Units: questions, or passage units of `passageGroupSize` questions from one passage, kept in
 *    passage order (2 of a 3-question passage may be chosen). A passage unit's difficulty is the
 *    rounded mean (easy 1, medium 2, hard 3; halves round up).
 * 2. Subject quotas first: chapter quotas over each subject's total across all parts (JEE Main 25, the
 *    JEE Advanced pair 34) by largest remainder from the chapter weights, capped by supply, overflow
 *    redistributed by weight.
 * 3. Sections by scarcity: format-bound sections first, then the scarcest (supply ÷ count), so scarce
 *    numerical / match-list / passage / multiple supply never distorts chapter counts; the plain MCQ
 *    sections take the rest. Chapters whose remaining quota cannot be met by later sections get
 *    their units first.
 * 4. Difficulty targets per section (count × mix, largest remainder), split across the section's
 *    chapters in proportion to the remaining deficits, capped by availability, then a bounded repair
 *    loop.
 * 5. Picking within a (chapter, difficulty) cell: weighted sampling without replacement (weight
 *    1 / (1 + exposures / 50)), never a used cluster or passage, never a soft-excluded (recently seen)
 *    cluster unless that relaxation is on, preferring formats with a deficit; the officialMaxShare and
 *    crossExamMaxShare caps are hard unless `source_mix` is relaxed.
 * 6. Relaxation (practice only), each pass recorded: recent_seen → difficulty_borrowed → chapter_quota
 *    (zero-weight chapters) → source_mix. Ranked templates allow only difficulty_borrowed.
 * 7. Shortening: r = min over sections of served ÷ count; every section becomes max(1, ⌊count × r⌋)
 *    (whole passage units); below `minShortRatio` the result is `thin`. Time round5(full × r), ≥ 10.
 * 8. Order: parts and sections in blueprint order, shuffled within a section (seeded), passage units
 *    kept together. Options are never shuffled.
 * 9. The JEE Advanced pair is allocated together (one call): no cluster appears in both papers.
 */

export interface GenerateInput {
  blueprint: QbBlueprint;
  pool: readonly QbPoolItem[];
  weights: QbChapterWeights;
  formatTargets: QbFormatTargets;
  /** Clusters the student saw recently. A Map may carry when each was seen (oldest relaxed first). */
  softExclude: ReadonlySet<string> | ReadonlyMap<string, number>;
  mode: "practice" | "ranked_template";
  seed: string;
  /** Hindi mode uses only `hiOk` items. Default "en". */
  language?: "en" | "hi";
  /** Sample questions are eligible only when the blueprint allows them AND placeholder content is on. */
  placeholderMode?: boolean;
}

export interface GeneratedSection {
  sectionId: string;
  items: QbPoolItem[];
}

export interface GeneratedPart {
  partId: string;
  sections: GeneratedSection[];
  durationMinutes: number;
  maxScore: number;
}

export type GenerateResult =
  | { ok: true; parts: GeneratedPart[]; composition: QbPaperComposition; short: boolean }
  | { ok: false; reason: "thin"; readiness: QbReadiness };

const DIFFICULTY_VALUE: Record<QbDifficulty, number> = { easy: 1, medium: 2, hard: 3 };
const VALUE_DIFFICULTY: QbDifficulty[] = ["easy", "easy", "medium", "hard"];
const BORROW_ORDER: Record<QbDifficulty, QbDifficulty[]> = {
  easy: ["medium", "hard"],
  hard: ["medium", "easy"],
  medium: ["easy", "hard"],
};
const MAX_PASSAGE_COMBINATION_SOURCE = 6;

// ---------------------------------------------------------------------------------------------
// Eligibility

export function blueprintSubjectsOf(blueprint: Pick<QbBlueprint, "parts">): Set<QbSubject> {
  const subjects = new Set<QbSubject>();
  for (const part of blueprint.parts) for (const section of part.sections) subjects.add(section.subject);
  return subjects;
}

/** Whether a pool item may appear in any paper of this blueprint (subject, level, source, language). */
export function eligibleForBlueprint(
  item: QbPoolItem,
  blueprint: Pick<QbBlueprint, "parts" | "chapterLevels" | "sourcePolicy">,
  options: { language?: "en" | "hi"; placeholderMode?: boolean; subjects?: ReadonlySet<QbSubject> } = {},
): boolean {
  const subjects = options.subjects ?? blueprintSubjectsOf(blueprint);
  const subjectOk =
    subjects.has(item.subject) || (subjects.has("biology") && (item.subject === "botany" || item.subject === "zoology"));
  if (!subjectOk) return false;
  if (!blueprint.chapterLevels.includes(item.level)) return false;
  if (!sourceAllowed(item.sourceKind, blueprint.sourcePolicy, options.placeholderMode === true)) return false;
  if (options.language === "hi" && !item.hiOk) return false;
  return true;
}

export function sourceAllowed(kind: QbSourceKind, policy: QbBlueprint["sourcePolicy"], placeholderMode: boolean): boolean {
  if (kind === "official") return policy.official;
  if (kind === "aspire") return policy.aspire;
  return policy.sample === "placeholder_only" && placeholderMode;
}

/** Whether an item fits a section: type, the integer rule, the required format. */
export function itemFitsSection(item: QbPoolItem, section: QbBlueprintSection): boolean {
  const subjectOk =
    item.subject === section.subject ||
    (section.subject === "biology" && (item.subject === "botany" || item.subject === "zoology"));
  if (!subjectOk) return false;
  if (item.type !== section.type) return false;
  if (section.type === "numerical" && section.answerFormat === "integer" && !item.integer) return false;
  if (section.format) return item.format === section.format;
  return item.format !== "passage";
}

// ---------------------------------------------------------------------------------------------
// Allocation helpers

/**
 * Largest-remainder apportionment of `total` over `weights`, each capped by `caps[i]`, with any overflow
 * redistributed by weight. Ties go to the earlier index (callers pass a seeded order). Returns the
 * allocation; its sum is less than `total` only when the caps run out.
 */
export function largestRemainder(total: number, weights: readonly number[], caps?: readonly number[]): number[] {
  const n = weights.length;
  const result = new Array<number>(n).fill(0);
  const cap = (i: number) => (caps ? Math.max(0, Math.floor(caps[i])) : Number.POSITIVE_INFINITY);
  let remaining = Math.max(0, Math.floor(total));
  for (let round = 0; round < n + 1 && remaining > 0; round += 1) {
    const open = [...Array(n).keys()].filter((i) => result[i] < cap(i));
    if (open.length === 0) break;
    let weightSum = open.reduce((sum, i) => sum + Math.max(0, weights[i]), 0);
    const useUniform = weightSum <= 0;
    if (useUniform) weightSum = open.length;
    const shares = open.map((i) => ({ i, exact: (remaining * (useUniform ? 1 : Math.max(0, weights[i]))) / weightSum }));
    let given = 0;
    for (const share of shares) {
      const room = cap(share.i) - result[share.i];
      const add = Math.min(room, Math.floor(share.exact));
      result[share.i] += add;
      given += add;
    }
    let left = remaining - given;
    const byRemainder = shares
      .filter((share) => result[share.i] < cap(share.i))
      .map((share) => ({ i: share.i, frac: share.exact - Math.floor(share.exact) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const entry of byRemainder) {
      if (left <= 0) break;
      if (result[entry.i] < cap(entry.i)) {
        result[entry.i] += 1;
        left -= 1;
      }
    }
    if (left === remaining) break; // nothing could be placed
    remaining = left;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Units and specs

interface Unit {
  key: string;
  items: QbPoolItem[];
  chapterId: string;
  subject: QbSubject;
  difficulty: QbDifficulty;
  clusters: string[];
  passageId: string | null;
  exposureWeight: number;
  formats: QbFormat[];
  official: number;
  cross: number;
}

interface SectionSpec {
  index: number;
  partIndex: number;
  section: QbBlueprintSection;
  /** Questions in this (possibly shortened) section. */
  count: number;
  fullCount: number;
  groupSize: number;
  units: Unit[];
}

function roundedMeanDifficulty(items: readonly QbPoolItem[]): QbDifficulty {
  const mean = items.reduce((sum, item) => sum + DIFFICULTY_VALUE[item.difficulty], 0) / items.length;
  return VALUE_DIFFICULTY[Math.min(3, Math.max(1, Math.floor(mean + 0.5)))];
}

function makeUnit(items: QbPoolItem[], passageId: string | null): Unit {
  const chapterCounts = new Map<string, number>();
  for (const item of items) chapterCounts.set(item.chapterId, (chapterCounts.get(item.chapterId) ?? 0) + 1);
  let chapterId = items[0].chapterId;
  for (const [chapter, count] of chapterCounts) if (count > (chapterCounts.get(chapterId) ?? 0)) chapterId = chapter;
  const meanExposure = items.reduce((sum, item) => sum + Math.max(0, item.exposures), 0) / items.length;
  return {
    key: items.map((item) => item.id).join("+"),
    items,
    chapterId,
    subject: items[0].subject,
    difficulty: items.length === 1 ? items[0].difficulty : roundedMeanDifficulty(items),
    clusters: items.map((item) => item.clusterId),
    passageId,
    exposureWeight: 1 / (1 + meanExposure / 50),
    formats: items.map((item) => item.format),
    official: items.filter((item) => item.sourceKind === "official").length,
    cross: items.filter((item) => item.crossExam).length,
  };
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length === size) {
      out.push(picked.slice());
      return;
    }
    for (let i = start; i <= items.length - (size - picked.length); i += 1) {
      picked.push(items[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}

function unitsForSection(section: QbBlueprintSection, eligible: readonly QbPoolItem[]): Unit[] {
  const fitting = eligible.filter((item) => itemFitsSection(item, section));
  const groupSize = Math.max(1, section.passageGroupSize ?? 1);
  if (section.format !== "passage" && groupSize === 1) return fitting.map((item) => makeUnit([item], item.passageId));
  const byPassage = new Map<string, QbPoolItem[]>();
  for (const item of fitting) {
    if (!item.passageId) continue;
    const list = byPassage.get(item.passageId) ?? [];
    list.push(item);
    byPassage.set(item.passageId, list);
  }
  const units: Unit[] = [];
  for (const [passageId, list] of byPassage) {
    const ordered = list.slice().sort((a, b) => (a.passageOrder ?? 0) - (b.passageOrder ?? 0) || a.n - b.n);
    if (ordered.length < groupSize) continue;
    const groups =
      ordered.length <= MAX_PASSAGE_COMBINATION_SOURCE
        ? combinations(ordered, groupSize)
        : Array.from({ length: ordered.length - groupSize + 1 }, (_, i) => ordered.slice(i, i + groupSize));
    for (const group of groups) units.push(makeUnit(group, passageId));
  }
  return units;
}

function flattenSpecs(blueprint: QbBlueprint, eligible: readonly QbPoolItem[], scale: number | null): SectionSpec[] {
  const specs: SectionSpec[] = [];
  blueprint.parts.forEach((part, partIndex) => {
    for (const section of part.sections) {
      const groupSize = Math.max(1, section.passageGroupSize ?? 1);
      const fullCount = section.count;
      let count = fullCount;
      if (scale !== null && scale < 1) {
        const units = Math.max(1, Math.floor((fullCount / groupSize) * scale + 1e-9));
        count = units * groupSize;
      }
      specs.push({ index: specs.length, partIndex, section, count, fullCount, groupSize, units: unitsForSection(section, eligible) });
    }
  });
  return specs;
}

// ---------------------------------------------------------------------------------------------
// One allocation pass

interface PassConfig {
  allowRecent: boolean;
  allowDifficultyBorrow: boolean;
  allowZeroWeight: boolean;
  ignoreCaps: boolean;
}

interface PassResult {
  picked: Unit[][];
  shortfall: { index: number; needed: number; served: number }[];
  used: Set<QbRelaxation>;
}

interface PassState {
  usedIds: Set<string>;
  usedClusters: Set<string>;
  usedPassages: Set<string>;
  official: number;
  cross: number;
  /** Questions picked per chapter. */
  chapterPicked: Map<string, number>;
  used: Set<QbRelaxation>;
}

class Allocator {
  private readonly subjects: QbSubject[];
  private readonly quota = new Map<string, number>(); // chapter → question quota (subject level)
  private readonly chapterWeight: (subject: QbSubject, chapter: string) => number;
  private readonly recent: (cluster: string) => number | undefined;
  private readonly officialCap: number;
  private readonly crossCap: number;

  constructor(
    private readonly specs: SectionSpec[],
    private readonly input: GenerateInput,
    private readonly cfg: PassConfig,
    private readonly rng: Rng,
  ) {
    this.subjects = [...new Set(specs.map((s) => s.section.subject))];
    const weights = input.weights;
    this.chapterWeight = (subject, chapter) => {
      const map = weights[subject];
      if (!map) return 1;
      const value = map[chapter];
      if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
      const positive = Object.values(map).filter((v) => v > 0);
      return positive.length > 0 ? Math.min(...positive) / 2 : 1;
    };
    const soft = input.softExclude;
    this.recent =
      soft instanceof Map
        ? (cluster) => (soft as ReadonlyMap<string, number>).get(cluster)
        : (cluster) => ((soft as ReadonlySet<string>).has(cluster) ? 0 : undefined);
    const total = specs.reduce((sum, s) => sum + s.count, 0);
    const policy = input.blueprint.sourcePolicy;
    this.officialCap = policy.officialMaxShare === null ? Number.POSITIVE_INFINITY : Math.floor(policy.officialMaxShare * total + 1e-9);
    this.crossCap = Math.floor(Math.max(0, input.blueprint.crossExamMaxShare) * total + 1e-9);
  }

  private isRecent(unit: Unit): boolean {
    return unit.clusters.some((c) => this.recent(c) !== undefined);
  }

  private recentAge(unit: Unit): number {
    let oldest = Number.POSITIVE_INFINITY;
    for (const c of unit.clusters) {
      const seen = this.recent(c);
      if (seen !== undefined) oldest = Math.min(oldest, seen);
    }
    return oldest;
  }

  private free(unit: Unit, state: PassState): boolean {
    if (unit.passageId && unit.items.length > 1 && state.usedPassages.has(unit.passageId)) return false;
    for (const item of unit.items) if (state.usedIds.has(item.id)) return false;
    for (const cluster of unit.clusters) if (state.usedClusters.has(cluster)) return false;
    if (!this.cfg.allowRecent && this.isRecent(unit)) return false;
    if (!this.cfg.allowZeroWeight && this.chapterWeight(unit.subject, unit.chapterId) <= 0) return false;
    return true;
  }

  private withinCaps(unit: Unit, state: PassState): boolean {
    if (this.cfg.ignoreCaps) return true;
    return state.official + unit.official <= this.officialCap && state.cross + unit.cross <= this.crossCap;
  }

  /** Chapter quotas per subject (questions), capped by supply, overflow by weight. */
  private computeQuotas(state: PassState): void {
    for (const subject of this.subjects) {
      const specs = this.specs.filter((s) => s.section.subject === subject);
      const total = specs.reduce((sum, s) => sum + s.count, 0);
      const supply = new Map<string, Set<string>>(); // chapter → distinct clusters
      for (const spec of specs) {
        for (const unit of spec.units) {
          if (!this.free(unit, state)) continue;
          const set = supply.get(unit.chapterId) ?? new Set<string>();
          for (const cluster of unit.clusters) set.add(cluster);
          supply.set(unit.chapterId, set);
        }
      }
      const chapters = this.rng.shuffle([...supply.keys()].sort());
      const allocation = largestRemainder(
        total,
        chapters.map((c) => this.chapterWeight(subject, c)),
        chapters.map((c) => supply.get(c)?.size ?? 0),
      );
      chapters.forEach((c, i) => this.quota.set(c, allocation[i]));
    }
  }

  private remainingQuota(chapter: string, state: PassState): number {
    return (this.quota.get(chapter) ?? 0) - (state.chapterPicked.get(chapter) ?? 0);
  }

  private sectionOrder(state: PassState): SectionSpec[] {
    const ratio = (spec: SectionSpec) => {
      const clusters = new Set<string>();
      for (const unit of spec.units) if (this.free(unit, state)) unit.clusters.forEach((c) => clusters.add(c));
      return spec.count > 0 ? clusters.size / spec.count : Number.POSITIVE_INFINITY;
    };
    const keyed = this.specs.map((spec) => ({
      spec,
      formatBound: spec.section.format ? 0 : 1,
      plainSingle: spec.section.type === "single" && !spec.section.format ? 1 : 0,
      ratio: ratio(spec),
    }));
    keyed.sort((a, b) => a.formatBound - b.formatBound || a.plainSingle - b.plainSingle || a.ratio - b.ratio || a.spec.index - b.spec.index);
    return keyed.map((k) => k.spec);
  }

  run(): PassResult {
    const state: PassState = {
      usedIds: new Set(),
      usedClusters: new Set(),
      usedPassages: new Set(),
      official: 0,
      cross: 0,
      chapterPicked: new Map(),
      used: new Set(),
    };
    this.computeQuotas(state);
    const picked: Unit[][] = this.specs.map(() => []);
    const shortfall: PassResult["shortfall"] = [];
    const order = this.sectionOrder(state);
    order.forEach((spec, position) => {
      const later = order.slice(position + 1).filter((s) => s.section.subject === spec.section.subject);
      const units = this.fillSection(spec, later, state);
      picked[spec.index] = units;
      const served = units.reduce((sum, u) => sum + u.items.length, 0);
      if (served < spec.count) shortfall.push({ index: spec.index, needed: spec.count, served });
    });
    // chapter_quota: a zero-weight chapter had to be used; source_mix: a share cap was exceeded.
    if (this.cfg.allowZeroWeight) {
      for (const units of picked) {
        for (const unit of units) if (this.chapterWeight(unit.subject, unit.chapterId) <= 0) state.used.add("chapter_quota");
      }
    }
    if (this.cfg.ignoreCaps && (state.official > this.officialCap || state.cross > this.crossCap)) state.used.add("source_mix");
    return { picked, shortfall: shortfall.sort((a, b) => a.index - b.index), used: state.used };
  }

  private availability(spec: SectionSpec, state: PassState): Map<string, Record<QbDifficulty, number>> {
    // Distinct clusters (single units) or passages (passage units) per (chapter, difficulty).
    const seen = new Map<string, Set<string>>();
    const avail = new Map<string, Record<QbDifficulty, number>>();
    for (const unit of spec.units) {
      if (!this.free(unit, state)) continue;
      const cellKey = `${unit.chapterId}|${unit.difficulty}`;
      const identity = unit.passageId && unit.items.length > 1 ? `p:${unit.passageId}` : `c:${unit.clusters[0]}`;
      const set = seen.get(cellKey) ?? new Set<string>();
      if (set.has(identity)) continue;
      set.add(identity);
      seen.set(cellKey, set);
      const row = avail.get(unit.chapterId) ?? { easy: 0, medium: 0, hard: 0 };
      row[unit.difficulty] += 1;
      avail.set(unit.chapterId, row);
    }
    return avail;
  }

  private chapterTargets(
    spec: SectionSpec,
    later: SectionSpec[],
    state: PassState,
    avail: Map<string, Record<QbDifficulty, number>>,
  ): Map<string, number> {
    const g = spec.groupSize;
    const needed = Math.floor(spec.count / g);
    const chapters = this.rng.shuffle([...avail.keys()].sort());
    const availC = chapters.map((c) => {
      const row = avail.get(c)!;
      return row.easy + row.medium + row.hard;
    });
    const remQ = chapters.map((c) => Math.max(0, this.remainingQuota(c, state)));
    const capInQuota = chapters.map((_, i) => Math.min(availC[i], Math.floor(remQ[i] / g)));
    // Need-based first: quota that later sections of the subject cannot absorb.
    const laterByChapter = new Map<string, number>();
    for (const s of later) {
      const clustersByChapter = new Map<string, Set<string>>();
      for (const unit of s.units) {
        if (!this.free(unit, state)) continue;
        const set = clustersByChapter.get(unit.chapterId) ?? new Set<string>();
        unit.clusters.forEach((x) => set.add(x));
        clustersByChapter.set(unit.chapterId, set);
      }
      for (const [chapter, set] of clustersByChapter) laterByChapter.set(chapter, (laterByChapter.get(chapter) ?? 0) + set.size);
    }
    const laterAvail = chapters.map((c) => laterByChapter.get(c) ?? 0);
    const mandatory = chapters.map((_, i) => Math.min(capInQuota[i], Math.max(0, Math.ceil((remQ[i] - laterAvail[i]) / g))));
    let targets = largestRemainder(Math.min(needed, mandatory.reduce((a, b) => a + b, 0)), mandatory, mandatory);
    let left = needed - targets.reduce((a, b) => a + b, 0);
    if (left > 0) {
      const extra = largestRemainder(
        left,
        remQ.map((q, i) => Math.max(0, q - targets[i] * g)),
        capInQuota.map((c, i) => c - targets[i]),
      );
      targets = targets.map((t, i) => t + extra[i]);
      left = needed - targets.reduce((a, b) => a + b, 0);
    }
    if (left > 0) {
      // Overflow beyond quota among weighted chapters (normal: capped by supply, redistributed by weight).
      const extra = largestRemainder(
        left,
        chapters.map((c) => this.chapterWeight(spec.section.subject, c)),
        availC.map((a, i) => a - targets[i]),
      );
      targets = targets.map((t, i) => t + extra[i]);
    }
    const out = new Map<string, number>();
    chapters.forEach((c, i) => {
      if (targets[i] > 0) out.set(c, targets[i]);
    });
    return out;
  }

  private difficultyPlan(
    spec: SectionSpec,
    targets: Map<string, number>,
    avail: Map<string, Record<QbDifficulty, number>>,
  ): { plan: Map<string, Record<QbDifficulty, number>>; deficit: Record<QbDifficulty, number>; target: Record<QbDifficulty, number> } {
    const units = [...targets.values()].reduce((a, b) => a + b, 0);
    const mix = spec.section.difficultyMix ?? this.input.blueprint.difficultyMix;
    const dtList = largestRemainder(units, QB_DIFFICULTIES.map((d) => mix[d]));
    const target: Record<QbDifficulty, number> = { easy: dtList[0], medium: dtList[1], hard: dtList[2] };
    const R: Record<QbDifficulty, number> = { ...target };
    const plan = new Map<string, Record<QbDifficulty, number>>();
    const chapters = [...targets.keys()].sort((a, b) => (targets.get(b) ?? 0) - (targets.get(a) ?? 0));
    for (const c of chapters) {
      const t = targets.get(c) ?? 0;
      const row = avail.get(c) ?? { easy: 0, medium: 0, hard: 0 };
      const x = largestRemainder(
        t,
        QB_DIFFICULTIES.map((d) => Math.max(0, R[d])),
        QB_DIFFICULTIES.map((d) => row[d]),
      );
      let rest = t - x.reduce((a, b) => a + b, 0);
      // Fill what is left from any difficulty with availability, nearest to the largest deficit first.
      const worst = QB_DIFFICULTIES.slice().sort((a, b) => R[b] - R[a])[0];
      for (const d of [worst, ...BORROW_ORDER[worst]]) {
        const i = QB_DIFFICULTIES.indexOf(d);
        const room = row[d] - x[i];
        const add = Math.min(room, rest);
        if (add > 0) {
          x[i] += add;
          rest -= add;
        }
      }
      const cell: Record<QbDifficulty, number> = { easy: x[0], medium: x[1], hard: x[2] };
      plan.set(c, cell);
      for (const d of QB_DIFFICULTIES) R[d] -= cell[d];
    }
    // Repair: move units between difficulties inside a chapter to close the deficits.
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const under = QB_DIFFICULTIES.filter((d) => R[d] > 0);
      const over = QB_DIFFICULTIES.filter((d) => R[d] < 0);
      if (under.length === 0 || over.length === 0) break;
      let moved = false;
      outer: for (const dUp of under) {
        for (const dDown of [...BORROW_ORDER[dUp]].filter((d) => over.includes(d))) {
          for (const c of chapters) {
            const cell = plan.get(c)!;
            const row = avail.get(c)!;
            if (cell[dDown] > 0 && row[dUp] > cell[dUp]) {
              cell[dDown] -= 1;
              cell[dUp] += 1;
              R[dDown] += 1;
              R[dUp] -= 1;
              moved = true;
              break outer;
            }
          }
        }
      }
      if (!moved) break;
    }
    return { plan, deficit: R, target };
  }

  private pickFrom(candidates: Unit[], state: PassState, spec: SectionSpec, formatCounts: Map<QbFormat, number>): Unit | null {
    const usable = candidates.filter((u) => this.free(u, state) && this.withinCaps(u, state));
    if (usable.length === 0) return null;
    const fresh = usable.filter((u) => !this.isRecent(u));
    let pool = fresh;
    if (pool.length === 0) {
      // recent_seen relaxation: the oldest-seen first.
      const oldest = Math.min(...usable.map((u) => this.recentAge(u)));
      pool = usable.filter((u) => this.recentAge(u) === oldest);
    }
    const targets = this.input.formatTargets[spec.section.id];
    const weights = pool.map((unit) => {
      let w = unit.exposureWeight;
      if (targets) {
        const f = unit.formats[0];
        const target = (targets[f] ?? 0) * spec.count;
        if (target - (formatCounts.get(f) ?? 0) > 0.5) w *= 4;
      }
      return w;
    });
    const index = this.rng.weightedIndex(weights);
    return index >= 0 ? pool[index] : pool[0];
  }

  private take(unit: Unit, state: PassState, formatCounts: Map<QbFormat, number>): void {
    for (const item of unit.items) state.usedIds.add(item.id);
    for (const cluster of unit.clusters) state.usedClusters.add(cluster);
    if (unit.passageId && unit.items.length > 1) state.usedPassages.add(unit.passageId);
    state.official += unit.official;
    state.cross += unit.cross;
    state.chapterPicked.set(unit.chapterId, (state.chapterPicked.get(unit.chapterId) ?? 0) + unit.items.length);
    for (const f of unit.formats) formatCounts.set(f, (formatCounts.get(f) ?? 0) + 1);
    if (this.isRecent(unit)) state.used.add("recent_seen");
  }

  private fillSection(spec: SectionSpec, later: SectionSpec[], state: PassState): Unit[] {
    const avail = this.availability(spec, state);
    const targets = this.chapterTargets(spec, later, state, avail);
    const { plan, deficit, target } = this.difficultyPlan(spec, targets, avail);
    const exact = QB_DIFFICULTIES.every((d) => deficit[d] === 0);
    if (!exact) {
      if (!this.cfg.allowDifficultyBorrow) {
        // Strict: never more than the target of a difficulty; the missing units stay short.
        for (const d of QB_DIFFICULTIES) {
          let over = -deficit[d];
          if (over <= 0) continue;
          const chapters = [...plan.keys()].sort((a, b) => plan.get(b)![d] - plan.get(a)![d]);
          for (const c of chapters) {
            const cell = plan.get(c)!;
            const cut = Math.min(cell[d], over);
            cell[d] -= cut;
            over -= cut;
            if (over === 0) break;
          }
        }
      }
    }
    const formatCounts = new Map<QbFormat, number>();
    const picked: Unit[] = [];
    const neededUnits = Math.floor(spec.count / spec.groupSize);
    const byCell = new Map<string, Unit[]>();
    for (const unit of spec.units) {
      const key = `${unit.chapterId}|${unit.difficulty}`;
      const list = byCell.get(key) ?? [];
      list.push(unit);
      byCell.set(key, list);
    }
    const chapters = this.rng.shuffle([...plan.keys()].sort());
    for (const c of chapters) {
      const cell = plan.get(c)!;
      for (const d of QB_DIFFICULTIES) {
        for (let k = 0; k < cell[d]; k += 1) {
          let unit = this.pickFrom(byCell.get(`${c}|${d}`) ?? [], state, spec, formatCounts);
          if (!unit) {
            // Another weighted chapter, same difficulty (normal overflow).
            unit = this.pickFrom(spec.units.filter((u) => u.difficulty === d && u.chapterId !== c), state, spec, formatCounts);
          }
          if (!unit && this.cfg.allowDifficultyBorrow) {
            for (const other of BORROW_ORDER[d]) {
              unit = this.pickFrom(byCell.get(`${c}|${other}`) ?? [], state, spec, formatCounts);
              if (unit) break;
            }
          }
          if (unit) {
            this.take(unit, state, formatCounts);
            picked.push(unit);
          }
        }
      }
    }
    // Strict difficulty cuts or misses leave the section short; with borrowing, top up from anything.
    if (picked.length < neededUnits && this.cfg.allowDifficultyBorrow) {
      while (picked.length < neededUnits) {
        const unit = this.pickFrom(spec.units, state, spec, formatCounts);
        if (!unit) break;
        this.take(unit, state, formatCounts);
        picked.push(unit);
      }
    }
    if (picked.length === neededUnits && QB_DIFFICULTIES.some((d) => picked.filter((u) => u.difficulty === d).length !== target[d])) {
      state.used.add("difficulty_borrowed");
    }
    return picked;
  }
}

// ---------------------------------------------------------------------------------------------
// Composition and ordering

function emptyComposition(full: number, language: "en" | "hi"): QbPaperComposition {
  return {
    total: 0,
    full,
    ratio: 0,
    bySource: { official: 0, aspire: 0, sample: 0 },
    officialYears: [],
    officialShare: 0,
    adapted: 0,
    crossExam: 0,
    byDifficulty: { easy: 0, medium: 0, hard: 0 },
    byFormat: {},
    language,
    hindiShortfall: 0,
    shortfall: [],
    relaxed: [],
  };
}

function buildComposition(
  items: readonly QbPoolItem[],
  full: number,
  language: "en" | "hi",
  shortfall: QbPaperComposition["shortfall"],
  relaxed: QbRelaxation[],
): QbPaperComposition {
  const composition = emptyComposition(full, language);
  const years = new Set<number>();
  for (const item of items) {
    composition.total += 1;
    composition.bySource[item.sourceKind] += 1;
    if (item.sourceKind === "official" && item.sourceYear !== null) years.add(item.sourceYear);
    if (item.adapted) composition.adapted += 1;
    if (item.crossExam) composition.crossExam += 1;
    composition.byDifficulty[item.difficulty] += 1;
    composition.byFormat[item.format] = (composition.byFormat[item.format] ?? 0) + 1;
  }
  composition.ratio = full > 0 ? composition.total / full : 0;
  composition.officialYears = [...years].sort((a, b) => a - b);
  composition.officialShare = composition.total > 0 ? composition.bySource.official / composition.total : 0;
  composition.hindiShortfall = language === "hi" ? Math.max(0, full - composition.total) : 0;
  composition.shortfall = shortfall;
  const order: QbRelaxation[] = ["recent_seen", "difficulty_borrowed", "chapter_quota", "format_mix", "source_mix", "shortened"];
  composition.relaxed = order.filter((r) => relaxed.includes(r));
  return composition;
}

/** The composition of a set of served items (papers.ts uses it per part of a pair). */
export function compositionOf(
  items: readonly QbPoolItem[],
  full: number,
  language: "en" | "hi",
  shortfall: QbPaperComposition["shortfall"] = [],
  relaxed: readonly QbRelaxation[] = [],
): QbPaperComposition {
  return buildComposition(items, full, language, shortfall, [...relaxed]);
}

function round5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

// ---------------------------------------------------------------------------------------------
// Public API

function passConfigs(mode: GenerateInput["mode"]): PassConfig[] {
  const strict: PassConfig = { allowRecent: false, allowDifficultyBorrow: false, allowZeroWeight: false, ignoreCaps: false };
  if (mode === "ranked_template") return [strict, { ...strict, allowDifficultyBorrow: true }];
  return [
    strict,
    { ...strict, allowRecent: true },
    { ...strict, allowRecent: true, allowDifficultyBorrow: true },
    { ...strict, allowRecent: true, allowDifficultyBorrow: true, allowZeroWeight: true },
    { allowRecent: true, allowDifficultyBorrow: true, allowZeroWeight: true, ignoreCaps: true },
  ];
}

function eligiblePool(input: GenerateInput, language: "en" | "hi"): QbPoolItem[] {
  const subjects = blueprintSubjectsOf(input.blueprint);
  const seen = new Set<string>();
  const out: QbPoolItem[] = [];
  for (const item of input.pool) {
    if (seen.has(item.id)) continue;
    if (!eligibleForBlueprint(item, input.blueprint, { language, placeholderMode: input.placeholderMode, subjects })) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function runPasses(
  specs: SectionSpec[],
  input: GenerateInput,
): { result: PassResult; complete: boolean } {
  let last: PassResult | null = null;
  for (const cfg of passConfigs(input.mode)) {
    const rng = createRng(`${input.seed}|${specs.map((s) => s.count).join(",")}`);
    const result = new Allocator(specs, input, cfg, rng).run();
    last = result;
    if (result.shortfall.length === 0) return { result, complete: true };
  }
  return { result: last!, complete: false };
}

/** Generates one paper (or, for a two-part blueprint, the pair) from the pool. */
export function generatePaper(input: GenerateInput): GenerateResult {
  const language = input.language ?? "en";
  const eligible = eligiblePool(input, language);
  const fullSpecs = flattenSpecs(input.blueprint, eligible, null);
  const full = fullSpecs.reduce((sum, s) => sum + s.fullCount, 0);

  let { result, complete } = runPasses(fullSpecs, input);
  let specs = fullSpecs;
  let scale = 1;
  const relaxed = new Set<QbRelaxation>(result.used);
  const originalShortfall = result.shortfall.map((s) => ({
    sectionId: fullSpecs[s.index].section.id,
    needed: s.needed,
    served: s.served,
  }));

  if (!complete) {
    if (input.mode === "ranked_template") return { ok: false, reason: "thin", readiness: readiness({ ...input, language }) };
    for (let attempt = 0; attempt < 4 && !complete; attempt += 1) {
      const served = new Map(result.shortfall.map((s) => [s.index, s.served]));
      const ratio = Math.min(
        ...specs.map((s) => (served.has(s.index) ? served.get(s.index)! : s.count) / s.fullCount),
      );
      scale = Math.min(scale, ratio);
      if (!(scale >= input.blueprint.minShortRatio) || scale <= 0) {
        return { ok: false, reason: "thin", readiness: readiness({ ...input, language }) };
      }
      specs = flattenSpecs(input.blueprint, eligible, scale);
      const next = runPasses(specs, input);
      result = next.result;
      complete = next.complete;
      for (const r of result.used) relaxed.add(r);
      if (!complete) scale -= 0.01;
    }
    if (!complete) return { ok: false, reason: "thin", readiness: readiness({ ...input, language }) };
    relaxed.add("shortened");
  }

  // Ordering: blueprint order; units shuffled within a section; passage units stay together.
  const orderRng = createRng(`${input.seed}|order`);
  const parts: GeneratedPart[] = input.blueprint.parts.map((part, partIndex) => {
    const partSpecs = specs.filter((s) => s.partIndex === partIndex);
    const sections = partSpecs.map((spec) => ({
      sectionId: spec.section.id,
      items: orderRng.shuffle(result.picked[spec.index]).flatMap((unit) => unit.items),
    }));
    const short = scale < 1;
    const duration = short ? Math.max(10, round5(part.durationMinutes * scale)) : part.durationMinutes;
    const maxScore = partSpecs.reduce((sum, spec) => sum + spec.count * spec.section.marking.correct, 0);
    return { partId: part.id, sections, durationMinutes: duration, maxScore };
  });

  // Format deviation is soft: recorded (practice only) when a section with targets is off by more than 1.
  if (input.mode === "practice") {
    for (const spec of specs) {
      const targets = input.formatTargets[spec.section.id];
      if (!targets) continue;
      const items = result.picked[spec.index].flatMap((u) => u.items);
      for (const [format, share] of Object.entries(targets)) {
        const actual = items.filter((i) => i.format === format).length;
        if (Math.abs(actual - (share ?? 0) * spec.count) > 1.5) relaxed.add("format_mix");
      }
    }
  }

  const allItems = parts.flatMap((p) => p.sections.flatMap((s) => s.items));
  const composition = buildComposition(allItems, full, language, scale < 1 ? originalShortfall : [], [...relaxed]);
  return { ok: true, parts, composition, short: scale < 1 };
}

// ---------------------------------------------------------------------------------------------
// Readiness (availability only; no picking)

export type ReadinessInput = Omit<GenerateInput, "mode" | "seed" | "softExclude"> & {
  softExclude?: GenerateInput["softExclude"];
  seed?: string;
  mode?: GenerateInput["mode"];
};

interface SectionSupply {
  spec: SectionSpec;
  available: Record<QbDifficulty, number>;
  /**
   * Questions this section can be served when every section is filled together (≤ count): sections
   * claim distinct units in the generator's own order (format-bound first, plain single-correct last,
   * then scarcest), so a match-list section never counts the plain MCQ supply it cannot use.
   */
  servableQuestions: number;
  /** Supply in questions after sharing with sections that can use the same units (variety). */
  supplyQuestions: number;
}

function unitIdentity(unit: Unit): string {
  return unit.passageId && unit.items.length > 1 ? `p:${unit.passageId}` : `c:${unit.clusters[0]}`;
}

function sectionSupplies(blueprint: QbBlueprint, eligible: readonly QbPoolItem[]): SectionSupply[] {
  const specs = flattenSpecs(blueprint, eligible, null);
  const own = specs.map((spec) => {
    const identities = new Set<string>();
    const perDifficulty: Record<QbDifficulty, Set<string>> = { easy: new Set(), medium: new Set(), hard: new Set() };
    for (const unit of spec.units) {
      const id = unitIdentity(unit);
      identities.add(id);
      perDifficulty[unit.difficulty].add(id);
    }
    const available: Record<QbDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const d of QB_DIFFICULTIES) available[d] = perDifficulty[d].size;
    return { identities, available };
  });
  // Which sections can use each unit (identity).
  const users = new Map<string, number[]>();
  own.forEach((o, i) => {
    for (const id of o.identities) {
      const list = users.get(id) ?? [];
      list.push(i);
      users.set(id, list);
    }
  });

  // Servable: claim distinct units section by section, in the generator's order (sectionOrder), taking
  // first the units the fewest other sections can use. Never more than a section's own supply.
  const order = specs
    .map((spec, i) => ({
      i,
      formatBound: spec.section.format ? 0 : 1,
      plainSingle: spec.section.type === "single" && !spec.section.format ? 1 : 0,
      ratio: spec.count > 0 ? (own[i].identities.size * spec.groupSize) / spec.count : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.formatBound - b.formatBound || a.plainSingle - b.plainSingle || a.ratio - b.ratio || a.i - b.i);
  const claimed = new Set<string>();
  const servable = new Array<number>(specs.length).fill(0);
  for (const { i } of order) {
    const spec = specs[i];
    const neededUnits = Math.floor(spec.count / spec.groupSize);
    const candidates = [...own[i].identities]
      .filter((id) => !claimed.has(id))
      .sort((a, b) => (users.get(a)?.length ?? 0) - (users.get(b)?.length ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
    const taken = candidates.slice(0, neededUnits);
    for (const id of taken) claimed.add(id);
    servable[i] = Math.min(spec.count, taken.length * spec.groupSize);
  }

  // Variety: sections linked by shared units (e.g. both papers' single-correct sections and the
  // match-list section of a subject) split the union of their supply in proportion to their counts,
  // never more than a section's own supply.
  const parent = specs.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const list of users.values()) for (let k = 1; k < list.length; k += 1) parent[find(list[k])] = find(list[0]);
  const componentSupply = new Map<number, number>();
  const componentNeeded = new Map<number, number>();
  const componentSize = new Map<number, number>();
  for (const list of users.values()) {
    const root = find(list[0]);
    componentSupply.set(root, (componentSupply.get(root) ?? 0) + Math.max(...list.map((i) => specs[i].groupSize)));
  }
  specs.forEach((spec, i) => {
    const root = find(i);
    componentNeeded.set(root, (componentNeeded.get(root) ?? 0) + spec.count);
    componentSize.set(root, (componentSize.get(root) ?? 0) + 1);
  });

  return specs.map((spec, i) => {
    const root = find(i);
    const ownQuestions = own[i].identities.size * spec.groupSize;
    const shared =
      (componentSize.get(root) ?? 1) > 1
        ? Math.floor(((componentSupply.get(root) ?? 0) * spec.count) / Math.max(1, componentNeeded.get(root) ?? 1))
        : ownQuestions;
    return { spec, available: own[i].available, servableQuestions: servable[i], supplyQuestions: Math.min(ownQuestions, shared) };
  });
}

function levelFor(supplies: SectionSupply[], minShortRatio: number): { level: QbReadinessLevel; ratio: number } {
  if (supplies.length === 0) return { level: "thin", ratio: 0 };
  const ratio = Math.min(...supplies.map((s) => Math.min(1, s.servableQuestions / Math.max(1, s.spec.count))));
  if (ratio >= 1) return { level: "full", ratio };
  if (ratio >= minShortRatio) return { level: "short", ratio };
  return { level: "thin", ratio };
}

/** Readiness from supply alone: full / short / thin per language, per-section availability, variety. */
export function readiness(input: ReadinessInput): QbReadiness {
  const base = { ...input, mode: input.mode ?? "practice", seed: input.seed ?? "readiness", softExclude: input.softExclude ?? new Set<string>() };
  const en = sectionSupplies(input.blueprint, eligiblePool(base as GenerateInput, "en"));
  const hi = sectionSupplies(input.blueprint, eligiblePool(base as GenerateInput, "hi"));
  const minShort = input.blueprint.minShortRatio;
  const enLevel = levelFor(en, minShort);
  const hiLevel = input.blueprint.languages.includes("hi") ? levelFor(hi, minShort) : { level: "thin" as const, ratio: 0 };
  const language = input.language ?? "en";
  const chosen = language === "hi" ? hiLevel : enLevel;
  const supplies = language === "hi" ? hi : en;
  const totals = blueprintTotals(input.blueprint);
  const servable =
    chosen.level === "full"
      ? totals.questions
      : chosen.level === "short"
        ? supplies.reduce(
            (sum, s) => sum + Math.max(s.spec.groupSize, Math.floor((s.spec.count / s.spec.groupSize) * chosen.ratio) * s.spec.groupSize),
            0,
          )
        : supplies.reduce((sum, s) => sum + Math.min(s.spec.count, s.servableQuestions), 0);
  const variety = Math.floor(Math.min(...supplies.map((s) => s.supplyQuestions / Math.max(1, s.spec.count))) * 10) / 10;
  return {
    level: chosen.level,
    servable,
    full: totals.questions,
    variety: Number.isFinite(variety) ? variety : 0,
    byLanguage: { en: enLevel.level, hi: hiLevel.level },
    sections: supplies.map((s) => ({
      sectionId: s.spec.section.id,
      needed: s.spec.count,
      available: s.available,
      servable: Math.min(s.spec.count, s.servableQuestions),
    })),
    ranked: { available: false, windowId: null, closesAt: null },
  };
}

// ---------------------------------------------------------------------------------------------
// Preview statistics (admin only; the caller caches per bank revision and runs one at a time)

export interface PreviewStats {
  papers: number;
  thinRate: number;
  shortRate: number;
  relaxedRate: number;
  chapters: Record<string, { min: number; avg: number; max: number }>;
  difficulty: Record<QbDifficulty, { min: number; avg: number; max: number }>;
  sources: Record<QbSourceKind, { min: number; avg: number; max: number }>;
  mostUsed: { id: string; share: number }[];
}

function summarise(values: number[]): { min: number; avg: number; max: number } {
  if (values.length === 0) return { min: 0, avg: 0, max: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), avg: Math.round((sum / values.length) * 100) / 100, max: Math.max(...values) };
}

/** Lets other work run between generated papers (a JEE Advanced pair takes ~0.15 s on a large pool). */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Statistics over `seeds` generated papers. Async: it yields to the event loop after every paper so a
 * long preview never blocks other requests on the same server.
 */
export async function previewStats(input: Omit<GenerateInput, "seed"> & { seed?: string }, seeds = 100): Promise<PreviewStats> {
  const okPapers: QbPoolItem[][] = [];
  let thin = 0;
  let short = 0;
  let relaxed = 0;
  for (let i = 0; i < seeds; i += 1) {
    if (i > 0) await yieldToEventLoop();
    const result = generatePaper({ ...input, seed: `${input.seed ?? "preview"}:${i}` });
    if (!result.ok) {
      thin += 1;
      continue;
    }
    if (result.short) short += 1;
    if (result.composition.relaxed.length > 0) relaxed += 1;
    okPapers.push(result.parts.flatMap((p) => p.sections.flatMap((s) => s.items)));
  }
  const chapterIds = new Set<string>();
  for (const items of okPapers) for (const item of items) chapterIds.add(item.chapterId);
  const chapters: PreviewStats["chapters"] = {};
  for (const chapter of [...chapterIds].sort()) {
    chapters[chapter] = summarise(okPapers.map((items) => items.filter((i) => i.chapterId === chapter).length));
  }
  const difficulty = Object.fromEntries(
    QB_DIFFICULTIES.map((d) => [d, summarise(okPapers.map((items) => items.filter((i) => i.difficulty === d).length))]),
  ) as PreviewStats["difficulty"];
  const sources = Object.fromEntries(
    (["official", "aspire", "sample"] as const).map((k) => [k, summarise(okPapers.map((items) => items.filter((i) => i.sourceKind === k).length))]),
  ) as PreviewStats["sources"];
  const usage = new Map<string, number>();
  for (const items of okPapers) for (const item of new Set(items.map((i) => i.id))) usage.set(item, (usage.get(item) ?? 0) + 1);
  const mostUsed = [...usage.entries()]
    .map(([id, count]) => ({ id, share: okPapers.length > 0 ? count / okPapers.length : 0 }))
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id))
    .slice(0, 10);
  return {
    papers: seeds,
    thinRate: seeds > 0 ? thin / seeds : 0,
    shortRate: seeds > 0 ? short / seeds : 0,
    relaxedRate: okPapers.length > 0 ? relaxed / okPapers.length : 0,
    chapters,
    difficulty,
    sources,
    mostUsed,
  };
}
