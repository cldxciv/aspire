import "server-only";

import type { z } from "zod";

import type { McpCaller } from "../tokens";

/**
 * Shape of one MCP tool (docs/mcp.md). Tools are plain objects so tests can call `run` directly;
 * src/lib/mcp/server.ts registers them with the SDK and adds the scope check, error handling and
 * audit for write tools.
 */

export type ToolScope = "read" | "write";

export interface ToolContext {
  caller: McpCaller;
  /** Request time (epoch ms). */
  now: number;
}

/** A successful result: a one-line summary for the model plus the JSON data. */
export interface ToolSuccess {
  ok: true;
  summary: string;
  data: Record<string, unknown>;
  /**
   * Write tools: the audit row for `mcp.<tool>` (target + non-secret, non-free-text details).
   * Omitted when nothing changed.
   */
  audit?: { target: string | null; details?: Record<string, string | number | boolean | null> };
}

/** An expected failure (not found, wrong role, validation by business rules). */
export interface ToolFailure {
  ok: false;
  /** Fixed machine code, e.g. `not_found`, `forbidden`, `login_id_taken`. */
  error: string;
  /** Safe, actionable message for the agent. Never echoes secrets. */
  message: string;
}

export type ToolOutcome = ToolSuccess | ToolFailure;

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface AspireTool<Schema extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  /** Written for an AI agent: what it does, constraints, what it returns. */
  description: string;
  scope: ToolScope;
  inputSchema: Schema;
  annotations: ToolAnnotations;
  run(args: z.output<Schema>, ctx: ToolContext): ToolOutcome | Promise<ToolOutcome>;
}

/** Identity helper that keeps each tool's argument type. */
export function defineTool<Schema extends z.ZodObject>(tool: AspireTool<Schema>): AspireTool<Schema> {
  return tool;
}

export function fail(error: string, message: string): ToolFailure {
  return { ok: false, error, message };
}

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
