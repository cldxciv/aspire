import type { QbDifficulty, QbExam, QbFlag, QbSourceKind, QbStatus, QbSubject } from "@/lib/qb/types";
import {
  isOneOf,
  QB_ADMIN_DIFFICULTIES,
  QB_ADMIN_EXAMS,
  QB_ADMIN_FLAGS,
  QB_ADMIN_SOURCE_KINDS,
  QB_ADMIN_STATUSES,
  QB_ADMIN_SUBJECTS,
  QB_QUESTION_QUEUES,
  type QbQuestionQueue,
} from "./constants";

/**
 * Question-list filters (QB-ADMIN): one pure parser shared by `GET /api/admin/qb/questions` and the
 * `/admin/questions` pages, so a filter in the page URL means the same thing to the API. Unknown or
 * malformed values are dropped (never an error), like the CRM inbox filters. Client-safe.
 */

export const QB_QUESTION_SORTS = ["updated_desc", "updated_asc", "number_asc", "number_desc"] as const;
export type QbQuestionSort = (typeof QB_QUESTION_SORTS)[number];

export const QB_PAGE_SIZES = [25, 50, 100] as const;
export const QB_DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE = 10_000;
const MAX_TEXT = 100;

export interface QbQuestionFilters {
  /** `open` = draft or in review. */
  status?: QbStatus | "open";
  subject?: QbSubject;
  chapterId?: string;
  exam?: QbExam;
  /** Per-exam difficulty; needs `exam` to mean anything (the API ignores it otherwise). */
  difficulty?: QbDifficulty;
  sourceKind?: QbSourceKind;
  sourceYear?: number;
  /** `source_paper_key`, e.g. `JEE_MAIN|2024|2024-01-27|January|Shift 1|Paper 1`. */
  paperKey?: string;
  importId?: string;
  flag?: QbFlag;
  /** `with` = any flag at all; `blocking` = at least one blocking flag. */
  flagged?: "with" | "blocking";
  queue?: QbQuestionQueue;
  suspended?: boolean;
  /** Free text: stem, qno, source label (FTS5 trigram or LIKE, §B13). */
  q?: string;
  sort: QbQuestionSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_QUESTION_FILTERS: QbQuestionFilters = { sort: "updated_desc", page: 1, pageSize: QB_DEFAULT_PAGE_SIZE };

type RawParams = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;

function reader(input: RawParams): (name: string) => string | undefined {
  return (name) => {
    const raw = input instanceof URLSearchParams ? input.get(name) : input[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed.slice(0, MAX_TEXT);
  };
}

const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const PAPER_KEY = /^[A-Za-z0-9_ |:.-]{3,100}$/;

function integer(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !/^\d{1,6}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

/** Filters from a query string or Next's `searchParams` object. */
export function parseQuestionFilters(input: RawParams): QbQuestionFilters {
  const get = reader(input);
  const filters: QbQuestionFilters = { ...DEFAULT_QUESTION_FILTERS };

  const status = get("status");
  if (status === "open" || isOneOf(QB_ADMIN_STATUSES, status)) filters.status = status;
  const subject = get("subject");
  if (isOneOf(QB_ADMIN_SUBJECTS, subject)) filters.subject = subject;
  const chapter = get("chapter");
  if (chapter && SLUG.test(chapter)) filters.chapterId = chapter;
  const exam = get("exam");
  if (isOneOf(QB_ADMIN_EXAMS, exam)) filters.exam = exam;
  const difficulty = get("difficulty");
  if (isOneOf(QB_ADMIN_DIFFICULTIES, difficulty)) filters.difficulty = difficulty;
  const source = get("source");
  if (isOneOf(QB_ADMIN_SOURCE_KINDS, source)) filters.sourceKind = source;
  const year = integer(get("year"), 2000, 2100);
  if (year !== undefined) filters.sourceYear = year;
  const paper = get("paper");
  if (paper && PAPER_KEY.test(paper)) filters.paperKey = paper;
  const importId = get("import");
  if (importId && SLUG.test(importId)) filters.importId = importId;
  const flag = get("flag");
  if (isOneOf(QB_ADMIN_FLAGS, flag)) filters.flag = flag;
  const flagged = get("flagged");
  if (flagged === "with" || flagged === "blocking") filters.flagged = flagged;
  const queue = get("queue");
  if (isOneOf(QB_QUESTION_QUEUES, queue)) filters.queue = queue;
  const suspended = get("suspended");
  if (suspended === "true" || suspended === "false") filters.suspended = suspended === "true";
  const q = get("q");
  if (q) filters.q = q.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || undefined;
  if (filters.q === undefined) delete filters.q;
  const sort = get("sort");
  if (isOneOf(QB_QUESTION_SORTS, sort)) filters.sort = sort;
  filters.page = integer(get("page"), 1, MAX_PAGE) ?? 1;
  const size = integer(get("pageSize"), 1, 100);
  filters.pageSize = size !== undefined && (QB_PAGE_SIZES as readonly number[]).includes(size) ? size : QB_DEFAULT_PAGE_SIZE;
  return filters;
}

/**
 * The query string for `filters` (`?status=open&subject=physics`), defaults left out, stable key
 * order; `""` when nothing is set. `parseQuestionFilters(questionFiltersToQuery(f))` returns `f`.
 */
export function questionFiltersToQuery(filters: Partial<QbQuestionFilters>): string {
  const params = new URLSearchParams();
  const put = (name: string, value: string | number | boolean | undefined) => {
    if (value !== undefined && value !== "") params.set(name, String(value));
  };
  put("status", filters.status);
  put("subject", filters.subject);
  put("chapter", filters.chapterId);
  put("exam", filters.exam);
  put("difficulty", filters.difficulty);
  put("source", filters.sourceKind);
  put("year", filters.sourceYear);
  put("paper", filters.paperKey);
  put("import", filters.importId);
  put("flag", filters.flag);
  put("flagged", filters.flagged);
  put("queue", filters.queue);
  put("suspended", filters.suspended);
  put("q", filters.q);
  if (filters.sort && filters.sort !== DEFAULT_QUESTION_FILTERS.sort) put("sort", filters.sort);
  if (filters.page && filters.page > 1) put("page", filters.page);
  if (filters.pageSize && filters.pageSize !== QB_DEFAULT_PAGE_SIZE) put("pageSize", filters.pageSize);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Same filters on another page (page reset unless `page` is given). */
export function withFilters(filters: QbQuestionFilters, change: Partial<QbQuestionFilters>): QbQuestionFilters {
  const next: QbQuestionFilters = { ...filters, page: 1, ...change };
  for (const key of Object.keys(next) as (keyof QbQuestionFilters)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

/** How many filters (other than sort and paging) are active: the "Filters (3)" count. */
export function activeFilterCount(filters: QbQuestionFilters): number {
  const ignored = new Set<keyof QbQuestionFilters>(["sort", "page", "pageSize"]);
  return (Object.keys(filters) as (keyof QbQuestionFilters)[]).filter((key) => !ignored.has(key) && filters[key] !== undefined).length;
}

/** Total pages for a list (at least 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}
