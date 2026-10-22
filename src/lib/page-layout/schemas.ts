import { z } from "zod";

import { SECTION_KEY_PATTERN } from "./registry";

/**
 * Body of `POST /api/admin/page-layout/[page]` (docs/page-layout-plan.md §9). Strict: unknown
 * fields are rejected. Unknown, pinned and missing section keys are NOT schema errors (D12): the
 * store normalises them; real rule violations come back as 422 issue codes.
 */
const revision = z.number().int().min(0).max(2 ** 31);

const entry = z.object({ key: z.string().regex(SECTION_KEY_PATTERN), hidden: z.boolean() }).strict();

export const layoutWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_draft"), revision, sections: z.array(entry).max(32) }).strict(),
  z.object({ action: z.literal("discard_draft"), revision }).strict(),
  z.object({ action: z.literal("publish"), revision }).strict(),
  z.object({ action: z.literal("reset"), revision }).strict(),
]);

export type LayoutWriteBody = z.infer<typeof layoutWriteSchema>;
