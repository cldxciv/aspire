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
 *   it. `scopes` is "read" or "read write". Times are epoch ms. A token is usable only while it is
 *   not revoked, not expired, and its creator is still an enabled admin. Deleted with the creator
 *   (ON DELETE CASCADE; accounts are disabled, not deleted, in practice).
 */
export const schema = `
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scopes TEXT NOT NULL CHECK (scopes IN ('read', 'read write')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS mcp_tokens_created_idx ON mcp_tokens (created_at);
`;
