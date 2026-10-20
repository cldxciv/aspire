import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { unstable_rethrow } from "next/navigation";

import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";

import { MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAME, MCP_SERVER_TITLE, MCP_SERVER_VERSION } from "./info";
import { exceptionReason, mcpLog } from "./log";
import { canWrite, type McpCaller } from "./tokens";
import { MCP_TOOLS } from "./tools";
import type { AspireTool, ToolContext, ToolFailure, ToolOutcome, ToolSuccess } from "./tools/types";

/**
 * Builds the MCP server for ONE request (stateless Streamable HTTP: a fresh server and transport
 * per HTTP request; see src/lib/mcp/handler.ts). Every tool is listed for every token so agents see
 * a stable catalogue; write tools refuse read-only tokens with a `forbidden` tool error.
 *
 * Each tool call runs through `runTool`: scope check → the tool → result shaping. Unexpected
 * exceptions become a generic error (the SDK would otherwise echo the exception message to the
 * client); write tools add an `mcp.<tool>` audit row. The `mcp.call` row for every call is written
 * by the HTTP handler before dispatch.
 */

/** Audit action for a write tool. */
export function writeAuditAction(toolName: string): string {
  return `mcp.${toolName}`;
}

export function toCallToolResult(outcome: ToolOutcome): CallToolResult {
  if (outcome.ok) return successResult(outcome);
  return failureResult(outcome);
}

function successResult(outcome: ToolSuccess): CallToolResult {
  // Text for clients that only read `content` (summary + the same JSON), structured JSON for the rest.
  return {
    content: [{ type: "text", text: `${outcome.summary}\n${JSON.stringify(outcome.data)}` }],
    structuredContent: outcome.data,
  };
}

function failureResult(failure: ToolFailure): CallToolResult {
  return {
    content: [{ type: "text", text: `Error (${failure.error}): ${failure.message}` }],
    structuredContent: { error: failure.error, message: failure.message },
    isError: true,
  };
}

function auditWrite(tool: AspireTool, ctx: ToolContext, outcome: ToolOutcome): void {
  const outcomeCode = outcome.ok ? (outcome.audit ? "changed" : "no_change") : outcome.error;
  recordAudit(getDb(), {
    actorId: ctx.caller.createdBy,
    action: writeAuditAction(tool.name),
    target: outcome.ok ? (outcome.audit?.target ?? null) : null,
    details: {
      ...(outcome.ok ? outcome.audit?.details : undefined),
      via: "mcp",
      mcpKeyId: ctx.caller.tokenId,
      outcome: outcomeCode,
    },
    now: ctx.now,
  });
}

/** Runs one tool for `ctx.caller` (args already validated by the tool's zod schema). */
export async function runTool(tool: AspireTool, args: unknown, ctx: ToolContext): Promise<CallToolResult> {
  if (tool.scope === "write" && !canWrite(ctx.caller)) {
    const denied: ToolFailure = {
      ok: false,
      error: "forbidden",
      message: `${tool.name} needs an MCP token with the 'read write' scope; this token is read-only. Ask an Aspire admin for a write token (Admin → MCP).`,
    };
    auditWrite(tool, ctx, denied);
    mcpLog({ action: "tool", outcome: "forbidden", reason: "read_only_token", tool: tool.name });
    return failureResult(denied);
  }
  try {
    const outcome = await tool.run(args as never, ctx);
    if (tool.scope === "write") auditWrite(tool, ctx, outcome);
    mcpLog({ action: "tool", outcome: outcome.ok ? "success" : "bad_request", reason: outcome.ok ? undefined : outcome.error, tool: tool.name });
    return toCallToolResult(outcome);
  } catch (error) {
    unstable_rethrow(error);
    mcpLog({ action: "tool", outcome: "error", reason: exceptionReason(error), tool: tool.name });
    return failureResult({ ok: false, error: "server_error", message: "The tool failed unexpectedly. Try again later." });
  }
}

/** A fresh MCP server with every Aspire tool registered for this caller. */
export function createAspireMcpServer(caller: McpCaller, now: number = Date.now()): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, title: MCP_SERVER_TITLE, version: MCP_SERVER_VERSION },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  const ctx: ToolContext = { caller, now };
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      (args: unknown) => runTool(tool, args, ctx),
    );
  }
  return server;
}
