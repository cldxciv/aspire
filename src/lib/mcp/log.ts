import "server-only";

/**
 * Structured, secret-free log lines for the MCP endpoint. Fixed codes only: never a token (or any
 * part of one), Authorization header, IP address, request body, tool argument or tool result.
 * Who did what is recorded in the database audit log instead (`mcp.call`, `mcp.<tool>`).
 */

export type McpLogAction = "auth" | "request" | "tool";

export type McpLogOutcome =
  | "success"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "bad_request"
  | "error";

export interface McpLogEntry {
  action: McpLogAction;
  outcome: McpLogOutcome;
  /** A fixed code (e.g. `missing_token`, `expired`, `exception_TypeError`). */
  reason?: string;
  /** Registered tool name only (never free text from the request). */
  tool?: string;
}

export function mcpLog(entry: McpLogEntry): void {
  const { action, outcome, reason, tool } = entry;
  const level = outcome === "error" ? "error" : outcome === "success" ? "info" : "warn";
  // Explicit field picking: extra properties passed at runtime are never written.
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "mcp",
    action,
    outcome,
    ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) } : {}),
    ...(tool ? { tool: tool.replace(/[^a-z_]/g, "").slice(0, 40) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** A thrown value's constructor name only (messages can echo input). */
export function exceptionReason(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}`;
}
