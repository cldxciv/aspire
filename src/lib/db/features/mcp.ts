/**
 * SQLite schema for the "mcp" feature (owner: MCP-CORE; docs/mcp.md). Applied on every open after
 * the core migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX
 * IF NOT EXISTS`. Prefix tables with `mcp_`. Never alter core tables (users, sessions, …).
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of
 * project files here; type-only imports are fine. Data access lives in src/lib/mcp/tokens.ts.
 *
 * - mcp_tokens: admin-issued bearer tokens for the MCP endpoint (/api/mcp). Only the SHA-256 hex
 *   of the token is stored (`token_hash`); the plaintext is shown once, to the admin who created
 *   it. `scopes` holds the per-service permissions as a space-separated list
 *   (`accounts:read accounts:write content:read`); rows written before per-service permissions
 *   hold the legacy `read` / `read write` and are mapped when read (src/lib/mcp/scopes.ts).
 *   Times are epoch ms. A token is usable only while it is not revoked, not expired, and its
 *   creator is still an enabled admin. Deleted with the creator (ON DELETE CASCADE).
 *
 *   Databases created before per-service permissions have `CHECK (scopes IN ('read', 'read
 *   write'))` on that column; src/lib/mcp/tokens.ts rebuilds the table once (rows copied
 *   unchanged) before the first new-format write. See `isLegacyMcpTokensTable`.
 */

/** Column definitions of `mcp_tokens`, shared by the schema and the one-time legacy rebuild. */
export function mcpTokensTableSql(tableName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scopes TEXT NOT NULL CHECK (length(scopes) BETWEEN 1 AND 400),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT
);`;
}

export const MCP_TOKENS_INDEX_SQL = "CREATE INDEX IF NOT EXISTS mcp_tokens_created_idx ON mcp_tokens (created_at);";

export const schema = `
${mcpTokensTableSql("mcp_tokens")}
${MCP_TOKENS_INDEX_SQL}
`;

/** True when a stored `CREATE TABLE mcp_tokens` statement still has the legacy scopes CHECK. */
export function isLegacyMcpTokensTable(createSql: string | null | undefined): boolean {
  return typeof createSql === "string" && /scopes\s+IN\s*\(\s*'read'\s*,\s*'read write'\s*\)/i.test(createSql);
}
