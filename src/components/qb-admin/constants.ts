import type {
  QbCapability,
  QbDifficulty,
  QbExam,
  QbFlag,
  QbFormat,
  QbKeyStage,
  QbLevel,
  QbQuestionType,
  QbRole,
  QbSlot,
  QbSourceKind,
  QbStatus,
  QbSubject,
} from "@/lib/qb/types";

/**
 * Runtime constants for the question-bank admin (QB-ADMIN, docs/question-bank-plan.md §B5–B7).
 * Client-safe. They mirror the contracts of `src/lib/qb/types.ts` (QB-CORE-A) so the admin
 * helpers, the admin API's query parsing and their tests do not need CORE-A at runtime. The
 * type-level checks at the bottom make `tsc` fail the moment the two lists drift apart.
 */

export const QB_ADMIN_EXAMS = ["JEE_MAIN", "NEET", "JEE_ADV", "BOH"] as const;
export const QB_ADMIN_SUBJECTS = ["physics", "chemistry", "maths", "botany", "zoology", "biology", "mental_ability"] as const;
export const QB_ADMIN_STATUSES = ["draft", "in_review", "approved", "rejected", "retired"] as const;
export const QB_ADMIN_TYPES = ["single", "multiple", "numerical"] as const;
export const QB_ADMIN_FORMATS = ["standard", "assertion_reason", "statements", "match_list", "passage"] as const;
export const QB_ADMIN_SOURCE_KINDS = ["official", "aspire", "sample"] as const;
export const QB_ADMIN_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const QB_ADMIN_LEVELS = ["class_9_10", "class_11", "class_12", "general"] as const;
export const QB_ADMIN_SLOTS = ["jee-main", "neet-ug", "jee-adv", "boh-class-10"] as const;
export const QB_ADMIN_KEY_STAGES = ["provisional", "final", "staff_verified", "aspire"] as const;
export const QB_ADMIN_ROLES = ["admin", "reviewer", "author"] as const;

export const QB_ADMIN_FLAGS = [
  "low_confidence",
  "answer_missing",
  "answer_conflict",
  "key_dropped",
  "multiple_accepted",
  "key_provisional",
  "figure_needed",
  "math_error",
  "hi_missing",
  "hi_machine",
  "source_mismatch",
  "source_incomplete",
  "third_party_source",
  "exact_duplicate",
  "near_duplicate",
  "unsupported_type",
  "chapter_missing",
  "difficulty_missing",
  "solution_unreviewed",
  "options_incomplete",
  "fidelity_unconfirmed",
  "negative_discrimination",
  "student_report",
] as const;

/** Approval (single or bulk) is refused while any of these is set (§B5 `QB_BLOCKING_FLAGS`). */
export const QB_ADMIN_BLOCKING_FLAGS: readonly QbFlag[] = [
  "answer_missing",
  "answer_conflict",
  "key_dropped",
  "multiple_accepted",
  "key_provisional",
  "figure_needed",
  "math_error",
  "source_mismatch",
  "source_incomplete",
  "third_party_source",
  "exact_duplicate",
  "unsupported_type",
  "chapter_missing",
  "difficulty_missing",
  "solution_unreviewed",
  "options_incomplete",
  "fidelity_unconfirmed",
];

/** Bulk approval also skips these (§B5 `QB_BULK_EXCLUDED_FLAGS`). */
export const QB_ADMIN_BULK_EXCLUDED_FLAGS: readonly QbFlag[] = [
  ...QB_ADMIN_BLOCKING_FLAGS,
  "low_confidence",
  "student_report",
  "negative_discrimination",
];

/**
 * Marks a reviewer clears by hand with a note (QB-CORE-B `clear_flag`: sticky flags, `approve` in
 * the subject). Duplicate marks are decided as a pair in the duplicates queue instead, and
 * `third_party_source` has its own admin-only dialog with the official URL.
 */
export const QB_REVIEWER_CLEARABLE_FLAGS: readonly QbFlag[] = ["source_mismatch", "unsupported_type", "low_confidence", "student_report", "negative_discrimination"];

export const QB_ADMIN_CAPABILITIES = [
  "view",
  "edit_draft",
  "import_tabular",
  "import_ai",
  "approve",
  "retire",
  "set_labels",
  "merge_duplicates",
  "manage_chapters",
  "key_corrections",
  "edit_blueprint",
  "publish_blueprint",
  "confirm_taxonomy",
  "manage_team",
  "manage_settings",
] as const;

const AUTHOR: readonly QbCapability[] = ["view", "edit_draft", "import_tabular"];
const REVIEWER: readonly QbCapability[] = [
  ...AUTHOR,
  "import_ai",
  "approve",
  "retire",
  "set_labels",
  "merge_duplicates",
  "manage_chapters",
  "key_corrections",
  "edit_blueprint",
];

/**
 * The §B6 capability matrix (author ⊂ reviewer ⊂ admin), a client-safe copy of QB-CORE-B's
 * `QB_ROLE_CAPABILITIES` in `src/lib/qb/access.ts`. The admin UI uses it only to hide controls a
 * viewer cannot use; the admin API checks roles with CORE-B's own `roleCan`, and the services
 * re-check every write, including the subject scope. A test compares the two matrices.
 */
export const QB_ROLE_CAPABILITIES: Readonly<Record<QbRole, readonly QbCapability[]>> = {
  author: AUTHOR,
  reviewer: REVIEWER,
  admin: QB_ADMIN_CAPABILITIES,
};

export function qbRoleCan(role: QbRole, capability: QbCapability): boolean {
  return QB_ROLE_CAPABILITIES[role].includes(capability);
}

/** Everything a viewer of `role` may do, as a lookup the client components receive as props. */
export type QbCapabilityMap = Readonly<Record<QbCapability, boolean>>;

export function qbCapabilityMap(role: QbRole): QbCapabilityMap {
  return Object.fromEntries(QB_ADMIN_CAPABILITIES.map((capability) => [capability, qbRoleCan(role, capability)])) as Record<
    QbCapability,
    boolean
  >;
}

/** Review queues (§B7). `duplicates` and `reports` have their own endpoints; the rest filter questions. */
export const QB_QUEUES = ["to_review", "flagged", "duplicates", "calibration", "wrong_key", "reports", "hindi"] as const;
export type QbQueue = (typeof QB_QUEUES)[number];
/** Queues served by `GET /api/admin/qb/questions?queue=…`. */
export const QB_QUESTION_QUEUES = ["to_review", "flagged", "calibration", "wrong_key", "hindi"] as const;
export type QbQuestionQueue = (typeof QB_QUESTION_QUEUES)[number];

/** Bulk approval and bulk label actions take at most this many ids (§B7). */
export const QB_BULK_MAX = 200;

/** Spot-check sample size for a bulk action of `n` items: max(3, ceil(5 % of n)), at most 10, never above n. */
export function spotCheckSampleSize(n: number): number {
  if (n <= 0) return 0;
  return Math.min(n, Math.min(10, Math.max(3, Math.ceil(n * 0.05))));
}

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Drift checks against the CORE-A contracts (type-level only; nothing runs).

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type QbAdminContractChecks = [
  Assert<Same<(typeof QB_ADMIN_EXAMS)[number], QbExam>>,
  Assert<Same<(typeof QB_ADMIN_SUBJECTS)[number], QbSubject>>,
  Assert<Same<(typeof QB_ADMIN_STATUSES)[number], QbStatus>>,
  Assert<Same<(typeof QB_ADMIN_TYPES)[number], QbQuestionType>>,
  Assert<Same<(typeof QB_ADMIN_FORMATS)[number], QbFormat>>,
  Assert<Same<(typeof QB_ADMIN_SOURCE_KINDS)[number], QbSourceKind>>,
  Assert<Same<(typeof QB_ADMIN_DIFFICULTIES)[number], QbDifficulty>>,
  Assert<Same<(typeof QB_ADMIN_LEVELS)[number], QbLevel>>,
  Assert<Same<(typeof QB_ADMIN_SLOTS)[number], QbSlot>>,
  Assert<Same<(typeof QB_ADMIN_KEY_STAGES)[number], QbKeyStage>>,
  Assert<Same<(typeof QB_ADMIN_ROLES)[number], QbRole>>,
  Assert<Same<(typeof QB_ADMIN_FLAGS)[number], QbFlag>>,
  Assert<Same<(typeof QB_ADMIN_CAPABILITIES)[number], QbCapability>>,
];
