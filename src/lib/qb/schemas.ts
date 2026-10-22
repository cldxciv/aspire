import { z } from "zod";

import { OFFICIAL_HOSTS_HINT, OFFICIAL_SOURCE_HOSTS } from "./official-hosts";
import { RICH_TEXT_LIMITS } from "./rich-text";
import {
  QB_DIFFICULTIES,
  QB_EXAMS,
  QB_FLAGS,
  QB_FORMATS,
  QB_IMPORT_KINDS,
  QB_LEVELS,
  QB_QUESTION_TYPES,
  QB_REPORT_KINDS,
  QB_SLOTS,
  QB_SUBJECTS,
} from "./types";

/**
 * Request bodies for every QB API (owner: QB-CORE-A): /api/admin/qb/** (QB-ADMIN-API, QB-IMPORT) and
 * /api/mocktest/papers/** (QB-MOCKTEST-API). Shapes and bounds only; services re-check meaning
 * (capabilities, subject scope, taxonomy gate, flags). Client-safe: the admin UI may reuse them for
 * early feedback. Unknown keys are rejected (`.strict()`) on staff bodies.
 */

export const QB_MAX_JSON_BYTES = 64 * 1024;
export const QB_BULK_MAX = 200;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const qbId = z.string().regex(ID, { error: "Invalid id." });
/** Paper ids: 22 base64url characters (128 bits). Tokens: 43 base64url characters (32 bytes). */
export const QB_PAPER_ID = /^[A-Za-z0-9_-]{22}$/;
export const QB_PAPER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const paperIdSchema = z.string().regex(QB_PAPER_ID, { error: "Invalid paper id." });
export const paperTokenSchema = z.string().regex(QB_PAPER_TOKEN, { error: "Invalid paper token." });

const text = (max: number) => z.string().max(max, { error: `At most ${max} characters.` });
const field = text(RICH_TEXT_LIMITS.fieldChars);
const note = text(2000);

export const bilingualSchema = z.object({ en: field, hi: field }).strict();
const shortBilingual = z.object({ en: text(300), hi: text(300) }).strict();

export const examSchema = z.enum(QB_EXAMS, { error: "Choose an exam." });
export const subjectSchema = z.enum(QB_SUBJECTS, { error: "Choose a subject." });
export const difficultySchema = z.enum(QB_DIFFICULTIES, { error: "Choose easy, medium or hard." });
export const slotSchema = z.enum(QB_SLOTS, { error: "Unknown exam slot." });

const finite = z.number().refine(Number.isFinite, { error: "Must be a number." });

export const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), index: z.number().int().min(0).max(5) }).strict(),
  z
    .object({ kind: z.literal("multiple"), indices: z.array(z.number().int().min(0).max(5)).min(1).max(6) })
    .strict()
    .refine((a) => new Set(a.indices).size === a.indices.length, { error: "Options must be distinct." }),
  z
    .object({
      kind: z.literal("numerical"),
      value: finite,
      low: finite.optional(),
      high: finite.optional(),
      integer: z.boolean(),
      unit: shortBilingual.optional(),
    })
    .strict()
    .refine((a) => (a.low === undefined) === (a.high === undefined), { error: "Give both ends of the range." })
    .refine((a) => a.low === undefined || a.high === undefined || (a.low <= a.value && a.value <= a.high), {
      error: "The value must lie inside the range.",
    })
    .refine((a) => !a.integer || Number.isInteger(a.value), { error: "An integer answer must be a whole number." }),
]);

export const figureRefSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{32}$/, { error: "Invalid figure id." }),
    slot: z.union([z.literal("stem"), z.literal("solution"), z.string().regex(/^option:[0-5]$/)]),
    alt: shortBilingual,
    width: z.number().int().min(1).max(4000),
    height: z.number().int().min(1).max(4000),
  })
  .strict();

export const contentSchema = z
  .object({
    type: z.enum(QB_QUESTION_TYPES),
    format: z.enum(QB_FORMATS),
    passageId: qbId.nullable(),
    passageOrder: z.number().int().min(1).max(20).nullable(),
    stem: bilingualSchema,
    options: z.array(bilingualSchema).max(6),
    answer: answerSchema.nullable(),
    solution: bilingualSchema,
    solutionSource: z.enum(["none", "official", "staff", "ai_draft", "ai_draft_reviewed"]),
    hiSource: z.enum(["none", "official", "staff", "machine_draft"]),
    figures: z.array(figureRefSchema).max(12),
    topics: z.array(text(80)).max(20),
  })
  .strict()
  .refine((c) => c.type === "numerical" || c.options.length >= 2, { error: "A choice question needs 2–6 options.", path: ["options"] })
  .refine((c) => c.type !== "numerical" || c.options.length === 0, { error: "A numerical question has no options.", path: ["options"] })
  .refine((c) => c.answer === null || c.answer.kind === c.type, { error: "The answer does not match the question type.", path: ["answer"] })
  .refine(
    (c) =>
      c.answer === null ||
      (c.answer.kind === "single" && c.answer.index < c.options.length) ||
      (c.answer.kind === "multiple" && c.answer.indices.every((i) => i < c.options.length)) ||
      c.answer.kind === "numerical",
    { error: "The answer points at a missing option.", path: ["answer"] },
  );

const yearSchema = z.number().int().min(2000).max(2100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });
const urlSchema = z.url({ protocol: /^https$/, error: "Use an https link." }).max(500);

export const sourceSchema = z
  .object({
    kind: z.enum(["official", "aspire"]),
    exam: examSchema.optional(),
    year: yearSchema.optional(),
    date: isoDate.optional(),
    session: text(40).optional(),
    shift: text(40).optional(),
    paper: text(40).optional(),
    booklet: text(20).optional(),
    qno: text(20).optional(),
    questionRef: text(40).optional(),
    optionRefs: z.array(text(40)).max(6).optional(),
    page: z.number().int().min(1).max(2000).optional(),
    evidenceUrl: urlSchema.optional(),
    evidencePage: z.number().int().min(1).max(2000).optional(),
    aspireRef: text(120).optional(),
    claimedSource: text(200).optional(),
  })
  .strict();

export const questionExamInputSchema = z
  .object({
    exam: examSchema,
    eligible: z.boolean().optional(),
    crossExam: z.boolean().optional(),
    difficulty: difficultySchema.nullable().optional(),
    syllabus: z.enum(["current", "removed", "unchecked"]).optional(),
    expectedTimeSec: z.number().int().min(5).max(3600).nullable().optional(),
  })
  .strict();

/** POST /api/admin/qb/questions — a hand-written draft. */
export const questionCreateSchema = z
  .object({
    content: contentSchema,
    chapterId: qbId.nullable(),
    subject: subjectSchema.optional(),
    source: sourceSchema,
    exams: z.array(questionExamInputSchema).min(1).max(4),
    keyNote: note.optional(),
  })
  .strict();
export type QuestionCreateBody = z.infer<typeof questionCreateSchema>;

/** PATCH /api/admin/qb/questions/[id] — `expectedVersion` guards against overwriting someone's edit. */
export const questionPatchSchema = z
  .object({
    expectedUpdatedAt: z.number().int().positive(),
    content: contentSchema.optional(),
    chapterId: qbId.nullable().optional(),
    source: sourceSchema.optional(),
    exams: z.array(questionExamInputSchema).max(4).optional(),
  })
  .strict()
  .refine((b) => b.content !== undefined || b.chapterId !== undefined || b.source !== undefined || b.exams !== undefined, {
    error: "Nothing to change.",
  });
export type QuestionPatchBody = z.infer<typeof questionPatchSchema>;

/** The approval checklist (§B7). Every tick is re-checked on the server. */
export const approvalChecklistSchema = z
  .object({
    answerVerified: z.literal(true, { error: "Confirm the answer was checked." }),
    answerNote: note.optional(),
    transcription: z.enum(["matches_source", "adapted", "not_applicable"]),
    adaptedNote: shortBilingual.optional(),
    mathRenders: z.literal(true, { error: "Confirm the maths renders." }),
    figuresPresent: z.literal(true, { error: "Confirm the figures are present." }),
    hindi: z.enum(["checked", "labelled", "none"]),
    syllabusCurrent: z.array(examSchema).max(4),
    licenceAcknowledged: z.literal(true, { error: "Confirm the licence acknowledgement." }),
  })
  .strict();
export type ApprovalChecklist = z.infer<typeof approvalChecklistSchema>;

/** POST /api/admin/qb/questions/[id]/actions */
export const questionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }).strict(),
  z.object({ action: z.literal("approve"), checklist: approvalChecklistSchema }).strict(),
  z.object({ action: z.literal("reject"), reason: note.min(3) }).strict(),
  z.object({ action: z.literal("suspend"), reason: note.min(3) }).strict(),
  z.object({ action: z.literal("unsuspend") }).strict(),
  z.object({ action: z.literal("retire"), reason: note.min(3, { error: "Say why it is retired." }) }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z.object({ action: z.literal("clear_flag"), flag: z.enum(QB_FLAGS), note: note.min(3) }).strict(),
  z
    .object({
      action: z.literal("set_fidelity"),
      fidelity: z.enum(["transcription_fixed", "adapted"]),
      adaptedNote: shortBilingual.optional(),
    })
    .strict(),
  z.object({ action: z.literal("verify_key"), note: note.min(3) }).strict(),
  z.object({ action: z.literal("accept_calibration"), exam: examSchema }).strict(),
  z.object({ action: z.literal("dismiss_calibration"), exam: examSchema }).strict(),
]);
export type QuestionActionBody = z.infer<typeof questionActionSchema>;

const idList = z.array(qbId).min(1).max(QB_BULK_MAX, { error: `At most ${QB_BULK_MAX} questions at once.` });

/** POST /api/admin/qb/questions/bulk — spot-checked bulk approval / syllabus confirmation (§B7). */
export const bulkSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      kind: z.enum(["approve", "syllabus_current"]),
      ids: idList,
      exam: examSchema.optional(),
    })
    .strict()
    .refine((b) => b.kind !== "syllabus_current" || b.exam !== undefined, { error: "Choose the exam.", path: ["exam"] }),
  z
    .object({
      action: z.literal("confirm"),
      bulkId: qbId,
      checks: z.array(z.object({ id: qbId, viewToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/), ok: z.boolean() }).strict()).max(10),
    })
    .strict(),
  z.object({ action: z.literal("abort"), bulkId: qbId }).strict(),
]);
export type BulkBody = z.infer<typeof bulkSchema>;

/** POST /api/admin/qb/questions/bulk-labels */
export const bulkLabelsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept_ai"), ids: idList, exam: examSchema }).strict(),
  z.object({ action: z.literal("set_difficulty"), ids: idList, exam: examSchema, difficulty: difficultySchema }).strict(),
  z.object({ action: z.literal("set_eligible"), ids: idList, exam: examSchema, eligible: z.boolean() }).strict(),
  z.object({ action: z.literal("set_cross_exam"), ids: idList, exam: examSchema, crossExam: z.boolean() }).strict(),
]);
export type BulkLabelsBody = z.infer<typeof bulkLabelsSchema>;

/** Official issuers only (units cite official documents). */
export { OFFICIAL_SOURCE_HOSTS };

export const officialUrlSchema = urlSchema.refine(
  (value) => {
    try {
      return OFFICIAL_SOURCE_HOSTS.test(new URL(value).hostname);
    } catch {
      return false;
    }
  },
  { error: `Use a link on an official site (${OFFICIAL_HOSTS_HINT}).` },
);

/** POST /api/admin/qb/units */
export const unitUpsertSchema = z
  .object({
    id: z.string().regex(/^[A-Z_]+:\d{4}:[a-z_]+:[A-Za-z0-9_-]{1,20}$/).optional(),
    exam: examSchema,
    syllabusYear: yearSchema,
    subject: subjectSchema,
    code: text(20).nullable().optional(),
    label: shortBilingual,
    sourceUrl: officialUrlSchema,
    sourceRef: text(200),
    status: z.enum(["current", "removed"]).optional(),
    sort: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
export type UnitUpsertBody = z.infer<typeof unitUpsertSchema>;

const chapterIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, { error: "Use lower-case letters, digits and hyphens." });
const examStatusSchema = z.partialRecord(examSchema, z.enum(["current", "removed"]));
const unitsMapSchema = z.partialRecord(examSchema, z.array(text(80)).max(40));

/** POST /api/admin/qb/chapters */
export const chapterCreateSchema = z
  .object({
    id: chapterIdSchema,
    subject: subjectSchema,
    level: z.enum(QB_LEVELS),
    label: shortBilingual,
    units: unitsMapSchema.optional(),
    examStatus: examStatusSchema.optional(),
    sort: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
export type ChapterCreateBody = z.infer<typeof chapterCreateSchema>;

/** PATCH /api/admin/qb/chapters/[id] */
export const chapterPatchSchema = z
  .object({
    label: shortBilingual.optional(),
    subject: subjectSchema.optional(),
    level: z.enum(QB_LEVELS).optional(),
    units: unitsMapSchema.optional(),
    examStatus: examStatusSchema.optional(),
    sort: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type ChapterPatchBody = z.infer<typeof chapterPatchSchema>;

/** POST /api/admin/qb/taxonomy/[exam]/confirm */
export const taxonomyConfirmSchema = z
  .object({
    confirm: z.boolean(),
    syllabusRevisionYear: yearSchema.nullable(),
    note: note.optional(),
  })
  .strict();
export type TaxonomyConfirmBody = z.infer<typeof taxonomyConfirmSchema>;

// Blueprints -------------------------------------------------------------------------------------

const markingSchema = z
  .object({
    correct: z.number().int().min(1).max(10),
    wrong: z.number().int().min(-5).max(0),
    partial: z.literal("per_correct_option").optional(),
  })
  .strict();
const mixSchema = z
  .object({ easy: z.number().int().min(0).max(100), medium: z.number().int().min(0).max(100), hard: z.number().int().min(0).max(100) })
  .strict()
  .refine((m) => m.easy + m.medium + m.hard === 100, { error: "The mix must add up to 100 %." });

export const blueprintSectionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    subject: subjectSchema,
    label: shortBilingual,
    type: z.enum(QB_QUESTION_TYPES),
    format: z.enum(QB_FORMATS).optional(),
    answerFormat: z.enum(["integer", "decimal2"]).optional(),
    count: z.number().int().min(1).max(200),
    passageGroupSize: z.number().int().min(1).max(6).optional(),
    marking: markingSchema,
    difficultyMix: mixSchema.optional(),
    formatMix: z.union([z.literal("past_papers"), z.partialRecord(z.enum(QB_FORMATS), z.number().min(0).max(100)), z.null()]).optional(),
    instructions: z.object({ en: text(2000), hi: text(2000) }).strict(),
  })
  .strict();

export const blueprintPartSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,19}$/),
    label: shortBilingual,
    durationMinutes: z.number().int().min(10).max(600),
    sections: z.array(blueprintSectionSchema).min(1).max(30),
  })
  .strict();

const tieBreakStepSchema = z.union([
  z.object({ by: z.literal("subject_score"), subject: z.union([subjectSchema, z.literal("biology")]) }).strict(),
  z.object({ by: z.literal("wrong_correct_ratio"), subject: z.union([subjectSchema, z.literal("biology"), z.literal("all")]) }).strict(),
]);

/** The editable part of a blueprint (id, slot, version, status and sign-off facts are server-owned). */
export const blueprintDefinitionSchema = z
  .object({
    title: shortBilingual,
    summary: z.object({ en: text(600), hi: text(600) }).strict(),
    parts: z.array(blueprintPartSchema).min(1).max(2),
    difficultyMix: mixSchema,
    chapterLevels: z.array(z.enum(QB_LEVELS)).min(1).max(4),
    chapterWeights: z
      .object({
        mode: z.enum(["past_papers", "uniform", "manual"]),
        fromYear: yearSchema.nullable(),
        fallbackYears: z.number().int().min(1).max(20),
        halfLifeYears: z.number().min(0.5).max(20).nullable(),
        overrides: z.record(chapterIdSchema, z.number().min(0).max(100)),
      })
      .strict(),
    sourcePolicy: z
      .object({
        official: z.boolean(),
        aspire: z.boolean(),
        sample: z.enum(["never", "placeholder_only"]),
        officialMaxShare: z.number().min(0).max(1).nullable(),
      })
      .strict(),
    crossExamMaxShare: z.number().min(0).max(1),
    minShortRatio: z.number().min(0.1).max(1),
    recentExclusionDays: z.number().int().min(0).max(365),
    ranked: z.enum(["off", "monthly"]),
    languages: z.array(z.enum(["en", "hi"])).min(1).max(2),
    compensatoryMinutes: z.number().int().min(0).max(120).nullable(),
    tieBreak: z.array(tieBreakStepSchema).max(12).nullable(),
    pattern: z
      .object({
        year: yearSchema,
        sourceUrls: z.array(urlSchema).max(10),
        verifiedAt: isoDate.nullable(),
        reviewDueAt: isoDate.nullable(),
        note: z.object({ en: text(600), hi: text(600) }).strict(),
      })
      .strict(),
  })
  .strict();
export type BlueprintDefinitionBody = z.infer<typeof blueprintDefinitionSchema>;

/** POST /api/admin/qb/blueprints (new draft for a slot) and PATCH /api/admin/qb/blueprints/[id]. */
export const blueprintSaveSchema = z
  .object({ slot: slotSchema.optional(), definition: blueprintDefinitionSchema, expectedUpdatedAt: z.number().int().positive().optional() })
  .strict();
export type BlueprintSaveBody = z.infer<typeof blueprintSaveSchema>;

/** POST /api/admin/qb/blueprints/[id]/actions */
export const blueprintActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("new_version") }).strict(),
  z.object({ action: z.literal("confirm_pattern"), note: note.min(3, { error: "Say how the pattern was confirmed." }) }).strict(),
  z.object({ action: z.literal("signoff"), label: shortBilingual }).strict(),
]);
export type BlueprintActionBody = z.infer<typeof blueprintActionSchema>;

// Review queues ----------------------------------------------------------------------------------

/** POST /api/admin/qb/duplicates/decide */
export const duplicateDecisionSchema = z
  .object({ a: qbId, b: qbId, decision: z.enum(["duplicate", "variant", "distinct"]), keep: qbId.optional() })
  .strict()
  .refine((d) => d.a !== d.b, { error: "Choose two different questions." })
  .refine((d) => d.keep === undefined || (d.decision === "duplicate" && (d.keep === d.a || d.keep === d.b)), {
    error: "Keep one of the two questions (duplicates only).",
    path: ["keep"],
  });
export type DuplicateDecisionBody = z.infer<typeof duplicateDecisionSchema>;

/** PATCH /api/admin/qb/reports/[id] */
export const reportResolveSchema = z.object({ status: z.enum(["resolved", "dismissed"]), note: note.optional() }).strict();
export type ReportResolveBody = z.infer<typeof reportResolveSchema>;

/** POST /api/admin/qb/corrections */
export const keyCorrectionSchema = z
  .object({
    questionId: qbId,
    appliesToVersion: z.number().int().min(1).max(65535).optional(),
    kind: z.enum(["answer", "dropped"]),
    answer: answerSchema.optional(),
    reason: note.min(3, { error: "Say why the key changes." }),
    evidenceUrl: urlSchema.optional(),
  })
  .strict()
  .refine((c) => c.kind === "dropped" || c.answer !== undefined, { error: "Give the corrected answer.", path: ["answer"] });
export type KeyCorrectionBody = z.infer<typeof keyCorrectionSchema>;

/** PUT /api/admin/qb/members/[userId] */
export const memberUpsertSchema = z
  .object({
    role: z.enum(["author", "reviewer"]),
    subjects: z.array(subjectSchema).max(QB_SUBJECTS.length),
    active: z.boolean(),
  })
  .strict();
export type MemberUpsertBody = z.infer<typeof memberUpsertSchema>;

const thresholdSchema = z
  .object({ easyMin: z.number().min(0).max(1), hardMax: z.number().min(0).max(1) })
  .strict()
  .refine((t) => t.hardMax < t.easyMin, { error: "The hard limit must be below the easy limit." });

/** PATCH /api/admin/qb/settings (admin only) */
export const settingsPatchSchema = z
  .object({
    importEnabled: z.boolean().optional(),
    approvalSelf: z.enum(["allowed_recorded", "second_reviewer"]).optional(),
    calibrationThresholds: z
      .partialRecord(examSchema, z.object({ mcq: thresholdSchema, numerical: thresholdSchema.nullable() }).strict())
      .optional(),
  })
  .strict();
export type SettingsPatchBody = z.infer<typeof settingsPatchSchema>;

// Imports (QB-IMPORT routes) --------------------------------------------------------------------

export const importMetaSchema = z
  .object({
    sourceKind: z.enum(["official", "aspire"]),
    exam: examSchema.optional(),
    year: yearSchema.optional(),
    date: isoDate.optional(),
    session: text(40).optional(),
    shift: text(40).optional(),
    paper: text(40).optional(),
    booklet: text(20).optional(),
    language: z.enum(["en", "hi", "bilingual"]),
    pairsWith: qbId.optional(),
    keyFor: z.array(qbId).max(10).optional(),
    keyStage: z.enum(["provisional", "final"]).optional(),
    aspireRef: text(120).optional(),
  })
  .strict()
  .refine((m) => m.sourceKind !== "official" || (m.exam !== undefined && m.year !== undefined), {
    error: "An official paper needs its exam and year.",
  });
export type ImportMetaBody = z.infer<typeof importMetaSchema>;

export const importKindSchema = z.enum(QB_IMPORT_KINDS);

/** POST /api/admin/qb/imports/[id] */
export const importActionSchema = z
  .object({
    action: z.enum(["run", "pause", "cancel", "retry_failed", "close", "create_drafts", "confirm_snapshot"]),
    options: z
      .object({
        mode: z.enum(["sync", "batch"]).optional(),
        draftSolutions: z.boolean().optional(),
        machineHindi: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ImportActionBody = z.infer<typeof importActionSchema>;

// Students (/api/mocktest/papers/**) -------------------------------------------------------------

/** POST /api/mocktest/papers — a new practice paper, or this month's ranked paper. */
export const paperCreateSchema = z.object({
  slot: slotSchema,
  mode: z.enum(["practice", "ranked"]).default("practice"),
  language: z.enum(["en", "hi"]).default("en"),
  /** Extra time for eligible PwD candidates (practice only; such attempts are unranked). */
  compensatory: z.boolean().default(false),
  /** A guest's last papers (at most 5) so their questions are avoided. */
  recent: z
    .array(z.object({ id: paperIdSchema, token: paperTokenSchema }))
    .max(5)
    .optional()
    .catch(undefined),
});
export type PaperCreateBody = z.infer<typeof paperCreateSchema>;

/** POST /api/mocktest/papers/[id]/report — no account or IP is stored. */
export const paperReportSchema = z.object({
  token: paperTokenSchema.optional(),
  questionId: qbId,
  kind: z.enum(QB_REPORT_KINDS),
  note: text(500).optional(),
});
export type PaperReportBody = z.infer<typeof paperReportSchema>;
