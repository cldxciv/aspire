import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_QUESTIONS } from "@/content/mocktest";
import { MOCK_TOPICS } from "@/content/mocktest/topics";
import { MEMORY_DB_PATH, openDatabase } from "@/lib/db/connection";
import { blueprintAction, publishBlockers, validateBlueprint } from "@/lib/qb/blueprints";
import { fingerprintOf } from "@/lib/qb/fingerprint";
import { generatePaper, readiness } from "@/lib/qb/generator";
import { sourceLabel } from "@/lib/qb/labels";
import { contentMathProblems } from "@/lib/qb/math-check";
import { blueprintTotals, defaultBlueprint } from "@/lib/qb/patterns";
import { parseRichText, richTextIssues } from "@/lib/qb/rich-text";
import { searchQuestionIds } from "@/lib/qb/search";
import { isOfficialSourceUrl } from "@/lib/qb/taxonomy";
import { QB_SLOTS, type QbBlueprint, type QbPoolItem, type QbQuestionContent, type QbViewer } from "@/lib/qb/types";

import { BIOLOGY_BLOCK_UNVERIFIED, chapterExamStatus, chapterUnits, MULTI_CLASS_CHAPTER_IDS, SEED_CHAPTERS } from "./chapters";
import { ensureQbSeeded, resetQbSeedMemo, resetQbSeedMemoForTests, SEED_MARKERS } from "./index";
import { RESERVED_QUESTION_IDS, SAMPLE_CHAPTER_OVERRIDES, SAMPLE_SOLUTION_REVIEW, seedSamples } from "./samples";
import { SEED_UNITS, UNIT_SOURCES } from "./units";

// QB-SEED. In-memory databases with the real core migrations + feature schemas (incl. qb).
const NOW = Date.UTC(2026, 9, 22, 6, 0, 0);
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(MEMORY_DB_PATH);
});
afterEach(() => {
  if (db.isOpen) db.close();
  vi.unstubAllEnvs();
});

const count = (sql: string, ...params: (string | number)[]) => Number(db.prepare(sql).get(...params)?.n ?? 0);
const setting = (key: string) => {
  const row = db.prepare("SELECT value FROM qb_settings WHERE key = ?").get(key);
  return row ? (JSON.parse(String(row.value)) as unknown) : undefined;
};

describe("ensureQbSeeded", () => {
  it("is idempotent: a second run (new memo, same database) inserts nothing", () => {
    const first = ensureQbSeeded(db, { now: NOW, placeholder: true });
    expect(first.units.inserted).toBe(SEED_UNITS.length);
    expect(first.chapters.inserted).toBe(SEED_CHAPTERS.length);
    expect(first.blueprints.inserted).toHaveLength(QB_SLOTS.length);
    expect(first.samples.inserted).toBe(MOCK_QUESTIONS.length);

    const tables = ["qb_units", "qb_chapters", "qb_blueprints", "qb_questions", "qb_question_exams", "qb_question_versions", "qb_pool", "qb_events"];
    const before = tables.map((t) => count(`SELECT COUNT(*) AS n FROM ${t}`));

    expect(ensureQbSeeded(db, { now: NOW + 1, placeholder: true })).toBe(first); // memoized per connection
    resetQbSeedMemoForTests(db);
    const second = ensureQbSeeded(db, { now: NOW + 2, placeholder: true });
    expect(second.units).toMatchObject({ inserted: 0, skipped: true });
    expect(second.chapters).toMatchObject({ inserted: 0, skipped: true });
    expect(second.blueprints).toMatchObject({ inserted: [], skipped: true });
    expect(second.samples).toMatchObject({ inserted: 0, skipped: "already_seeded" });
    expect(tables.map((t) => count(`SELECT COUNT(*) AS n FROM ${t}`))).toEqual(before);
  });

  it("seeds once across two connections to the same file (markers, one transaction)", () => {
    const dir = mkdtempSync(join(tmpdir(), "qb-seed-"));
    try {
      const path = join(dir, "seed.sqlite");
      const a = openDatabase(path);
      const b = openDatabase(path);
      try {
        ensureQbSeeded(a, { now: NOW, placeholder: true });
        const again = ensureQbSeeded(b, { now: NOW, placeholder: true });
        expect(again.samples.inserted).toBe(0);
        expect(Number(b.prepare("SELECT COUNT(*) AS n FROM qb_questions").get()?.n)).toBe(MOCK_QUESTIONS.length);
      } finally {
        a.close();
        b.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never overwrites staff edits and never re-creates what staff removed", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    db.prepare("UPDATE qb_chapters SET label_en = 'Edited by staff' WHERE id = 'phy-units'").run();
    db.prepare("DELETE FROM qb_units WHERE id = 'JEE_MAIN:2026:physics:01'").run();
    db.prepare("UPDATE qb_questions SET status = 'retired' WHERE id = 'jee-p-01'").run();
    resetQbSeedMemoForTests(db);
    ensureQbSeeded(db, { now: NOW + 1, placeholder: true });
    expect(db.prepare("SELECT label_en FROM qb_chapters WHERE id = 'phy-units'").get()?.label_en).toBe("Edited by staff");
    expect(count("SELECT COUNT(*) AS n FROM qb_units WHERE id = 'JEE_MAIN:2026:physics:01'")).toBe(0);
    expect(db.prepare("SELECT status FROM qb_questions WHERE id = 'jee-p-01'").get()?.status).toBe("retired");
  });

  it("re-seeds a part only after its marker is deleted AND the memo is reset (restart or resetQbSeedMemo)", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    const unitId = "JEE_MAIN:2026:physics:01";
    db.prepare("DELETE FROM qb_units WHERE id = ?").run(unitId);
    db.prepare("DELETE FROM qb_settings WHERE key = ?").run(SEED_MARKERS.units);
    // Same process, memo still set: nothing happens.
    expect(ensureQbSeeded(db, { now: NOW + 1, placeholder: true }).units.inserted).toBe(SEED_UNITS.length); // the memoized first report
    expect(count("SELECT COUNT(*) AS n FROM qb_units WHERE id = ?", unitId)).toBe(0);
    // Forget every connection's memo (no argument): the deleted part is seeded again, nothing else.
    resetQbSeedMemo();
    const again = ensureQbSeeded(db, { now: NOW + 2, placeholder: true });
    expect(again.units).toMatchObject({ inserted: 1, skipped: false });
    expect(again.chapters).toMatchObject({ inserted: 0, skipped: true });
    expect(again.samples).toMatchObject({ inserted: 0, skipped: "already_seeded" });
    expect(count("SELECT COUNT(*) AS n FROM qb_units WHERE id = ?", unitId)).toBe(1);
    expect(setting(SEED_MARKERS.units)).toBeDefined();
  });

  it("writes markers but never confirms a taxonomy or publishes a blueprint", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    for (const key of Object.values(SEED_MARKERS)) expect(setting(key), key).toBeDefined();
    expect(count("SELECT COUNT(*) AS n FROM qb_settings WHERE key LIKE 'taxonomy.%'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM qb_blueprints WHERE status <> 'draft'")).toBe(0);
    expect(setting(SEED_MARKERS.reservedIds)).toEqual(["neet-z-01"]);
    expect(setting(SEED_MARKERS.blockUnverified)).toEqual(BIOLOGY_BLOCK_UNVERIFIED);
    expect(Number(db.prepare("SELECT value FROM qb_settings WHERE key = 'bank.revision'").get()?.value)).toBeGreaterThan(0);
  });
});

describe("samples", () => {
  it("seeds exactly the content files' samples, labelled sample, approved v1 — never official", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE source_kind = 'sample'")).toBe(MOCK_QUESTIONS.length);
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE source_kind <> 'sample'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE status <> 'approved' OR version <> 1 OR approved_version <> 1")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE source_year IS NOT NULL OR source_exam IS NOT NULL OR source_paper_key IS NOT NULL")).toBe(0);
    for (const row of db.prepare("SELECT source, fidelity FROM qb_questions").all()) {
      const source = JSON.parse(String(row.source));
      expect(source).toEqual({ kind: "sample" });
      expect(sourceLabel({ source, fidelity: null }, "en")).toMatch(/sample/i);
    }
    const ids = new Set(db.prepare("SELECT id FROM qb_questions").all().map((r) => String(r.id)));
    expect(ids).toEqual(new Set(MOCK_QUESTIONS.map((q) => q.id)));
    // No two samples are exact duplicates of each other.
    expect(count("SELECT COUNT(DISTINCT fingerprint) AS n FROM qb_questions")).toBe(MOCK_QUESTIONS.length);
  });

  it("records that sample solutions were checked by build agents, not Aspire staff", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    const events = db.prepare("SELECT question_id, actor_id, details FROM qb_events WHERE action = 'seeded'").all();
    expect(events).toHaveLength(MOCK_QUESTIONS.length);
    for (const event of events) {
      expect(event.actor_id).toBeNull();
      expect(JSON.parse(String(event.details))).toMatchObject({
        sourceKind: "sample",
        solutionReviewedBy: SAMPLE_SOLUTION_REVIEW.reviewedBy,
        solutionNote: SAMPLE_SOLUTION_REVIEW.note,
      });
    }
    expect(SAMPLE_SOLUTION_REVIEW.note).toMatch(/not reviewed by Aspire staff/);
    // No sample claims a staff review anywhere else: no approver, no staff solution source.
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE approved_by IS NOT NULL OR created_by IS NOT NULL")).toBe(0);
    for (const row of db.prepare("SELECT content FROM qb_questions").all()) {
      expect((JSON.parse(String(row.content)) as QbQuestionContent).solutionSource).toBe("ai_draft_reviewed");
    }
  });

  it("never seeds the withdrawn neet-z-01 (its id stays reserved)", () => {
    expect(RESERVED_QUESTION_IDS).toContain("neet-z-01");
    expect(MOCK_QUESTIONS.some((q) => q.id === "neet-z-01")).toBe(false);
    const withWithdrawn = seedSamples([...MOCK_QUESTIONS, { ...MOCK_QUESTIONS[0], id: "neet-z-01" }]);
    expect(withWithdrawn.some((s) => s.id === "neet-z-01")).toBe(false);
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    expect(count("SELECT COUNT(*) AS n FROM qb_questions WHERE id = 'neet-z-01'")).toBe(0);
  });

  it("no sample is seeded or pooled while placeholder content is off (env switch)", () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const report = ensureQbSeeded(db, { now: NOW });
    expect(report.samples.skipped).toBe("placeholder_off");
    expect(count("SELECT COUNT(*) AS n FROM qb_questions")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM qb_pool")).toBe(0);
    expect(setting(SEED_MARKERS.samples)).toBeUndefined();
    // Taxonomy and draft blueprints are still seeded.
    expect(count("SELECT COUNT(*) AS n FROM qb_units")).toBe(SEED_UNITS.length);
    expect(count("SELECT COUNT(*) AS n FROM qb_blueprints")).toBe(QB_SLOTS.length);

    // Turning placeholder content on later seeds the samples then.
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    expect(ensureQbSeeded(db, { now: NOW + 1 }).samples.inserted).toBe(MOCK_QUESTIONS.length);
  });

  it("keeps the content: answers, units, solutions, per-exam rows and an approved snapshot", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    for (const question of MOCK_QUESTIONS) {
      const row = db.prepare("SELECT * FROM qb_questions WHERE id = ?").get(question.id);
      expect(row, question.id).toBeDefined();
      const content = JSON.parse(String(row?.content)) as QbQuestionContent;
      expect(content.stem).toEqual(question.stem);
      expect(content.solution).toEqual(question.solution);
      if (question.type === "mcq") {
        expect(content.type).toBe("single");
        expect(content.options).toEqual(question.options);
        expect(content.answer).toEqual({ kind: "single", index: question.answer });
      } else {
        expect(content.type).toBe("numerical");
        expect(content.answer).toMatchObject({ kind: "numerical", value: question.answer, integer: question.tolerance === 0 });
        if (question.unit) expect(content.answer).toMatchObject({ unit: question.unit });
      }
      expect(content.hiSource).toBe("machine_draft");
      expect(JSON.parse(String(row?.flags))).toEqual(["hi_machine"]);
      expect(row?.fingerprint).toBe(fingerprintOf(content));

      const chapterId = SAMPLE_CHAPTER_OVERRIDES[question.id]?.chapterId ?? question.topic;
      expect(row?.chapter_id).toBe(chapterId);
      expect(row?.subject).toBe(question.subject);

      const exams = db.prepare("SELECT * FROM qb_question_exams WHERE question_id = ?").all(question.id);
      expect(exams).toHaveLength(1);
      expect(exams[0]).toMatchObject({ exam: question.exam, difficulty: question.difficulty, difficulty_source: "sample", syllabus: "current", eligible: 1, cross_exam: 0 });

      const version = db.prepare("SELECT snapshot FROM qb_question_versions WHERE question_id = ? AND version = 1").get(question.id);
      const snapshot = JSON.parse(inflateRawSync(version?.snapshot as Uint8Array).toString("utf8"));
      expect(snapshot).toEqual({ content, passage: null, subject: question.subject, chapterId, source: { kind: "sample" }, fidelity: null, adaptedNote: null });
    }
  });

  it("puts every sample in qb_pool for its exam, from the snapshot facts", () => {
    const report = ensureQbSeeded(db, { now: NOW, placeholder: true });
    expect(report.samples.notCurrent).toEqual([]);
    expect(report.samples.noChapter).toEqual([]);
    const rows = db.prepare("SELECT p.*, c.level AS chapter_level FROM qb_pool p JOIN qb_chapters c ON c.id = p.chapter_id").all();
    expect(rows).toHaveLength(MOCK_QUESTIONS.length);
    for (const row of rows) {
      const question = MOCK_QUESTIONS.find((q) => q.id === row.question_id)!;
      expect(row).toMatchObject({
        exam: question.exam,
        version: 1,
        source_kind: "sample",
        hi_ok: 0,
        cross_exam: 0,
        has_figures: 0,
        adapted: 0,
        cluster_id: question.id,
        answer_integer: question.type === "numerical" ? 1 : 0,
        level: row.chapter_level,
      });
    }
    // The pool's n matches the question's n (packed paper items use it).
    expect(count("SELECT COUNT(*) AS n FROM qb_pool p JOIN qb_questions q ON q.id = p.question_id WHERE p.n <> q.n")).toBe(0);
  });

  it("make an honest short JEE Main practice set in placeholder mode, and nothing otherwise", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    const poolFor = (exam: string): QbPoolItem[] =>
      db.prepare("SELECT * FROM qb_pool WHERE exam = ?").all(exam).map((row) => ({
      id: String(row.question_id),
      n: Number(row.n),
      version: Number(row.version),
      subject: row.subject as QbPoolItem["subject"],
      chapterId: String(row.chapter_id),
      level: row.level as QbPoolItem["level"],
      type: row.type as QbPoolItem["type"],
      format: row.format as QbPoolItem["format"],
      integer: row.answer_integer === 1,
      difficulty: row.difficulty as QbPoolItem["difficulty"],
      sourceKind: row.source_kind as QbPoolItem["sourceKind"],
      sourceYear: null,
      crossExam: row.cross_exam === 1,
      hiOk: row.hi_ok === 1,
      clusterId: String(row.cluster_id),
      passageId: null,
      passageOrder: null,
      exposures: 0,
      adapted: false,
    }));
    const input = (slot: "jee-main" | "neet-ug", placeholderMode: boolean) => ({
      blueprint: defaultBlueprint(slot),
      pool: poolFor(slot === "jee-main" ? "JEE_MAIN" : "NEET"),
      weights: {},
      formatTargets: {},
      placeholderMode,
    });

    // 15 samples per JEE subject (12 MCQ + 3 integer numericals) against 20 + 5: 60 % of the real paper.
    const jee = readiness(input("jee-main", true));
    expect(jee.level).toBe("short");
    expect(jee.byLanguage.hi).toBe("thin"); // machine-drafted Hindi is never used on its own
    const paper = generatePaper({ ...input("jee-main", true), softExclude: new Set<string>(), mode: "practice", seed: "seed-test" });
    expect(paper.ok).toBe(true);
    if (paper.ok) {
      expect(paper.short).toBe(true);
      expect(paper.composition.bySource).toMatchObject({ sample: paper.composition.total, official: 0, aspire: 0 });
      expect(paper.composition.total).toBe(45);
      for (const section of paper.parts[0].sections) {
        if (section.sectionId.endsWith("-b")) expect(section.items.every((item) => item.type === "numerical" && item.integer)).toBe(true);
      }
    }
    expect(readiness(input("neet-ug", true)).level).toBe("thin"); // 10 per subject against 45
    expect(readiness(input("jee-main", false)).level).toBe("thin"); // samples only in placeholder mode
  });

  it("are findable in the admin search", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: true });
    expect(searchQuestionIds(db, "tidal volume").ids).toContain("neet-z-02");
    expect(searchQuestionIds(db, "jee-p-01").ids).toContain("jee-p-01");
  });

  it("parses with no math_error, no rich-text issue and no accidental table", () => {
    for (const sample of seedSamples()) {
      expect(contentMathProblems(sample.content), sample.id).toEqual([]);
      const fields = [sample.content.stem, sample.content.solution, ...sample.content.options].flatMap((b) => [b.en, b.hi]);
      for (const text of fields) {
        expect(richTextIssues(text), `${sample.id}: ${text.slice(0, 40)}`).toEqual([]);
        expect(parseRichText(text).some((segment) => segment.kind === "table"), sample.id).toBe(false);
      }
    }
  });
});

describe("taxonomy", () => {
  it("every unit is official, cited and uniquely numbered", () => {
    const ids = new Set<string>();
    for (const unit of SEED_UNITS) {
      expect(ids.has(unit.id), unit.id).toBe(false);
      ids.add(unit.id);
      expect(unit.sourceUrl).toMatch(/^https:\/\//);
      expect(new URL(unit.sourceUrl).hostname).toMatch(/^(cdnbbsr\.s3waas\.gov\.in|jeeadv\.ac\.in)$/);
      expect(isOfficialSourceUrl(unit.sourceUrl)).toBe(true);
      expect(unit.sourceUrl).toBe(UNIT_SOURCES[unit.exam].url);
      expect(new URL(UNIT_SOURCES[unit.exam].linkedFrom).hostname).toMatch(/(^|\.)(nta\.nic\.in|nta\.ac\.in|jeeadv\.ac\.in)$/);
      // The S3WaaS host is accepted only for a file linked from an NTA site (plan §B14.3 allowlist).
      if (new URL(unit.sourceUrl).hostname === "cdnbbsr.s3waas.gov.in") {
        expect(new URL(UNIT_SOURCES[unit.exam].linkedFrom).hostname).toMatch(/(^|\.)nta\.nic\.in$/);
        expect(unit.sourceRef).toContain(`linked from ${UNIT_SOURCES[unit.exam].linkedFrom}`);
      }
      expect(unit.sourceRef.length).toBeGreaterThan(10);
      expect(unit.labelEn.trim()).toBe(unit.labelEn);
      expect(unit.id).toBe(`${unit.exam}:2026:${unit.subject}:${String(unit.sort).padStart(2, "0")}`);
    }
    const perExam = (exam: string) => SEED_UNITS.filter((u) => u.exam === exam).length;
    expect(perExam("JEE_MAIN")).toBe(14 + 20 + 20);
    expect(perExam("NEET")).toBe(20 + 20 + 10);
    expect(perExam("JEE_ADV")).toBe(37 + 9 + 7);
    expect(SEED_UNITS.some((u) => u.exam === ("BOH" as string))).toBe(false);
  });

  it("stores every unit with its source URL", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: false });
    expect(count("SELECT COUNT(*) AS n FROM qb_units")).toBe(SEED_UNITS.length);
    expect(count("SELECT COUNT(*) AS n FROM qb_units WHERE source_url NOT LIKE 'https://%' OR source_ref = ''")).toBe(0);
  });

  it("keeps every MOCK_TOPICS id as a chapter of the same subject", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: false });
    for (const [id, topic] of Object.entries(MOCK_TOPICS)) {
      const row = db.prepare("SELECT subject, origin FROM qb_chapters WHERE id = ?").get(id);
      expect(row, id).toMatchObject({ subject: topic.subject, origin: "seed" });
    }
  });

  it("maps chapters to existing units and derives exam_status from them", () => {
    const unitIds = new Set(SEED_UNITS.map((u) => u.id));
    const chapterIds = new Set<string>();
    for (const chapter of SEED_CHAPTERS) {
      expect(chapterIds.has(chapter.id), chapter.id).toBe(false);
      chapterIds.add(chapter.id);
      expect(["physics", "chemistry", "maths", "botany", "zoology"]).toContain(chapter.subject);
      expect(["class_11", "class_12"]).toContain(chapter.level); // never BOH levels, never "general"
      expect(chapter.label.en.length).toBeGreaterThan(2);
      expect(chapter.label.hi.length).toBeGreaterThan(1);
      const units = chapterUnits(chapter);
      const status = chapterExamStatus(chapter);
      expect(status.BOH).toBeUndefined();
      for (const [exam, ids] of Object.entries(units)) {
        expect(status[exam as keyof typeof status]).toBe("current");
        for (const id of ids ?? []) {
          expect(unitIds.has(id), `${chapter.id} → ${id}`).toBe(true);
          expect(id.startsWith(`${exam}:`)).toBe(true);
        }
      }
      const biology = chapter.subject === "botany" || chapter.subject === "zoology";
      expect(Object.keys(status).sort()).toEqual(biology ? ["NEET"] : chapter.subject === "maths" ? ["JEE_ADV", "JEE_MAIN"] : ["JEE_ADV", "JEE_MAIN", "NEET"]);
    }
    // Every official unit is covered by at least one chapter.
    const covered = new Set(SEED_CHAPTERS.flatMap((c) => Object.values(chapterUnits(c)).flat()));
    expect(SEED_UNITS.filter((u) => !covered.has(u.id)).map((u) => u.id)).toEqual([]);
  });

  it("flags every biology chapter 'verify against a booklet' and seeds no BOH or mental-ability chapter", () => {
    const biology = SEED_CHAPTERS.filter((c) => c.subject === "botany" || c.subject === "zoology").map((c) => c.id);
    expect(BIOLOGY_BLOCK_UNVERIFIED).toEqual(biology);
    expect(SEED_CHAPTERS.some((c) => c.subject === "mental_ability" || c.subject === "biology")).toBe(false);
  });

  it("lists the chapters that span both NCERT classes but carry one level (known limitation)", () => {
    expect([...MULTI_CLASS_CHAPTER_IDS].sort()).toEqual(
      ["chem-p-block", "chem-practical", "chem-redox", "math-3d", "math-limits", "math-probability", "math-sets", "math-trigonometry", "phy-experimental"].sort(),
    );
    for (const id of MULTI_CLASS_CHAPTER_IDS) {
      expect(["class_11", "class_12"]).toContain(SEED_CHAPTERS.find((c) => c.id === id)?.level);
    }
  });

  it("samples whose topic was split land in a finer chapter of the same subject", () => {
    for (const [id, override] of Object.entries(SAMPLE_CHAPTER_OVERRIDES)) {
      const question = MOCK_QUESTIONS.find((q) => q.id === id)!;
      const chapter = SEED_CHAPTERS.find((c) => c.id === override.chapterId)!;
      expect(chapter.subject).toBe(question.subject);
    }
  });
});

describe("blueprints", () => {
  const stored = (): QbBlueprint[] =>
    db.prepare("SELECT definition, status, version, slot, id FROM qb_blueprints ORDER BY slot").all().map((row) => {
      expect(row.status).toBe("draft");
      expect(row.version).toBe(1);
      const definition = JSON.parse(String(row.definition)) as QbBlueprint;
      expect(definition.slot).toBe(row.slot);
      expect(definition.id).toBe(row.id);
      return definition;
    });

  it("seeds the four defaults as v1 drafts equal to patterns.ts", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: false });
    const blueprints = stored();
    expect(blueprints.map((b) => b.slot).sort()).toEqual([...QB_SLOTS].sort());
    for (const blueprint of blueprints) expect(blueprint).toEqual(defaultBlueprint(blueprint.slot));
  });

  it("matches the official totals; BOH is a placeholder", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: false });
    const bySlot = Object.fromEntries(stored().map((b) => [b.slot, b]));
    const jeeMain = blueprintTotals(bySlot["jee-main"]);
    expect([jeeMain.questions, jeeMain.marks, jeeMain.minutes]).toEqual([75, 300, 180]);
    const neet = blueprintTotals(bySlot["neet-ug"]);
    expect([neet.questions, neet.marks, neet.minutes]).toEqual([180, 720, 180]);
    const adv = blueprintTotals(bySlot["jee-adv"]);
    expect(adv.parts.map((p) => [p.questions, p.marks, p.minutes])).toEqual([
      [48, 180, 180],
      [54, 180, 180],
    ]);
    expect(bySlot["boh-class-10"].placeholder).toBe(true);
    expect(bySlot["boh-class-10"].patternConfirmedBy).toBeNull();
    for (const slot of ["jee-main", "neet-ug", "jee-adv"]) expect(bySlot[slot].placeholder).toBe(false);
  });

  it("validate (QB-CORE-B rules) and stay unpublishable until an admin acts; BOH needs its pattern confirmed", () => {
    ensureQbSeeded(db, { now: NOW, placeholder: false });
    const admin: QbViewer = { userId: "u-admin", displayName: "Admin", role: "admin", subjects: [] };
    for (const blueprint of stored()) {
      expect(validateBlueprint(blueprint), blueprint.slot).toEqual([]);
      const codes = publishBlockers(db, blueprint).map((b) => b.code);
      expect(codes, blueprint.slot).toContain("taxonomy_unconfirmed"); // the seed never confirms a taxonomy
      if (blueprint.slot === "boh-class-10") expect(codes).toContain("placeholder_blueprint");
      else expect(codes).not.toContain("placeholder_blueprint");
    }
    // Even with BOH's taxonomy confirmed, the placeholder BOH blueprint cannot be published.
    db.prepare("INSERT INTO qb_settings (key, value, updated_at) VALUES ('taxonomy.BOH.confirmed', 'true', ?)").run(NOW);
    const boh = stored().find((b) => b.slot === "boh-class-10")!;
    expect(publishBlockers(db, boh).map((b) => b.code)).toEqual(["placeholder_blueprint"]);
    const result = blueprintAction(admin, boh.id, { action: "publish" }, NOW, db);
    expect(result).toMatchObject({ ok: false, error: "conflict", code: "placeholder_blueprint" });
    expect(count("SELECT COUNT(*) AS n FROM qb_blueprints WHERE status = 'published'")).toBe(0);
  });

  it("does not add a draft for a slot staff already have", () => {
    db.prepare(
      "INSERT INTO qb_blueprints (id, slot, version, status, definition, created_at, updated_at) VALUES ('bp_staff', 'jee-main', 1, 'draft', '{}', ?, ?)",
    ).run(NOW, NOW);
    const report = ensureQbSeeded(db, { now: NOW, placeholder: false });
    expect(report.blueprints.inserted).not.toContain("bp_jee_main_v1");
    expect(count("SELECT COUNT(*) AS n FROM qb_blueprints WHERE slot = 'jee-main'")).toBe(1);
  });
});
