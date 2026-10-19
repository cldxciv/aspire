import { z } from "zod";
import type { ApiError } from "./api";

/**
 * Enquiry contract — FROZEN (docs/agent-decisions.md D-008).
 * Shared by the client form (client-side validation) and POST /api/enquiries
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

/** Indian mobile number: optional +91/91/0 prefix, then 10 digits starting 6–9. Spaces and hyphens ignored. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(?:\+?91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

const baseFields = {
  // Neutral wording: quick/admissions ask for the student's name, contact asks for "Your name".
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

export const enquirySchema = z.discriminatedUnion("source", [
  // Home page hero card (Enquiry / Scholarship tabs).
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
    /** Centre slug or "not-sure". Free text is not accepted (the server also checks the slug exists). */
    preferredCentre: z
      .string()
      .trim()
      .max(60)
      .regex(/^$|^not-sure$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Select a centre from the list")
      .optional(),
  }),
  // /contact form.
  z.object({
    source: z.literal("contact"),
    ...baseFields,
    topic: z.enum(values(CONTACT_TOPIC_OPTIONS), { error: "Select a topic" }),
  }),
]);

export type EnquirySource = z.infer<typeof enquirySchema>["source"];
/** What the client sends (before transforms/defaults). */
export type EnquiryInput = z.input<typeof enquirySchema>;
/** What the server works with after validation. */
export type Enquiry = z.output<typeof enquirySchema>;

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
