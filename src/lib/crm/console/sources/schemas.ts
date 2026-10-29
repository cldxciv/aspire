import { z } from "zod";

/**
 * Request body of PUT /api/crm/settings/centre-links (docs/admin-phase-1b-plan.md §3, §5.J;
 * owner: 1B-SOURCES). Strict SHAPE and bounds only: CORE's `validateCentreLinks` then checks each
 * slug and that every link is an https Google Maps link of at most 300 characters, answering with
 * per-centre field errors (`centres.<slug>.mapsUrl`), so the bound here is looser on purpose. Client-safe.
 */
export const centreLinksBodySchema = z.strictObject({
  centres: z.record(z.string().min(1).max(60), z.strictObject({ mapsUrl: z.string().max(2048).nullable() })),
  expectedVersion: z.number().int().min(0).max(1_000_000),
});

export type CentreLinksBody = z.infer<typeof centreLinksBodySchema>;
