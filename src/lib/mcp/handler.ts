import "server-only";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { unstable_rethrow } from "next/navigation";

import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";
import { readBodyWithLimit } from "@/lib/server/request-guards";

import { authenticateMcpRequest, mcpHttpError, rejectForeignBrowserOrigin, withPrivateHeaders } from "./auth";
import { exceptionReason, mcpLog } from "./log";
import { createAspireMcpServer } from "./server";
import type { McpCaller } from "./tokens";
import { MCP_TOOL_NAMES } from "./tools";

/**
 * HTTP handling for `/api/mcp` (MCP Streamable HTTP, stateless, JSON responses).
 *
 * POST: browser-origin check → bearer auth + rate limits → bounded body (64 KB) → one `mcp.call`
 * audit row per `tools/call` message → a fresh SDK server + transport for this request. GET and
 * DELETE answer 405 after the same checks: a stateless server offers no standalone SSE stream and
 * has no sessions to end. Every response carries `Cache-Control: no-store` and `X-Robots-Tag`.
 */

export const MCP_MAX_BODY_BYTES = 64 * 1024;

export const AUDIT_MCP_CALL = "mcp.call";

/** `tools/call` names in a JSON-RPC message or batch (registered names only; anything else → "unknown"). */
export function toolCallNames(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body];
  const names: string[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const { method, params } = message as { method?: unknown; params?: unknown };
    if (method !== "tools/call") continue;
    const name = typeof params === "object" && params !== null ? (params as { name?: unknown }).name : undefined;
    names.push(typeof name === "string" && MCP_TOOL_NAMES.has(name) ? name : "unknown");
  }
  return names;
}

function auditToolCalls(caller: McpCaller, names: readonly string[], now: number): void {
  if (names.length === 0) return;
  const db = getDb();
  for (const tool of names) {
    recordAudit(db, {
      actorId: caller.createdBy,
      action: AUDIT_MCP_CALL,
      target: null,
      details: { tool, via: "mcp", mcpKeyId: caller.tokenId, scopes: caller.scopes },
      now,
    });
  }
}

function withHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withPrivateHeaders(response.headers),
  });
}

/** Origin + authentication shared by every method. */
function admit(request: Request, now: number): { ok: true; caller: McpCaller } | { ok: false; response: Response } {
  const rejection = rejectForeignBrowserOrigin(request);
  if (rejection) return { ok: false, response: rejection };
  return authenticateMcpRequest(request, now);
}

function serverError(error: unknown): Response {
  unstable_rethrow(error);
  mcpLog({ action: "request", outcome: "error", reason: exceptionReason(error) });
  return mcpHttpError(500, "Internal server error.");
}

export async function handleMcpPost(request: Request): Promise<Response> {
  try {
    const now = Date.now();
    const admitted = admit(request, now);
    if (!admitted.ok) return admitted.response;

    const body = await readBodyWithLimit(request, MCP_MAX_BODY_BYTES);
    if (!body.ok) {
      mcpLog({ action: "request", outcome: "bad_request", reason: body.reason });
      return body.reason === "too_large"
        ? mcpHttpError(413, `Payload too large: the limit is ${MCP_MAX_BODY_BYTES} bytes.`)
        : mcpHttpError(400, "Bad request: unreadable body.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      mcpLog({ action: "request", outcome: "bad_request", reason: "invalid_json" });
      const headers = withPrivateHeaders({ "Content-Type": "application/json" });
      return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error: Invalid JSON" }, id: null }), {
        status: 400,
        headers,
      });
    }

    auditToolCalls(admitted.caller, toolCallNames(parsed), now);

    const server = createAspireMcpServer(admitted.caller, now);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody: parsed });
      return withHeaders(response);
    } finally {
      await server.close().catch(() => undefined);
    }
  } catch (error) {
    return serverError(error);
  }
}

/** GET / DELETE: 405 for authenticated callers (stateless server, no SSE stream, no sessions). */
export async function handleMcpUnsupported(request: Request): Promise<Response> {
  try {
    const admitted = admit(request, Date.now());
    if (!admitted.ok) return admitted.response;
    return mcpHttpError(405, "Method not allowed: this MCP server is stateless; send JSON-RPC messages with POST.", {
      Allow: "POST",
    });
  } catch (error) {
    return serverError(error);
  }
}
