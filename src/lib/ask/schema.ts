import { z } from "zod";

import { TOOL_CONTEXT_MAX_CHARS, type RanchoTool, type RanchoToolContext } from "./cards";
import {
  ASK_IMAGE_TYPES,
  ASK_LANGUAGES,
  ASK_MAX_BODY_BYTES,
  ASK_MAX_QUESTION_CHARS,
  ASK_SUBJECT_HINTS,
} from "./constants";

/** Tools that can hand a question over to Rancho (`RanchoTool` in ./cards). */
export const RANCHO_TOOL_IDS = ["predictor", "mock-test", "planner"] as const satisfies readonly RanchoTool[];
// Compile-time check that the list covers the whole union.
type MissingToolId = Exclude<RanchoTool, (typeof RANCHO_TOOL_IDS)[number]>;
const toolIdsComplete: MissingToolId extends never ? true : false = true;
void toolIdsComplete;

/**
 * `POST /api/ask` JSON body (≤ ASK_MAX_BODY_BYTES):
 * `{ question?, subject?, language, image?: { mediaType, data (base64) }, photoConsent?, toolContext? }`.
 * At least a question or an image is required; an image requires `photoConsent: true`.
 * `toolContext` (`RanchoToolContext`, ./cards): `{ tool, summary ≤ TOOL_CONTEXT_MAX_CHARS }` from an
 * "Ask Rancho about this" handoff. It is untrusted plain text: cleaned with `cleanToolContext()`
 * and given to the model as marked background information, never as instructions.
 */
export const askRequestSchema = z.object({
  question: z.string().max(ASK_MAX_QUESTION_CHARS * 2).optional(),
  subject: z.enum(ASK_SUBJECT_HINTS).optional(),
  language: z.enum(ASK_LANGUAGES),
  image: z
    .object({
      mediaType: z.enum(ASK_IMAGE_TYPES),
      data: z.string().min(1).max(ASK_MAX_BODY_BYTES),
    })
    .nullable()
    .optional(),
  photoConsent: z.boolean().optional(),
  toolContext: z
    .object({
      tool: z.enum(RANCHO_TOOL_IDS),
      summary: z.string().max(TOOL_CONTEXT_MAX_CHARS),
    })
    .nullable()
    .optional(),
});

export type AskRequestBody = z.infer<typeof askRequestSchema>;

/** Removes control characters (keeps newlines and tabs), normalises newlines and trims. */
export function cleanQuestion(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/**
 * A handoff summary as one plain line: control characters (newlines included) become spaces,
 * whitespace collapses, and the prompt's own wrapper tags cannot be opened or closed from it.
 */
export function cleanToolSummary(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/<\s*\/?\s*(?:question|tool_context|aspire-meta)\b[^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOOL_CONTEXT_MAX_CHARS);
}

/** The validated handoff, cleaned; null when absent or empty after cleaning. */
export function cleanToolContext(value: AskRequestBody["toolContext"]): RanchoToolContext | null {
  if (!value) return null;
  const summary = cleanToolSummary(value.summary);
  return summary ? { tool: value.tool, summary } : null;
}

export const ASK_FIELD_MESSAGES = {
  questionRequired: "Type your question or add a photo of it.",
  questionTooLong: `Please keep the question under ${ASK_MAX_QUESTION_CHARS} characters.`,
  consentRequired: "Please confirm the photo has no faces or names before sending it.",
  imageTooLarge: "The photo is too large. Please use a photo under 4 MB.",
  imageInvalid: "Please send a JPG, PNG or WebP photo.",
} as const;

/** Cross-field rules (zod handles the shape). Returns field errors, or null when valid. */
export function askFieldErrors(body: AskRequestBody, question: string): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (question.length > ASK_MAX_QUESTION_CHARS) errors.question = [ASK_FIELD_MESSAGES.questionTooLong];
  else if (!question && !body.image) errors.question = [ASK_FIELD_MESSAGES.questionRequired];
  if (body.image && body.photoConsent !== true) errors.photoConsent = [ASK_FIELD_MESSAGES.consentRequired];
  return Object.keys(errors).length > 0 ? errors : null;
}
