/**
 * Localised labels for the MCP admin UI (owner: MCP-ADMIN). Pure and client-safe: every function
 * takes the message slice it needs, so the server page and the browser components share them.
 */
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { retryAfterMinutes, type ApiFailure } from "@/lib/auth/client-api";
import { summarise, type McpServiceView, type PermissionState } from "./permissions";
import { MCP_EXPIRY_DAYS } from "./token-view";

type McpT = Messages<"mcp">;

/** Only what the browser needs: the explainer and page copy stay on the server. */
export type McpTokenManagerMessages = {
  mcp: Pick<
    McpT,
    "create" | "secret" | "list" | "status" | "access" | "services" | "revoke" | "announce" | "errors"
  >;
  errors: Messages<"portal">["errors"];
};

/** A service's display name; unknown ids (a newer backend) fall back to the id itself. */
export function serviceName(id: string, services: McpT["services"]): string {
  return (services as Record<string, { name: string } | undefined>)[id]?.name ?? id;
}

export function serviceDescription(id: string, services: McpT["services"]): string | null {
  return (services as Record<string, { description: string } | undefined>)[id]?.description ?? null;
}

/**
 * "Can read: Site status, Accounts" / "Can change: Accounts" for a permission state or a token's
 * scope summary; `null` when nothing is granted.
 */
export function permissionSummaryLines(
  services: readonly McpServiceView[],
  state: PermissionState,
  t: Pick<McpT["create"], "summaryRead" | "summaryWrite" | "summaryNothing" | "listSeparator">,
  names: McpT["services"],
): { read: string; write: string } | null {
  const { read, write } = summarise(services, state);
  if (read.length === 0) return null;
  const list = (ids: string[]) => (ids.length ? ids.map((id) => serviceName(id, names)).join(t.listSeparator) : t.summaryNothing);
  return { read: format(t.summaryRead, { services: list(read) }), write: format(t.summaryWrite, { services: list(write) }) };
}

/** Localised copy for a failed call (the server's English text is never shown). */
export function mcpFailureMessage(result: ApiFailure, m: McpTokenManagerMessages, minutes = retryAfterMinutes): string {
  if (result.error === "unauthenticated") return m.errors.sessionExpired;
  if (result.known === "passwordChangeRequired") return m.errors.passwordChangeRequired;
  switch (result.error) {
    case "forbidden":
      return m.errors.forbidden;
    case "not_found":
      return m.mcp.errors.tokenNotFound;
    case "not_configured":
      return m.errors.notConfigured;
    case "network":
      return m.errors.network;
    case "rate_limited":
      return format(m.errors.rateLimited, { minutes: minutes(result.retryAfterSeconds) });
    case "validation":
    case "bad_request":
      return m.errors.validation;
    default:
      return m.errors.server;
  }
}

/** Expiry select label: "1 day", "30 days", "90 days (recommended)", "1 year". */
export function expiryLabel(days: number, t: McpT["create"]): string {
  const label = days === 1 ? t.expiryOneDay : days === 365 ? t.expiryOneYear : format(t.expiryDays, { days });
  return days === MCP_EXPIRY_DAYS.default ? format(t.expiryRecommended, { label }) : label;
}
