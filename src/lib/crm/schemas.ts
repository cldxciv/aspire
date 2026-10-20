import { z } from "zod";

import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  CRM_ROLES,
  EDITABLE_LEAD_FIELDS,
  LEAD_STAGES,
  LOST_REASONS,
  MANUAL_LEAD_SOURCES,
} from "./types";

/**
 * Request bodies for /api/crm/**. Shapes and bounds only; the services re-validate values
 * (phone, names, slugs, dates) so every entry point applies the same rules. Client-safe: CRM-UI
 * may reuse these for early feedback.
 */

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "Invalid id." });
const shortText = (max: number) => z.string().max(max, { error: `At most ${max} characters.` });
const nullableText = (max: number) => shortText(max).nullable().optional();

export const leadFieldsSchema = z
  .object(Object.fromEntries(EDITABLE_LEAD_FIELDS.map((field) => [field, nullableText(254)])) as Record<
    (typeof EDITABLE_LEAD_FIELDS)[number],
    ReturnType<typeof nullableText>
  >)
  .strict();

export const leadPatchSchema = z
  .object({
    stage: z.enum(LEAD_STAGES, { error: "Choose a valid stage." }).optional(),
    lostReason: z.enum(LOST_REASONS, { error: "Choose why this lead was lost." }).nullable().optional(),
    assigneeId: id.nullable().optional(),
    fields: leadFieldsSchema.optional(),
  })
  .strict()
  .refine(
    (body) => body.stage !== undefined || body.lostReason !== undefined || body.assigneeId !== undefined || body.fields !== undefined,
    { error: "Nothing to change." },
  );
export type LeadPatchBody = z.infer<typeof leadPatchSchema>;

export const manualLeadSchema = z
  .object({
    source: z.enum(MANUAL_LEAD_SOURCES, { error: "Choose where this lead came from." }),
    studentName: nullableText(80),
    guardianName: nullableText(80),
    phone: shortText(32),
    email: nullableText(254),
    currentClass: nullableText(60),
    programInterest: nullableText(60),
    centreSlug: nullableText(60),
    note: nullableText(2000),
    consent: z.literal(true, { error: "Confirm the family agreed to be contacted." }),
  })
  .strict();
export type ManualLeadBody = z.infer<typeof manualLeadSchema>;

export const noteSchema = z.object({ body: shortText(2000).min(1, { error: "Write a note." }) }).strict();

export const contactSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS, { error: "Choose call or WhatsApp." }),
    outcome: z.enum(CONTACT_OUTCOMES, { error: "Choose an outcome." }),
    body: nullableText(2000),
  })
  .strict();

export const taskSchema = z
  .object({
    title: shortText(200).min(1, { error: "Describe the follow-up." }),
    dueAt: shortText(40).min(1, { error: "Choose a due date." }),
    assigneeId: id.nullable().optional(),
  })
  .strict();

export const taskPatchSchema = z.object({ done: z.literal(true, { error: "Send done: true." }) }).strict();

export const eraseSchema = z.object({ confirm: z.literal(true, { error: "Send confirm: true." }) }).strict();

export const staffSchema = z
  .object({
    crmRole: z.enum(CRM_ROLES, { error: "Choose counsellor or manager." }),
    centreSlugs: z.array(shortText(60)).max(20, { error: "At most 20 centres." }).default([]),
    active: z.boolean({ error: "active must be true or false." }).default(true),
  })
  .strict();

export const rulesSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            centreSlug: nullableText(60),
            programInterest: nullableText(60),
            memberIds: z.array(id).min(1, { error: "Choose at least one member." }).max(50),
            active: z.boolean().default(true),
          })
          .strict(),
      )
      .max(50, { error: "At most 50 rules." }),
  })
  .strict();

/** `crm` part of POST /api/admin/users when `role` is `staff`. */
export const staffAccountCrmSchema = z
  .object({
    crmRole: z.enum(CRM_ROLES, { error: "Choose counsellor or manager." }).default("counsellor"),
    centreSlugs: z.array(shortText(60)).max(20, { error: "At most 20 centres." }).default([]),
  })
  .strict();
