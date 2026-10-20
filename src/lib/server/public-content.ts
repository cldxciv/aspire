import "server-only";

import { z } from "zod";

import type { ExamTrack, ResultRecord } from "@/lib/types";

import { apiError } from "./http";

/**
 * Query-parameter validation and public projections for the read-only
 * content API (GET /api/programs, /api/centres, /api/results).
 */

export const EXAM_TRACKS = ["JEE", "NEET", "Foundation", "Integrated"] as const satisfies readonly ExamTrack[];

// Compile-time guard: fails if ExamTrack gains a member that EXAM_TRACKS lacks.
type MissingExamTracks = Exclude<ExamTrack, (typeof EXAM_TRACKS)[number]>;
const examTracksComplete: [MissingExamTracks] extends [never] ? true : never = true;
void examTracksComplete;

const EXAM_BY_LOWERCASE = new Map<string, ExamTrack>(EXAM_TRACKS.map((exam) => [exam.toLowerCase(), exam]));

/** `exam` is case-insensitive (`jee`, `JEE`) and normalised to the ExamTrack spelling. */
const examParam = z.string().transform((value, ctx) => {
  const exam = EXAM_BY_LOWERCASE.get(value.trim().toLowerCase());
  if (!exam) {
    ctx.addIssue({ code: "custom", message: `exam must be one of: ${EXAM_TRACKS.join(", ")}` });
    return z.NEVER;
  }
  return exam;
});

const yearParam = z
  .string()
  .regex(/^\d{4}$/, "year must be a 4-digit year")
  .transform(Number)
  .pipe(z.number().int().min(2000, "year must be 2000 or later").max(2100, "year must be 2100 or earlier"));

const searchParam = z.string().trim().max(100, "q must be 100 characters or fewer");

const single = { error: "Pass this parameter at most once" } as const;

export const programsQuerySchema = z.object({ exam: z.string(single).pipe(examParam).optional() });
export const centresQuerySchema = z.object({
  q: z.string(single).pipe(searchParam).optional(),
  exam: z.string(single).pipe(examParam).optional(),
});
export const resultsQuerySchema = z.object({
  year: z.string(single).pipe(yearParam).optional(),
  exam: z.string(single).pipe(examParam).optional(),
});

/** Slug path segments: lowercase letters, digits and hyphens. Anything else is a 404. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

/**
 * Converts URLSearchParams to a plain object for zod: empty values are treated
 * as absent, repeated keys become arrays (rejected by the schemas), unknown
 * keys are ignored by z.object's default strip behaviour.
 */
function searchParamsToObject(searchParams: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key).filter((value) => value.trim() !== "");
    if (values.length === 1) out[key] = values[0];
    else if (values.length > 1) out[key] = values;
  }
  return out;
}

export type QueryParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Validates query parameters; on failure returns a ready 400 `bad_request` response with field errors. */
export function parseQuery<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
): QueryParseResult<z.output<S>> {
  const result = schema.safeParse(searchParamsToObject(searchParams));
  if (result.success) return { ok: true, data: result.data };
  const { fieldErrors } = z.flattenError(result.error);
  return {
    ok: false,
    response: apiError(400, "bad_request", "Invalid query parameters.", {
      fieldErrors: fieldErrors as Record<string, string[]>,
    }),
  };
}

/** Personal text fields that are only exposed with explicit `granted` consent. */
const CONSENTED_FIELDS = ["studentDisplayName", "school", "quote"] as const;

/** Public projection of a result record: an explicit whitelist, so new internal fields never leak. */
export type PublicResult = Pick<
  ResultRecord,
  "id" | "year" | "exam" | "examLabel" | "programSlug" | "rankOrOutcome" | "destination" | "centreSlug" | "featured" | "sourceReference" | "consentStatus" | "publishedAt" | "status"
> &
  Partial<Pick<ResultRecord, (typeof CONSENTED_FIELDS)[number] | "photo">>;

/**
 * Defence in depth on top of getResults(): personal details (name, school,
 * quote, result-card photo) are only exposed with explicit `granted` consent —
 * never for placeholder records with pending consent, even in preview — and
 * internal fields (verifiedBy, sourceRef…) are never exposed.
 */
export function toPublicResult(record: ResultRecord): PublicResult {
  const publicResult: PublicResult = {
    id: record.id,
    year: record.year,
    exam: record.exam,
    examLabel: record.examLabel,
    programSlug: record.programSlug,
    rankOrOutcome: record.rankOrOutcome,
    destination: record.destination,
    centreSlug: record.centreSlug,
    featured: record.featured,
    sourceReference: record.sourceReference,
    consentStatus: record.consentStatus,
    publishedAt: record.publishedAt,
    status: record.status,
  };
  if (record.consentStatus === "granted") {
    for (const field of CONSENTED_FIELDS) {
      if (record[field]) publicResult[field] = record[field];
    }
    if (record.photo) {
      const { src, alt, width, height } = record.photo;
      publicResult.photo = { src, alt, width, height };
    }
  }
  // Drop undefined keys so the JSON stays compact.
  return Object.fromEntries(Object.entries(publicResult).filter(([, v]) => v !== undefined)) as PublicResult;
}

/**
 * Public projection for content records (centres, programs): drops the internal
 * import provenance `sourceRef` (e.g. "aspire2.thechunkmedia.com/… (fetched …)"),
 * which is for the verification register, not API consumers.
 */
export function withoutInternalFields<T extends { sourceRef?: string }>(record: T): Omit<T, "sourceRef"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally dropped.
  const { sourceRef, ...rest } = record;
  return rest;
}

/**
 * Public projection for centres: `withoutInternalFields` plus the centre `head`
 * (a named staff member with a faculty slug). Faculty info is not published
 * (owner request 2026-10-20, D-030), so no API response carries it.
 */
export function toPublicCentre<T extends { sourceRef?: string; head?: unknown }>(
  record: T,
): Omit<T, "sourceRef" | "head"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally dropped.
  const { sourceRef, head, ...rest } = record;
  return rest;
}
