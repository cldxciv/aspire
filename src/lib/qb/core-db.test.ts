import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { applyFeatureSchemas, CORE_MIGRATION_SQL, MEMORY_DB_PATH, openDatabase, SCHEMA_VERSION } from "@/lib/db/connection";
import { FEATURE_SCHEMAS } from "@/lib/db/features";
import { schema as qbSchema } from "@/lib/db/features/qb";

import { checkTex, contentMathProblems, mathProblemsIn } from "./math-check";
import {
  answerSchema,
  blueprintDefinitionSchema,
  bulkSchema,
  contentSchema,
  importMetaSchema,
  paperCreateSchema,
  questionActionSchema,
  unitUpsertSchema,
} from "./schemas";
import { defaultBlueprint } from "./patterns";

// Schema (applies twice, and on a database migrated from the old core schema), the server math check
// and the request schemas. Synthetic data only.

const QB_TABLES = [
  "qb_members",
  "qb_units",
  "qb_chapters",
  "qb_passages",
  "qb_questions",
  "qb_question_exams",
  "qb_question_versions",
  "qb_pool",
  "qb_item_stats",
  "qb_score_hist",
  "qb_events",
  "qb_dup_pairs",
  "qb_figures",
  "qb_figure_refs",
  "qb_imports",
  "qb_import_items",
  "qb_key_corrections",
  "qb_reports",
  "qb_blueprints",
  "qb_windows",
  "qb_papers",
  "qb_attempt_papers",
  "qb_settings",
];

function tables(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'qb_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));
}

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("qb schema", () => {
  it("is registered after the other features and applies twice cleanly", () => {
    expect(FEATURE_SCHEMAS[FEATURE_SCHEMAS.length - 1]).toEqual({ name: "qb", sql: qbSchema });
    const db = openDatabase(MEMORY_DB_PATH);
    applyFeatureSchemas(db);
    applyFeatureSchemas(db);
    expect(tables(db)).toEqual([...QB_TABLES].sort());
    expect(qbSchema).not.toMatch(/ALTER TABLE|DROP|CREATE VIRTUAL/i);
    db.close();
  });

  it("applies after the M7 users rebuild on an old database, keeping foreign keys valid", () => {
    dir = mkdtempSync(join(tmpdir(), "qb-schema-"));
    const path = join(dir, "old.sqlite");
    const old = new DatabaseSync(path);
    old.exec("PRAGMA foreign_keys = ON");
    old.exec(CORE_MIGRATION_SQL[0]);
    old.exec("PRAGMA user_version = 1");
    for (const { name, sql } of FEATURE_SCHEMAS) if (name !== "crm" && name !== "qb" && sql.trim()) old.exec(sql);
    old.prepare(
      "INSERT INTO users (id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at) VALUES ('u1','admin','A','a.one','x',0,0,1,1)",
    ).run();
    old.close();

    const db = openDatabase(path);
    expect(Number(db.prepare("PRAGMA user_version").get()?.user_version)).toBe(SCHEMA_VERSION);
    expect(tables(db)).toEqual([...QB_TABLES].sort());
    db.prepare("INSERT INTO qb_members (user_id, qb_role, created_at, updated_at) VALUES ('u1', 'reviewer', 1, 1)").run();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    // Ranked papers need a student and a window.
    expect(() =>
      db
        .prepare(
          `INSERT INTO qb_papers (id, token_hash, kind, slot, test_id, blueprint_id, blueprint_version, seed, items, composition,
            duration_minutes, max_score, question_count, created_at, expires_at)
           VALUES ('p1', 'h', 'ranked', 'jee-main', 'bp-jee-main-ranked', 'b', 1, 's', x'', '{}', 180, 300, 75, 1, 2)`,
        )
        .run(),
    ).toThrow();
    db.close();
  });
});

describe("math check (server)", () => {
  it("passes mhchem and Devanagari inside \\text{}", () => {
    expect(checkTex("\\ce{H2O}")).toBeNull();
    expect(checkTex("\\ce{2H2 + O2 -> 2H2O}")).toBeNull();
    expect(checkTex("\\text{बल} = ma")).toBeNull();
    expect(checkTex("\\frac{1}{2}mv^2", true)).toBeNull();
  });

  it("flags bad LaTeX in any field and language", () => {
    expect(checkTex("\\frac{1}{")).not.toBeNull();
    expect(checkTex("\\undefinedmacro{x}")).not.toBeNull();
    expect(mathProblemsIn("ok \\(x^2\\) bad \\(\\frac{1}\\)", "stem.en")).toHaveLength(1);
    const problems = contentMathProblems({
      stem: { en: "Find \\(x\\)", hi: "\\(\\sqrt{\\)" },
      options: [
        { en: "\\(1\\)", hi: "\\(1\\)" },
        { en: "\\(2^{\\)", hi: "\\(2\\)" },
      ],
      solution: { en: "", hi: "" },
    });
    expect(problems.map((p) => p.field).sort()).toEqual(["options.1.en", "stem.hi"]);
  });
});

describe("request schemas", () => {
  const content = {
    type: "single",
    format: "standard",
    passageId: null,
    passageOrder: null,
    stem: { en: "Which is largest?", hi: "" },
    options: [
      { en: "1", hi: "1" },
      { en: "2", hi: "2" },
    ],
    answer: { kind: "single", index: 1 },
    solution: { en: "", hi: "" },
    solutionSource: "none",
    hiSource: "none",
    figures: [],
    topics: [],
  };

  it("validates content and answers", () => {
    expect(contentSchema.safeParse(content).success).toBe(true);
    expect(contentSchema.safeParse({ ...content, answer: { kind: "single", index: 3 } }).success).toBe(false);
    expect(contentSchema.safeParse({ ...content, answer: { kind: "multiple", indices: [0] } }).success).toBe(false);
    expect(contentSchema.safeParse({ ...content, options: [{ en: "1", hi: "" }] }).success).toBe(false);
    expect(answerSchema.safeParse({ kind: "numerical", value: 2.5, integer: true }).success).toBe(false);
    expect(answerSchema.safeParse({ kind: "numerical", value: 2.5, low: 2.4, high: 2.6, integer: false }).success).toBe(true);
    expect(answerSchema.safeParse({ kind: "numerical", value: 2.5, low: 2.4, integer: false }).success).toBe(false);
    expect(answerSchema.safeParse({ kind: "multiple", indices: [1, 1] }).success).toBe(false);
  });

  it("validates actions, bulk bodies, units, imports and papers", () => {
    expect(questionActionSchema.safeParse({ action: "retire" }).success).toBe(false);
    expect(questionActionSchema.safeParse({ action: "retire", reason: "duplicate of q_x" }).success).toBe(true);
    expect(bulkSchema.safeParse({ action: "start", kind: "approve", ids: Array.from({ length: 201 }, (_, i) => `q${i}`) }).success).toBe(false);
    expect(bulkSchema.safeParse({ action: "start", kind: "syllabus_current", ids: ["q1"] }).success).toBe(false);
    expect(
      unitUpsertSchema.safeParse({
        exam: "JEE_MAIN",
        syllabusYear: 2026,
        subject: "physics",
        label: { en: "Unit", hi: "" },
        sourceUrl: "https://www.example-coaching.com/syllabus.pdf",
        sourceRef: "p. 3",
      }).success,
    ).toBe(false);
    expect(
      unitUpsertSchema.safeParse({
        exam: "JEE_MAIN",
        syllabusYear: 2026,
        subject: "physics",
        label: { en: "Unit", hi: "" },
        sourceUrl: "https://jeemain.nta.nic.in/syllabus.pdf",
        sourceRef: "p. 3",
      }).success,
    ).toBe(true);
    expect(importMetaSchema.safeParse({ sourceKind: "official", language: "en" }).success).toBe(false);
    expect(paperCreateSchema.parse({ slot: "jee-main" })).toMatchObject({ mode: "practice", language: "en", compensatory: false });
    expect(paperCreateSchema.safeParse({ slot: "jee-x" }).success).toBe(false);
  });

  it("accepts every default blueprint definition", () => {
    for (const slot of ["jee-main", "neet-ug", "jee-adv", "boh-class-10"] as const) {
      const bp = defaultBlueprint(slot);
      const definition = {
        title: bp.title,
        summary: bp.summary,
        parts: bp.parts,
        difficultyMix: bp.difficultyMix,
        chapterLevels: bp.chapterLevels,
        chapterWeights: bp.chapterWeights,
        sourcePolicy: bp.sourcePolicy,
        crossExamMaxShare: bp.crossExamMaxShare,
        minShortRatio: bp.minShortRatio,
        recentExclusionDays: bp.recentExclusionDays,
        ranked: bp.ranked,
        languages: bp.languages,
        compensatoryMinutes: bp.compensatoryMinutes,
        tieBreak: bp.tieBreak,
        pattern: bp.pattern,
      };
      const parsed = blueprintDefinitionSchema.safeParse(definition);
      expect(parsed.success, `${slot}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    }
  });
});
