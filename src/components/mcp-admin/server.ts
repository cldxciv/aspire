import "server-only";

import { listMcpTokens } from "@/lib/mcp/tokens";
import { getSiteOrigin } from "@/lib/server/env";

import { publicOrigin, safeOrigin, toMcpTokenView, type McpTokenView } from "./token-view";

/**
 * Origin for the MCP endpoint shown to admins. Production prefers NEXT_PUBLIC_SITE_URL (the proxy's
 * Host / X-Forwarded-* are only a fallback); elsewhere the request's own origin wins, so a dev or
 * staging admin gets a command for the server they are actually using.
 */
export function resolveMcpOrigin(headers: { get(name: string): string | null }, fallbackUrl?: string): string | null {
  const site = getSiteOrigin(process.env);
  if (process.env.NODE_ENV === "production") return publicOrigin(site, headers, fallbackUrl);
  return publicOrigin(null, headers, fallbackUrl) ?? safeOrigin(site);
}

/** Every token as the admin list shows it (no secrets), newest first. Call only after the admin gate. */
export function loadMcpTokenViews(): McpTokenView[] {
  return listMcpTokens().map(toMcpTokenView);
}
