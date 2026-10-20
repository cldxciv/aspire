import type { NextRequest } from "next/server";

import { loadMcpTokenViews, resolveMcpOrigin } from "@/components/mcp-admin/server";
import { mcpEndpoint, toMcpTokenView, type McpTokenCreated } from "@/components/mcp-admin/token-view";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem, portalApiList } from "@/lib/auth/responses";
import { createMcpToken, McpTokenError } from "@/lib/mcp/tokens";

import { createMcpTokenBodySchema, guardMcpAdmin, mcpAdminLog, mcpAdminServerError, MCP_TOKEN_MESSAGES } from "./shared";

/**
 * GET /api/admin/mcp-tokens — every MCP access token, newest first: id, name, scopes, creator's
 * display name, created / expires / last used / revoked times and status. Never the token or its
 * hash. Admin only (401 / 403, 403 while the admin's temporary password is unchanged), rate-limited.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await guardMcpAdmin(request, "list", { write: false });
    if (!auth.ok) return auth.response;
    return portalApiList(loadMcpTokenViews());
  } catch (error) {
    return mcpAdminServerError("list", error);
  }
}

/**
 * POST /api/admin/mcp-tokens — `{ name, scopes?: "read" | "read write", expiresInDays?: 1–365 }`.
 * Same-origin JSON (415 / 413 at 4 KB), admin only, rate-limited. 201 `{ token, record, mcpUrl }`:
 * the plaintext token is returned ONCE here and never again (only its SHA-256 is stored). 422 with
 * `fieldErrors` for invalid input. Audited by the token module (`mcp.token_create`).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await guardMcpAdmin(request, "create", { write: true });
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody(request, createMcpTokenBodySchema);
    if (!body.ok) {
      mcpAdminLog("create", "rejected", body.reason ?? body.outcome);
      return body.response;
    }

    let created: ReturnType<typeof createMcpToken>;
    try {
      created = createMcpToken({
        name: body.data.name,
        scopes: body.data.scopes,
        expiresInDays: body.data.expiresInDays,
        createdBy: auth.session.userId,
      });
    } catch (error) {
      if (!(error instanceof McpTokenError)) throw error;
      mcpAdminLog("create", "rejected", error.code);
      if (error.code === "creator_not_admin") return portalApiError("forbidden");
      const field = error.code === "invalid_name" ? "name" : error.code === "invalid_scopes" ? "scopes" : "expiresInDays";
      const message =
        field === "name" ? MCP_TOKEN_MESSAGES.name.nameLength : field === "scopes" ? MCP_TOKEN_MESSAGES.scopes : MCP_TOKEN_MESSAGES.expiresInDays;
      return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: { [field]: [message] } });
    }

    const origin = resolveMcpOrigin(request.headers, request.nextUrl.origin) ?? request.nextUrl.origin;
    mcpAdminLog("create", "success");
    const data: McpTokenCreated = { token: created.token, record: toMcpTokenView(created.record), mcpUrl: mcpEndpoint(origin) };
    return portalApiItem(data, { status: 201 });
  } catch (error) {
    return mcpAdminServerError("create", error);
  }
}
