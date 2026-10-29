import { z } from "zod";

import { CONTACT_CHANNELS, CONTACT_OUTCOMES } from "../../types";
import { FOLLOW_UP_PRESETS, TEMPLATE_KEY_PATTERN, TEMPLATE_LANGS } from "../types";

/**
 * Body of POST /api/crm/leads/[leadId]/outcome (`OutcomeInput`, docs/admin-phase-1b-plan.md §5.C;
 * owner: 1B-CALLS). Shapes and bounds only, strict (unknown keys refused); `recordOutcome` applies
 * the rules (which outcome fits which channel, when "no follow-up" is allowed, the 08:00–21:00 limit).
 * Client-safe.
 */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "Invalid id." });

export const NEXT_FOLLOW_UP_REASONS = ["wrong_number", "closing", "has_other_task"] as const;

export const nextFollowUpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), preset: z.enum(FOLLOW_UP_PRESETS, { error: "Choose when to follow up." }) }).strict(),
  z.object({ kind: z.literal("at"), at: z.string().min(10).max(40) }).strict(),
  z.object({ kind: z.literal("none"), reason: z.enum(NEXT_FOLLOW_UP_REASONS) }).strict(),
]);

export const outcomeInputSchema = z
  .object({
    contact: z
      .object({
        channel: z.enum(CONTACT_CHANNELS, { error: "Choose call or WhatsApp." }),
        outcome: z.enum(CONTACT_OUTCOMES, { error: "Choose what happened." }),
        note: z.string().max(2000, { error: "At most 2000 characters." }).nullable().optional(),
        template: z
          .object({
            key: z.string().regex(TEMPLATE_KEY_PATTERN, { error: "Choose a known template." }),
            lang: z.enum(TEMPLATE_LANGS, { error: "Choose English, Hindi or Hinglish." }),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict()
      .nullable(),
    taskId: id.nullable().optional(),
    next: nextFollowUpSchema,
    nextTitle: z.string().max(200, { error: "At most 200 characters." }).nullable().optional(),
    markNotReachable: z.boolean().optional(),
    markLostWrongNumber: z.boolean().optional(),
  })
  .strict();

export type OutcomeInputBody = z.infer<typeof outcomeInputSchema>;
