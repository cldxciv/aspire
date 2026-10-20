import "server-only";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";

import { MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAME, MCP_SERVER_TITLE, MCP_SERVER_VERSION } from "./info";
import { exceptionReason, mcpLog } from "./log";
import { allowedTools, isToolAllowed, toolPermission } from "./scopes";
import type { McpCaller } from "./tokens";
import { MCP_TOOLS } from "./tools";
import type { AspireTool, ToolContext, ToolFailure, ToolOutcome, ToolSuccess } from "./tools/types";

/**
 * Builds the MCP server for ONE request (stateless Streamable HTTP: a fresh server and transport
 * per HTTP request; see src/lib/mcp/handler.ts). Uses the SDK's low-level `Server` so the tool
 * list can follow the token's per-service scopes (src/lib/mcp/scopes.ts):
 * - `tools/list` returns only the tools the token's scopes allow;
 * - `tools/call` re-checks `isToolAllowed`: a known tool outside the scopes gets a `forbidden` tool
 *   error and an `mcp.<tool>` audit row (outcome `forbidden`); unknown tools get `unknown_tool`.
 * Arguments are validated with each tool's zod schema; unexpected exceptions become a generic
 * error (never the exception message). Write tools add an `mcp.<tool>` audit row. The `mcp.call`
 * row for every call is written by the HTTP handler before dispatch.
 */

/** Audit action for a tool-specific row (write tools, and denied calls of any tool). */
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

function auditToolRow(tool: AspireTool, ctx: ToolContext, outcome: ToolOutcome): void {
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

function forbidden(tool: AspireTool): ToolFailure {
  const permission = toolPermission(tool.name);
  const needed = permission ? `${permission.service.id}:${permission.level}` : "a permission";
  return {
    ok: false,
    error: "forbidden",
    message: `${tool.name} needs the '${needed}' permission, which this MCP token does not have. Ask an Aspire admin to grant it (Admin → MCP).`,
  };
}

/** Runs one tool for `ctx.caller`: scope re-check → the tool (args already validated) → result. */
export async function runTool(tool: AspireTool, args: unknown, ctx: ToolContext): Promise<CallToolResult> {
  if (!isToolAllowed(ctx.caller.scopes, tool.name)) {
    const denied = forbidden(tool);
    auditToolRow(tool, ctx, denied);
    mcpLog({ action: "tool", outcome: "forbidden", reason: "out_of_scope", tool: tool.name });
    return failureResult(denied);
  }
  try {
    const outcome = await tool.run(args as never, ctx);
    if (tool.scope === "write") auditToolRow(tool, ctx, outcome);
    mcpLog({ action: "tool", outcome: outcome.ok ? "success" : "bad_request", reason: outcome.ok ? undefined : outcome.error, tool: tool.name });
    return toCallToolResult(outcome);
  } catch (error) {
    unstable_rethrow(error);
    mcpLog({ action: "tool", outcome: "error", reason: exceptionReason(error), tool: tool.name });
    return failureResult({ ok: false, error: "server_error", message: "The tool failed unexpectedly. Try again later." });
  }
}

/** MCP tool definition (JSON Schema input, annotations) for `tools/list`. */
export function toolDefinition(tool: AspireTool): Tool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: toJsonSchemaCompat(tool.inputSchema, { strictUnions: true, pipeStrategy: "input" }) as Tool["inputSchema"],
    annotations: { title: tool.title, ...tool.annotations },
  };
}

const TOOLS_BY_NAME = new Map<string, AspireTool>(MCP_TOOLS.map((tool) => [tool.name, tool]));

/** The tools `caller` may see and call, in service-catalogue order (src/lib/mcp/scopes.ts). */
export function toolsFor(caller: Pick<McpCaller, "scopes">): AspireTool[] {
  return allowedTools(caller.scopes).flatMap((name) => {
    const tool = TOOLS_BY_NAME.get(name);
    return tool ? [tool] : [];
  });
}

async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<CallToolResult> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    mcpLog({ action: "tool", outcome: "bad_request", reason: "unknown_tool" });
    return failureResult({ ok: false, error: "unknown_tool", message: "There is no tool with this name. Call tools/list to see the available tools." });
  }
  // Scope first, so a token learns nothing about a tool it may not use (not even its arguments).
  if (!isToolAllowed(ctx.caller.scopes, tool.name)) return runTool(tool, undefined, ctx);
  const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    mcpLog({ action: "tool", outcome: "bad_request", reason: "invalid_arguments", tool: tool.name });
    return failureResult({
      ok: false,
      error: "invalid_arguments",
      message: `Input validation error: ${z.prettifyError(parsed.error).slice(0, 800)}`,
    });
  }
  return runTool(tool, parsed.data, ctx);
}

/** A fresh MCP server for this caller: only its allowed tools are listed. */
export function createAspireMcpServer(caller: McpCaller, now: number = Date.now()): Server {
  const server = new Server(
    { name: MCP_SERVER_NAME, title: MCP_SERVER_TITLE, version: MCP_SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } }, instructions: MCP_SERVER_INSTRUCTIONS },
  );
  const ctx: ToolContext = { caller, now };
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: toolsFor(caller).map(toolDefinition) }));
  server.setRequestHandler(CallToolRequestSchema, (request) => callTool(request.params.name, request.params.arguments, ctx));
  return server;
}
