import { z } from "zod";

import {
  QB_ADMIN_DIFFICULTIES,
  QB_ADMIN_EXAMS,
  QB_ADMIN_FLAGS,
  QB_ADMIN_FORMATS,
  QB_ADMIN_LEVELS,
  QB_ADMIN_SLOTS,
  QB_ADMIN_SUBJECTS,
  QB_ADMIN_TYPES,
  QB_BULK_MAX,
} from "@/components/qb-admin/constants";
import { QB_BLUEPRINT_ACTIONS, QB_CHECKLIST_KEYS, QB_DUPLICATE_DECISIONS } from "@/components/qb-admin/contract";
import { isOfficialSourceUrl } from "@/lib/qb/taxonomy";

/**
 * Request bodies of `/api/admin/qb/**` (QB-ADMIN-API). Shapes and bounds only: QB-CORE-B services
 * re-validate meaning (math, flags, subject scope, blueprint totals, taxonomy gate) so every entry
 * point applies the same rules. Limits follow §B5: 8,000 characters per rich-text field,
 * 2–6 options, at most 200 ids in a bulk action. The route caps every body at 64 KB first.
 *
 * Note for the integrator: §B14 gives "zod for every QB API body" to QB-CORE-A's
 * `src/lib/qb/schemas.ts`; these are the admin routes' own bodies, written to the §B5 types.
 * Swap in CORE-A schemas wherever they are equivalent.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const qbIdSchema = z.string().regex(ID_PATTERN, { error: "Invalid id." });
const figureId = z.string().regex(/^[0-9a-f]{32}$/, { error: "Invalid figure id." });
// No NUL or other C0 controls except tab / newline / carriage return in stored text.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (max: number) =>
  z
    .string()
    .max(max, { error: `At most ${max} characters.` })
    .refine((value) => !CONTROL.test(value), { error: "Remove control characters." });
const line = (max: number) => text(max).refine((value) => !/[\r\n]/.test(value), { error: "Use a single line." });
const httpsUrl = z
  .string()
  .max(500)
  .regex(/^https:\/\/[^\s<>"']+$/, { error: "Use a full https:// address." });

export const bilingualSchema = (max = 8000) => z.object({ en: text(max), hi: text(max) }).strict();

const examEnum = z.enum(QB_ADMIN_EXAMS, { error: "Choose an exam." });
const subjectEnum = z.enum(QB_ADMIN_SUBJECTS, { error: "Choose a subject." });
const difficultyEnum = z.enum(QB_ADMIN_DIFFICULTIES, { error: "Choose easy, medium or hard." });
const syllabusEnum = z.enum(["current", "removed", "unchecked"]);

// ---------------------------------------------------------------------------------------------
// Question content (§B5 QbQuestionContent)

export const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), index: z.number().int().min(0).max(5) }).strict(),
  z
    .object({ kind: z.literal("multiple"), indices: z.array(z.number().int().min(0).max(5)).min(1).max(6) })
    .strict()
    .refine((answer) => answer.indices.every((value, i, all) => i === 0 || all[i - 1] < value), {
      error: "List the correct options once each, in order.",
    }),
  z
    .object({
      kind: z.literal("numerical"),
      value: z.number(),
      low: z.number().optional(),
      high: z.number().optional(),
      integer: z.boolean(),
      unit: bilingualSchema(40).optional(),
    })
    .strict()
    .refine((answer) => answer.low === undefined || answer.high === undefined || answer.low <= answer.high, {
      error: "The low end of the range must not be above the high end.",
    })
    .refine((answer) => !answer.integer || Number.isInteger(answer.value), { error: "An integer answer must be a whole number." }),
]);

export const figureRefSchema = z
  .object({
    id: figureId,
    slot: z
      .union([z.literal("stem"), z.literal("solution"), z.templateLiteral(["option:", z.number()])])
      .refine((slot) => !slot.startsWith("option:") || /^option:[0-5]$/.test(slot), { error: "Invalid figure slot." }),
    alt: bilingualSchema(300),
    width: z.number().int().min(1).max(4000),
    height: z.number().int().min(1).max(4000),
  })
  .strict();

export const contentSchema = z
  .object({
    type: z.enum(QB_ADMIN_TYPES),
    format: z.enum(QB_ADMIN_FORMATS),
    passageId: qbIdSchema.nullable(),
    passageOrder: z.number().int().min(1).max(20).nullable(),
    stem: bilingualSchema(),
    options: z.array(bilingualSchema()).max(6),
    answer: answerSchema.nullable(),
    solution: bilingualSchema(),
    solutionSource: z.enum(["none", "official", "staff", "ai_draft", "ai_draft_reviewed"]),
    hiSource: z.enum(["none", "official", "staff", "machine_draft"]),
    figures: z.array(figureRefSchema).max(20),
    topics: z.array(line(64)).max(20),
  })
  .strict()
  .superRefine((content, ctx) => {
    if (content.type === "numerical") {
      if (content.options.length > 0) ctx.addIssue({ code: "custom", path: ["options"], message: "Numerical questions have no options." });
    } else if (content.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Give 2–6 options." });
    }
    if (content.answer && content.answer.kind !== content.type) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "The answer does not match the question type." });
    }
    if (content.answer?.kind === "single" && content.answer.index >= content.options.length) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "The answer must be one of the options." });
    }
    if (content.answer?.kind === "multiple" && content.answer.indices.some((index) => index >= content.options.length)) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "Every answer must be one of the options." });
    }
    if ((content.passageId === null) !== (content.passageOrder === null)) {
      ctx.addIssue({ code: "custom", path: ["passageOrder"], message: "A passage question needs both the passage and its order." });
    }
  });

// ---------------------------------------------------------------------------------------------
// Source (§B2; `sample` sources are seeded only, never created through the API)

/**
 * A question's source as staff may write it. Two honesty rules (§B2) are enforced here:
 * - `importId` is server-owned: only the import pipeline sets it. It is accepted (the editor sends
 *   back the source it loaded) but always DROPPED, so a hand-made "official" question cannot skip
 *   the `source_incomplete` check by naming an import it never came from. The service keeps the
 *   stored import id on edits.
 * - an official question's evidence link must be the issuer's own site (NTA, JoSAA/IIT, NMC, NCERT
 *   or the government hosts the bulletins use), never a coaching-site copy.
 */
export const sourceSchema = z
  .object({
    kind: z.enum(["official", "aspire"], { error: "Choose official paper or Aspire's own question." }),
    exam: examEnum.optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." }).optional(),
    session: line(40).optional(),
    shift: line(40).optional(),
    paper: line(40).optional(),
    booklet: line(20).optional(),
    qno: line(20).optional(),
    questionRef: line(40).optional(),
    optionRefs: z.array(line(40)).max(6).optional(),
    page: z.number().int().min(1).max(2000).optional(),
    importId: qbIdSchema.optional(),
    evidenceUrl: httpsUrl.optional(),
    evidencePage: z.number().int().min(1).max(2000).optional(),
    aspireRef: line(120).optional(),
    claimedSource: line(200).optional(),
  })
  .strict()
  .refine((source) => source.kind !== "official" || source.evidenceUrl === undefined || isOfficialSourceUrl(source.evidenceUrl), {
    error: "Link to the official site the paper was published on (for example nta.ac.in or jeeadv.ac.in), not a copy elsewhere.",
    path: ["evidenceUrl"],
  })
  .transform(({ importId, ...source }) => {
    void importId;
    return source;
  });

export const questionExamSchema = z
  .object({
    exam: examEnum,
    eligible: z.boolean(),
    crossExam: z.boolean().optional(),
    difficulty: difficultyEnum.nullable(),
    syllabus: syllabusEnum.optional(),
    expectedTimeSec: z.number().int().min(10).max(3600).nullable().optional(),
  })
  .strict();

type ReviewerLabels = { crossExam?: boolean; syllabus?: "current" | "removed" | "unchecked" };

/**
 * Cross-exam use and syllabus status are reviewer labels (§A3, §B3, §B7). For a viewer without
 * `set_labels` (an author) they are dropped from the per-exam rows, so the server keeps its
 * default on a new row (cross-exam off, syllabus from the confirmed revision year) and the current
 * value on an existing one. Difficulty stays: an author proposes it and a reviewer confirms it in
 * the approval checklist (single approval) or the spot check (bulk).
 */
export function withoutReviewerLabels<T extends ReviewerLabels>(rows: readonly T[]): Omit<T, "crossExam" | "syllabus">[] {
  return rows.map(({ crossExam, syllabus, ...row }) => {
    void crossExam;
    void syllabus;
    return row;
  });
}

const examsSchema = z
  .array(questionExamSchema)
  .max(QB_ADMIN_EXAMS.length)
  .refine((rows) => new Set(rows.map((row) => row.exam)).size === rows.length, { error: "Each exam once." });

export const questionInputSchema = z
  .object({
    chapterId: qbIdSchema.nullable(),
    subject: subjectEnum.optional(),
    content: contentSchema,
    source: sourceSchema,
    exams: examsSchema,
    adaptedNote: bilingualSchema(1000).nullable().optional(),
  })
  .strict()
  .refine((input) => input.chapterId !== null || input.subject !== undefined, {
    error: "Choose a chapter (or at least a subject).",
    path: ["chapterId"],
  });

export const questionPatchSchema = z
  .object({
    baseVersion: z.number().int().min(1),
    baseUpdatedAt: z.number().int().min(0),
    chapterId: qbIdSchema.nullable().optional(),
    content: contentSchema.optional(),
    source: sourceSchema.optional(),
    exams: examsSchema.optional(),
    adaptedNote: bilingualSchema(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.chapterId !== undefined ||
      patch.content !== undefined ||
      patch.source !== undefined ||
      patch.exams !== undefined ||
      patch.adaptedNote !== undefined,
    { error: "Nothing to change." },
  );

const reason = (min = 3) => line(500).refine((value) => value.trim().length >= min, { error: "Give a short reason." });

export const questionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }).strict(),
  z
    .object({
      action: z.literal("approve"),
      checklist: z.object(Object.fromEntries(QB_CHECKLIST_KEYS.map((key) => [key, z.boolean()])) as Record<(typeof QB_CHECKLIST_KEYS)[number], z.ZodBoolean>).strict(),
      note: line(500).optional(),
    })
    .strict(),
  z.object({ action: z.literal("reject"), reason: reason() }).strict(),
  z.object({ action: z.literal("return_to_draft"), note: line(500).optional() }).strict(),
  z.object({ action: z.literal("suspend"), reason: reason() }).strict(),
  z.object({ action: z.literal("unsuspend") }).strict(),
  z.object({ action: z.literal("retire"), reason: reason() }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z
    .object({ action: z.literal("set_fidelity"), fidelity: z.enum(["transcription_fixed", "adapted"]), note: bilingualSchema(1000).optional() })
    .strict()
    .refine((body) => body.fidelity !== "adapted" || (body.note !== undefined && body.note.en.trim().length > 0), {
      error: "Say how Aspire adapted it (English note required).",
      path: ["note"],
    }),
  z.object({ action: z.literal("set_key_stage"), keyStage: z.literal("staff_verified"), note: reason(5) }).strict(),
  z
    .object({ action: z.literal("clear_flag"), flag: z.enum(QB_ADMIN_FLAGS), note: reason(3), officialUrl: httpsUrl.optional() })
    .strict()
    .refine((body) => body.flag !== "third_party_source" || body.officialUrl !== undefined, {
      error: "Clearing a third-party mark needs the official URL the file came from.",
      path: ["officialUrl"],
    }),
  z.object({ action: z.literal("accept_calibration"), exam: examEnum }).strict(),
  z.object({ action: z.literal("dismiss_calibration"), exam: examEnum }).strict(),
]);
export type QuestionActionBody = z.infer<typeof questionActionSchema>;

// ---------------------------------------------------------------------------------------------
// Bulk actions (§B7): start → open the sample → commit (or cancel)

const idList = z
  .array(qbIdSchema)
  .min(1, { error: "Choose at least one question." })
  .max(QB_BULK_MAX, { error: `At most ${QB_BULK_MAX} questions at a time.` })
  .refine((ids) => new Set(ids).size === ids.length, { error: "Each question once." });
const batchId = qbIdSchema;
const checks = z
  .array(z.object({ id: qbIdSchema, token: z.string().min(16).max(400).regex(/^[A-Za-z0-9_.~-]+$/), ok: z.boolean() }).strict())
  .min(1)
  .max(10);

export const bulkApproveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), ids: idList }).strict(),
  z.object({ action: z.literal("commit"), batchId, checks }).strict(),
  z.object({ action: z.literal("cancel"), batchId }).strict(),
]);

const labelOp = z.enum(["accept_ai_labels", "confirm_syllabus"]);
export const bulkLabelsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), op: labelOp, exam: examEnum, ids: idList }).strict(),
  z.object({ action: z.literal("commit"), op: labelOp, batchId, checks }).strict(),
  z.object({ action: z.literal("cancel"), op: labelOp, batchId }).strict(),
]);

// ---------------------------------------------------------------------------------------------
// Taxonomy (§B3)

const unitSource = z.string().max(500).regex(/^https:\/\/([a-z0-9-]+\.)*(nta\.ac\.in|nta\.nic\.in|nmc\.org\.in|jeeadv\.ac\.in|ncert\.nic\.in|s3waas\.gov\.in)\/[^\s<>"']*$/i, {
  error: "Units must cite an official source (nta.ac.in, *.nta.nic.in, nmc.org.in, jeeadv.ac.in, ncert.nic.in).",
});

export const unitInputSchema = z
  .object({
    id: line(80).regex(/^[A-Za-z0-9_:-]+$/).optional(),
    exam: examEnum,
    syllabusYear: z.number().int().min(2000).max(2100),
    subject: subjectEnum,
    code: line(20).nullable().optional(),
    label: bilingualSchema(200),
    sourceUrl: unitSource,
    sourceRef: line(200),
    status: z.enum(["current", "removed"]),
    sort: z.number().int().min(0).max(10_000),
  })
  .strict()
  .refine((unit) => unit.label.en.trim().length > 0, { error: "Give the unit's English name.", path: ["label"] });

const unitsMap = z.partialRecord(examEnum, z.array(line(80)).max(40));
const examStatusMap = z.partialRecord(examEnum, z.enum(["current", "removed"]));

export const chapterInputSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, { error: "Use lowercase letters, digits and hyphens." }).optional(),
    subject: subjectEnum,
    level: z.enum(QB_ADMIN_LEVELS),
    label: bilingualSchema(200),
    units: unitsMap,
    examStatus: examStatusMap,
    sort: z.number().int().min(0).max(10_000),
    active: z.boolean(),
  })
  .strict()
  .refine((chapter) => chapter.label.en.trim().length > 0, { error: "Give the chapter's English name.", path: ["label"] });

export const chapterPatchSchema = z
  .object({
    subject: subjectEnum.optional(),
    level: z.enum(QB_ADMIN_LEVELS).optional(),
    label: bilingualSchema(200).optional(),
    units: unitsMap.optional(),
    examStatus: examStatusMap.optional(),
    sort: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), { error: "Nothing to change." });

export const taxonomyConfirmSchema = z
  .object({
    confirm: z.literal(true, { error: "Tick the confirmation." }),
    syllabusRevisionYear: z.number().int().min(2000).max(2100),
    note: line(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Blueprints (§B5 QbBlueprint; protected fields are dropped: they change through actions only)

const mixSchema = z
  .object({ easy: z.number().int().min(0).max(100), medium: z.number().int().min(0).max(100), hard: z.number().int().min(0).max(100) })
  .strict()
  .refine((mix) => mix.easy + mix.medium + mix.hard === 100, { error: "Easy, medium and hard must add up to 100 %." });

const markingSchema = z
  .object({ correct: z.number().min(0).max(20), wrong: z.number().min(-20).max(0), partial: z.literal("per_correct_option").optional() })
  .strict();

const sectionSchema = z
  .object({
    id: qbIdSchema,
    subject: subjectEnum,
    label: bilingualSchema(200),
    type: z.enum(QB_ADMIN_TYPES),
    format: z.enum(QB_ADMIN_FORMATS).optional(),
    answerFormat: z.enum(["integer", "decimal2"]).optional(),
    count: z.number().int().min(1).max(200),
    passageGroupSize: z.number().int().min(2).max(6).optional(),
    marking: markingSchema,
    difficultyMix: mixSchema.optional(),
    formatMix: z.union([z.partialRecord(z.enum(QB_ADMIN_FORMATS), z.number().min(0).max(100)), z.literal("past_papers"), z.null()]).optional(),
    instructions: bilingualSchema(4000),
  })
  .strict();

const partSchema = z
  .object({
    id: qbIdSchema,
    label: bilingualSchema(200),
    durationMinutes: z.number().int().min(10).max(600),
    sections: z.array(sectionSchema).min(1).max(30),
  })
  .strict();

const tieBreakStep = z.union([
  z.object({ by: z.literal("subject_score"), subject: z.union([subjectEnum, z.literal("biology")]) }).strict(),
  z.object({ by: z.literal("wrong_correct_ratio"), subject: z.union([subjectEnum, z.literal("biology"), z.literal("all")]) }).strict(),
]);

export const blueprintEditableSchema = z.object({
  title: bilingualSchema(200),
  summary: bilingualSchema(1000),
  parts: z.array(partSchema).min(1).max(4),
  difficultyMix: mixSchema,
  chapterLevels: z.array(z.enum(QB_ADMIN_LEVELS)).min(1).max(4),
  chapterWeights: z
    .object({
      mode: z.enum(["past_papers", "uniform", "manual"]),
      fromYear: z.number().int().min(2000).max(2100).nullable(),
      fallbackYears: z.number().int().min(1).max(20),
      halfLifeYears: z.number().min(0.5).max(20).nullable(),
      overrides: z.record(qbIdSchema, z.number().min(0).max(100)),
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
  compensatoryMinutes: z.number().int().min(0).max(180).nullable(),
  tieBreak: z.array(tieBreakStep).max(12).nullable(),
  pattern: z
    .object({
      year: z.number().int().min(2000).max(2100),
      sourceUrls: z.array(httpsUrl).max(10),
      verifiedAt: z.string().max(40).nullable(),
      reviewDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      note: bilingualSchema(2000),
    })
    .strict(),
});

export const blueprintCreateSchema = z.object({ slot: z.enum(QB_ADMIN_SLOTS, { error: "Choose an exam slot." }) }).strict();

export const blueprintSaveSchema = z
  .object({ definition: blueprintEditableSchema, baseUpdatedAt: z.number().int().min(0) })
  .strict();

export const blueprintActionSchema = z
  .object({
    action: z.enum(QB_BLUEPRINT_ACTIONS),
    note: line(500).optional(),
    label: bilingualSchema(120).optional(),
  })
  .strict()
  .refine((body) => body.action !== "signoff" || (body.label !== undefined && body.label.en.trim().length > 0), {
    error: "Give the public sign-off wording.",
    path: ["label"],
  })
  .refine((body) => body.action !== "confirm_pattern" || (body.note ?? "").trim().length >= 3, {
    error: "Say how the pattern was confirmed.",
    path: ["note"],
  });

// ---------------------------------------------------------------------------------------------
// Duplicates, reports, corrections, team, settings

export const duplicateDecisionSchema = z
  .object({ a: qbIdSchema, b: qbIdSchema, decision: z.enum(QB_DUPLICATE_DECISIONS), keep: qbIdSchema.optional() })
  .strict()
  .refine((body) => body.a !== body.b, { error: "Pick two different questions.", path: ["b"] })
  .refine((body) => body.keep === undefined || body.keep === body.a || body.keep === body.b, { error: "Keep one of the pair.", path: ["keep"] });

export const reportPatchSchema = z.object({ status: z.enum(["resolved", "dismissed"]), note: line(500).optional() }).strict();

export const correctionInputSchema = z
  .object({
    questionId: qbIdSchema,
    appliesToVersion: z.number().int().min(1),
    kind: z.enum(["answer", "dropped"]),
    answer: answerSchema.optional(),
    reason: reason(5),
    evidenceUrl: httpsUrl.optional(),
  })
  .strict()
  .refine((body) => (body.kind === "answer") === (body.answer !== undefined), {
    error: "An answer correction needs the corrected answer; a drop has none.",
    path: ["answer"],
  });

export const memberInputSchema = z
  .object({
    qbRole: z.enum(["author", "reviewer"], { error: "Choose author or reviewer." }),
    subjects: z
      .array(subjectEnum)
      .max(QB_ADMIN_SUBJECTS.length)
      .refine((list) => new Set(list).size === list.length, { error: "Each subject once." }),
    active: z.boolean(),
  })
  .strict();

export const settingsPatchSchema = z
  .object({
    importEnabled: z.boolean().optional(),
    approvalSelf: z.enum(["allowed_recorded", "second_reviewer"]).optional(),
  })
  .strict()
  .refine((patch) => patch.importEnabled !== undefined || patch.approvalSelf !== undefined, { error: "Nothing to change." });
