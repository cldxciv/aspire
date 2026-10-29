import { z } from "zod";

import { TEMPLATE_LANGS, TEMPLATE_STATUSES } from "../types";

/**
 * Request bodies of the template write routes (docs/admin-phase-1b-plan.md §5.D, §8; owner:
 * 1B-CALLS). Strict shapes and bounds; the service checks slots, edges and versions. Client-safe.
 */
const version = z.number().int().min(0).max(1_000_000);

/** PUT /api/crm/templates/[key]. */
export const templateEditSchema = z
  .object({
    lang: z.enum(TEMPLATE_LANGS, { error: "Choose English, Hindi or Hinglish." }),
    body: z.string().max(2000, { error: "At most 700 characters." }),
    expectedVersion: version,
  })
  .strict();

/** POST /api/crm/templates/[key]/status. */
export const templateStatusSchema = z
  .object({
    status: z.enum(TEMPLATE_STATUSES, { error: "Choose a status." }),
    expectedVersion: version,
  })
  .strict();

/** PUT /api/crm/templates/links. */
export const waLinksSchema = z
  .object({
    prospectusUrl: z.string().max(400, { error: "At most 300 characters." }).nullable(),
    expectedVersion: version,
  })
  .strict();
