import type { NextRequest } from "next/server";

import { toMcpTokenView } from "@/components/mcp-admin/token-view";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { revokeMcpToken } from "@/lib/mcp/tokens";

import { guardMcpAdmin, isMcpTokenId, mcpAdminLog, mcpAdminServerError, MCP_TOKEN_MESSAGES } from "../shared";

type Context = { params: Promise<{ tokenId: string }> };

/**
 * DELETE /api/admin/mcp-tokens/:tokenId — revokes the token immediately (the next MCP request with
 * it gets 401). Same-origin, admin only, rate-limited. 200 with the updated record (never the token
 * or its hash); idempotent for an already-revoked token. 400 for a malformed id, 404 for an unknown
 * one. Audited by the token module (`mcp.token_revoke`, actor = this admin).
 */
export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const auth = await guardMcpAdmin(request, "revoke", { write: true });
    if (!auth.ok) return auth.response;
    const { tokenId } = await ctx.params;
    if (!isMcpTokenId(tokenId)) return portalApiError("bad_request", MCP_TOKEN_MESSAGES.invalidTokenId);

    const result = revokeMcpToken(tokenId, auth.session.userId);
    if (!result) {
      mcpAdminLog("revoke", "not_found");
      return portalApiError("not_found", MCP_TOKEN_MESSAGES.tokenNotFound);
    }
    mcpAdminLog("revoke", "success", result.changed ? undefined : "already_revoked");
    return portalApiItem(toMcpTokenView(result.record));
  } catch (error) {
    return mcpAdminServerError("revoke", error);
  }
}
