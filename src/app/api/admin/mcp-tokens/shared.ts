import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import { z } from "zod";

import {
  MCP_EXPIRY_DAYS,
  MCP_SCOPE_CHOICES,
  normaliseTokenName,
  tokenNameIssue,
} from "@/components/mcp-admin/token-view";
import { requireRole, type GuardResult } from "@/lib/auth/guards";
import { exceptionCode } from "@/lib/auth/log";
import { rejectCrossOrigin, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError } from "@/lib/auth/responses";
import type { ApiError } from "@/lib/contracts/api";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * Shared pieces of /api/admin/mcp-tokens/** (owner: MCP-ADMIN): the admin guard, per-admin
 * rate limits, the create-body schema and a secret-free logger. Token storage, hashing and the
 * audit rows live in the token module (src/lib/mcp/tokens.ts, MCP-CORE).
 */

/** Creating and revoking: 30 per admin per rolling 10 minutes (single instance, see rate-limit.ts). */
export const MCP_TOKEN_WRITE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 } as const;
/** Listing: 120 per admin per minute. */
export const MCP_TOKEN_READ_LIMIT = { limit: 120, windowMs: 60 * 1000 } as const;

const writeLimiter = new SlidingWindowRateLimiter({ ...MCP_TOKEN_WRITE_LIMIT, maxKeys: 1_000 });
const readLimiter = new SlidingWindowRateLimiter({ ...MCP_TOKEN_READ_LIMIT, maxKeys: 1_000 });

/** Test hook: forget every rate-limit counter. */
export function resetMcpTokenLimitersForTests(): void {
  writeLimiter.reset();
  readLimiter.reset();
}

export const MCP_TOKEN_MESSAGES = {
  rateLimited: "Too many requests. Please wait a moment and try again.",
  invalidTokenId: "Invalid token id.",
  tokenNotFound: "Token not found.",
  name: {
    nameRequired: "Enter a name for the token.",
    nameLength: "Use 3–60 characters.",
    nameInvalid: "Use letters, numbers, spaces and simple punctuation only.",
  },
  scopes: 'Choose "read" or "read write".',
  expiresInDays: "Choose a whole number of days from 1 to 365.",
} as const;

type McpAdminAction = "list" | "create" | "revoke";
type McpAdminOutcome = "success" | "forbidden" | "rate_limited" | "rejected" | "not_found" | "error";

/** Fixed codes only: never a token, hash, name, user id, IP or request body. */
export function mcpAdminLog(action: McpAdminAction, outcome: McpAdminOutcome, reason?: string): void {
  const level = outcome === "error" ? "error" : outcome === "success" ? "info" : "warn";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "mcp_admin",
    action,
    outcome,
    ...(reason ? { reason: reason.slice(0, 60) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/**
 * Deny by default: same-origin first for writes (CSRF), then `requireRole("admin")` — 401 when
 * signed out, 403 for other roles and for an admin whose temporary password is unchanged —
 * then the per-admin rate limit (429 with Retry-After).
 */
export async function guardMcpAdmin(
  request: Request,
  action: McpAdminAction,
  options: { write: boolean },
): Promise<GuardResult> {
  if (options.write) {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      mcpAdminLog(action, "forbidden", rejection.reason);
      return { ok: false, response: rejection.response };
    }
  }
  const auth = await requireRole("admin");
  if (!auth.ok) return auth;
  const limit = (options.write ? writeLimiter : readLimiter).check(auth.session.userId);
  if (!limit.allowed) {
    mcpAdminLog(action, "rate_limited");
    return {
      ok: false,
      response: portalApiError("rate_limited", MCP_TOKEN_MESSAGES.rateLimited, {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    };
  }
  return auth;
}

/** For a route handler's `catch`: re-throws Next control flow, logs the class only, returns 500. */
export function mcpAdminServerError(action: McpAdminAction, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  mcpAdminLog(action, "error", exceptionCode(error));
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}

/** Token ids are opaque, URL-safe and short; anything else is a 400 before any lookup. */
export function isMcpTokenId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

/**
 * `POST /api/admin/mcp-tokens` body: `{ name (3–60 characters), scopes? ("read" default |
 * "read write"), expiresInDays? (1–365, default 90) }`. Stricter than the token module's own
 * schema (name 1–80). Unknown keys are refused, so a client can never smuggle extra options
 * (e.g. its own `createdBy`) through to the token module.
 */
export const createMcpTokenBodySchema = z
  .strictObject(
    {
      name: z
        .string({ error: MCP_TOKEN_MESSAGES.name.nameRequired })
        .max(400, { error: MCP_TOKEN_MESSAGES.name.nameLength })
        .transform(normaliseTokenName)
        .superRefine((name, ctx) => {
          const issue = tokenNameIssue(name);
          if (issue) ctx.addIssue({ code: "custom", message: MCP_TOKEN_MESSAGES.name[issue] });
        }),
      /** Least privilege by default. */
      scopes: z.enum(MCP_SCOPE_CHOICES, { error: MCP_TOKEN_MESSAGES.scopes }).optional().default("read"),
      expiresInDays: z
        .number({ error: MCP_TOKEN_MESSAGES.expiresInDays })
        .int({ error: MCP_TOKEN_MESSAGES.expiresInDays })
        .min(MCP_EXPIRY_DAYS.min, { error: MCP_TOKEN_MESSAGES.expiresInDays })
        .max(MCP_EXPIRY_DAYS.max, { error: MCP_TOKEN_MESSAGES.expiresInDays })
        .optional()
        .default(MCP_EXPIRY_DAYS.default),
    },
    { error: "Unknown field." },
  );
export type CreateMcpTokenBody = z.infer<typeof createMcpTokenBodySchema>;
