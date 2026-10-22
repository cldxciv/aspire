import "server-only";

import { MOCK_TESTS } from "@/content/mocktest";
import type { Bilingual, TestWindow } from "@/content/mocktest/types";
import { blueprintTestId, parseBlueprintTestId, QB_SLOT_META } from "@/lib/qb/patterns";
import type { QbExam, QbSlot } from "@/lib/qb/types";
import { recentMonthWindows } from "./timing";

/**
 * Test ids across fixed tests and generated (exam-pattern) mocks — pure and synchronous
 * (docs/question-bank-plan.md §B9.4, §B13). SERVER-ONLY: it reads the sample-test registry, whose
 * module graph includes the sample answer keys, so it must never reach a client bundle (client code
 * uses `parseBlueprintTestId` / `QB_SLOT_META` from src/lib/qb/patterns.ts, or titles passed as props).
 * - fixed tests: the ids in src/content/mocktest ("jee-main-sample", …);
 * - generated practice papers: "bp-<slot>"; the JEE Advanced pair's parts "bp-jee-adv-p1" / "-p2";
 * - the monthly ranked paper: "bp-<slot>-ranked" (a separate id, so a practice attempt can never
 *   block a student's ranked board entry).
 * Titles come from code constants (`QB_SLOT_META`), never the database, so static pages and
 * `generateMetadata` can use them (Cache Components: no request data, no seeding).
 */

export interface BlueprintTestRef {
  testId: string;
  slot: QbSlot;
  mode: "practice" | "ranked";
  /** 1 or 2 for a part of the JEE Advanced pair ("bp-jee-adv-p1"), else null. */
  part: number | null;
}

const PART_SUFFIX = /^(bp-.+)-p([1-9])$/;

/** Parses a generated-mock test id ("bp-jee-main", "bp-neet-ug-ranked", "bp-jee-adv-p2"); null otherwise. */
export function parseBlueprintTest(testId: string): BlueprintTestRef | null {
  const direct = parseBlueprintTestId(testId);
  if (direct) return { testId, slot: direct.slot, mode: direct.mode, part: null };
  const part = PART_SUFFIX.exec(testId);
  if (!part) return null;
  const base = parseBlueprintTestId(part[1]);
  return base ? { testId, slot: base.slot, mode: base.mode, part: Number(part[2]) } : null;
}

export function isBlueprintTestId(testId: string): boolean {
  return parseBlueprintTest(testId) !== null;
}

/** "bp-<slot>", "bp-<slot>-ranked", or with a part "bp-jee-adv-p1". */
export function blueprintTestIdFor(slot: QbSlot, mode: "practice" | "ranked", part: number | null = null): string {
  const base = blueprintTestId(slot, mode);
  return part === null ? base : `${base}-p${part}`;
}

/** The exam of a slot (from the code constants). */
export function slotExam(slot: QbSlot): QbExam {
  return QB_SLOT_META[slot].exam;
}

// Hindi: machine-assisted draft, pending native review (docs/hindi-review-register.md).
const RANKED_SUFFIX: Bilingual = { en: "monthly ranked paper", hi: "मासिक रैंक्ड प्रश्नपत्र" };
const PART_LABEL: Bilingual = { en: "Paper {n}", hi: "प्रश्नपत्र {n}" };

/** The bilingual title of a generated mock's test id ("JEE Main exam-pattern mock · monthly ranked paper"). */
export function blueprintTestTitle(ref: Pick<BlueprintTestRef, "slot" | "mode" | "part">): Bilingual {
  const base = QB_SLOT_META[ref.slot].title;
  const suffixes: Bilingual[] = [];
  if (ref.part !== null) suffixes.push({ en: PART_LABEL.en.replace("{n}", String(ref.part)), hi: PART_LABEL.hi.replace("{n}", String(ref.part)) });
  if (ref.mode === "ranked") suffixes.push(RANKED_SUFFIX);
  return {
    en: [base.en, ...suffixes.map((s) => s.en)].join(" · "),
    hi: [base.hi, ...suffixes.map((s) => s.hi)].join(" · "),
  };
}

/**
 * Title of any mock-test id, synchronously, from code constants: fixed tests (whatever their
 * status: callers apply their own visibility rules) and generated mocks. Null for unknown ids.
 */
export function mockTestTitle(id: string, locale: "en" | "hi"): string | null {
  const fixed = MOCK_TESTS.find((t) => t.id === id);
  if (fixed) return fixed.title[locale];
  const ref = parseBlueprintTest(id);
  return ref ? blueprintTestTitle(ref)[locale] : null;
}

/**
 * A pseudo test definition for the timing rules of src/lib/mocktest/timing.ts (`isLeaderboardTest`,
 * `solutionsLockedUntil`, `evaluateAttempt`): practice papers are `kind: "practice"`; the ranked
 * paper is `kind: "weekly"` with monthly IST windows (plan §B9.4), so the existing rules apply
 * unchanged. `durationMinutes` is the paper's time; `windows` defaults to the last 12 months.
 */
export interface BlueprintTestDefinition {
  id: string;
  slot: QbSlot;
  exam: QbExam;
  kind: "practice" | "weekly";
  title: Bilingual;
  summary: Bilingual;
  durationMinutes: number;
  windows?: TestWindow[];
}

export function blueprintTestDefinition(
  slot: QbSlot,
  mode: "practice" | "ranked",
  options: { durationMinutes: number; now?: number; windows?: TestWindow[]; part?: number | null },
): BlueprintTestDefinition {
  const meta = QB_SLOT_META[slot];
  const part = options.part ?? null;
  return {
    id: blueprintTestIdFor(slot, mode, part),
    slot,
    exam: meta.exam,
    kind: mode === "ranked" ? "weekly" : "practice",
    title: blueprintTestTitle({ slot, mode, part }),
    summary: meta.summary,
    durationMinutes: options.durationMinutes,
    ...(mode === "ranked" ? { windows: options.windows ?? recentMonthWindows(options.now ?? Date.now(), 12) } : {}),
  };
}
