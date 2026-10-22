import { z } from "zod";

import { ALIAS_KINDS, REASSIGN_SCOPES, ROUTING_MODES } from "../lead-ops-types";

/**
 * Request bodies for the lead-routing routes (owner LR-ROUTING; docs/lead-routing-plan.md §21).
 * Shapes and bounds only: the services (./areas-service.ts) re-validate every value (names,
 * centre slugs, area ids, dates) and decide who may do what. Client-safe.
 */

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "Invalid id." });
const text = (max: number) => z.string().max(max, { error: `At most ${max} characters.` });
const slug = z.string().max(60);

export const areaCreateSchema = z.object({
  id: text(48).optional(),
  nameEn: text(120),
  nameHi: text(120),
  defaultCentreSlug: slug.nullable().optional(),
});

export const areaPatchSchema = z.object({
  nameEn: text(120).optional(),
  nameHi: text(120).optional(),
  defaultCentreSlug: slug.nullable().optional(),
  centres: z.array(slug).max(20).optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(1000).optional(),
});

export const areaMembersSchema = z.object({
  members: z
    .array(z.object({ userId: id, centreSlug: slug.nullable().optional(), takesLeads: z.boolean().optional() }))
    .max(200),
});

export const aliasAddSchema = z.object({
  label: text(120),
  kind: z.enum(ALIAS_KINDS, { error: "Choose a kind." }),
  placeKey: text(60).nullable().optional(),
});

export const aliasRemoveSchema = z.object({ key: text(60).min(1) });

export const areaMergeSchema = z.object({
  from: id,
  into: id,
  people: z.array(z.object({ userId: id, action: z.enum(["move", "remove"]) })).max(200),
});

export const setupFromCentreSchema = z.object({
  centreSlug: slug,
  headIds: z.array(id).max(100),
  executiveIds: z.array(id).max(200),
  headsTakeCalls: z.boolean(),
});

export const emptyBodySchema = z.object({});

export const reassignSchema = z.object({
  fromUserId: id,
  scope: z.enum(REASSIGN_SCOPES),
  toUserId: id.nullable().optional(),
});

export const availabilitySchema = z.object({
  userId: id,
  awayUntil: text(40).nullable(),
  note: text(200).nullable().optional(),
});

export const leadAreaSchema = z.object({ areaId: id.nullable() });

export const routingModeSchema = z.object({
  mode: z.enum(ROUTING_MODES),
  expectedVersion: z.number().int().min(0),
});

export const personAreasSchema = z.object({ areaIds: z.array(id).max(60) });
