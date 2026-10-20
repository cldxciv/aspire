/**
 * Per-service MCP permissions for the admin UI (owner: MCP-ADMIN): the create form's matrix logic.
 * Pure and client-safe; the catalogue comes from src/lib/mcp/scopes.ts (MCP-CORE, also client-safe).
 *
 * Rules (mirroring the backend contract):
 * - Scope strings are `<service>:read` or `<service>:write`; write implies read.
 * - `:write` exists only for services that have write tools (`hasWrite`).
 * - Unavailable services (`available: false`) can't be granted.
 * - Explicit-only services (families' lead data in the CRM) are never ticked by a preset; the admin
 *   has to tick them one by one, so a "Read only" token doesn't quietly include lead data.
 */

import { MCP_SERVICES, type McpService } from "@/lib/mcp/scopes";

export type McpAccess = "none" | "read" | "write";

/** One MCP service as the admin UI needs it (plain data, so tests can use their own catalogue). */
export type McpServiceView = {
  id: string;
  readTools: string[];
  writeTools: string[];
  hasWrite: boolean;
  available: boolean;
  explicitOnly: boolean;
};

/** Services the presets leave alone: personal data of enquiring families (D-042). */
const EXPLICIT_ONLY_SERVICES: ReadonlySet<string> = new Set(["crm"]);

export function toServiceView(service: McpService): McpServiceView {
  return {
    id: service.id,
    readTools: [...service.tools.read],
    writeTools: [...service.tools.write],
    hasWrite: service.hasWrite,
    available: service.available,
    explicitOnly: EXPLICIT_ONLY_SERVICES.has(service.id),
  };
}

/** The real catalogue (src/lib/mcp/scopes.ts), in display order. */
export const MCP_SERVICE_VIEWS: readonly McpServiceView[] = MCP_SERVICES.map(toServiceView);

/** service id → access. Missing ids mean "none". */
export type PermissionState = Record<string, McpAccess>;

const RANK: Record<McpAccess, number> = { none: 0, read: 1, write: 2 };

export function accessOf(state: PermissionState, serviceId: string): McpAccess {
  const value = state[serviceId];
  return value === "read" || value === "write" ? value : "none";
}

function grantable(service: McpServiceView, access: McpAccess): McpAccess {
  if (!service.available) return "none";
  if (access === "write" && !service.hasWrite) return "read";
  return access;
}

/** Ticking Read grants read (keeps write); unticking Read removes write too. */
export function setRead(state: PermissionState, service: McpServiceView, on: boolean): PermissionState {
  const current = accessOf(state, service.id);
  const next: McpAccess = on ? (current === "write" ? "write" : "read") : "none";
  return { ...state, [service.id]: grantable(service, next) };
}

/** Ticking Write also ticks Read; unticking Write leaves Read on. No-op where there are no write tools. */
export function setWrite(state: PermissionState, service: McpServiceView, on: boolean): PermissionState {
  const next: McpAccess = on ? "write" : accessOf(state, service.id) === "none" ? "none" : "read";
  return { ...state, [service.id]: grantable(service, next) };
}

export type PermissionPreset = "readOnly" | "full" | "clear";

/**
 * "Read only": every available service at read. "Full access": everything available at its highest
 * level. Neither ticks an explicit-only service; "Clear" unticks everything.
 */
export function applyPreset(services: readonly McpServiceView[], preset: PermissionPreset): PermissionState {
  const state: PermissionState = {};
  for (const service of services) {
    state[service.id] =
      preset === "clear" || service.explicitOnly ? "none" : grantable(service, preset === "full" ? "write" : "read");
  }
  return state;
}

/** The preset that `state` matches exactly, if any (for `aria-pressed` on the preset buttons). */
export function matchingPreset(services: readonly McpServiceView[], state: PermissionState): PermissionPreset | null {
  for (const preset of ["readOnly", "full", "clear"] as const) {
    const target = applyPreset(services, preset);
    if (services.every((service) => accessOf(state, service.id) === accessOf(target, service.id))) return preset;
  }
  return null;
}

/** Scope strings for the API: one per granted service, the highest level only (write implies read). */
export function toScopes(services: readonly McpServiceView[], state: PermissionState): string[] {
  const scopes: string[] = [];
  for (const service of services) {
    const access = grantable(service, accessOf(state, service.id));
    if (access !== "none") scopes.push(`${service.id}:${access}`);
  }
  return scopes;
}

/** Service ids that can be read and that can be changed (in catalogue order). */
export function summarise(
  services: readonly McpServiceView[],
  summary: PermissionState,
): { read: string[]; write: string[] } {
  const read: string[] = [];
  const write: string[] = [];
  for (const service of services) {
    const access = accessOf(summary, service.id);
    if (RANK[access] >= RANK.read) read.push(service.id);
    if (access === "write") write.push(service.id);
  }
  return { read, write };
}

export function hasAnyPermission(services: readonly McpServiceView[], state: PermissionState): boolean {
  return toScopes(services, state).length > 0;
}

export function hasAnyWrite(services: readonly McpServiceView[], state: PermissionState): boolean {
  return services.some((service) => grantable(service, accessOf(state, service.id)) === "write");
}

/** Services the token can use at all, in catalogue order, with their level. */
export function grantedServices(
  services: readonly McpServiceView[],
  summary: PermissionState,
): { service: McpServiceView; access: Exclude<McpAccess, "none"> }[] {
  return services.flatMap((service) => {
    const access = accessOf(summary, service.id);
    return access === "none" ? [] : [{ service, access }];
  });
}
