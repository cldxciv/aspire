import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import type { QbBlueprint, QbQuestion, QbQuestionContent } from "@/lib/qb/types";
import { adminChromeFor, isQuestionBankPath, portalAreas, QUESTION_BANK_HREF, QUESTION_BANK_NAV_KEYS } from "@/components/portal/areas";
import { PortalNavLinks } from "@/components/portal/PortalNav";
import { navMessages, previewBannerMode, previewBannerVisible } from "@/components/portal/PortalShell";
import { qbFailureMessage, qbRequests, readQbResponse, type QbFailure } from "./api";
import { blueprintTotals, editableFromBlueprint, percentTextToShare, shareToPercentText, updateSection } from "./blueprint-state";
import { qbCapabilityMap, qbRoleCan, QB_ADMIN_BLOCKING_FLAGS, QB_ADMIN_BULK_EXCLUDED_FLAGS, spotCheckSampleSize } from "./constants";
import { QB_CONFLICT_CODES, type QbBulkStartResult } from "./contract";
import {
  addOption,
  changeType,
  emptyContent,
  emptyForm,
  figureMarker,
  figurePosition,
  formFromQuestion,
  isDirty,
  numericalAnswer,
  removeOption,
  toCreateInput,
  toggleMultiple,
  toPatch,
} from "./editor-state";
import { scaledSize } from "./figure-upload";
import { activeFilterCount, DEFAULT_QUESTION_FILTERS, pageCount, parseQuestionFilters, questionFiltersToQuery, withFilters } from "./filters";
import { blockerLabel, displayStatus, parseOverrides, positionShares, previewText, sortFlags } from "./format";
import { isValidMix, mixCounts, mixSum, normaliseMix, setMixValue } from "./mix";
import { activeQbTab, QB_TABS } from "./QbTabs";
import { canCommit, commitBody, isExpired, SPOT_CHECK_IDLE, spotCheckReducer, spotProgress, type SpotCheckEvent, type SpotCheckState } from "./spot-check";

/**
 * Pure helpers of the question-bank admin UI (QB-ADMIN-UI, docs/question-bank-plan.md §B14
 * package 7): filter query parsing, mix sliders that always total 100, the spot-check flow state,
 * editor state, request builders, messages and the staff-aware admin chrome.
 */

// ---------------------------------------------------------------------------------------------
describe("question filters", () => {
  it("defaults: newest change first, page 1, 25 per page", () => {
    expect(parseQuestionFilters(new URLSearchParams())).toEqual(DEFAULT_QUESTION_FILTERS);
    expect(questionFiltersToQuery(DEFAULT_QUESTION_FILTERS)).toBe("");
  });

  it("keeps known values and drops unknown or malformed ones", () => {
    const filters = parseQuestionFilters(
      new URLSearchParams(
        "status=in_review&subject=chemistry&chapter=chem-p-block&exam=NEET&difficulty=hard&source=official&year=2024" +
          "&paper=NEET%7C2024%7C2024-05-05%7C%7C%7C&import=imp_1&flag=figure_needed&flagged=blocking&queue=wrong_key" +
          "&suspended=false&q=%20Lassaigne%20test%20&sort=number_asc&page=3&pageSize=50",
      ),
    );
    expect(filters).toEqual({
      status: "in_review",
      subject: "chemistry",
      chapterId: "chem-p-block",
      exam: "NEET",
      difficulty: "hard",
      sourceKind: "official",
      sourceYear: 2024,
      paperKey: "NEET|2024|2024-05-05|||",
      importId: "imp_1",
      flag: "figure_needed",
      flagged: "blocking",
      queue: "wrong_key",
      suspended: false,
      q: "Lassaigne test",
      sort: "number_asc",
      page: 3,
      pageSize: 50,
    });
    const junk = parseQuestionFilters(
      new URLSearchParams("status=published&subject=history&chapter=../x&exam=CBSE&difficulty=extreme&source=coaching&year=1890&flag=nope&queue=reports&sort=random&page=-2&pageSize=33&q=%00%01"),
    );
    expect(junk).toEqual(DEFAULT_QUESTION_FILTERS);
  });

  it("accepts Next's searchParams object (first value of a repeated key) and status=open", () => {
    expect(parseQuestionFilters({ status: ["open", "approved"], page: "2", subject: undefined })).toMatchObject({ status: "open", page: 2 });
  });

  it("round-trips through the query string", () => {
    const filters = { ...DEFAULT_QUESTION_FILTERS, status: "approved" as const, exam: "JEE_MAIN" as const, difficulty: "easy" as const, q: "projectile motion", page: 4, pageSize: 100 };
    const query = questionFiltersToQuery(filters);
    expect(query.startsWith("?")).toBe(true);
    expect(parseQuestionFilters(new URLSearchParams(query.slice(1)))).toEqual(filters);
  });

  it("changing a filter goes back to page 1; clearing one removes it; the active count ignores paging", () => {
    const filters = { ...DEFAULT_QUESTION_FILTERS, subject: "physics" as const, page: 5 };
    expect(withFilters(filters, { exam: "JEE_ADV" })).toEqual({ ...filters, exam: "JEE_ADV", page: 1 });
    expect(withFilters(filters, { subject: undefined })).not.toHaveProperty("subject");
    expect(activeFilterCount({ ...filters, exam: "NEET" })).toBe(2);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
describe("difficulty mix sliders", () => {
  it("moving one slider rebalances the others proportionally; the sum is always 100", () => {
    expect(setMixValue({ easy: 30, medium: 50, hard: 20 }, "easy", 40)).toEqual({ easy: 40, medium: 43, hard: 17 });
    expect(setMixValue({ easy: 30, medium: 50, hard: 20 }, "hard", 100)).toEqual({ easy: 0, medium: 0, hard: 100 });
    // Both others at 0: the rest is split evenly (ties go to the earlier difficulty).
    expect(setMixValue({ easy: 0, medium: 0, hard: 100 }, "hard", 55)).toEqual({ easy: 23, medium: 22, hard: 55 });
    // Out of range and fractional input are clamped and rounded.
    expect(setMixValue({ easy: 40, medium: 45, hard: 15 }, "medium", 140)).toEqual({ easy: 0, medium: 100, hard: 0 });
    expect(setMixValue({ easy: 40, medium: 45, hard: 15 }, "medium", -5).medium).toBe(0);
    let mix = { easy: 15, medium: 45, hard: 40 };
    for (const [key, value] of [["easy", 33], ["hard", 7], ["medium", 91], ["easy", 0], ["hard", 61], ["medium", 12.6]] as const) {
      mix = setMixValue(mix, key, value);
      expect(mixSum(mix), JSON.stringify(mix)).toBe(100);
      expect(isValidMix(mix)).toBe(true);
    }
  });

  it("validates and normalises mixes", () => {
    expect(isValidMix({ easy: 30, medium: 50, hard: 20 })).toBe(true);
    expect(isValidMix({ easy: 30, medium: 50, hard: 30 })).toBe(false);
    expect(isValidMix({ easy: 30.5, medium: 49.5, hard: 20 })).toBe(false);
    expect(normaliseMix({ easy: 1, medium: 1, hard: 2 })).toEqual({ easy: 25, medium: 25, hard: 50 });
    expect(normaliseMix({ easy: 0, medium: 0, hard: 0 })).toEqual({ easy: 34, medium: 33, hard: 33 });
  });

  it("splits a section's questions by largest remainder (JEE Main 20 MCQs at 30/50/20 → 6/10/4)", () => {
    expect(mixCounts({ easy: 30, medium: 50, hard: 20 }, 20)).toEqual({ easy: 6, medium: 10, hard: 4 });
    expect(mixCounts({ easy: 40, medium: 45, hard: 15 }, 45)).toEqual({ easy: 18, medium: 20, hard: 7 });
    const counts = mixCounts({ easy: 15, medium: 45, hard: 40 }, 4);
    expect(counts.easy + counts.medium + counts.hard).toBe(4);
  });
});

// ---------------------------------------------------------------------------------------------
describe("spot-check flow", () => {
  const started: QbBulkStartResult = {
    batchId: "batch_1",
    op: "approve",
    exam: null,
    eligible: ["q_1", "q_2", "q_3", "q_4"],
    skipped: [{ id: "q_9", reason: "figure_needed" }],
    sample: ["q_2", "q_4", "q_1"],
    expiresAt: 10_000,
  };
  const run = (events: SpotCheckEvent[], from: SpotCheckState = SPOT_CHECK_IDLE) => events.reduce(spotCheckReducer, from);
  const TOKEN = (id: string) => `token-${id}-0123456789`;

  it("start → open every sampled item → mark each OK → commit → done", () => {
    let state = run([{ type: "start", op: "approve", ids: ["q_1", "q_1", "q_2", "q_3", "q_4", "q_9"] }]);
    expect(state).toEqual({ phase: "starting", op: "approve", ids: ["q_1", "q_2", "q_3", "q_4", "q_9"] });
    state = run([{ type: "started", result: started }], state);
    expect(state.phase).toBe("checking");
    expect(spotProgress(state)).toEqual({ opened: 0, ok: 0, total: 3 });
    expect(canCommit(state)).toBe(false);

    // A verdict needs the item opened first (no token yet → ignored).
    expect(run([{ type: "verdict", id: "q_2", ok: true }], state)).toBe(state);
    state = run(
      [
        { type: "opened", id: "q_2", token: TOKEN("q_2") },
        { type: "opened", id: "q_4", token: TOKEN("q_4") },
        { type: "verdict", id: "q_2", ok: true },
        { type: "verdict", id: "q_4", ok: true },
      ],
      state,
    );
    expect(spotProgress(state)).toEqual({ opened: 2, ok: 2, total: 3 });
    expect(canCommit(state)).toBe(false);
    // "commit" before every item is checked does nothing.
    expect(run([{ type: "commit" }], state)).toBe(state);

    state = run([{ type: "opened", id: "q_1", token: TOKEN("q_1") }, { type: "verdict", id: "q_1", ok: true }], state);
    expect(canCommit(state)).toBe(true);
    state = run([{ type: "commit" }], state);
    expect(state.phase).toBe("committing");
    if (state.phase !== "committing") throw new Error("unreachable");
    expect(commitBody(state)).toEqual({
      action: "commit",
      batchId: "batch_1",
      checks: [
        { id: "q_2", token: TOKEN("q_2"), ok: true },
        { id: "q_4", token: TOKEN("q_4"), ok: true },
        { id: "q_1", token: TOKEN("q_1"), ok: true },
      ],
    });
    state = run([{ type: "committed", result: { outcome: "done", op: "approve", count: 4, ids: started.eligible, sample: started.sample } }], state);
    expect(state).toEqual({ phase: "done", op: "approve", count: 4 });
  });

  it("one 'not right' commits at once with that failure, and the batch ends aborted", () => {
    let state = run([
      { type: "start", op: "confirm_syllabus", ids: ["q_1"] },
      { type: "started", result: { ...started, op: "confirm_syllabus", exam: "NEET" } },
      { type: "opened", id: "q_2", token: TOKEN("q_2") },
      { type: "verdict", id: "q_2", ok: true },
      { type: "opened", id: "q_4", token: TOKEN("q_4") },
      { type: "verdict", id: "q_4", ok: false },
    ]);
    expect(state.phase).toBe("committing");
    if (state.phase !== "committing") throw new Error("unreachable");
    expect(commitBody(state).checks).toEqual([
      { id: "q_2", token: TOKEN("q_2"), ok: true },
      { id: "q_4", token: TOKEN("q_4"), ok: false },
    ]);
    // No more verdicts while committing.
    expect(run([{ type: "verdict", id: "q_2", ok: false }], state)).toBe(state);
    state = run([{ type: "committed", result: { outcome: "aborted", op: "confirm_syllabus", failedId: "q_4", sample: started.sample } }], state);
    expect(state).toEqual({ phase: "aborted", op: "confirm_syllabus", failedId: "q_4" });
  });

  it("nothing eligible, server failures, expiry and reset", () => {
    const empty = run([{ type: "start", op: "approve", ids: ["q_9"] }, { type: "started", result: { ...started, eligible: [], sample: [] } }]);
    expect(empty).toEqual({ phase: "error", op: "approve", message: "nothing_eligible" });
    const failed = run([{ type: "start", op: "approve", ids: ["q_1"] }, { type: "failed", message: "Clear the blocking flags." }]);
    expect(failed).toEqual({ phase: "error", op: "approve", message: "Clear the blocking flags." });
    const checking = run([{ type: "start", op: "approve", ids: ["q_1"] }, { type: "started", result: started }]);
    expect(isExpired(checking, 9_999)).toBe(false);
    expect(isExpired(checking, 10_000)).toBe(true);
    expect(run([{ type: "reset" }], checking)).toBe(SPOT_CHECK_IDLE);
    expect(run([{ type: "start", op: "approve", ids: [] }])).toBe(SPOT_CHECK_IDLE);
    // A late "started" for a batch that is no longer starting is ignored.
    expect(run([{ type: "started", result: started }])).toBe(SPOT_CHECK_IDLE);
  });

  it("sample size: max(3, ceil(5 %)), at most 10, never above the batch", () => {
    expect([1, 2, 3, 40, 61, 100, 199, 200].map(spotCheckSampleSize)).toEqual([1, 2, 3, 3, 4, 5, 10, 10]);
    expect(spotCheckSampleSize(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe("roles and flags (§B5–B6)", () => {
  it("author ⊂ reviewer ⊂ admin", () => {
    expect(qbRoleCan("author", "edit_draft")).toBe(true);
    expect(qbRoleCan("author", "import_tabular")).toBe(true);
    for (const capability of ["approve", "import_ai", "retire", "set_labels", "key_corrections", "edit_blueprint"] as const) {
      expect(qbRoleCan("author", capability), capability).toBe(false);
      expect(qbRoleCan("reviewer", capability), capability).toBe(true);
    }
    for (const capability of ["publish_blueprint", "confirm_taxonomy", "manage_team", "manage_settings"] as const) {
      expect(qbRoleCan("reviewer", capability), capability).toBe(false);
      expect(qbRoleCan("admin", capability), capability).toBe(true);
    }
    expect(Object.values(qbCapabilityMap("admin")).every(Boolean)).toBe(true);
  });

  it("bulk approval skips every blocking flag plus low confidence, reports and negative discrimination", () => {
    for (const flag of QB_ADMIN_BLOCKING_FLAGS) expect(QB_ADMIN_BULK_EXCLUDED_FLAGS).toContain(flag);
    expect(QB_ADMIN_BULK_EXCLUDED_FLAGS).toEqual(expect.arrayContaining(["low_confidence", "student_report", "negative_discrimination"]));
    expect(QB_ADMIN_BLOCKING_FLAGS).not.toContain("near_duplicate");
    expect(sortFlags(["near_duplicate", "math_error", "low_confidence", "answer_missing", "math_error"])).toEqual([
      "answer_missing",
      "math_error",
      "low_confidence",
      "near_duplicate",
    ]);
    expect(displayStatus({ status: "approved", suspended: true })).toBe("suspended");
    expect(displayStatus({ status: "draft", suspended: false })).toBe("draft");
  });
});

// ---------------------------------------------------------------------------------------------
describe("tab bar", () => {
  it("marks the right section; a question's own page and /new count as Questions", () => {
    expect(QB_TABS.map((tab) => tab.key)).toEqual(["questions", "review", "import", "taxonomy", "blueprints", "coverage", "team"]);
    expect(activeQbTab("/admin/questions")).toBe("questions");
    expect(activeQbTab("/admin/questions/q_abc")).toBe("questions");
    expect(activeQbTab("/admin/questions/new")).toBe("questions");
    expect(activeQbTab("/admin/questions/review")).toBe("review");
    expect(activeQbTab("/admin/questions/blueprints/bp_1")).toBe("blueprints");
    expect(activeQbTab("/admin/questions/import/imp_1")).toBe("import");
    expect(activeQbTab("/admin/users")).toBeNull();
    expect(activeQbTab(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
const bi = (en: string, hi = "") => ({ en, hi });

function question(overrides: Partial<QbQuestion> = {}): QbQuestion {
  const content: QbQuestionContent = {
    ...emptyContent("single"),
    stem: bi("Which is a scalar?"),
    options: [bi("Velocity"), bi("Speed"), bi("Force"), bi("Momentum")],
    answer: { kind: "single", index: 1 },
    figures: [{ id: "0123456789abcdef0123456789abcdef", slot: "option:2", alt: bi("Arrow"), width: 300, height: 200 }],
  };
  return {
    id: "q_abc",
    n: 12,
    status: "draft",
    suspended: false,
    version: 3,
    approvedVersion: null,
    subject: "physics",
    chapterId: "phy-units",
    content,
    exams: [
      { exam: "JEE_MAIN", eligible: true, crossExam: false, difficulty: "easy", difficultySource: "staff", aiDifficulty: "medium", aiReason: "One-step recall", syllabus: "current", expectedTimeSec: 60 },
    ],
    source: { kind: "aspire", aspireRef: "Synthetic set 1" },
    alsoIn: [],
    fidelity: null,
    adaptedNote: null,
    patternTag: null,
    originalMarking: null,
    keyStatus: "none",
    keyStage: "aspire",
    confidence: null,
    flags: [],
    clusterId: null,
    importId: null,
    stats: [],
    createdBy: "u_author",
    createdAt: 1,
    updatedBy: "u_author",
    updatedAt: 2,
    approvedBy: null,
    approvedAt: null,
    ...overrides,
  };
}

describe("editor state", () => {
  it("a new form: Aspire source, no chapter, four empty options, every exam unticked", () => {
    const form = emptyForm();
    expect(form.source).toEqual({ kind: "aspire" });
    expect(form.content.options).toHaveLength(4);
    expect(form.exams.map((row) => [row.exam, row.eligible])).toEqual([
      ["JEE_MAIN", false],
      ["NEET", false],
      ["JEE_ADV", false],
      ["BOH", false],
    ]);
    expect(toCreateInput(form).exams).toEqual([]);
  });

  it("changing the type keeps what still makes sense", () => {
    const single = question().content;
    const multiple = changeType(single, "multiple");
    expect(multiple.answer).toEqual({ kind: "multiple", indices: [1] });
    expect(changeType(multiple, "single").answer).toEqual({ kind: "single", index: 1 });
    const numerical = changeType(single, "numerical");
    expect(numerical.options).toEqual([]);
    expect(numerical.answer).toBeNull();
    expect(changeType(numerical, "single").options).toHaveLength(4);
  });

  it("removing an option shifts later answers and option figures; at least two options stay", () => {
    const content = question().content;
    const removed = removeOption(content, 0);
    expect(removed.options.map((option) => option.en)).toEqual(["Speed", "Force", "Momentum"]);
    expect(removed.answer).toEqual({ kind: "single", index: 0 });
    expect(removed.figures[0].slot).toBe("option:1");
    expect(removeOption(content, 1).answer).toBeNull();
    expect(removeOption(content, 2).figures).toEqual([]);
    const two = removeOption(removeOption(content, 3), 2);
    expect(removeOption(two, 0)).toBe(two);
    expect(addOption(addOption(addOption(two))).options).toHaveLength(5);
    const multiple = { ...changeType(content, "multiple"), answer: { kind: "multiple" as const, indices: [0, 2, 3] } };
    expect(removeOption(multiple, 2).answer).toEqual({ kind: "multiple", indices: [0, 2] });
  });

  it("multiple-correct ticks stay sorted and distinct; none ticked is no answer", () => {
    let answer = toggleMultiple(null, 3, true);
    answer = toggleMultiple(answer, 0, true);
    answer = toggleMultiple(answer, 3, true);
    expect(answer).toEqual({ kind: "multiple", indices: [0, 3] });
    expect(toggleMultiple(toggleMultiple(answer, 0, false), 3, false)).toBeNull();
  });

  it("numerical answers: integer, range only for decimals, unit, and nothing while not a number", () => {
    const base = { value: "", integer: true, range: false, low: "", high: "", unitEn: "", unitHi: "" };
    expect(numericalAnswer(base)).toBeNull();
    expect(numericalAnswer({ ...base, value: "abc" })).toBeNull();
    expect(numericalAnswer({ ...base, value: "-4" })).toEqual({ kind: "numerical", value: -4, integer: true });
    expect(numericalAnswer({ ...base, value: "2.32", integer: false, range: true, low: "2.30", high: "2.35", unitEn: "m/s", unitHi: "मी/से" })).toEqual({
      kind: "numerical",
      value: 2.32,
      integer: false,
      low: 2.3,
      high: 2.35,
      unit: { en: "m/s", hi: "मी/से" },
    });
    expect(numericalAnswer({ ...base, value: "7", range: true, low: "1", high: "9" })).toEqual({ kind: "numerical", value: 7, integer: true });
  });

  it("the patch carries only what changed, with the version guard; unticking an exam reaches the server", () => {
    const q = question();
    const original = formFromQuestion(q);
    const guard = { version: q.version, updatedAt: q.updatedAt };
    expect(toPatch(original, original, guard)).toBeNull();
    expect(isDirty(original, original)).toBe(false);

    const edited = { ...original, content: { ...original.content, stem: bi("Which of these is a scalar?") } };
    const patch = toPatch(edited, original, guard);
    expect(patch).toEqual({ baseVersion: 3, baseUpdatedAt: 2, content: edited.content });

    const unticked = { ...original, exams: original.exams.map((row) => (row.exam === "JEE_MAIN" ? { ...row, eligible: false } : row)) };
    expect(toPatch(unticked, original, guard)?.exams).toEqual([
      { exam: "JEE_MAIN", eligible: false, crossExam: false, difficulty: "easy", syllabus: "current", expectedTimeSec: 60 },
    ]);
    const neet = { ...original, exams: original.exams.map((row) => (row.exam === "NEET" ? { ...row, eligible: true, difficulty: "medium" as const } : row)) };
    expect(toPatch(neet, original, guard)?.exams?.map((row) => row.exam)).toEqual(["JEE_MAIN", "NEET"]);

    const blankRef = { ...original, source: { ...original.source, aspireRef: "   ", claimedSource: "" } };
    expect(toPatch(blankRef, original, guard)?.source).toEqual({ kind: "aspire" });
    expect(toCreateInput(blankRef).source).toEqual({ kind: "aspire" });
  });

  it("figure markers count within each slot, as <RichText> reads [[figure:N]]", () => {
    const fig = (slot: "stem" | "solution" | `option:${number}`, id: string) => ({ id: id.repeat(32).slice(0, 32), slot, alt: bi(""), width: 10, height: 10 });
    const figures = [fig("stem", "a"), fig("option:1", "b"), fig("stem", "c"), fig("solution", "d"), fig("option:1", "e")];
    expect(figures.map((_, index) => figureMarker(figures, index))).toEqual(["[[figure:1]]", "[[figure:1]]", "[[figure:2]]", "[[figure:1]]", "[[figure:2]]"]);
    expect(figurePosition(figures, 9)).toBe(0);
    expect(figureMarker(figures, 9)).toBe("");
  });

  it("create input: the subject only when there is no chapter", () => {
    const form = { ...emptyForm(), subject: "zoology" as const };
    expect(toCreateInput(form)).toMatchObject({ chapterId: null, subject: "zoology" });
    expect(toCreateInput({ ...form, chapterId: "zoo-molecular" })).not.toHaveProperty("subject");
  });
});

// ---------------------------------------------------------------------------------------------
describe("blueprint editor helpers", () => {
  const blueprint = {
    id: "bp_1",
    slot: "jee-main",
    version: 1,
    status: "draft",
    exam: "JEE_MAIN",
    title: bi("JEE Main"),
    summary: bi("75 questions"),
    parts: [
      {
        id: "p1",
        label: bi("Paper 1"),
        durationMinutes: 180,
        sections: (["maths", "physics", "chemistry"] as const).flatMap((subject) => [
          { id: `${subject}-a`, subject, label: bi(`${subject} A`), type: "single" as const, count: 20, marking: { correct: 4, wrong: -1 }, instructions: bi("") },
          { id: `${subject}-b`, subject, label: bi(`${subject} B`), type: "numerical" as const, answerFormat: "integer" as const, count: 5, marking: { correct: 4, wrong: -1 }, instructions: bi("") },
        ]),
      },
    ],
    difficultyMix: { easy: 30, medium: 50, hard: 20 },
    chapterLevels: ["class_11", "class_12"],
    chapterWeights: { mode: "past_papers", fromYear: 2024, fallbackYears: 10, halfLifeYears: 3, overrides: {} },
    sourcePolicy: { official: true, aspire: true, sample: "placeholder_only", officialMaxShare: null },
    crossExamMaxShare: 0.2,
    minShortRatio: 0.5,
    recentExclusionDays: 30,
    ranked: "monthly",
    languages: ["en", "hi"],
    compensatoryMinutes: 60,
    tieBreak: null,
    pattern: { year: 2026, sourceUrls: [], verifiedAt: "2026-10-22", reviewDueAt: "2026-11-15", note: bi("") },
    placeholder: false,
    patternConfirmedBy: null,
    signoff: null,
  } satisfies QbBlueprint;

  it("drops identity, status, placeholder, pattern confirmation and sign-off from the editable copy", () => {
    const editable = editableFromBlueprint(blueprint);
    for (const key of ["id", "slot", "version", "status", "exam", "placeholder", "patternConfirmedBy", "signoff"]) expect(editable).not.toHaveProperty(key);
    editable.parts[0].sections[0].count = 1;
    expect(blueprint.parts[0].sections[0].count).toBe(20);
  });

  it("JEE Main totals: 75 questions, 300 marks, 180 minutes; a section edit changes only that section", () => {
    const editable = editableFromBlueprint(blueprint);
    expect(blueprintTotals(editable)).toEqual({ questions: 75, marks: 300, minutes: 180 });
    const changed = updateSection(editable, 0, 1, { count: 10 });
    expect(blueprintTotals(changed)).toEqual({ questions: 80, marks: 320, minutes: 180 });
    expect(changed.parts[0].sections[0]).toBe(editable.parts[0].sections[0]);
  });

  it("percent inputs over 0–1 shares", () => {
    expect(shareToPercentText(0.2)).toBe("20");
    expect(shareToPercentText(null)).toBe("");
    expect(percentTextToShare("50")).toBe(0.5);
    expect(percentTextToShare("12.5")).toBe(0.125);
    expect(percentTextToShare("")).toBeNull();
    expect(percentTextToShare("140")).toBeUndefined();
    expect(percentTextToShare("abc")).toBeUndefined();
  });

  it("manual chapter weights: 'id = percent' lines, bad lines reported", () => {
    expect(parseOverrides("phy-units = 12\nchem-mole: 7.5\n\nbad line\nphy-x = 300")).toEqual({
      overrides: { "phy-units": 12, "chem-mole": 7.5 },
      invalid: ["bad line", "phy-x = 300"],
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("requests and failures", () => {
  it("builds the bulk and spot-check requests", () => {
    expect(qbRequests.bulkStart("approve", ["q_1", "q_2"], null)).toEqual({ path: "/api/admin/qb/questions/bulk", method: "POST", body: { action: "start", ids: ["q_1", "q_2"] } });
    expect(qbRequests.bulkStart("accept_ai_labels", ["q_1"], "NEET")).toEqual({
      path: "/api/admin/qb/questions/bulk-labels",
      method: "POST",
      body: { action: "start", op: "accept_ai_labels", exam: "NEET", ids: ["q_1"] },
    });
    expect(qbRequests.bulkCommit("confirm_syllabus", { batchId: "b1", checks: [] }).body).toEqual({ action: "commit", op: "confirm_syllabus", batchId: "b1", checks: [] });
    expect(qbRequests.getQuestion("q 1", "batch/1").path).toBe("/api/admin/qb/questions/q%201?spotCheck=batch%2F1");
    expect(qbRequests.listQuestions({ ...DEFAULT_QUESTION_FILTERS, queue: "flagged" }).path).toBe("/api/admin/qb/questions?queue=flagged");
    expect(qbRequests.confirmTaxonomy("JEE_MAIN", 2024).body).toEqual({ confirm: true, syllabusRevisionYear: 2024 });
    expect(qbRequests.chapters({ exam: "NEET", all: true }).path).toBe("/api/admin/qb/chapters?exam=NEET&all=true");
  });

  it("reads the envelope, keeping the 409 code and field messages", async () => {
    const ok = await readQbResponse<{ id: string }>(Response.json({ ok: true, data: { id: "q_1" } }));
    expect(ok).toEqual({ ok: true, status: 200, data: { id: "q_1" } });
    const conflict = await readQbResponse(Response.json({ ok: false, error: "bad_request", message: "x", code: "taxonomy_unconfirmed" }, { status: 409 }));
    expect(conflict).toMatchObject({ ok: false, status: 409, code: "taxonomy_unconfirmed" });
    const invalid = await readQbResponse(Response.json({ ok: false, error: "validation", message: "x", fieldErrors: { content: ["Give 2–6 options."], bad: "x" } }, { status: 422 }));
    expect(invalid).toMatchObject({ ok: false, error: "validation", fieldErrors: { content: ["Give 2–6 options."] } });
    const broken = await readQbResponse(new Response("<html>", { status: 502 }));
    expect(broken).toMatchObject({ ok: false, status: 502, error: "server_error", code: null });
  });

  it.each(["en", "hi"] as const)("localises failures by status and 409 code (%s)", (locale) => {
    const t = messagesFor(locale, "qb");
    const failure = (patch: Partial<QbFailure>): QbFailure => ({ ok: false, status: 400, error: "bad_request", code: null, fieldErrors: {}, message: null, ...patch });
    for (const code of QB_CONFLICT_CODES) expect(qbFailureMessage(failure({ status: 409, code }), t)).toBe(t.errors.codes[code]);
    expect(qbFailureMessage(failure({ status: 409, code: "something_new" }), t)).toBe(t.errors.conflict);
    expect(qbFailureMessage(failure({ status: 401, error: "unauthenticated" }), t)).toBe(t.errors.sessionExpired);
    expect(qbFailureMessage(failure({ status: 409, message: "Please change your temporary password before continuing." }), t)).toBe(t.errors.passwordChangeRequired);
    expect(qbFailureMessage(failure({ status: 403, error: "forbidden" }), t)).toBe(t.errors.forbidden);
    expect(qbFailureMessage(failure({ status: 413 }), t)).toBe(t.errors.tooLarge);
    expect(qbFailureMessage(failure({ status: 429, error: "rate_limited", retryAfterSeconds: 150 }), t)).toContain("3");
    expect(qbFailureMessage(failure({ status: 0, error: "network" }), t)).toBe(t.errors.network);
  });
});

// ---------------------------------------------------------------------------------------------
describe("small display helpers", () => {
  it.each(["en", "hi"] as const)("server blocker codes in words (%s)", (locale) => {
    const t = messagesFor(locale, "qb");
    expect(blockerLabel("flag:figure_needed", t)).toBe(t.flags.figure_needed);
    expect(blockerLabel("licence", t)).toBe(t.workflow.blockerCodes.licence);
    expect(blockerLabel("self_approval", t)).toBe(t.errors.codes.self_approval);
    expect(blockerLabel("taxonomy_unconfirmed", t)).toBe(t.errors.codes.taxonomy_unconfirmed);
    expect(blockerLabel("flag:made_up", t)).toBe("flag:made_up");
    expect(blockerLabel("something_new", t)).toBe("something_new");
  });

  it("previews, answer positions and figure sizes", () => {
    expect(previewText("  A  body\n of mass  ")).toBe("A body of mass");
    expect(previewText("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
    expect(positionShares([3, 1, 0, 0], 4)).toEqual([0.75, 0.25, 0, 0]);
    expect(positionShares([0, 0], 0)).toEqual([0, 0]);
    expect(scaledSize(1400, 700)).toEqual({ width: 700, height: 350 });
    expect(scaledSize(500, 300)).toEqual({ width: 500, height: 300 });
    expect(scaledSize(0, 10)).toEqual({ width: 0, height: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
describe("messages", () => {
  function leaves(value: unknown, prefix = "", out = new Map<string, unknown>()): Map<string, unknown> {
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
    } else {
      out.set(prefix, value);
    }
    return out;
  }
  const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("qb: Hindi has exactly the English keys, all non-empty strings with the same placeholders", () => {
    const en = leaves(messagesFor("en", "qb"));
    const hi = leaves(messagesFor("hi", "qb"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
  });

  it("honest wording: difficulty mixes are Aspire's choice, samples stay labelled", () => {
    const en = messagesFor("en", "qb");
    expect(en.blueprint.mixTitle).toMatch(/not official/);
    expect(en.common.sampleBadge).toBe("Sample");
    expect(en.sourceKinds.sample).toMatch(/demo/i);
    expect(en.blueprint.bohBanner).toMatch(/placeholder/);
  });

  it.each(["en", "hi"] as const)("portal keys for the question bank exist (%s)", (locale) => {
    const portal = messagesFor(locale, "portal");
    expect(portal.nav.questionBank.trim()).not.toBe("");
    expect(portal.navGroups.tests.trim()).not.toBe("");
    expect(portal.shell.qbAreaLabel.trim()).not.toBe("");
    expect(portal.shell.crmLink.trim()).not.toBe("");
  });
});

// ---------------------------------------------------------------------------------------------
describe("admin chrome for question-bank staff (§B6)", () => {
  it("admins keep the console; staff get the question bank, and console tools / a CRM link only with a CRM membership", () => {
    expect(adminChromeFor("admin", false)).toEqual({ staffMode: false, badgeHref: "/admin", showConsoleTools: true, navKeys: undefined, crmLink: false });
    expect(adminChromeFor(null, false).staffMode).toBe(false);
    expect(adminChromeFor("staff", false)).toEqual({ staffMode: true, badgeHref: "/admin/questions", showConsoleTools: false, navKeys: ["questionBank"], crmLink: false });
    expect(adminChromeFor("staff", true)).toMatchObject({ staffMode: true, showConsoleTools: true, crmLink: true });
    expect(QUESTION_BANK_HREF).toBe("/admin/questions");
    expect(portalAreas.admin.nav.find((item) => item.key === "questionBank")?.href).toBe(QUESTION_BANK_HREF);
  });

  it("staff miss the data-free preview banner on question-bank pages only; signed-out previews still show it", () => {
    const staff = { userId: "u_staff", role: "staff" as const, displayName: "Staff One" };
    expect(previewBannerMode(staff, "admin", true)).toBe("outside_question_bank");
    expect(previewBannerVisible(staff, "admin", true, "/admin/questions")).toBe(false);
    expect(previewBannerVisible(staff, "admin", true, "/admin/questions/review")).toBe(false);
    // Other admin pages are still a data-free preview for staff, so the banner says so.
    expect(previewBannerVisible(staff, "admin", true, "/admin/users")).toBe(true);
    expect(previewBannerVisible(staff, "admin", true, "/admin")).toBe(true);
    expect(previewBannerVisible(staff, "admin", true, "/admin/questionsx")).toBe(true);
    // Staff in the student and parent areas are treated like anyone else.
    expect(previewBannerMode(staff, "student", true)).toBe("shown");
    expect(previewBannerVisible(staff, "parent", true, "/parent")).toBe(true);
    expect(previewBannerMode(staff, "admin", false)).toBe("hidden");
    expect(previewBannerVisible(null, "admin", true, "/admin")).toBe(true);
    expect(previewBannerVisible(null, "admin", true, "/admin/questions")).toBe(true);
    expect(previewBannerVisible(null, "admin", false, "/admin")).toBe(false);
    expect(previewBannerVisible({ userId: "u_admin", role: "admin" }, "admin", true, "/admin")).toBe(false);
    expect(previewBannerVisible({ userId: "u_admin", role: "admin", mustChangePassword: true }, "admin", true, "/admin")).toBe(false);
    expect(previewBannerVisible({ userId: "u_s", role: "student" }, "parent", true, "/parent")).toBe(true);
  });

  it("question-bank paths are /admin/questions and below, locale-free", () => {
    expect(["/admin/questions", "/admin/questions/new", "/admin/questions/q_1"].every(isQuestionBankPath)).toBe(true);
    expect(["/admin", "/admin/questionsx", "/admin/users", "/hi/admin/questions"].some(isQuestionBankPath)).toBe(false);
  });

  it.each(["en", "hi"] as const)("a staff session's admin nav is the question bank only (%s)", (locale) => {
    const portal = messagesFor(locale, "portal");
    const prefix = locale === "hi" ? "/hi" : "";
    const html = renderToStaticMarkup(
      createElement(PortalNavLinks, {
        area: "admin",
        locale,
        messages: navMessages(portal, "admin", messagesFor(locale, "crm")),
        visibleKeys: QUESTION_BANK_NAV_KEYS,
        pathname: `${prefix}/admin/questions/review`,
      }),
    );
    expect(html).toContain(`href="${prefix}/admin/questions"`);
    expect(html).toContain(portal.nav.questionBank);
    expect(html).toContain(portal.navGroups.tests.replace(/&/g, "&amp;"));
    for (const path of ["/admin/users", "/admin/audit", "/admin/mcp", "/crm", "/admin/website", "/admin/coming"]) expect(html, path).not.toContain(`href="${prefix}${path}"`);
    // The question bank stays current on its sub-pages.
    expect(html).toMatch(new RegExp(`<a [^>]*href="${prefix}/admin/questions"[^>]*aria-current="page"|<a [^>]*aria-current="page"[^>]*href="${prefix}/admin/questions"`));
  });
});
