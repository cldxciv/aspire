import { z } from "zod";

import { LOST_REVIEW_DECISIONS, REOPEN_FOLLOW_UP_PRESETS, REOPEN_STAGES } from "./types";

/**
 * Body of POST /api/crm/lost-review/[leadId] (docs/admin-phase-1b-plan.md §5.H; owner: 1B-FAMILY):
 * `{ lostAt, decision: "kept" }` or `{ lostAt, decision: "reopened", reopenTo?, assigneeId?, followUp? }`.
 * Strict; the service checks the event, the lead and the follow-up time. Client-safe.
 */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "Invalid id." });

export const reopenFollowUpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), preset: z.enum(REOPEN_FOLLOW_UP_PRESETS, { error: "Choose when to follow up." }) }).strict(),
  z.object({ kind: z.literal("at"), at: z.string().min(10).max(40) }).strict(),
]);

export const lostReviewInputSchema = z
  .object({
    lostAt: z.string().min(10).max(40),
    decision: z.enum(LOST_REVIEW_DECISIONS, { error: "Choose keep lost or reopen." }),
    reopenTo: z.enum(REOPEN_STAGES, { error: "Choose an open stage." }).nullable().optional(),
    assigneeId: id.nullable().optional(),
    followUp: reopenFollowUpSchema.nullable().optional(),
  })
  .strict();

export type LostReviewBody = z.infer<typeof lostReviewInputSchema>;
