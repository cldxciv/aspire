import { z } from "zod";

import {
  ASK_IMAGE_TYPES,
  ASK_LANGUAGES,
  ASK_MAX_BODY_BYTES,
  ASK_MAX_QUESTION_CHARS,
  ASK_SUBJECT_HINTS,
} from "./constants";

/**
 * `POST /api/ask` JSON body (≤ ASK_MAX_BODY_BYTES):
 * `{ question?, subject?, language, image?: { mediaType, data (base64) }, photoConsent? }`.
 * At least a question or an image is required; an image requires `photoConsent: true`.
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
