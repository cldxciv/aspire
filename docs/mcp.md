# MCP server (`/api/mcp`)

Owner: MCP-CORE (endpoint, token module, tools). Admin UI and token APIs: MCP-ADMIN (`/admin/mcp`, `/api/admin/mcp-tokens`).

## What it is

The website is a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI agent (Claude Code, the Claude Agent SDK, the Claude API's MCP connector) can work with Aspire's data on behalf of an **admin**: look up accounts, read the audit log, summarise a student's study-tool progress, read programs / centres / results exactly as the website shows them, do a few account chores (create student/parent accounts, link parents, disable/enable accounts), and work the **CRM** (enquiry leads: inbox, lead detail, follow-ups, funnel report, notes, stages, assignment, walk-ins).

- **Endpoint:** `POST https://<host>/api/mcp`. MCP **Streamable HTTP** transport, **stateless** (no `Mcp-Session-Id`), **JSON responses** (no SSE). `GET` and `DELETE` answer `405` (no standalone stream, no sessions to end).
- **Server info:** name `aspire-website`, version = `package.json` version, protocol versions supported by `@modelcontextprotocol/sdk` 1.32.1 (latest `2025-11-25`).
- **Implementation:** the official SDK (`@modelcontextprotocol/sdk`, pinned `1.32.1`): the low-level `Server` (so `tools/list` can follow each token's permissions) + `WebStandardStreamableHTTPServerTransport`, which works on Web `Request`/`Response`, so it runs inside a Next.js route handler without Express. A fresh server and transport per request. Files: `src/app/api/mcp/route.ts`, `src/lib/mcp/{handler,server,auth,tokens,scopes,log,info}.ts`, `src/lib/mcp/tools/*`, table schema `src/lib/db/features/mcp.ts`.

## Tokens (admin-issued)

1. Sign in as an admin and open **Admin → MCP** (`/admin/mcp`, built by MCP-ADMIN).
2. Create a token: a name (e.g. "Office laptop – Claude Code"), its **permissions per service** (Read / Write, see below), and an expiry (default 90 days, 1–365). Grant only what the agent needs.
3. Copy the token **now**: it is shown once (`asp_mcp_…`, 32 random bytes). The site stores only its SHA-256.
4. Revoke it in the same page when it is no longer needed or may have leaked. Revocation is immediate.

A token stops working when it is revoked, expires, or when the admin who created it is disabled, is no longer an admin, or must change a temporary password (e.g. after a password reset). Creating and revoking tokens is audited (`mcp.token_create`, `mcp.token_revoke`).

Treat tokens like passwords: never commit them, paste them into chat, tickets or docs, or put them in shared config. Prefer an environment variable.

## Permissions (per service)

Access is granted per **service**, with separate **Read** and **Write** permissions. Scope strings are `<service>:read` and `<service>:write`; **write implies read**. The catalogue lives in `src/lib/mcp/scopes.ts` (`MCP_SERVICES`, shared with the admin UI).

| Service | Read tools (`<service>:read`) | Write tools (`<service>:write`) |
|---|---|---|
| `site` | `site_status` | – (read only) |
| `accounts` | `list_accounts`, `get_account` | `create_account`, `link_parent_student`, `unlink_parent_student`, `set_account_disabled` |
| `progress` | `get_student_progress` | – (read only) |
| `audit` | `list_audit_log` | – (read only) |
| `content` | `list_programs`, `list_centres`, `list_results` | – (read only) |
| `crm` | `list_leads`, `get_lead`, `list_my_tasks`, `crm_report` | `add_lead_note`, `change_lead_stage`, `assign_lead`, `create_lead_task`, `complete_lead_task`, `log_lead_contact`, `create_walkin_lead` |

Examples:

- Content assistant: `["site:read", "content:read"]`.
- Account helper that can create accounts and link parents, nothing else: `["accounts:write"]` (normalised to `["accounts:read", "accounts:write"]`).
- Read-everything token: `["site:read", "accounts:read", "progress:read", "audit:read", "content:read", "crm:read"]`.
- Admissions assistant working the CRM: `["site:read", "content:read", "crm:write"]`.

Rules: at least one permission; no duplicates; known, available services only; `:write` only where the service has write tools (`content:write` is a validation error). `tools/list` returns **only** the tools the token's permissions allow, and every `tools/call` is checked again: any other tool gets a `forbidden` tool error (`<tool> needs the '<service>:<level>' permission…`) and an `mcp.<tool>` audit row with outcome `forbidden`. `site_status` shows the token's permissions per service and its tool list.

Tokens created before per-service permissions keep working: the stored legacy value `read` means `site`, `accounts`, `progress`, `audit` and `content` at read, `read write` adds `accounts:write` (mapped when read; rows unchanged). Services added later — `crm` (families' personal data) — are **never** granted to a legacy token; create a new token with `crm:*` instead.

Admin UI: the create form starts on the **Read only** quick choice. The quick choices (**Read only**, **Full access**) never tick `crm`. The admin has to tick CRM Read or Write by hand, and the row says so (`explicitOnly` in `src/components/mcp-admin/permissions.ts`). This keeps lead data out of a new token unless an admin chose to grant it.

Storage: the normalised list, space-separated, in `mcp_tokens.scopes` (e.g. `accounts:read accounts:write content:read`). Databases created before this change had `CHECK (scopes IN ('read', 'read write'))` on that column; the token module rebuilds the table once (same columns, rows copied unchanged) before the first new-format write.

Module API. `src/lib/mcp/scopes.ts` (client-safe, for the admin UI): `MCP_SERVICES`, `type McpScope`, `normalizeScopes(list | legacy string)`, `isToolAllowed(scopes, tool)`, `scopesSummary(scopes)` → `{ [service]: "none" | "read" | "write" }`, `allowedTools(scopes)`, `scopeIssues(list)`, zod `mcpScopesInputSchema`. `src/lib/mcp/tokens.ts` (server-only): `createMcpToken({ name, scopes: string[] | "read" | "read write", expiresInDays, createdBy })`, `listMcpTokens()`, `getMcpToken(id)`, `revokeMcpToken(id, revokedBy)`; `McpTokenRecord.scopes` is the normalised `McpScope[]`, plus `scopeSummary`. `mcp.token_create` audit details: `name`, `expiresInDays`, `scopes` (the list) and `access` (summary, e.g. `site=read accounts=write progress=none audit=none content=read crm=read`).

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
    # The token's permissions decide which tools exist; allowlist mode narrows it further.
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

Each tool belongs to one service (table above). All results have a one-line summary plus the same data as JSON in the text block, and `structuredContent` with that JSON. Errors are tool results with `isError: true` and `structuredContent: { error, message }` (codes such as `not_found`, `forbidden`, `login_id_taken`). Lists page with `limit` (1–100, default 25) + `offset` → `nextOffset` (audit log: `beforeId` → `nextBeforeId`).

| Tool | Permission | Annotations | What it does |
|---|---|---|---|
| `site_status` | `site:read` | read-only | Content mode (demo/production), where enquiries go (stored as CRM leads and/or forwarded to a webhook, or `not_configured`; whether leads are reachable through the `crm` tools), Ask Aspire key present yes/no, preview gates, account counts, this token's name, expiry, permissions per service and tool list, the service catalogue. No secret values |
| `list_accounts` | `accounts:read` | read-only | Filter by role, status (active/disabled), search (name / login ID). id, role, displayName, loginId, disabled, mustChangePassword, createdAt, updatedAt. Never hashes |
| `get_account` | `accounts:read` | read-only | One account plus linked parents (for a student) or students (for a parent) |
| `list_audit_log` | `audit:read` | read-only | Newest first; filter by action (exact or prefix like `mcp.`), targetId, actorId; with actor/target names |
| `get_student_progress` | `progress:read` | read-only | Counts and labels only: mock tests (attempts, accuracy, best per test, streak, badges), planner (streak, XP, last-30-day activity, exam/days to exam), up to 10 Ask Aspire weak topics (subject + label + count). No answers, plan contents, nicknames, schools or question text |
| `list_programs` | `content:read` | read-only | Programs as on the website (optional exam track) |
| `list_centres` | `content:read` | read-only | Centres as on the website (optional query / exam) |
| `list_results` | `content:read` | read-only | `kind: results` or `rankers`; the website's visibility and consent rules (names only where `canShowStudentName`), no photos, schools or quotes |
| `create_account` | `accounts:write` | not destructive, not idempotent | Creates a **student or parent** account; returns the **one-time temporary password** (same as the admin API: shown once, never stored in clear, must be changed at first sign-in) |
| `link_parent_student` | `accounts:write` | idempotent | Links a parent to a student |
| `unlink_parent_student` | `accounts:write` | destructive, idempotent | Removes that link |
| `set_account_disabled` | `accounts:write` | destructive, idempotent | Disables (signs out everywhere) or re-enables a **student or parent**. Admin and staff accounts are refused |
| `list_leads` | `crm:read` | read-only | CRM inbox. Filters: stage (or `open`), centre (or `none`), program, source, tool (predictor / mocktest / ask / planner), assignee (id, `me` = the token's admin, `unassigned`), due (`today` / `overdue`), search (name or last 4+ phone digits), created range, sort. Paged (`page`, `pageSize` ≤ 100). **Phones masked** (`phoneMasked` `+91******1234`, `phoneLast4`) |
| `get_lead` | `crm:read` | read-only | Full lead: names, full phone, email, centre/program/class, stage, assignee, attribution, the family's message, consent **version and time only** (never the sentence), timeline and tasks. Audited by the CRM (`crm.lead_view`) |
| `list_my_tasks` | `crm:read` | read-only | Follow-ups assigned to the token's admin: `today`, `overdue`, `upcoming`, `open`, `done`; lead phones masked. Team-wide due work: `list_leads` with `due` |
| `crm_report` | `crm:read` | read-only | Funnel for leads created in [from, to) (default last 30 days): per stage, reached stages, by source / tool / centre / program / counsellor, lost reasons, conversion. Counts only |
| `add_lead_note` | `crm:write` | not idempotent | Staff note (1–2000 chars) on the timeline |
| `change_lead_stage` | `crm:write` | idempotent | Any stage → any stage; `lost` requires `lostReason`; leaving `lost` clears it |
| `assign_lead` | `crm:write` | idempotent | Assign to an active CRM staff member (`assigneeId`) or unassign (`null`) |
| `create_lead_task` | `crm:write` | not idempotent | Follow-up: title, `dueAt` (ISO, −1 day … +2 years), optional assignee |
| `complete_lead_task` | `crm:write` | idempotent | Marks a task done |
| `log_lead_contact` | `crm:write` | not idempotent | **Records** a call / WhatsApp a staff member made (outcome + optional note); **nothing is sent** (D-041). `connected` moves a `new` lead to `contacted` |
| `create_walkin_lead` | `crm:write` | not idempotent | Walk-in / phone / referral lead; needs a name, an Indian mobile and `familyConsented: true`; a known phone reuses its lead (`isNew: false`) |

Deliberately missing: password reset, admin creation, any change to admin or staff accounts, deleting anything, and from the CRM: CSV export, erase, staff and assignment-rule management.

CRM tools call the CRM services (`src/lib/crm`, never SQL), so their validation, record-level access and `crm.*` audit rows apply; the CRM viewer is the admin who created the token (admin-level access, docs/crm.md). The `tool` filter of `list_leads` is applied by walking the service's pages (the CRM service has no tool filter yet; at most 5000 leads are searched, flagged `truncated`). Placeholder records (`placeholder: true`) are unverified DEMO data and appear only in demo mode, exactly like on the site.

Unknown tool names get an `unknown_tool` error; arguments that fail a tool's schema get `invalid_arguments` (`Input validation error: …`). A tool outside the token's permissions gets `forbidden` before its arguments are looked at.

## Security

- **Authentication:** `Authorization: Bearer asp_mcp_<43 chars>`. Lookup by SHA-256 hash, constant-time comparison, creator re-checked on every request. Failures: `401` with `WWW-Authenticate: Bearer realm="aspire-mcp", error="invalid_token"` (or `invalid_request` when missing).
- **Rate limits** (in memory, per process, rolling 10 minutes): 120 requests per token, 600 for all tokens together, 20 failed authentications per client IP (then `429` before any lookup). `429` carries `Retry-After`.
- **Browsers:** a request with an `Origin` or `Sec-Fetch-Site` header must be same-origin (`403` otherwise, checked before authentication); no CORS headers are ever sent. MCP clients send no `Origin`.
- **Responses:** `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. Bodies over 64 KB → `413`.
- **Never in outputs:** password hashes, session tokens, MCP tokens or hashes, IP addresses, Ask Aspire question text/photos/answers, mock-test answers, consent sentences (only their version), full phone numbers in lists (only `get_lead` shows the full record), webhook URLs/secrets, API keys, result-card photos. Tool exceptions become a generic `server_error` (never the exception message).
- **Least privilege:** per-service Read/Write permissions; a token sees only its tools. Grant write only to tokens that need it.
- **Audit:** every `tools/call` writes `mcp.call` `{ tool, via: "mcp", mcpKeyId, scopes }` before it runs (unknown tool names are recorded as `unknown`; arguments are never recorded). Write tools add `mcp.<tool>` with the target and outcome (`changed`, `no_change` or the error code), and the account / CRM services write their usual `admin.*` / `crm.*` rows (CRM write rows carry the lead id and facts such as the stage, channel or contact outcome — never note text, names or phones). A call outside the token's permissions (any tool) adds `mcp.<tool>` with outcome `forbidden`. The actor is the admin who created the token. View them at `/admin/audit` or with `list_audit_log` (`action: "mcp."`).
- **Logs:** one JSON line per event with fixed codes (`event: "mcp"`); never tokens, IPs, arguments or results.
- **Minors:** student data is limited to what the admin portal already handles plus progress counts/labels. The tool descriptions and server instructions tell the agent to use it only for the task at hand.

## Deployment notes

- **nginx:** responses are plain JSON, so default buffering is fine. If the server is ever switched to SSE streaming (`enableJsonResponse: false`), add a location with `proxy_buffering off;` (and a long `proxy_read_timeout`) for `/api/mcp`.
- **Preview password gate (D-027):** `src/proxy.ts` exempts exactly `/api/mcp` from the HTTP Basic preview gate (the bearer token uses the same `Authorization` header; the endpoint has its own authentication). The proxy does not otherwise touch `/api/mcp` (not a portal path; `/api` is non-localized).
- **Single node:** tokens live in SQLite and rate limits in memory, like the rest of the auth system.
- `TRUSTED_PROXY_HOPS` decides which `X-Forwarded-For` entry is the client IP for the failed-auth limit.

## Limitations

- No OAuth (so no claude.ai connectors); tokens are bearer secrets: anyone holding one can act within its scope until it expires or is revoked.
- CRM: no export, erase or staff/rule management via MCP; `list_my_tasks` covers the token admin's own tasks only.
- Admins' learner-data access: `get_student_progress` lets a token holder see a learner's study-tool counts. The portal policy (docs/auth-and-portals.md) still denies admins learner records in the web UI; the owner asked for this tool, so record the decision if it stays.
- The audit log grows by one row per tool call (no pruning yet).

## Verification

```
npx vitest run src/lib/mcp src/app/api/mcp --maxWorkers=2
npx tsc --noEmit
npx eslint src/lib/mcp src/app/api/mcp
```
