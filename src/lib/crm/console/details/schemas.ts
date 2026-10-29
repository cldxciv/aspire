import { z } from "zod";

import { BOARDS, DECISION_MAKERS, HEARD_VIA, HOSTEL_ANSWERS, PREFERRED_TIMES, TARGET_EXAMS } from "../types";
import { REFERRED_BY_MAX, SCHOOL_MAX } from "./rules";

/**
 * Body of PUT /api/crm/leads/[leadId]/details (docs/admin-phase-1b-plan.md §5.E; owner: 1B-FAMILY):
 * a PARTIAL, strict `LeadMoreDetails` — only the fields that change; `null` clears one. Open
 * vocabularies are checked here against the code's tuples (the SQL only checks lengths, §3).
 * The service applies the rules that need the lead or the date (normalised second number, not the
 * main number, target year and joining session in range). Client-safe.
 */
const optionalText = (max: number) =>
  z
    .string()
    .max(max * 2, { error: `At most ${max} characters.` })
    .refine((value) => value.trim().length <= max, { error: `At most ${max} characters.` })
    .nullable()
    .optional();

export const leadDetailsPatchSchema = z
  .object({
    altPhone: z.string().max(32, { error: "Enter a 10-digit Indian mobile number." }).nullable().optional(),
    school: optionalText(SCHOOL_MAX),
    board: z.enum(BOARDS, { error: "Choose one of the boards." }).nullable().optional(),
    hostel: z.enum(HOSTEL_ANSWERS, { error: "Choose yes, no or maybe." }).nullable().optional(),
    targetExam: z.enum(TARGET_EXAMS, { error: "Choose one of the exams." }).nullable().optional(),
    targetYear: z.number({ error: "Choose a year." }).int().min(2024).max(2040).nullable().optional(),
    heardVia: z.enum(HEARD_VIA, { error: "Choose how they heard about us." }).nullable().optional(),
    referredBy: optionalText(REFERRED_BY_MAX),
    intakeSession: z.string().regex(/^S\d{4}$/, { error: "Choose a session." }).nullable().optional(),
    preferredTime: z.enum(PREFERRED_TIMES, { error: "Choose a time of day." }).nullable().optional(),
    decisionMaker: z.enum(DECISION_MAKERS, { error: "Choose who decides." }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { error: "Change at least one detail." });

export type LeadDetailsPatch = z.infer<typeof leadDetailsPatchSchema>;
