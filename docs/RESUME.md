# Paused work — how to resume (2026-10-20, paused for a system restart)

Last commit: `fef165f` (M5 snapshot). Everything after it is **uncommitted in the working tree** (M6 tools, portal data, carousels, spacing, MCP). Live site still runs release `wt10201151-demo`.

## Done (uncommitted)
- M6 tools: predictor, mock tests, Ask Aspire (needs `ANTHROPIC_API_KEY`), study planner — `/tools/*`, `/tools` hub, nav links (Resources ▸ Student tools), sitemap.
- Content verification of all sample questions/flashcards (`docs/m6-content-verification.md`).
- Portal integration: real tool data in student/parent portals.
- Privacy text for tools + portal accounts (messages in `legal.ts`; the **tools section still has to be rendered** on `src/app/[lang]/(site)/privacy/page.tsx`).
- Shared spacing loosened in `src/components/ui/**` (sections, gutters, headings, splits, hero).
- aspire2 visual audit (`docs/aspire2-visual-audit.md`).

## In progress when paused (resume these)
| Work | State |
|---|---|
| QA-SEC-M6 (security + QA of the 4 tools, + predictor sample-wording fix) | midway: browser flows |
| MCP-CORE (`/api/mcp`, tokens, tools, `docs/mcp.md`) | code written; running final tsc/eslint/tests |
| MCP-ADMIN (`/admin/mcp` token page + `/api/admin/mcp-tokens`) | fixing a test assertion |
| SPACING-A (declutter home/programs/results/centres) | in progress |
| Workflow `carousels-round-1` (run `wf_9f5e78a3-94a`) | shared ImageCarousel built; page groups converting |
| Workflow `tablet-responsive-audit` (run `wf_18a83469-ea1`) | auditing (lean screenshot policy) |

## Next after those
1. Carousel round 2 (home 2–3 carousels; programs, results, centres, `/tools/*` heroes) + tablet fixes from the audit + spacing pass on the remaining pages.
2. Render the privacy "Student tools" section; admin nav link to `/admin/mcp`; raise scrypt-heavy auth test timeouts.
3. Full `tsc` / `eslint` / `vitest`, `next build`, production smoke, commit, deploy to aspire.thechunkmedia.com (VPS disk ~2.9 GB free — remove the old `aspire-web:07a731b-demo` image first; nginx `proxy_buffering off` for `/api/ask` and `/api/mcp`).
4. Waiting on the owner: go-ahead for the CRM / lead-generation & admission engine (Phase 1 plan given in chat); for Ask Aspire either a workspace-scoped key (`sk-ant-api03-…`) or the workspace id (`wrkspc_…`) — the supplied account-level key is in git-ignored `.env.local` and needs `ANTHROPIC_WORKSPACE_ID`. At deploy, copy both into `/opt/aspire-web/.env` (never into git) and set an Anthropic spend limit.

## Resumed 2026-10-20 after the restart
Wave 1 (running): MCP-CORE, MCP-ADMIN, QA-SEC-M6. Wave 2 (start when wave 1 finishes — RAM is tight): SPACING-A, workflows `carousels-round-1` (`wf_9f5e78a3-94a`) and `tablet-responsive-audit` (`wf_18a83469-ea1`).

## Machine notes
Free disk on C: before starting agents; keep RAM headroom (close unused Chrome). Start the dev server with `NODE_OPTIONS=--max-old-space-size=4096 npm run dev`.
