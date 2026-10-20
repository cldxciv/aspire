# MCP server (`/api/mcp`)

Owner: MCP-CORE (endpoint, token module, tools). Admin UI and token APIs: MCP-ADMIN (`/admin/mcp`, `/api/admin/mcp-tokens`).

## What it is

The website is a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI agent (Claude Code, the Claude Agent SDK, the Claude API's MCP connector) can work with Aspire's data on behalf of an **admin**: look up accounts, read the audit log, summarise a student's study-tool progress, read programs / centres / results exactly as the website shows them, and do a few account chores (create student/parent accounts, link parents, disable/enable accounts).

- **Endpoint:** `POST https://<host>/api/mcp`. MCP **Streamable HTTP** transport, **stateless** (no `Mcp-Session-Id`), **JSON responses** (no SSE). `GET` and `DELETE` answer `405` (no standalone stream, no sessions to end).
- **Server info:** name `aspire-website`, version = `package.json` version, protocol versions supported by `@modelcontextprotocol/sdk` 1.32.1 (latest `2025-11-25`).
- **Implementation:** the official SDK (`@modelcontextprotocol/sdk`, pinned `1.32.1`): `McpServer` + `WebStandardStreamableHTTPServerTransport`, which works on Web `Request`/`Response`, so it runs inside a Next.js route handler without Express. A fresh server and transport per request. Files: `src/app/api/mcp/route.ts`, `src/lib/mcp/{handler,server,auth,tokens,log,info}.ts`, `src/lib/mcp/tools/*`, table schema `src/lib/db/features/mcp.ts`.

## Tokens (admin-issued)

1. Sign in as an admin and open **Admin → MCP** (`/admin/mcp`, built by MCP-ADMIN).
2. Create a token: a name (e.g. "Office laptop – Claude Code"), the scope, and an expiry (default 90 days, 1–365).
   - **`read`** – read tools only (recommended default).
   - **`read write`** – also the write tools.
3. Copy the token **now**: it is shown once (`asp_mcp_…`, 32 random bytes). The site stores only its SHA-256.
4. Revoke it in the same page when it is no longer needed or may have leaked. Revocation is immediate.

A token stops working when it is revoked, expires, or when the admin who created it is disabled, is no longer an admin, or must change a temporary password (e.g. after a password reset). Creating and revoking tokens is audited (`mcp.token_create`, `mcp.token_revoke`).

Treat tokens like passwords: never commit them, paste them into chat, tickets or docs, or put them in shared config. Prefer an environment variable.

## Connecting

### Claude Code

```bash
claude mcp add --transport http aspire https://<host>/api/mcp --header "Authorization: Bearer <token>"
```

Or in a project `.mcp.json` with the token taken from the environment (keeps it out of the file):

```json
{
  "mcpServers": {
    "aspire": {
      "type": "http",
      "url": "https://<host>/api/mcp",
      "headers": { "Authorization": "Bearer ${ASPIRE_MCP_TOKEN}" }
    }
  }
}
```

Check with `/mcp` inside Claude Code; the tools appear as `mcp__aspire__list_accounts` and so on.

### Claude Agent SDK

The Agent SDK takes the same server definition in its `mcpServers` option (`type: "http"`, `url`, `headers` with the bearer token). See the Agent SDK docs (code.claude.com/docs/en/agent-sdk) for the exact option names in your language.

### Claude API – MCP connector (Messages API)

Anthropic's servers connect to the MCP server, so the host must be reachable over public HTTPS (not `localhost`), and tool results pass through the API. Beta header `mcp-client-2025-11-20`; both `mcp_servers` and a matching `mcp_toolset` are required:

```python
import os
import anthropic

client = anthropic.Anthropic()
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    betas=["mcp-client-2025-11-20"],
    mcp_servers=[{
        "type": "url",
        "url": "https://<host>/api/mcp",
        "name": "aspire",
        "authorization_token": os.environ["ASPIRE_MCP_TOKEN"],
    }],
    # Allowlist mode: only the read tools you name are enabled.
    tools=[{
        "type": "mcp_toolset",
        "mcp_server_name": "aspire",
        "default_config": {"enabled": False},
        "configs": {"site_status": {"enabled": True}, "list_programs": {"enabled": True}},
    }],
    messages=[{"role": "user", "content": "Which programs prepare for NEET?"}],
)
```

### Claude Managed Agents

Declare the server on the agent (`mcp_servers: [{type: "url", name: "aspire", url: "https://<host>/api/mcp"}]` plus `{type: "mcp_toolset", mcp_server_name: "aspire"}`) and store the token in a **vault** as a `static_bearer` credential keyed by `mcp_server_url` (the token never enters the sandbox). MCP toolsets default to `always_ask`, so a person approves each call; keep that for write tokens.

### claude.ai custom connectors – not supported

claude.ai connectors require OAuth 2.1 authorization. This server only accepts admin-issued bearer tokens, so it targets Claude Code, the Agent SDK and the API.

## Tools

All results have a one-line summary plus the same data as JSON in the text block, and `structuredContent` with that JSON. Errors are tool results with `isError: true` and `structuredContent: { error, message }` (codes such as `not_found`, `forbidden`, `login_id_taken`). Lists page with `limit` (1–100, default 25) + `offset` → `nextOffset` (audit log: `beforeId` → `nextBeforeId`).

| Tool | Scope | Annotations | What it does |
|---|---|---|---|
| `site_status` | read | read-only | Content mode (demo/production), enquiry delivery (`connected` / `not_configured`, never stored), Ask Aspire key present yes/no, preview gates, account counts, this token's name/scope/expiry. No secret values |
| `list_accounts` | read | read-only | Filter by role, status (active/disabled), search (name / login ID). id, role, displayName, loginId, disabled, mustChangePassword, createdAt, updatedAt. Never hashes |
| `get_account` | read | read-only | One account plus linked parents (for a student) or students (for a parent) |
| `list_audit_log` | read | read-only | Newest first; filter by action (exact or prefix like `mcp.`), targetId, actorId; with actor/target names |
| `get_student_progress` | read | read-only | Counts and labels only: mock tests (attempts, accuracy, best per test, streak, badges), planner (streak, XP, last-30-day activity, exam/days to exam), up to 10 Ask Aspire weak topics (subject + label + count). No answers, plan contents, nicknames, schools or question text |
| `list_programs` | read | read-only | Programs as on the website (optional exam track) |
| `list_centres` | read | read-only | Centres as on the website (optional query / exam) |
| `list_results` | read | read-only | `kind: results` or `rankers`; the website's visibility and consent rules (names only where `canShowStudentName`), no photos, schools or quotes |
| `create_account` | read write | not destructive, not idempotent | Creates a **student or parent** account; returns the **one-time temporary password** (same as the admin API: shown once, never stored in clear, must be changed at first sign-in) |
| `link_parent_student` | read write | idempotent | Links a parent to a student |
| `unlink_parent_student` | read write | destructive, idempotent | Removes that link |
| `set_account_disabled` | read write | destructive, idempotent | Disables (signs out everywhere) or re-enables a **student or parent**. Admin accounts are refused |

Deliberately missing: password reset, admin creation, any change to admin accounts, deleting anything, and enquiries (the site never stores enquiries; `site_status` says whether they are forwarded to a webhook). Placeholder records (`placeholder: true`) are unverified DEMO data and appear only in demo mode, exactly like on the site.

Every tool is listed for every token. A `read` token calling a write tool gets a `forbidden` tool error (also audited).

## Security

- **Authentication:** `Authorization: Bearer asp_mcp_<43 chars>`. Lookup by SHA-256 hash, constant-time comparison, creator re-checked on every request. Failures: `401` with `WWW-Authenticate: Bearer realm="aspire-mcp", error="invalid_token"` (or `invalid_request` when missing).
- **Rate limits** (in memory, per process, rolling 10 minutes): 120 requests per token, 600 for all tokens together, 20 failed authentications per client IP (then `429` before any lookup). `429` carries `Retry-After`.
- **Browsers:** a request with an `Origin` or `Sec-Fetch-Site` header must be same-origin (`403` otherwise, checked before authentication); no CORS headers are ever sent. MCP clients send no `Origin`.
- **Responses:** `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. Bodies over 64 KB → `413`.
- **Never in outputs:** password hashes, session tokens, MCP tokens or hashes, IP addresses, Ask Aspire question text/photos/answers, mock-test answers, webhook URLs/secrets, API keys, result-card photos. Tool exceptions become a generic `server_error` (the SDK would otherwise echo the exception message).
- **Audit:** every `tools/call` writes `mcp.call` `{ tool, via: "mcp", mcpKeyId, scopes }` before it runs (unknown tool names are recorded as `unknown`; arguments are never recorded). Write tools add `mcp.<tool>` with the target and outcome (`changed`, `no_change`, `forbidden` or the error code), and the account service writes its usual `admin.*` row. The actor is the admin who created the token. View them at `/admin/audit` or with `list_audit_log` (`action: "mcp."`).
- **Logs:** one JSON line per event with fixed codes (`event: "mcp"`); never tokens, IPs, arguments or results.
- **Minors:** student data is limited to what the admin portal already handles plus progress counts/labels. The tool descriptions and server instructions tell the agent to use it only for the task at hand.

## Deployment notes

- **nginx:** responses are plain JSON, so default buffering is fine. If the server is ever switched to SSE streaming (`enableJsonResponse: false`), add a location with `proxy_buffering off;` (and a long `proxy_read_timeout`) for `/api/mcp`.
- **Preview password gate (D-027):** when `PREVIEW_ACCESS_PASSWORD` is set, `src/proxy.ts` requires HTTP Basic credentials on every route, which conflicts with the bearer token in the same `Authorization` header, so `/api/mcp` is unreachable while the gate is on. Fix (proxy owner): exempt `/api/mcp` from the preview gate (the endpoint has its own authentication). The proxy does not otherwise touch `/api/mcp` (not a portal path; `/api` is non-localized).
- **Single node:** tokens live in SQLite and rate limits in memory, like the rest of the auth system.
- `TRUSTED_PROXY_HOPS` decides which `X-Forwarded-For` entry is the client IP for the failed-auth limit.

## Limitations

- No OAuth (so no claude.ai connectors); tokens are bearer secrets: anyone holding one can act within its scope until it expires or is revoked.
- No enquiries (never stored).
- Admins' learner-data access: `get_student_progress` lets a token holder see a learner's study-tool counts. The portal policy (docs/auth-and-portals.md) still denies admins learner records in the web UI; the owner asked for this tool, so record the decision if it stays.
- The audit log grows by one row per tool call (no pruning yet).

## Verification

```
npx vitest run src/lib/mcp src/app/api/mcp
npx tsc --noEmit
npx eslint src/lib/mcp src/app/api/mcp
```
