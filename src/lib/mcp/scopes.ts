import { z } from "zod";

/**
 * Per-service MCP permissions (owner: MCP-CORE; docs/mcp.md). Pure and client-safe: no server
 * imports, so the admin UI (MCP-ADMIN) can use the catalogue and the validators directly.
 *
 * - Scope strings: `<service>:read`, `<service>:write`. Write implies read.
 * - `:write` exists only for services with write tools (`hasWrite`).
 * - Unavailable services (`available: false`) are listed so the UI can show them as "coming soon",
 *   but cannot be granted (rejected by the schema, dropped by normalisation). None today.
 * - Legacy token scopes (before per-service permissions): `"read"` = every LEGACY service at read;
 *   `"read write"` = the same plus write wherever such a service has write tools. Legacy services are
 *   the ones that existed then (`MCP_LEGACY_SERVICE_IDS`): a service added later (e.g. `crm`, lead
 *   data) is never granted to an old token implicitly.
 */

export const MCP_SERVICE_IDS = ["site", "accounts", "progress", "audit", "content", "crm"] as const;
export type McpServiceId = (typeof MCP_SERVICE_IDS)[number];

export type McpAccessLevel = "read" | "write";
export type McpScope = `${McpServiceId}:${McpAccessLevel}`;
export type McpServiceAccess = "none" | McpAccessLevel;

export interface McpService {
  id: McpServiceId;
  tools: { read: readonly string[]; write: readonly string[] };
  hasWrite: boolean;
  /** False for reserved services without tools yet (shown as "coming soon", not grantable). */
  available: boolean;
}

/** Every service, in display order. Tool names are the MCP tool names. */
export const MCP_SERVICES: readonly McpService[] = [
  { id: "site", tools: { read: ["site_status"], write: [] }, hasWrite: false, available: true },
  {
    id: "accounts",
    tools: {
      read: ["list_accounts", "get_account"],
      write: ["create_account", "link_parent_student", "unlink_parent_student", "set_account_disabled"],
    },
    hasWrite: true,
    available: true,
  },
  { id: "progress", tools: { read: ["get_student_progress"], write: [] }, hasWrite: false, available: true },
  { id: "audit", tools: { read: ["list_audit_log"], write: [] }, hasWrite: false, available: true },
  {
    id: "content",
    tools: { read: ["list_programs", "list_centres", "list_results"], write: [] },
    hasWrite: false,
    available: true,
  },
  {
    id: "crm",
    tools: {
      read: ["list_leads", "get_lead", "list_my_tasks", "crm_report"],
      write: [
        "add_lead_note",
        "change_lead_stage",
        "assign_lead",
        "create_lead_task",
        "complete_lead_task",
        "log_lead_contact",
        "create_walkin_lead",
      ],
    },
    hasWrite: true,
    available: true,
  },
];

/** Services that existed when tokens had whole-token scopes; legacy values map to these only. */
export const MCP_LEGACY_SERVICE_IDS: readonly McpServiceId[] = ["site", "accounts", "progress", "audit", "content"];

/** Legacy whole-token scopes stored before per-service permissions. */
export const MCP_LEGACY_SCOPES = ["read", "read write"] as const;
export type McpLegacyScopes = (typeof MCP_LEGACY_SCOPES)[number];

const SERVICE_BY_ID = new Map<string, McpService>(MCP_SERVICES.map((service) => [service.id, service]));

/** The service and level a tool belongs to, or null for an unknown tool. */
export function toolPermission(toolName: string): { service: McpService; level: McpAccessLevel } | null {
  for (const service of MCP_SERVICES) {
    if (service.tools.read.includes(toolName)) return { service, level: "read" };
    if (service.tools.write.includes(toolName)) return { service, level: "write" };
  }
  return null;
}

type ParsedScope = { service: McpService; level: McpAccessLevel };

function parseScope(raw: string): ParsedScope | null {
  const match = /^([a-z]+):(read|write)$/.exec(raw.trim());
  if (!match) return null;
  const service = SERVICE_BY_ID.get(match[1]);
  return service ? { service, level: match[2] as McpAccessLevel } : null;
}

/** Highest grantable level per service for the parsed entries (unavailable / invalid writes dropped). */
function levels(entries: readonly ParsedScope[]): Map<McpServiceId, McpAccessLevel> {
  const result = new Map<McpServiceId, McpAccessLevel>();
  for (const { service, level } of entries) {
    if (!service.available) continue;
    if (level === "write" && !service.hasWrite) continue;
    if (level === "write" || !result.has(service.id)) result.set(service.id, level);
  }
  return result;
}

/** Canonical list: catalogue order, `:read` before `:write`, write ⇒ read. */
function canonical(byService: Map<McpServiceId, McpAccessLevel>): McpScope[] {
  const scopes: McpScope[] = [];
  for (const service of MCP_SERVICES) {
    const level = byService.get(service.id);
    if (!level) continue;
    scopes.push(`${service.id}:read`);
    if (level === "write") scopes.push(`${service.id}:write`);
  }
  return scopes;
}

/**
 * Normalises scopes: accepts an array of scope strings, a space-separated scope string (as stored),
 * or a legacy `"read"` / `"read write"` (legacy services only, see `MCP_LEGACY_SERVICE_IDS`). Write implies read; output is de-duplicated in catalogue
 * order. Lenient by design (used on stored data): unknown entries, unavailable services and `:write`
 * on read-only services are dropped. Validate user input with `mcpScopesInputSchema` instead.
 */
export function normalizeScopes(input: readonly string[] | string): McpScope[] {
  const raw = typeof input === "string" ? input.trim() : null;
  if (raw === "read" || raw === "read write") {
    const all = new Map<McpServiceId, McpAccessLevel>();
    for (const service of MCP_SERVICES) {
      if (!service.available || !MCP_LEGACY_SERVICE_IDS.includes(service.id)) continue;
      all.set(service.id, raw === "read write" && service.hasWrite ? "write" : "read");
    }
    return canonical(all);
  }
  const parts = raw !== null ? raw.split(/\s+/).filter(Boolean) : input;
  const parsed: ParsedScope[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const scope = parseScope(part);
    if (scope) parsed.push(scope);
  }
  return canonical(levels(parsed));
}

/** Whether the scopes allow calling `toolName` (unknown tools: never). Write implies read. */
export function isToolAllowed(scopes: readonly string[], toolName: string): boolean {
  const permission = toolPermission(toolName);
  if (!permission || !permission.service.available) return false;
  const { id } = permission.service;
  if (permission.level === "write") return scopes.includes(`${id}:write`);
  return scopes.includes(`${id}:read`) || scopes.includes(`${id}:write`);
}

/** Access per service (every service in the catalogue, "none" when not granted). */
export function scopesSummary(scopes: readonly string[]): Record<McpServiceId, McpServiceAccess> {
  const normalized = normalizeScopes(scopes);
  const summary = {} as Record<McpServiceId, McpServiceAccess>;
  for (const service of MCP_SERVICES) {
    summary[service.id] = normalized.includes(`${service.id}:write`)
      ? "write"
      : normalized.includes(`${service.id}:read`)
        ? "read"
        : "none";
  }
  return summary;
}

/** Space-separated storage form of normalised scopes. */
export function serializeScopes(scopes: readonly McpScope[]): string {
  return normalizeScopes(scopes).join(" ");
}

/** Every tool name the scopes allow, in catalogue order. */
export function allowedTools(scopes: readonly string[]): string[] {
  return MCP_SERVICES.flatMap((service) => [...service.tools.read, ...service.tools.write]).filter((tool) =>
    isToolAllowed(scopes, tool),
  );
}

/** Problems with a requested scope list (empty = valid). Messages are safe to show to an admin. */
export function scopeIssues(input: readonly string[]): string[] {
  const issues: string[] = [];
  if (input.length === 0) issues.push("Choose at least one permission.");
  const seen = new Set<string>();
  for (const entry of input) {
    if (seen.has(entry)) {
      issues.push(`"${entry}" is listed twice.`);
      continue;
    }
    seen.add(entry);
    const match = /^([a-z]+):(read|write)$/.exec(entry);
    const service = match ? SERVICE_BY_ID.get(match[1]) : undefined;
    if (!match || !service) {
      issues.push(`"${entry.slice(0, 40)}" is not a known permission (use <service>:read or <service>:write).`);
    } else if (!service.available) {
      issues.push(`The ${service.id} service is not available yet.`);
    } else if (match[2] === "write" && !service.hasWrite) {
      issues.push(`The ${service.id} service has no write tools; use ${service.id}:read.`);
    }
  }
  return issues;
}

/**
 * Request schema for a token's permissions: an array of scope strings, at least one, no duplicates,
 * known and available services, `:write` only where the service has write tools. Output is the
 * normalised `McpScope[]` (write ⇒ read added, catalogue order).
 */
export const mcpScopesInputSchema = z
  .array(z.string().max(40), { error: "Permissions must be a list of <service>:read / <service>:write." })
  .max(MCP_SERVICES.length * 2)
  .superRefine((value, ctx) => {
    for (const message of scopeIssues(value)) ctx.addIssue({ code: "custom", message });
  })
  .transform((value) => normalizeScopes(value));
