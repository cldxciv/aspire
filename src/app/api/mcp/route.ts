import { connection } from "next/server";

import { handleMcpPost, handleMcpUnsupported } from "@/lib/mcp/handler";

/**
 * MCP server endpoint (docs/mcp.md): Streamable HTTP, stateless, JSON responses.
 * `Authorization: Bearer asp_mcp_…` (admin-issued tokens, /admin/mcp). Admin-only data, audited.
 *
 * `connection()` first: this route reads request headers and the database, so it must never be
 * prerendered (Cache Components). The handlers re-throw Next's control-flow errors.
 */

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleMcpPost(request);
}

export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleMcpUnsupported(request);
}

export async function DELETE(request: Request): Promise<Response> {
  await connection();
  return handleMcpUnsupported(request);
}
