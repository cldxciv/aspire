import { z } from "zod";
import type { ApiError } from "./api";

/**
 * Enquiry contract — FROZEN (docs/agent-decisions.md D-008, D-016, D-021).
 * Shared by the client forms (client-side validation) and POST /api/enquiries
 * (authoritative server-side validation). Change only via the Orchestrator.
 */

export const CLASS_OPTIONS = [
  { value: "class-6-8", label: "Class 6–8" },
  { value: "class-9", label: "Class 9" },
  { value: "class-10", label: "Class 10" },
  { value: "class-11", label: "Class 11" },
  { value: "class-12", label: "Class 12" },
  { value: "dropper", label: "Dropper" },
] as const;

export const PROGRAM_INTEREST_OPTIONS = [
  { value: "jee", label: "IIT JEE" },
  { value: "neet", label: "NEET" },
  { value: "foundation", label: "Foundation" },
  { value: "integrated", label: "Integrated program" },
  { value: "not-sure", label: "Not sure yet" },
] as const;

export const CONTACT_TOPIC_OPTIONS = [
  { value: "course-information", label: "Course information" },
  { value: "admissions", label: "Admissions" },
  { value: "scholarship", label: "Scholarship" },
  { value: "centre-information", label: "Centre information" },
  { value: "other", label: "Other" },
] as const;

type OptionValues<T extends readonly { value: string }[]> = [T[number]["value"], ...T[number]["value"][]];
const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((o) => o.value) as OptionValues<T>;

type ClassValue = (typeof CLASS_OPTIONS)[number]["value"];
type ProgramValue = (typeof PROGRAM_INTEREST_OPTIONS)[number]["value"];

/**
 * Hero step 1 "Class / Target Exam": one select whose options are the valid
 * (class, program) pairs, shown grouped by `group` (<optgroup>). Labels are
 * self-contained because a closed select shows only the option label.
 * The submitted `classOrExam` is mapped back to `currentClass` + `programInterest`
 * when the enquiry is parsed, so destinations receive the same fields as the
 * quick and admissions forms. Adding a pair is additive; existing values must stay stable.
 */
export const HERO_CLASS_EXAM_OPTIONS = [
  { value: "jee-class-11", label: "IIT JEE – Class 11", group: "IIT JEE", currentClass: "class-11", programInterest: "jee" },
  { value: "jee-class-12", label: "IIT JEE – Class 12", group: "IIT JEE", currentClass: "class-12", programInterest: "jee" },
  { value: "jee-dropper", label: "IIT JEE – Dropper", group: "IIT JEE", currentClass: "dropper", programInterest: "jee" },
  { value: "neet-class-11", label: "NEET – Class 11", group: "NEET", currentClass: "class-11", programInterest: "neet" },
  { value: "neet-class-12", label: "NEET – Class 12", group: "NEET", currentClass: "class-12", programInterest: "neet" },
  { value: "neet-dropper", label: "NEET – Dropper", group: "NEET", currentClass: "dropper", programInterest: "neet" },
  {
    // Foundation runs Class 8–10 (programs data + design): label says Class 8; the stored
    // class bucket stays "class-6-8" and the value stays stable for receivers.
    value: "foundation-class-6-8",
    label: "Foundation – Class 8",
    group: "Foundation",
    currentClass: "class-6-8",
    programInterest: "foundation",
  },
  {
    value: "foundation-class-9",
    label: "Foundation – Class 9",
    group: "Foundation",
    currentClass: "class-9",
    programInterest: "foundation",
  },
  {
    value: "foundation-class-10",
    label: "Foundation – Class 10",
    group: "Foundation",
    currentClass: "class-10",
    programInterest: "foundation",
  },
  {
    value: "not-sure-class-11",
    label: "Not sure yet – Class 11",
    group: "Not sure yet",
    currentClass: "class-11",
    programInterest: "not-sure",
  },
  {
    value: "not-sure-class-12",
    label: "Not sure yet – Class 12",
    group: "Not sure yet",
    currentClass: "class-12",
    programInterest: "not-sure",
  },
  {
    value: "not-sure-dropper",
    label: "Not sure yet – Dropper",
    group: "Not sure yet",
    currentClass: "dropper",
    programInterest: "not-sure",
  },
] as const satisfies readonly {
  value: string;
  label: string;
  group: string;
  currentClass: ClassValue;
  programInterest: ProgramValue;
}[];

export type HeroClassExamOption = (typeof HERO_CLASS_EXAM_OPTIONS)[number];

/** The (class, program) pair behind a validated `classOrExam` value. */
export function heroClassExamOption(value: HeroClassExamOption["value"]): HeroClassExamOption {
  const option = HERO_CLASS_EXAM_OPTIONS.find((o) => o.value === value);
  // Unreachable: `value` has already passed the enum. The message never contains input.
  if (!option) throw new Error("Unknown classOrExam value");
  return option;
}

/** Indian mobile number: optional +91/91/0 prefix, then 10 digits starting 6–9. Spaces and hyphens ignored. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(?:\+?91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

const baseFields = {
  // Neutral wording: quick/admissions/hero ask for the student's name, contact asks for "Your name".
  name: z.string().trim().min(2, "Enter a name (at least 2 characters)").max(80, "Name is too long"),
  phone: phoneSchema,
  email: z.union([z.literal(""), z.email("Enter a valid email address")]).optional(),
  message: z.string().trim().max(1000, "Message must be 1000 characters or fewer").optional(),
  consent: z.literal(true, { error: "Please confirm you agree to be contacted about this enquiry" }),
  /** Honeypot. Real users never fill this; the server silently drops submissions where it is set. */
  website: z.string().optional(),
};

const classField = z.enum(values(CLASS_OPTIONS), { error: "Select the current class" });
const programField = z.enum(values(PROGRAM_INTEREST_OPTIONS), { error: "Select a program" });

/**
 * Centre slug or "not-sure" (admissions + hero). Free text is not accepted; the
 * server also checks the slug is a centre getCentres() publishes (D-016).
 */
const preferredCentreField = z
  .string()
  .trim()
  .max(60)
  .regex(/^$|^not-sure$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Select a centre from the list")
  .optional();

/** Parent/guardian name (hero only). Required (D-021a); trimmed, 2–80 characters. Never logged. */
const guardianNameField = z
  .string({ error: "Enter the parent or guardian's name" })
  .trim()
  .min(2, "Enter the parent or guardian's name")
  .max(80, "Parent or guardian name is too long");

// ── Home page hero: 3-step form (D-021) ──────────────────────────────────────
// Each step is its own schema so the client can validate one step at a time.
// The `hero` variant is composed from these shapes, so every rule exists once.

/** Step 1 — the student: name and class / target exam. */
export const heroStudentStepSchema = z.object({
  name: baseFields.name,
  classOrExam: z.enum(values(HERO_CLASS_EXAM_OPTIONS), { error: "Select a class / target exam" }),
});

/** Step 2 — who Aspire should contact. `email` stays optional; the hero UI does not render it (D-021a). */
export const heroContactStepSchema = z.object({
  guardianName: guardianNameField,
  phone: baseFields.phone,
  email: baseFields.email,
});

/** Step 3 — preferred centre, message and consent. */
export const heroDetailsStepSchema = z.object({
  preferredCentre: preferredCentreField,
  message: baseFields.message,
  consent: baseFields.consent,
});

/** Step schemas in display order. Unknown keys are stripped, so a step can be checked against the whole payload. */
export const HERO_STEP_SCHEMAS = [heroStudentStepSchema, heroContactStepSchema, heroDetailsStepSchema] as const;

export type HeroStepIndex = 0 | 1 | 2;

/** Field names per step, in display order — derived from the schemas, never repeated by hand. */
export const HERO_STEP_FIELDS = [
  heroStudentStepSchema.keyof().options,
  heroContactStepSchema.keyof().options,
  heroDetailsStepSchema.keyof().options,
] as const;

export type HeroFieldName = (typeof HERO_STEP_FIELDS)[number][number];

/** The step that renders `field`, or null ("source", "website", unknown). Used to jump back to the first step with an error. */
export function heroStepOfField(field: string): HeroStepIndex | null {
  const index = HERO_STEP_FIELDS.findIndex((fields) => (fields as readonly string[]).includes(field));
  return index === -1 ? null : (index as HeroStepIndex);
}

/** Validates one step. Returns null when valid, otherwise that step's field errors (same messages as the full schema). */
export function validateHeroStep(
  step: HeroStepIndex,
  payload: unknown,
): Partial<Record<HeroFieldName, string[]>> | null {
  const schema: z.ZodType = HERO_STEP_SCHEMAS[step];
  const result = schema.safeParse(payload);
  return result.success ? null : (z.flattenError(result.error).fieldErrors as Partial<Record<HeroFieldName, string[]>>);
}

/**
 * `hero` variant: the three steps plus the honeypot. After validation,
 * `classOrExam` is replaced by `currentClass` + `programInterest`.
 */
export const heroEnquirySchema = z
  .object({
    source: z.literal("hero"),
    ...heroStudentStepSchema.shape,
    ...heroContactStepSchema.shape,
    ...heroDetailsStepSchema.shape,
    /** Honeypot — not part of any step; the form renders it once. */
    website: baseFields.website,
  })
  .transform(({ classOrExam, ...rest }) => {
    const { currentClass, programInterest } = heroClassExamOption(classOrExam);
    return { ...rest, currentClass, programInterest };
  });

export const enquirySchema = z.discriminatedUnion("source", [
  // Former single-step home page card (Enquiry / Scholarship tabs). No page renders it once the
  // hero form ships; still accepted so pages loaded before the switch can submit (D-021).
  z.object({
    source: z.literal("quick"),
    ...baseFields,
    currentClass: classField,
    programInterest: programField,
    intent: z.enum(["enquiry", "scholarship"]).default("enquiry"),
  }),
  // /admissions form.
  z.object({
    source: z.literal("admissions"),
    ...baseFields,
    currentClass: classField,
    programInterest: programField,
    preferredCentre: preferredCentreField,
  }),
  // /contact form.
  z.object({
    source: z.literal("contact"),
    ...baseFields,
    topic: z.enum(values(CONTACT_TOPIC_OPTIONS), { error: "Select a topic" }),
  }),
  // Home page hero, 3-step form (D-021).
  heroEnquirySchema,
]);

export type EnquirySource = z.infer<typeof enquirySchema>["source"];
/** What the client sends (before transforms/defaults). */
export type EnquiryInput = z.input<typeof enquirySchema>;
/** What the server works with after validation. */
export type Enquiry = z.output<typeof enquirySchema>;
/** What the hero form sends. */
export type HeroEnquiryInput = z.input<typeof heroEnquirySchema>;

/**
 * POST /api/enquiries responses.
 * - 201 `received`: a configured destination accepted the enquiry.
 * - 200 `not_configured`: input was valid but NO destination is configured, so
 *   nothing was sent or stored. The UI must say so plainly — never "submitted".
 * - 4xx/5xx: ApiError (validation → 422 with fieldErrors).
 */
export type EnquiryResponse =
  | { ok: true; status: "received"; reference: string; message: string }
  | { ok: true; status: "not_configured"; message: string }
  | ApiError;
