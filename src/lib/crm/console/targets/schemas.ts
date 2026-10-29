import { z } from "zod";

import { CONSOLE_PROGRAMS, TARGET_METRICS } from "../types";

/**
 * Request body of PUT /api/crm/targets (docs/admin-phase-1b-plan.md §5.B, O6; owner: 1B-NUMBERS).
 * Client-safe. 1b writes SESSION periods only (`S2026`; month periods `M2026-11` are refused here
 * although the table's CHECK accepts them for a later phase). One request replaces every cell of
 * one period × metric; an empty box is simply a missing cell. Unknown centre slugs are allowed
 * (the real centre list is pending, decision 7); programme and metric are closed lists here.
 */

/** Largest target value (the table's CHECK). */
export const TARGET_MAX = 100_000;
/** At most this many cells per request (60 centres × 5 programmes). */
export const MAX_TARGET_CELLS = 300;

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export const targetCellSchema = z.strictObject({
  centreSlug: z.string().min(1).max(60).regex(SLUG, "Use centre slugs such as shimla."),
  program: z.enum(CONSOLE_PROGRAMS),
  value: z.number().int("Use whole numbers.").min(0, "Use 0 or more.").max(TARGET_MAX, `Use at most ${TARGET_MAX}.`),
});

export const targetsBodySchema = z
  .strictObject({
    period: z.string().regex(/^S\d{4}$/, "Choose a session such as S2026."),
    metric: z.enum(TARGET_METRICS),
    cells: z.array(targetCellSchema).max(MAX_TARGET_CELLS),
    /** The `updatedAt` the editor loaded (null = no targets yet for the period). */
    expectedUpdatedAt: z.string().max(40).nullable(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.cells.forEach((cell, index) => {
      const key = `${cell.centreSlug}|${cell.program}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["cells", index], message: "Each centre and programme once." });
      seen.add(key);
    });
  });

export type TargetsBody = z.infer<typeof targetsBodySchema>;
