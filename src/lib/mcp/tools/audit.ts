import "server-only";

import type { SQLInputValue } from "node:sqlite";
import { z } from "zod";

import { sanitizeAuditDetails } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";

import { limitSchema, recordIdSchema } from "./common";
import { defineTool, READ_ONLY } from "./types";

/**
 * `list_audit_log`: the same audit rows the admin portal shows (/admin/audit), newest first, with
 * actor / target display names where they are accounts. Details are re-sanitised (secret-looking
 * keys dropped) on the way out; they never hold passwords, hashes, tokens or IPs.
 */

const ACTION_FILTER = /^[a-z_]+(\.[a-z_]+)?\.?$/;

export const listAuditLog = defineTool({
  name: "list_audit_log",
  title: "List audit log",
  description:
    "Lists audit-log entries of the Aspire website, newest first: who changed which account and when (sign-ins, account creation, " +
    "disable/enable, password resets, parent links, MCP token changes and every MCP tool call). " +
    "Filters: action (exact, e.g. 'admin.user_create', or a prefix ending in '.', e.g. 'mcp.' or 'admin.'), targetId, actorId. " +
    "Paginated by cursor: pass `nextBeforeId` from the previous page as beforeId. limit 1–100 (default 25). " +
    "Entries: id, action, actorId, actorName, targetId, targetName, createdAt, details (small non-secret facts).",
  scope: "read",
  inputSchema: z.object({
    action: z
      .string()
      .trim()
      .max(60)
      .regex(ACTION_FILTER, "Use an action like 'admin.user_create' or a prefix like 'mcp.'.")
      .optional()
      .describe("Exact action or a prefix ending in '.'."),
    targetId: recordIdSchema.optional().describe("Only entries about this account / record id."),
    actorId: recordIdSchema.optional().describe("Only entries by this account id."),
    beforeId: z.number().int().min(1).optional().describe("Return entries older than this entry id (cursor)."),
    limit: limitSchema,
  }),
  annotations: READ_ONLY,
  run(args) {
    const db = getDb();
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (args.action) {
      if (args.action.endsWith(".")) {
        where.push("substr(action, 1, ?) = ?");
        params.push(args.action.length, args.action);
      } else {
        where.push("action = ?");
        params.push(args.action);
      }
    }
    if (args.targetId) {
      where.push("target = ?");
      params.push(args.targetId);
    }
    if (args.actorId) {
      where.push("actor_id = ?");
      params.push(args.actorId);
    }
    if (args.beforeId) {
      where.push("id < ?");
      params.push(args.beforeId);
    }
    const sql = `SELECT id, actor_id, action, target, created_at, details FROM audit_log
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, args.limit + 1);
    const hasMore = rows.length > args.limit;
    const pageRows = rows.slice(0, args.limit);

    const names = new Map<string, string>();
    for (const row of db.prepare("SELECT id, display_name FROM users").all()) {
      names.set(String(row.id), String(row.display_name));
    }
    const nameOf = (id: string | null) => (id === null ? null : (names.get(id) ?? null));

    const entries = pageRows.map((row) => {
      const actorId = row.actor_id === null ? null : String(row.actor_id);
      const targetId = row.target === null ? null : String(row.target);
      let details: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(String(row.details));
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          details = sanitizeAuditDetails(parsed as Record<string, unknown>);
        }
      } catch {
        details = {};
      }
      return {
        id: Number(row.id),
        action: String(row.action),
        actorId,
        actorName: nameOf(actorId),
        targetId,
        targetName: nameOf(targetId),
        createdAt: new Date(Number(row.created_at)).toISOString(),
        details,
      };
    });
    const nextBeforeId = hasMore && entries.length > 0 ? entries[entries.length - 1].id : null;
    return {
      ok: true,
      summary:
        entries.length === 0
          ? "No audit entries match."
          : `${entries.length} audit entr${entries.length === 1 ? "y" : "ies"}, newest first.${nextBeforeId !== null ? ` More: call again with beforeId ${nextBeforeId}.` : ""}`,
      data: { count: entries.length, nextBeforeId, entries },
    };
  },
});
