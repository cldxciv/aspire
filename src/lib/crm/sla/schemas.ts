import { z } from "zod";

/**
 * Request body of PUT /api/crm/settings/speed (owner LR-SLA; docs/lead-routing-plan.md §21).
 * Shape and bounds only: the documents themselves are validated by CORE's `validateCallingHours`
 * / `validateSpeedRule` (src/lib/crm/settings.ts), which return field errors. Client-safe.
 */
const version = z.number().int().min(0).max(1_000_000);

export const speedSettingsSchema = z.object({
  callingHours: z.record(z.string(), z.unknown()).optional(),
  speedRule: z.record(z.string(), z.unknown()).optional(),
  expectedVersion: z.object({ callingHours: version.optional(), speedRule: version.optional() }),
});

export type SpeedSettingsRequest = z.infer<typeof speedSettingsSchema>;
