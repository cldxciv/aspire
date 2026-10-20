# Auth boundary and portals

Owner: AUTH workstream (was PORTAL). Decisions: D-011 (deny by default, proxy is optimistic only) and **D-029** (self-hosted credentials sign-in for student, parent and admin) in `docs/agent-decisions.md` / `docs/m4-plan.md`.

## Current state

- **Sign-in works at the API level** for all three roles: `POST /api/auth/login` checks a login id + password against a local SQLite user store and sets an `HttpOnly` session cookie. `getSession()` validates that cookie against the database on every request.
- **The UI is built (AUTH-2), in English and Hindi (`/hi/...`).** See "Pages" below: `/login` with Student / Parent / Admin tabs, `/forgot-password` (contact the office — no email service, no fake reset), `/account/password` (change password; also where `mustChangePassword` accounts are sent), the student / parent / admin portals, and admin user management (`/admin/users`) + audit log (`/admin/audit`).
- **Portal data stays honest.** No LMS or student-information system is connected. Since M6 the portals show real data from the site's own tools (mock tests, study planner, Ask Aspire topics) via `src/components/portal/learner-tools.ts`; timetable, classroom results and attendance remain `notConnected`. Nothing invents grades or attendance. **Enquiries are stored:** since M7 every valid website and tool enquiry is saved as a lead in the admissions CRM (`ENQUIRY_STORE=crm`, the default; D-039, `docs/crm.md`), and staff and admins work them in the Enquiries inbox at `/crm`. The old `GET /api/admin/enquiries` 503 stub and the admin "Enquiries" page are gone; `/admin/enquiries` redirects to `/crm`.
- **Accounts:** the first admin is created with `npm run auth:create-admin`. Admins then create student, parent and admin accounts via `/api/admin/users`. In development, `npm run auth:seed` creates four demo accounts.

## Architecture

| Layer | File(s) | Role |
|---|---|---|
| Proxy | `src/proxy.ts` (owned by I18N) | Optimistic only: `X-Robots-Tag`, `no-store`, 401 / login redirect when the `aspire_session` cookie is **absent**. Presence of the cookie grants nothing |
| Route guards | `src/lib/auth/guards.ts` | `requireRole(...roles)`, `requireStudentRecord(id, ...roles)` → 401 / 403 / 400 JSON |
| Page gate | `src/lib/auth/portal-access.ts` via `<PortalGate>` | Session with the right role → page; previews on → data-free shell; else redirect to `/login?next=…` |
| Policy (pure) | `src/lib/auth/policy.ts` | `authorizeRole`, `canAccessStudentRecord`, `decidePortalPage`. Deny by default, unit-tested |
| Session read | `src/lib/auth/session.ts` | `getSession()` / `getCurrentSession()`: read the cookie with `cookies()`, validate in the DB, fail closed |
| Sessions | `src/lib/auth/sessions.ts` | Token generation, SHA-256 hashing, create / resolve / sliding expiry / revoke |
| Accounts | `src/lib/auth/accounts.ts` | Sign-in, password change, admin create / disable / enable / rename / reset / link, audit rows |
| Passwords | `src/lib/auth/password.ts` | scrypt hashing, constant-time verify, policy, temporary-password generator |
| Throttling | `src/lib/auth/throttle.ts` | Failed-attempt counters in SQLite (per login id, per IP, per user for password changes) |
| HTTP helpers | `src/lib/auth/{request,responses,cookie,route-helpers,schemas,messages,log}.ts` | Same-origin check, JSON + size limit + zod, envelope with `no-store`, cookie attributes, secret-free logs |
| Store | `src/lib/db/**` (server-only) | `node:sqlite` connection, migrations, and one module per table |

Other files: `roles.ts` (`Role`, `Session`, `isValidSession`), `config.ts` (`AUTH_COOKIE_NAME`, `SESSION_COOKIE_NAME`, `isPortalPreviewEnabled`, `ROBOTS_NOINDEX`), `paths.ts` (`sanitizeNextPath`, `buildLoginHref`, `postLoginRedirect`), `identifiers.ts` (login-id and display-name rules).

### Store (`src/lib/db/`)

Node's built-in **`node:sqlite`** (`DatabaseSync`). No npm packages. The file is `AUTH_DB_PATH`, default `.data/aspire.sqlite`; the directory is created if missing. `.data/` is git-ignored. Migrations run on first use and are idempotent (`PRAGMA user_version` plus `IF NOT EXISTS`). The database runs in WAL mode with foreign keys on and a 5 s busy timeout. One connection is shared per process (on `globalThis`, so dev reloads reuse it).

| Table | Columns | Notes |
|---|---|---|
| `users` | id (UUID), role `student\|parent\|admin`, display_name, login_id (unique, lower case, CHECK-enforced), password_hash, disabled, must_change_password, created_at, updated_at | Times are epoch ms |
| `sessions` | token_hash (PK, SHA-256 hex), user_id, created_at, expires_at, last_seen_at, user_agent (≤ 120 chars) | Raw tokens are never stored |
| `parent_links` | parent_id, student_id, created_at, created_by | Written only by admins (or the dev seed) |
| `audit_log` | id, actor_id, action, target, created_at, details (JSON) | Details hold flat, non-secret facts. Keys that look like secrets are dropped |
| `login_attempts` | id, scope `ip\|login\|pwchange`, key_hash (SHA-256), created_at | Pruned past the 10-minute window |

Types: the repo pins `@types/node@20`, which predates `node:sqlite`, so `src/lib/db/node-sqlite.d.ts` declares the subset we use. Delete it if `@types/node` is upgraded to 22.13 or later.

The files in `src/lib/db/**`, plus `password.ts` and `identifiers.ts`, have **no runtime imports of other project files**: type-only imports are fine. The scripts load them directly through Node's type stripping, so keep it that way.

### Passwords

- `crypto.scrypt` with N = 2^15, r = 8, p = 1 (about 32 MiB), a 32-byte key and a random 16-byte salt per hash. `maxmem` is set explicitly. Stored as `scrypt$N$r$p$<salt>$<hash>` (base64url). Parameters read back from storage are bounds-checked. Verification uses `timingSafeEqual`. Hashes made with older parameters are re-hashed on the next successful sign-in.
- Input is NFKC-normalised before hashing.
- Policy: 10 to 128 characters, counted as code points, and not equal to the login id (case-insensitive). A new password must differ from the current one.
- Temporary passwords look like `Kq7m-x2Pa-9TbW-fh4R` (16 symbols from an unambiguous 55-character alphabet, about 92 bits). They are generated server-side, returned once in the admin API response, and never stored in clear. The account gets `must_change_password = 1`.

### Sessions

- The token is 32 random bytes (base64url, 43 characters) in the cookie **`aspire_session`**: `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `NODE_ENV=production`, and `Max-Age` 7 days. The database stores **SHA-256(token)** only.
- Expiry slides. A session is valid for 7 days after the last activity, and activity (`last_seen_at` / `expires_at`) is written **at most once an hour**. A session never lasts more than 30 days after sign-in. `GET /api/auth/me` re-issues the cookie when the expiry moved.
- A token that is malformed, unknown, expired, or belongs to a disabled or missing account counts as signed out, and the dead row is deleted. A database error is logged without detail and also counts as signed out (fail closed).
- Signing in rotates the session: the browser's previous session is revoked. Each user keeps at most 10 sessions, so the oldest are dropped.
- Revocation: logout deletes the row and expires the cookie. A password change revokes all of the user's *other* sessions. An admin password reset or disable revokes *all* of them.
- **Temporary password gate.** While `mustChangePassword` is true, `authorizeRole` returns `password_change_required`. Guards answer 403 ("Please change your temporary password before continuing.") and portal pages deny, falling back to preview or the login redirect. `/api/auth/me`, `/api/auth/change-password`, `/api/auth/logout` and `/api/session` still work.

### Sign-in throttling

Attempts are recorded in `login_attempts` **before** the password check, in the same synchronous step as the limit check, so parallel requests cannot slip past the limit. A successful attempt removes its own rows and clears the login id's failures.

| Key | Limit (rolling 10 min) | Notes |
|---|---|---|
| login id | 5 failures | Applies to unknown ids too, so a 429 reveals nothing about existence. Lifted by an admin password reset |
| client IP | 20 failures | Looser, because a classroom or centre often shares one IP. Uses the first `X-Forwarded-For` hop (see the trust caveat in `src/lib/server/request-guards.ts`) |
| user (password change) | 5 wrong current passwords | — |

A throttled request gets `429 rate_limited` with `Retry-After`, even when the password is right.

## Roles and session

```ts
type Role = "student" | "parent" | "admin";
type Session = {
  userId: string;
  role: Role;
  linkedStudentIds?: readonly string[]; // parents: enabled linked learners, read from parent_links on every request
  displayName?: string;
  loginId?: string;
  mustChangePassword?: boolean;
};
```

- A `Session` only ever comes from `getSession()`, which looks the cookie's token up in the database. A role or user id is **never** taken from query strings, headers, the cookie's contents, local storage or client state. `/login?role=student` and the login body's `role` only select or check a tab; they never grant anything.
- A malformed session is treated as signed out.

### Record-level rules (`canAccessStudentRecord`)

| Role | May read learner `id` when |
|---|---|
| student | `id === session.userId` |
| parent | `id` is in `session.linkedStudentIds`, which comes from `parent_links`. Only enabled student accounts count. Missing or empty means none |
| admin | **Denied** for learner records in the portal until a staff permission model exists (for example, centre-scoped). Admins manage *accounts* through `/api/admin/users`, not learner data. **Exception (owner request, M6 — D-036):** an admin-issued MCP token can call `get_student_progress`, which returns counts and labels only (mock-test totals, planner consistency, doubt-topic labels — no answers, question text or photos); every call is audited (`mcp.call` + token id) |

## APIs

All of these return the D-007 envelope (`src/lib/contracts/api.ts`) with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. State-changing endpoints require the **same origin**: the `Origin` header (or `Sec-Fetch-Site: same-origin`) must match the request host or `NEXT_PUBLIC_SITE_URL`, else 403. They also accept **JSON only** (415) and **at most 4 KB** (413). Validation failures are 422 with `fieldErrors`. Responses never contain password hashes, and tokens never appear in a body.

### Account (`src/app/api/auth/**`)

| Endpoint | Body / result |
|---|---|
| `POST /api/auth/login` | `{ loginId, password, role?, next? }` → 200 `{ role, displayName, mustChangePassword, redirectTo }` and sets the cookie. Every credential failure is a 401 with "Incorrect login ID or password.": unknown id, wrong password, disabled account, or a `role` that doesn't match the account (wrong tab). Unknown ids still run one scrypt verification against a dummy hash. `redirectTo` is the sanitised `next` when it is inside the user's own portal, else the portal home |
| `POST /api/auth/logout` | No body → 200 `{ signedOut: true }`. Deletes the session and expires the cookie. Idempotent |
| `GET /api/auth/me` | 200 `{ id, role, displayName, loginId, mustChangePassword, linkedStudents? (parents: id + displayName), sessionExpiresAt }`, or 401 (a stale cookie is cleared) |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` → 200 `{ passwordChanged: true, otherSessionsSignedOut }`. 401 when signed out. 422 for a wrong current password, a policy failure or an unchanged password. 429 after 5 wrong attempts |

### Admin user management (`src/app/api/admin/**`, admin only)

| Endpoint | Body / result |
|---|---|
| `GET /api/admin/users[?role=]` | List of `{ id, role, displayName, loginId, disabled, mustChangePassword, createdAt, updatedAt, linkedStudentIds? / linkedParentIds? }` |
| `POST /api/admin/users` | `{ role, displayName, loginId }` → 201 `{ user, temporaryPassword }`. The password is shown **once**. 422 for an invalid or taken login id |
| `GET /api/admin/users/:userId` | One user |
| `PATCH /api/admin/users/:userId` | `{ disabled?, displayName? }` → `{ user, signedOutSessions }`. Disabling revokes every session. 403 when an admin tries to disable **themselves** or the **last active admin** |
| `POST /api/admin/users/:userId/reset-password` | No body → `{ user, temporaryPassword, signedOutSessions }`. Revokes sessions, sets must-change and lifts the sign-in lockout. 403 for your own account (use change-password) |
| `PUT` / `DELETE /api/admin/users/:parentId/links/:studentId` | Link or unlink a parent and a student (idempotent; 422 if the roles are wrong, 404 if a user is unknown) |
| `GET /api/admin/audit[?limit=1-200][&target=userId]` | Newest audit entries first |

Each guard checks the same origin first (for writes), then `requireRole("admin")`: 401 when signed out, 403 for other roles or a pending temporary password. Every admin write adds an `audit_log` row: `admin.user_create`, `admin.user_disable`, `admin.user_enable`, `admin.user_rename`, `admin.password_reset`, `admin.link_add` or `admin.link_remove`. The actor is the admin's user id. Sign-ins, sign-outs and password changes are audited too (`auth.login`, `auth.logout`, `auth.password_change`), as are the scripts (`seed.*`, `bootstrap.admin_create`).

### Portal data

| Endpoint | Guard | Signed out | With a valid session |
|---|---|---|---|
| `GET /api/student/me` | `requireRole("student")` | 401 | `{ id, displayName, loginId, notConnected: ["timetable","results","attendance"] }` |
| `GET /api/parent/students` | `requireRole("parent")` | 401 | `[{ id, displayName }]` for linked, enabled learners only |
| `GET /api/parent/students/:studentId` | `requireStudentRecord(id, "parent")` | 401 | 403 if not linked, 400 if the id is malformed, else `{ id, displayName, notConnected }` |
| `GET /api/session` | none | `{ authenticated: false }` | `{ authenticated: true, role, displayName }`. Never ids or tokens |

## Preview mode

`PORTAL_PREVIEW=true|false`. Unset, or any other value, falls back to **on in development and off everywhere else**. Previews only render data-free shells for visitors who are not signed in with the right role. They **never** open an API. A real session with the right role always gets the real page.

## Proxy (`src/proxy.ts`, owned by I18N)

Matcher: everything except `_next/`, `images/`, `assets/` and `favicon.ico` (for the D-027 preview password gate). For portal paths:

| Request | No `aspire_session` cookie | Cookie present |
|---|---|---|
| Portal API (`/api/admin\|student\|parent/**`) | `401` JSON (`no-store`) | Passed to the handler, which verifies the session |
| Portal page | Preview on: continue. Off: `307 → /login?next=<sanitised path>` (localised login path) | Passed to the page gate |
| Account page (`/account/**`, `/hi/account/**`) | Always `307 → /login?next=…` in the same locale; `X-Robots-Tag: noindex` | Passed to the page (`requireSignedIn(locale)`) |

`/api/auth/**` and `/api/session` are not portal paths; their handlers do their own checks. The `next` sanitiser (`sanitizeNextPath`) accepts an optional locale prefix (`/hi/student/x`, `/en/...`) and always returns the **locale-free** path; the allowlist is only same-site paths under `/student`, `/parent` or `/admin` (tests cover `//evil.com`, `/hi//evil.com`, absolute URLs, backslashes, `%2F`/`%5C` encodings, `/hi/hi/...`, control characters). The login API applies it again (`postLoginRedirect`), requires the path to match the user's role and returns a locale-free `redirectTo`; the login form re-checks it and adds the page's locale (`localizedPostLoginPath(role, next, locale)`), so Hindi users land on `/hi/...`. Helpers: `buildLoginHref(next, locale)`, `buildChangePasswordHref(locale, next)`, `requirePortalAccess(role, path, locale)` (redirects to the localised login; a `mustChangePassword` account is sent to `/account/password?next=…`).

## Environment variables

| Name | Purpose |
|---|---|
| `AUTH_DB_PATH` | SQLite file. Default `.data/aspire.sqlite` relative to the working directory. Use an absolute path on persistent storage in production. Under the test runner (`NODE_ENV=test`) an unset value means in-memory |
| `PORTAL_PREVIEW` | See above |
| `NEXT_PUBLIC_SITE_URL` | Also accepted as a same-origin value |
| `AUTH_ADMIN_LOGIN_ID`, `AUTH_ADMIN_NAME`, `AUTH_ADMIN_PASSWORD` | Only for a non-interactive `auth:create-admin`. Set them for that one command; never commit them |
| `TRUSTED_PROXY_HOPS` | Reverse proxies in front of the app that append to `X-Forwarded-For` (default 1). The per-IP sign-in and enquiry limits use the entry added by the outermost trusted proxy (counted from the right), so a client-forged header can't choose its own bucket (QA-AUTH M1). Run production behind a proxy that sets the header; with no proxy a client-sent header is kept as-is by Next |

## QA-AUTH follow-ups (2026-10-20, open — owner/deployment decisions)
- **L1 Session cookie isn't re-issued while in use**: the server-side expiry slides (7 days, 30-day cap) but the cookie's `Max-Age` is set at sign-in and only `GET /api/auth/me` refreshes it, which no UI calls — users are signed out 7 days after signing in (fails safe; the privacy notice says 7 days). Fix if longer sessions are wanted: re-issue the cookie from `/me` and ping it from the portal shell.
- **L2** Any admin can reset/disable another admin (flat admin role, no re-authentication for admin-level actions).
- **L3** Same-origin check prefers `X-Forwarded-Host`; compare against `NEXT_PUBLIC_SITE_URL` only in production.
- **L4** Failed sign-ins / lockouts are only console-logged, not audited.
- **L5** `auth:seed` refuses only when `NODE_ENV=production`; add an explicit `--dev` flag or a DB-path check before running on a server.
- A global cap on failed sign-ins (CPU protection against scrypt floods) is not implemented.
- Info: `auth:create-admin` sets must-change-password only in the env-var mode; `student/me`, `parent/*`, `session` handlers return a non-envelope 500 on a database error.

## Development accounts

```
npm run auth:seed              # create missing demo accounts (idempotent)
npm run auth:seed -- --reset   # also give existing demo accounts new passwords
```

This creates `dev.admin`, `dev.student1`, `dev.student2` and `dev.parent` (linked to `dev.student1`), each with a **randomly generated** password and the must-change flag off. The credentials are written **only** to `.data/dev-credentials.txt` (git-ignored; tab-separated). The script prints counts, never passwords. It **refuses to run when `NODE_ENV=production`**. Never paste these credentials into chat, docs, tickets or commits.

## Creating the first admin (production)

On the server, with the production environment (including `AUTH_DB_PATH`) loaded:

```
npm run auth:create-admin -- --login-id office.admin --name "Office Admin"
```

You type the password at a hidden prompt, twice. It must be 10 to 128 characters and not the login id. For automation without a terminal, set `AUTH_ADMIN_PASSWORD` (plus optionally `AUTH_ADMIN_LOGIN_ID` / `AUTH_ADMIN_NAME`) for that single command only. The account is then flagged to change its password at first sign-in. The script never prints, logs or writes the password, refuses an existing login id, and audits `bootstrap.admin_create`. After that, admins create every other account through the admin API.

## Security checklist

- [x] Passwords: scrypt with a per-user salt and `maxmem`, constant-time compare, bounded parameters, re-hash on parameter change, 10–128-character policy, not the login id.
- [x] No user enumeration: one generic 401 message, the same scrypt work for unknown ids, and throttling applied to unknown ids too.
- [x] Throttling: per login id (5 per 10 min), per IP (20 per 10 min) and per user for password changes. Attempts are recorded before the async check.
- [x] Sessions: 256-bit random tokens, only hashes stored, HttpOnly, SameSite=Lax, Secure in production, 7-day sliding and 30-day absolute expiry, rotation on sign-in, revocation on logout, password change, reset and disable.
- [x] CSRF: same-origin check on every state-changing endpoint, JSON-only bodies and SameSite=Lax.
- [x] Authorisation: deny by default, a role check on every handler, a record-level parent→learner check from server-side links, and portal data held back until a temporary password is changed.
- [x] Admin safety: no self-disable, no disabling the last active admin, no self-reset, and every write audited.
- [x] No secrets in responses, logs or the audit log. Log lines carry fixed codes only: no login ids, IPs, passwords, hashes or tokens. Temporary passwords are returned once.
- [x] `no-store` and `noindex` on every auth, portal and admin response. Errors return a generic 500 with no internals.
- [x] Dev credentials stay in a git-ignored file. The seed refuses to run in production.

## Limitations

- **Single node only.** SQLite lives on one server's disk, so serverless or multi-instance hosting would give each instance its own users and sessions. Move to a managed database (Postgres or similar) before scaling out. The store modules take the database as a parameter, which keeps that change contained.
- The IP limit trusts the first `X-Forwarded-For` hop. That is only reliable behind a proxy that overwrites the header.
- There are no email or SMS channels, so there is no self-service password reset (the office resets passwords) and no 2FA. Admin accounts should use long, unique passwords.
- The per-login-id lockout can be triggered by someone who knows a login id, but it is temporary (10 minutes) and an admin reset lifts it.
- No LMS or student-information system is connected, so portals show account information and "not connected" states only.
- Admins cannot read learner records (no staff permission model yet).

## Pages (AUTH-2; every route also exists under `/hi/`)

| Route | What it does |
|---|---|
| `/login` | 50/50 layout (form + labelled stock photo). Student / Parent / Admin tabs (ARIA tabs: arrows, Home/End); `?role=` and `?next=` pre-select. Login ID + password (autocomplete attrs, show/hide). Focused error summary; generic failure + "check the tab" hint; separate copy for 429 (minutes from `Retry-After`), network, cross-origin and server errors. Password field cleared after each attempt. Signed-in visitors see "signed in as X / go to your portal / sign out" |
| `/forgot-password` | Contact the office or your centre (link to the localised contact page). No reset form |
| `/account/password` | Change password for every role (current / new / confirm, policy hints) → `POST /api/auth/change-password` → role home or a safe `next` |
| `/student` (+ `timetable`, `resources`, `progress`) | Own account details + **real tool data (M6)**: mock-test attempts, best scores, badges and links to result/certificate/report; study-planner streak, study days (last 30), XP, countdown; top Ask Aspire doubt topics (AI-tagged). Still "not connected": timetable, classroom results, attendance, study material |
| `/parent` (+ `progress`, `updates`) | Only the learners linked to this account (read server-side; each re-checked with `canAccessStudentRecord`): mock-test summary, planner consistency (counts only — no XP, exam or exam date), doubt subjects/topics; `/parent/progress` **is** the report (D-033: nothing is sent by WhatsApp/SMS/email); `/parent/updates` lists recent activity. Attendance/classroom results/announcements still "not connected" |
| `/admin` | Real account counts from the database (staff, admins, students, parents, disabled, waiting for a password change) and links to the console sections |
| `/admin/website` | "What's on the website": how many programs, centres, results, rankers, testimonials, headline numbers, articles and FAQs the public site shows right now (read through `src/lib/data.ts`), how many are demo placeholders or approved, names shown without recorded consent, demo or production mode, and how to change content today |
| `/admin/coming` | "What's coming": every planned console page and feature by phase (`src/components/portal/console-roadmap.ts`, from `docs/admin-console-plan.md`), so no sidebar item is an empty screen |
| `/admin/users` | List with role / status / search filters; create (temporary password shown **once** in a dialog with copy button, then dropped); rename; disable (confirm) / enable; reset password (shown once); link / unlink parent ↔ student. No disable/reset on your own account |
| `/admin/audit` | Latest 50 / 100 / 200 audit entries, names instead of ids, no secrets |
| `/admin/enquiries` | Redirects to the Enquiries inbox (`/crm`), where every stored enquiry is listed |
| `/admin/content`, `centres`, `results` | Redirect to `/admin/website` |

Portal chrome (`PortalShell`): logo → localised home, role badge (a link to the area's home), "View website" (every screen width), language switcher (keeps the page), user name, "Change password", "Sign out" (`POST /api/auth/logout` → localised login). In the console areas (admin and staff) the bar also has "Find an enquiry" (a GET search of the inbox, `/crm?q=…`) and "+ Add enquiry" (`/crm?add=1`, which opens the add-enquiry form). The admin sidebar is grouped by the console sections of `docs/admin-console-plan.md` (Dashboard, Admission engine, Website & content, Users & access, Settings & audit); a section appears only once one of its pages works. The preview banner shows only on the data-free preview shells (D-014). All strings come from the `auth` and `portal` message namespaces (Hindi is a machine draft — `docs/hindi-review-register.md`).

## Verification

```
npx vitest run src/lib/auth src/lib/db src/app/api src/proxy.test.ts
npx tsc --noEmit
npx eslint src/lib/auth src/lib/db src/app/api scripts
```
