# Auth boundary and portals

Owner: PORTAL workstream. Decision reference: D-011 (`docs/agent-decisions.md`).

## Current state

- **No identity provider is integrated.** `getSession()` always returns `null`.
- **Every portal API denies.** `/api/admin|student|parent/**` return `401 unauthenticated` (in the proxy and again in the handler).
- **Portal pages are data-free preview shells.** They render only when previews are enabled (`PORTAL_PREVIEW`). Otherwise the proxy and the page both redirect to `/login`.
- **`/login` has no form and no password field.** It explains that sign-in isn't available yet.
- No metric, record, name or number on a portal page comes from a data source. Tiles show "—" with "No live data", and unavailable areas show an `EmptyState` naming the system that must be connected. The only rows anywhere are the client-only **DEMO** table on `/admin/enquiries` ("Sample applicant A/B/C"). It appears in preview mode only and is never saved or sent.

## Layers (deny by default at each one)

| Layer | File | Role | Decides access? |
|---|---|---|---|
| Proxy | `src/proxy.ts` | `X-Robots-Tag`, `no-store`, optimistic 401 / login redirect | **No.** It is optimistic only |
| Page gate | `src/components/portal/PortalGate.tsx` → `src/lib/auth/portal-access.ts` | Session with the right role → page; preview on → data-free shell; else `redirect('/login?next=…')` | Yes |
| Route-handler guards | `src/lib/auth/guards.ts` | `requireRole(...roles)`, `requireStudentRecord(id, ...roles)` → 401 / 403 / 400 JSON envelope | Yes |
| Policy (pure) | `src/lib/auth/policy.ts` | `authorizeRole`, `canAccessStudentRecord`, `decidePortalPage` | Yes. Unit-tested |
| Session | `src/lib/auth/session.ts` | `getSession()`: **the integration point** | — |

Other files:
- `src/lib/auth/roles.ts`: `Role`, `Session` and the `isValidSession` structural check.
- `src/lib/auth/config.ts`: `isPortalPreviewEnabled()`, `SESSION_COOKIE_NAME` and `ROBOTS_NOINDEX`.
- `src/lib/auth/paths.ts`: portal path helpers, `sanitizeNextPath` and `buildLoginHref`.
- `src/lib/auth/responses.ts`: the JSON envelope with `no-store` and `X-Robots-Tag`.

## Roles and session

```ts
type Role = "student" | "parent" | "admin";
type Session = { userId: string; role: Role; linkedStudentIds?: readonly string[] };
```

- A `Session` only ever comes from `getSession()`, which runs on the server only and verifies the provider's session. A role or user id is **never** taken from query strings, request headers, unsigned cookies, local storage or client state.
- `/login?role=student` only highlights a card on the login page. It plays no part in access.
- A malformed session (bad id, unknown role, non-array links) is treated as signed out.

### Record-level rules (`canAccessStudentRecord`)

| Role | May read learner `id` when |
|---|---|
| student | `id === session.userId` |
| parent | `id` is in `session.linkedStudentIds`. Missing or empty means none |
| admin | **Denied** until a staff permission model is agreed (for example centre-scoped access plus audit logging) |

Every check runs on every request. Parent-to-learner links must come from Aspire's server-side records after verification. Never accept them from the client.

## Preview mode

`PORTAL_PREVIEW=true|false`. Unset, or any other value, falls back to **on in `development` and off everywhere else**, so production denies by default. It is read at request time (proxy, page gate, `/login`), so changing it does not need a rebuild.

Preview only renders data-free shells. It **never** opens an API.

## Proxy (`src/proxy.ts`)

Matcher: `/student/:path*`, `/parent/:path*`, `/admin/:path*`, `/api/admin/:path*`, `/api/student/:path*`, `/api/parent/:path*`.

| Request | Preview on | Preview off |
|---|---|---|
| Portal page | continue | `307 → /login?next=<sanitised path>` (`no-store`) |
| Portal API | `401` JSON (`no-store`) | `401` JSON (`no-store`) |

- Every response carries `X-Robots-Tag: noindex, nofollow`. The `(portal)` layout also sets `metadata.robots = { index: false, follow: false }`, and `robots.ts` disallows these paths.
- **Session hint:** when a provider is integrated, a page or API request carrying the provider's session cookie (`SESSION_COOKIE_NAME`) is allowed through for the page or handler to verify. The cookie's presence grants nothing on its own. While `SESSION_COOKIE_NAME` is `null`, every request counts as signed out.
- **`next` sanitisation** (`sanitizeNextPath`): accepts only a same-site path under `/student`, `/parent` or `/admin`, and drops the query and hash. It rejects absolute URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`), backslashes, control characters, doubled slashes, over-long values and anything that normalises outside a portal. Use the same helper after a real sign-in before redirecting.

## Portal pages

- Route group `src/app/(portal)` is **not** under the `(site)` layout. `(portal)/layout.tsx` provides the skip link. `PortalShell` (used by each area layout) provides the top bar (logo, role badge and "Back to website"), the persistent banner ("Preview: no real accounts or records are connected"), the sidebar nav (`aria-current`, with a horizontal scroll strip below `md`) and `<main id="main">`.
- Areas are visually distinct: **student** has a blue accent, **parent** a green accent and **staff admin** a gold accent on a deeper navy sidebar. Each also has its own icon and role label (`src/components/portal/areas.ts`).
- Routes: `/student` (with `/timetable`, `/resources` and `/progress`), `/parent` (with `/updates` and `/progress`), and `/admin` (with `/enquiries`, `/content`, `/centres` and `/results`).
- **Cache Components:** the session is read at request time, so `getSession()` awaits `connection()`. That means every page wraps its content in `<PortalGate area path>`, a `<Suspense>` boundary whose fallback says "Checking access…". The shell chrome stays static and prerenders. Nothing inside the gate renders until access passes. Don't call `getSession()` at the top level of a layout or page.
- `<PortalGate>` accepts a function child, `(access) => …`, to branch on `access.kind` (`"session"` or `"preview"`). `/admin/enquiries` uses this so the DEMO table appears only in preview mode.

## APIs

| Endpoint | Guard | Today | With a valid session |
|---|---|---|---|
| `GET /api/admin/enquiries` | `requireRole("admin")` | 401 | 503 `not_configured` (no enquiry store) |
| `GET /api/student/me` | `requireRole("student")` | 401 | 503 `not_configured` |
| `GET /api/parent/students` | `requireRole("parent")` | 401 | 503 `not_configured`. Must list `linkedStudentIds` only |
| `GET /api/parent/students/:studentId` | `requireStudentRecord(id, "parent")` | 401 | 403 if not linked, 400 if the id is malformed, else 503 |
| `GET /api/session` | none | `{ ok: true, data: { authenticated: false } }` | `{ authenticated: true, role }`. Never ids or tokens |

All of these return the D-007 envelope (`src/lib/contracts/api.ts`) with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

## Integration point: connecting a real identity provider

Use an established provider or library (Aspire's existing SSO, or a managed auth service). **Do not build password handling, hashing or session crypto from scratch.**

1. **`src/lib/auth/session.ts` → `getSession()`.** Read the provider's session cookie with `cookies()` from `next/headers`, verify it server-side with the provider SDK (signature, expiry and revocation), look the user up in Aspire's records, and return `{ userId, role, linkedStudentIds }`. Run the result through `isValidSession()` and return `null` on any failure. You can wrap it in `'use cache: private'` per the Next guide `02-guides/authentication-with-cache-components.md`. Keep the call under `<Suspense>`.
2. **`src/lib/auth/config.ts` → `SESSION_COOKIE_NAME`.** Set it to the provider's cookie name so the proxy can let probable sessions through. It remains a hint only.
3. **`/login`.** Replace the explanatory page with the provider's sign-in flow (a redirect to the hosted login, or the provider's component). After sign-in, redirect to `sanitizeNextPath(next) ?? PORTAL_HOME[role]`. Add sign-out (clear the session server-side) and `/forgot-password` only if the provider supplies it.
4. **Roles and links.** Map provider identities to `student`, `parent` or `admin` from server-side records. Store parent-to-learner links server-side, created only after Aspire verifies them.
5. **Data.** Build a data access layer that resolves the session itself (never trusts an id from the caller) and calls the guards before any query. Replace each `NotConnected` empty state with real components under their own `<Suspense>`. Replace the 503s in the route handlers.
6. **Admin.** Define staff permissions, which may be centre-scoped. Add audit logging for every change. Add CSRF/origin checks and rate limits on mutations. Then reconsider `canAccessStudentRecord` for `admin`.
7. **Remove the preview scaffolding.** Set `PORTAL_PREVIEW=false` in production, delete the DEMO table, and drop the preview banner and badges once real data flows.
8. **Tests.** Extend `src/lib/auth/*.test.ts` and `src/proxy.test.ts` with unauthenticated, wrong-role and wrong-record cases against the real adapter, using synthetic records only.

## Verification

```
npx vitest run src/proxy.test.ts src/lib/auth
npx tsc --noEmit
npx eslint src/proxy.ts src/lib/auth "src/app/(portal)" "src/app/(site)/login" src/components/portal src/app/api/admin src/app/api/student src/app/api/parent src/app/api/session
```
