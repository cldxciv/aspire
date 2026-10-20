import "server-only";

import { z } from "zod";

import { canShowStudentName, getCentres, getPrograms, getRankers, getResults, isPlaceholder } from "@/lib/data";

import { compact, examSchema, limitSchema, offsetSchema, pageSummary, paginate } from "./common";
import { defineTool, READ_ONLY } from "./types";

/**
 * Public website content through the `src/lib/data.ts` accessors, so the website's visibility
 * rules apply unchanged (D-005 / D-020): `published` records, plus `placeholder` records only
 * while showPlaceholderContent() is on (flagged `placeholder: true` = DEMO, not verified). Names
 * only where canShowStudentName(); never result-card photos, images, quotes, schools or internal
 * provenance (`sourceRef`, `verifiedBy`).
 */

const DEMO_NOTE = " Records with placeholder: true are unverified DEMO data (only visible in demo mode); never present them as facts.";

export const listPrograms = defineTool({
  name: "list_programs",
  title: "List programs",
  description:
    "Lists the courses/programs shown on the Aspire website (JEE, NEET, Foundation, Integrated), with title, exam track(s), class level, " +
    "cohort, duration, delivery mode, batch size, short description and fee text when verified. Same visibility rules as the public site." +
    DEMO_NOTE +
    " Paginated: limit 1–100 (default 25) and offset.",
  scope: "read",
  inputSchema: z.object({
    exam: examSchema.optional().describe("Only programs that prepare for this exam track."),
    limit: limitSchema,
    offset: offsetSchema,
  }),
  annotations: READ_ONLY,
  async run(args) {
    const programs = (await getPrograms(args.exam ? { track: args.exam } : undefined)).map((p) =>
      compact({
        id: p.id,
        slug: p.slug,
        title: p.title,
        exam: p.exam,
        tracks: p.tracks ?? [p.exam],
        classLevel: p.classLevel,
        cohortName: p.cohortName,
        targetAudience: p.targetAudience,
        shortDescription: p.shortDescription,
        duration: p.duration,
        deliveryMode: p.deliveryMode,
        batchSize: p.batchSize,
        dailyContactHours: p.dailyContactHours,
        feeDisplay: p.feeDisplay,
        url: `/programs/${p.slug}`,
        status: p.status,
        placeholder: isPlaceholder(p),
      }),
    );
    const page = paginate(programs, args.offset, args.limit);
    return {
      ok: true,
      summary: pageSummary(page, "programs"),
      data: { total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset, programs: page.items },
    };
  },
});

export const listCentres = defineTool({
  name: "list_centres",
  title: "List centres",
  description:
    "Lists Aspire's study centres/campuses shown on the website: name, district, label, headquarters flag, summary, address, phone, email, " +
    "opening hours, exam tracks offered and districts served. Optional query matches name, district or a served district. " +
    "Same visibility rules as the public site." +
    DEMO_NOTE +
    " Paginated: limit 1–100 (default 25) and offset.",
  scope: "read",
  inputSchema: z.object({
    query: z.string().trim().max(100).optional().describe("Matches centre name, district or a district it serves."),
    exam: examSchema.optional().describe("Only centres that offer this exam track."),
    limit: limitSchema,
    offset: offsetSchema,
  }),
  annotations: READ_ONLY,
  async run(args) {
    const centres = (await getCentres({ query: args.query, exam: args.exam })).map((c) =>
      compact({
        id: c.id,
        slug: c.slug,
        name: c.name,
        district: c.district,
        label: c.label,
        isHeadquarters: c.isHeadquarters,
        summary: c.summary,
        address: c.address,
        phone: c.phone,
        email: c.email,
        openingHours: c.openingHours,
        programs: c.programs,
        servesDistricts: c.servesDistricts,
        hostelNote: c.hostelNote,
        transportNote: c.transportNote,
        status: c.status,
        placeholder: isPlaceholder(c),
      }),
    );
    const page = paginate(centres, args.offset, args.limit);
    return {
      ok: true,
      summary: pageSummary(page, "centres"),
      data: { total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset, centres: page.items },
    };
  },
});

export const listResults = defineTool({
  name: "list_results",
  title: "List results",
  description:
    "Lists students' exam results as published on the Aspire website. kind 'results' (default): detailed results (year, exam, rank or outcome, " +
    "destination college/course, centre, featured flag). kind 'rankers': the verified-rankers list (exam, year, college/institute, note such as 'AIR 3238'). " +
    "Exactly the website's rules: only records the site may show, student names only where publication is allowed, no photos, schools or quotes. " +
    "There are no scores in the rankers list; never infer or invent ranks or scores." +
    DEMO_NOTE +
    " Paginated: limit 1–100 (default 25) and offset (newest year first).",
  scope: "read",
  inputSchema: z.object({
    kind: z.enum(["results", "rankers"]).default("results").describe("results (default) or rankers."),
    exam: examSchema.optional(),
    year: z.number().int().min(2000).max(2100).optional().describe("Exam year, e.g. 2025."),
    limit: limitSchema,
    offset: offsetSchema,
  }),
  annotations: READ_ONLY,
  async run(args) {
    const filter = { exam: args.exam, year: args.year };
    const items: Record<string, unknown>[] =
      args.kind === "rankers"
        ? (await getRankers(filter))
            .slice()
            .sort((a, b) => b.year - a.year)
            .map((r) =>
              compact({
                id: r.id,
                name: canShowStudentName(r) ? r.studentDisplayName.trim() : undefined,
                institution: r.institution,
                exam: r.exam,
                year: r.year,
                note: r.note,
                status: r.status,
                placeholder: isPlaceholder(r),
              }),
            )
        : (await getResults(filter)).map((r) =>
            compact({
              id: r.id,
              name: canShowStudentName(r) ? r.studentDisplayName : undefined,
              year: r.year,
              exam: r.exam,
              examLabel: r.examLabel,
              rankOrOutcome: r.rankOrOutcome,
              destination: r.destination,
              programSlug: r.programSlug,
              centreSlug: r.centreSlug,
              featured: r.featured,
              status: r.status,
              placeholder: isPlaceholder(r),
            }),
          );
    const page = paginate(items, args.offset, args.limit);
    return {
      ok: true,
      summary: pageSummary(page, args.kind === "rankers" ? "ranker entries" : "results"),
      data: { kind: args.kind, total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset, items: page.items },
    };
  },
});
