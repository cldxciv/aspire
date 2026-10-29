# Aspire platform: progress and handoff (as of 30 Oct 2026, 03:30 IST)

This file is for the next agent working on this project. It replaces `docs/RESUME.md`, `docs/START_HERE_PROMPT.md` and `docs/AGENT_WORKFLOW.md`, which are older. Read sections 1–4 before touching anything; section 6 tells you exactly where to resume.

The raw chat history is the Claude Code transcript `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53.jsonl` (very large; search it, don't read it whole). Section 12 is a condensed timeline.

---

## 1. The project in brief

- **Client:** Aspire IIT & Medical, a JEE / NEET / Foundation coaching institute in Himachal Pradesh. Four centres: Shimla (HQ), Dharamshala, Kullu, Hamirpur. Students come from Himachal's 12 districts; many are under 18, and parents decide and pay.
- **What we build:** a bilingual (English / Hindi) website plus a lead and admissions engine: CRM, automatic routing, a 1-hour first-call rule, Meta Lead Ads integration, free student tools, the Rancho AI doubt solver, a question bank with generated mock tests, and an admin console. The owner's framing: "that's just a website and this is a complete lead management engine".
- **Live:** https://aspire.thechunkmedia.com, **release 5a2d7cb** (Release 1), in **demo mode** (sample data visible with DEMO labels; robots `Disallow: /` and `noindex` everywhere). The future production domain is aspireiit.in, which is currently the client's old WordPress site and still ranks on Google.
- **Stack:** Next.js 16 (Cache Components; read `AGENTS.md` and `node_modules/next/dist/docs` before writing pages or route handlers), Tailwind 4, TypeScript, `node:sqlite`, Anthropic SDK (Rancho), en/hi message namespaces with parity tests, vitest (about 3,600 tests).

## 2. Where things are

| What | Where |
|---|---|
| Main checkout (branch `main`) | `C:\Users\ADMIN\aspire-2\aspire-web` |
| SEO worktree (branch `feature/seo-golive`) | `C:\Users\ADMIN\aspire-2\aspire-web-seo` (`node_modules` is a junction to the main checkout's; never `npm install` there) |
| Asha worktree (branch `feature/asha`) | `C:\Users\ADMIN\aspire-2\aspire-web-asha` (same junction rule) |
| Handoff folder (survives temp-folder wipes) | `C:\Users\ADMIN\aspire-2\handoff\`: `deploy-release.sh`, `agent-board/` (local progress page, `node server.mjs` → http://localhost:3999), `reports/` (every finished builder / verifier / fixer report for Phase 1b, SEO and Asha) |
| Workflow scripts from this session | `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\workflows\scripts\` |
| Workflow journals (agent results) | `...\b14df18b-965d-49a0-b7d8-e2fc393bfa53\subagents\workflows\<run id>\journal.jsonl` |
| Persistent memory | `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\memory\` (MEMORY.md index) |
| GitHub | private repo `cldxciv/aspire`; `main` = 5a2d7cb; tag `release-2026-10-22.1`; branch `release/2026-10-22-r1` |
| VPS | `root@69.62.76.109`, key `~/.ssh/aspire_deploy`; app in `/opt/aspire-web` (Docker compose, `127.0.0.1:3011`, nginx proxies; root-only `.env`, chmod 600) |
| Live admin login | login id **aspire.admin** (auto-granted super admin). The owner holds the password; to reset, the owner runs `docker compose exec app npm run auth:super-admin -- reset-password aspire.admin` in their own terminal. Never handle it in chat. |
| Local dev accounts | `aspire-web\.data\dev-credentials.txt` (local only; never print or commit) |
| Aspire MCP server | `https://aspire.thechunkmedia.com/api/mcp` (bearer tokens created at `/admin/mcp`, scoped per service; CRM is explicit-only) |
| Claude Console (Managed Agents) | workspace **Aspire**. Agent `aspire-ops` = `agent_01SwmZ144epAkMutn46UGrqq` (Claude Haiku 5.5), environment `env_01B8KhAHbPFYpiyexB7bwwaP`, vault `vlt_011CgG9eWeaQbgQdU8JvYY28` (holds a read-only MCP token), deployments daily 08:30 IST `depl_019uQCuZ1UEv61rcgUuRcQby` and weekly Mon 09:00 IST `depl_01NVw7az1iWcs2435xJmwDxv`. Definitions: `aspire-web\agents\aspire-ops\` (sync with `ant apply`; `ant` 1.44 is at `~\.local\bin\ant.exe`; `claude-lock.json` holds the IDs). |
| Client-facing artifacts (private until the owner shares) | client deck https://claude.ai/artifact/3kRWGQxhZPiwdsrYW9JyDm (16 slides, Slides type, downloadable as .pptx/PDF); platform doc https://claude.ai/artifact/RBqYerE7edDnVESBoazCCM; hero design canvas https://claude.ai/artifact/MEzJFNUxa92drA3HPhxz3n |

Permission allow rules already exist in `C:\Users\ADMIN\aspire-2\.claude\settings.local.json` for `git push`, `git -c core.autocrlf=false archive` and `ssh -i ~/.ssh/aspire_deploy root@69.62.76.109 …` (the owner chose this).

## 3. Rules you must follow

**Owner preferences**
- No Zapier / Make, ever. Build integrations natively. Integration and routing settings are super-admin only.
- Never invent facts, numbers, results, dates, fees or quotes. Unverified data is omitted or shown as DEMO; placeholders like "[N]" never reach the live site.
- English and natural Hindi for every UI string (en/hi parity tests). WCAG 2.2 AA, 44 px targets, tablet (768 px) matters.
- Deploy only after the full gate: tsc, full vitest, eslint, a production `next build`, a browser smoke, a DB backup, a ready rollback. The owner said "deploy with best decision" while away, which covers deploying finished, verified work and removing the oldest rollback image when disk requires it (report it afterwards). Otherwise ask before deleting Docker images.
- Off-server backups are deferred ("leave the backup for now"); don't raise them again until the owner does.
- `docs/agent-decisions.md` was originally the owner's log. Agents have since added D-044–D-058, D-084 and reserved ranges (D-059–D-068 Asha, D-070–D-077 Phase 2, D-078–D-083 Phase 1b). The owner was asked whether that's OK and has not answered; keep additions minimal.

**Security**
- Never print, paste or commit secrets. Keys live only in git-ignored `.env.local` and the server's `/opt/aspire-web/.env`. Never ask the owner to paste tokens into chat; they enter them in the super-admin Integrations page, the Console vault, or a hidden prompt (e.g. `agents/aspire-ops/add-token.ps1`).
- **Open security items for the owner:** (1) the Anthropic API key in `aspire-web\.env.local` was exposed in chat on 23 Oct through an editor selection: rotate it (new key → `.env.local`, and the server `.env` if it is the same key → delete the old one); (2) MCP tokens were pasted in chat twice (`asp_mcp_6Sd…` earlier, `asp_mcp_c3k…` on 22 Oct): confirm both are revoked at `/admin/mcp`; (3) earlier advice still stands: change the VPS root password, revoke the old `sk-ant-usr` key, set an Anthropic spend limit.

**The owner's PC (crashes under load)**
- 15.4 GB RAM, often under 2 GB free: VS Code ~4 GB, Chrome 3–5 GB, Docker Desktop + WSL ~2.3 GB (not needed for this work; ask the owner to quit it). Run at most ~3 workflows at once. Builders run only their own vitest files with `--maxWorkers=1`; only integrators run tsc / full suite / dev server / one headless Chrome, and they wait until no other tsc / vitest / next build runs.
- The 9 user-scope **Hostinger MCP servers** reload in every Claude tab and use 1–2 GB. The owner chose to disable them for this project, but the project-level disable doesn't hold; kill their node processes when memory is low (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'hostinger' | % { Stop-Process -Id $_.ProcessId -Force }`). Don't use Hostinger MCP tools.
- The Windows temp scratchpad was wiped once: keep anything important in `C:\Users\ADMIN\aspire-2\handoff\`.

**Multi-agent workflows (lessons learned)**
- Workflow subagents see the owner's latest chat message. On 22 Oct, lead-routing builders saw a side question ("how can i free my memory") and built nothing. Every workflow prompt must start with an **AUTHORIZATION** block quoting the owner's actual request for that work and saying other relayed messages don't cancel it. After a run, scan results for "not started / BLOCKED / wrote no files".
- Builds stopped twice for outside reasons: a network outage (`ENOTFOUND`) and the **weekly usage limit** (hit 22 Oct, reset 25 Oct 08:30 IST). `resumeFromRunId` only works in the same session; after a restart, write a continuation script that skips finished packages and points agents at the saved reports in `handoff\reports\`.
- The owner asked why Fable wasn't used. The chat model is whatever the owner picks with `/model`; the last restarted builds set `model: 'fable'` on agents because the owner said they had Fable allowance left.
- Commits: there is no global git identity on this PC. Use the repository's existing author: `git -c user.name="attri.anshuman" -c user.email="attri.anshuman@gmail.com" commit …`, and end messages with the Co-Authored-By line the harness specifies. (The Claude account email has since changed to info.aspireehub09@gmail.com; ask the owner before changing the commit identity.)

## 4. Current state at a glance

| Item | State |
|---|---|
| **Release 1 (5a2d7cb)** | **Live** since 22 Oct ~10:40 IST, healthy |
| **Phase 1b → Release 2** | All 6 packages built, verified, fixed in the main checkout (102 uncommitted files). **Final integration check never completed** (run `wf_11c8b664-4e5` died when the session ended). |
| **SEO go-live pack → Release 4** | All 7 packages built, verified, fixed in the SEO worktree (65 uncommitted). **Integration not done.** Ships switched off. |
| **Asha → Release 5** | AA-0 foundations done (36 uncommitted in the Asha worktree). AA-WA and AA-CALL were mid-build when the session ended; their partial edits may be in the worktree. Remaining: AA-WA, AA-CALL, AA-CONSENT, AA-AGENT, AA-INT1, AA-PAY, AA-DASH, AA-INT2, integrate. Ships dark. |
| **Phase 2 → Release 3** | Designed (`docs/admin-phase-2-plan.md`, 7 packages); build starts after Release 2 is committed (its core package stops unless lead routing, the question bank and Phase 1b are integrated). Add the Rancho answer review (section 8) to this release. |
| **Aspire Ops** | Running in the Console: daily and weekly reports (≈2 cents each). Reports say "0 leads" while the live CRM is empty. |

## 5. What is live in Release 1

**Website (en / hi):** every public page; homepage with hero enquiry form, stats, programs, results showcase, free-tools section (4 tool tiles: predictor, mock tests, Rancho, planner), why Aspire, campus life, testimonials, impact chart, resources, centres, CTA; carousels advance every 5 s with no hover pause and a Pause that sticks. **Inner-page heroes** (`src/components/hero/**`): About / Admissions "proof up front", Programs Himalayan editorial + program picker, program pages with their own facts, Results ribbon (5 s, pause, year pills), Centres / Contact centre finder (12 districts → nearest of 4 centres; Contact has call / WhatsApp), Hostels / Resources / Tools Himalayan frame, quiet hero on legal and login pages. **Page-layout editor** (`/admin/page-layout`, super admin): move / show / hide sections on the homepage and 9 inner pages, draft, preview, publish, reset, history; hero first, CTA last, homepage tools never last.

**Student tools:** rank predictor; mock tests (weekly sample tests + exam-pattern papers generated fresh per attempt for JEE Main, NEET, JEE Advanced, BOH placeholder; timed runner with server-authoritative end, result page, monthly ranked paper + leaderboard; exam pages show "coming soon" until an admin publishes the pattern blueprint); study planner with exam countdown and offline service worker; **Rancho** AI doubt solver (text, photo, voice in / out; uses predictor, mock tests, planner as tools with cards; prompt version in `src/lib/ask/prompt.ts`; persona: a snow leopard with round glasses and a brown Aspire vest); **Rancho app** PWA at `/rancho` with sign-in and an install prompt for mobile visitors. **Contact form (lead gate)** before every tool result: `LEAD_GATE=required`, once per browser for 180 days, honest sample-data note; staff and admins also see it; signed-in students / parents skip only if their account has a mobile number (no account has one yet); `/api/ask`, `/api/mocktest/score` and `/api/mocktest/attempts` enforce it.

**CRM / lead engine:** every enquiry becomes one lead per family (E.164 phone dedupe, consent records): website forms, tools, Rancho, walk-ins, phone, Meta Lead Ads webhook, Meta Leads Center CSV import (with Excel-damage detection). Inbox, Today's calls, pipeline, tasks, reports, CSV export, add / edit / erase. Super admin role; 12 Himachal districts as areas with area heads and executives; routing area → centre → next executive in turn; Unassigned and Tool sign-ups queues; 1-hour first-call rule with calling hours and escalation (area head at 1 h, super admin at 4 working hours); dashboards; Integrations → Meta page (tokens encrypted with `INTEGRATIONS_SECRET`). Plan and Meta setup guide: `docs/lead-routing-plan.md` (Part 2).

**Admin console:** overview, users and staff, readable activity log, MCP tokens, website status, question bank (`/admin/questions`: questions, review queue, imports — AI import off via `QB_IMPORT_ENABLED=0` — exam patterns / blueprints, syllabus, coverage, team), page layout, CRM settings.

**AI and ops:** Rancho, the MCP server, the Aspire Ops Console agent, Docker release flow with pre-deploy DB snapshot and rollback image, GitHub tags.

## 6. Resume here (in this order)

### 6a. Release 2 = Phase 1b (main checkout)
1. Run the integration check (one agent, AUTHORIZATION block; the script `admin-phase-1b-integrate-wf_11c8b664-4e5.js` in the workflow scripts folder has the full prompt): `npx next typegen`; `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit`; `npx vitest run --maxWorkers=2`; eslint on files changed since 5a2d7cb; apply the FAMILY fixer's `format.ts` patch (BackKind `"lead"` + `parseBackParam`, see `handoff\reports\p1b-prior\fix_1B-FAMILY.md`); record the planned deviations (409 + `bad_request` for version conflicts; O11: duplicates already lost as duplicates leave the duplicate list) in D-078..D-083; browser smoke per `docs/admin-phase-1b-plan.md` 1B-INTEGRATE.
2. Pre-deploy gate like Release 1: production build `SHOW_PLACEHOLDER_CONTENT=true NODE_OPTIONS=--max-old-space-size=4096 ANTHROPIC_API_KEY=" " npx next build`, `next start -p 3100`, browser smoke of changed areas plus a regression pass of Release 1 areas (the Release 1 check script is `release-1-check-wf_a577cd9e-562.js`).
3. Commit on `main` (or a `release/…` branch, fast-forward main), tag `release-2026-…`, push, then deploy with `C:\Users\ADMIN\aspire-2\handoff\deploy-release.sh <sha>` (Git Bash). After deploy: health checks (script does them), check new DB tables, read the 1b plan's owner steps (targets, WhatsApp template approval, Google Maps links per centre).

### 6b. Release 3 = Phase 2 (main checkout, after Release 2 is committed)
- Build from `docs/admin-phase-2-plan.md` (PACKAGES json at the end: P2-CORE → P2-TEST + P2-VISITS-DESK → P2-PUBLIC + P2-FACTS-PRIVACY → P2-GROWTH + P2-FAMILY → integrate). No QR dependency (in-house encoder). Front-desk role is deny-by-default.
- Add **Rancho answer review** (approved 22 Oct, changes D-035): opt-in "help improve Rancho" tick; strip names (incl. the student's own), phones, emails, addresses, roll numbers / IDs, school and coaching names before saving; never store photos (note "[photo]"); keep exam, subject, date, helpful flag and Rancho's answer; no account / phone / IP / lead link; delete after 30 days; super admins only; "Rancho answers" screen with good / wrong marking; privacy notice en / hi; recommend counsel review.

### 6c. Release 4 = SEO go-live pack (SEO worktree)
- Run the SEO-INTEGRATE step in the worktree (prompt in `seo-golive-pack-finish-wf_394caf39-57a.js`; dev server port 3001). Then merge `feature/seo-golive` into `main` after Release 2 (expect conflicts in shared files: `src/lib/db/features/index.ts`, `src/proxy.ts`, nav `src/components/portal/areas.ts`, `src/i18n/messages/{index,types}.ts`, portal messages, audit labels); run the full gate again on `main`; deploy. Everything stays OFF while demo mode is on; the go-live switch refuses to turn on until the site is on aspireiit.in and out of demo mode.
- Key content: 108 suggested 301 forwards from the old aspireiit.in sitemaps; centre pages `/centres/<slug>`; verified-facts sheet (only verified facts reach JSON-LD / llms.txt); share images (`/og`); title / description editor; AI-crawler policy (decision 22: allow answer and training crawlers on public pages); llms.txt; crawler visit counts without IPs. Plan: `docs/seo-golive-plan.md` (in the worktree; also copied to main's docs earlier).

### 6d. Release 5 = Asha (Asha worktree)
- Continue packages per `docs/admissions-agent-plan.md` package table (rev 2.1): AA-WA + AA-CALL (check the worktree for partial edits first), AA-CONSENT + AA-AGENT, AA-INT1, AA-PAY + AA-DASH, AA-INT2, integrate (dev port 3002). Continuation script: `asha-build-continue-wf_48e66ec0-bde.js`. Everything behind super-admin switches that default OFF; fakes only; no real WhatsApp / Exotel / Razorpay / Anthropic calls in tests.
- Merge `feature/asha` after Release 3 (shared CRM files: `LeadDetailView.tsx`, inbox, settings hub, consent texts, messages). Deploy dark.
- The WhatsApp Cloud API plan for lead handling (stage 1 Meta setup by the owner; stage 2 instant acknowledgement, CRM inbox, chats become leads, STOP and caps — this is AA-WA; stage 3 Asha replies; stage 4 Razorpay token links) is on slides 12–13 of the client deck. A WhatsApp Business connector ("WAPI") was connected in claude.ai on 28 Oct; if the owner wants the Meta-side setup done through it, list businesses first and confirm each outward step.

## 7. Release procedure (what worked)

1. `git status` must show only intended files; never commit `.env*`, `.data/`, `private/`, scratch, screenshots, logs.
2. Commit with the repo identity (section 3), tag, `git push origin main <branch> <tag>`.
3. `bash C:/Users/ADMIN/aspire-2/handoff/deploy-release.sh <sha>`: git archive → sha256-checked upload → `VACUUM INTO` snapshot to `/opt/aspire-web/backups/backup-pre-<sha>.sqlite` → extract to `release/` → `docker compose build` with a watchdog that kills the build under 300 MB free and restores `RELEASE` → `up -d` → health checks on 10 pages plus `thechunkmedia.com` and `aspire2.thechunkmedia.com`.
4. **Disk** is the bottleneck (50 GB, ~95% used; a build peaks ~2.6 GB). Before building: `docker builder prune -af` (freed 2.4 GB last time). Keep only the current and one rollback image: now `aspire-web:5a2d7cb-demo` (live), `aspire-web:3394b3d-demo` (rollback), plus the old `aspire-web:demo`; 806a938 was removed 22 Oct.
5. Server `.env` (never print values): `RELEASE`, `SHOW_PLACEHOLDER_CONTENT=true`, `LEAD_GATE=required`, `LEAD_GATE_SECRET`, `LEAD_GATE_SINCE`, `INTEGRATIONS_SECRET` (server-generated 22 Oct), `QB_IMPORT_ENABLED=0`, plus earlier keys. Backup copies: `.env.bak-pre-leadgate`, `.env.bak-pre-r1`. Data folders `data/qb-figures`, `data/qb-imports` exist. Migrations run lazily on first DB open; after deploy check `docker compose exec -T app npm run -s auth:super-admin -- list`.
6. Rollback: set `RELEASE=3394b3d-demo` in `.env`, `docker compose up -d`, restore the pre-deploy DB snapshot if a migration misbehaved (see `deploy/README.md`).

## 8. Owner decisions (binding; quotes are verbatim)

- **Lead gate:** "every tool should be a data collection point before showing the result" → required, once per browser (180 days), staff and admins see it too, students / parents skip only with a mobile on their account; homepage countdown gated.
- **Lead routing:** replace "CMO → area heads → executives" forwarding. "for the areas we can assign the areas based on the roles for area heads and the executives. should be a super admin functionality… calling hours… for now it should be 1 hour", "for now there are 12 districts in himachal", "no zapier please", Meta Lead Ads live into the CRM ("meta ads leads should directly go into crm").
- **Question bank:** past 10 years of official papers + Aspire's bank; easy / medium / hard; a fresh random paper per attempt in the real pattern; exams JEE Main, NEET UG, JEE Advanced, Aspire BOH (pattern still needed).
- **Admin console plan:** all 23 defaults approved (`docs/admin-console-plan.md`); next phases 1b and 2; editors are Phase 3; SEO is Phase 4 timed with go-live (domain default aspireiit.in; decision 22: AI crawlers allowed on public pages).
- **Page layout:** "we should be able to set the section's position up or down" for homepage and inner pages.
- **Rancho:** snow-leopard mascot from Aspire's Instagram reels; photo option only in the floating chat; voice; integrated with all tools; Rancho is the PWA with sign-in; chats are not stored (D-035) except the approved opt-in anonymised review (section 6b).
- **Aspire Ops:** cheapest model that gives correct results → Claude Haiku 5.5, tested against live data.
- **Asha (admissions agent):** separate from Rancho; female persona "Asha", feminine Hindi / Hinglish forms, introduces herself as "Main Asha hoon, Aspire ki AI admission counsellor" and always discloses she is an AI; acts as a counsellor and handles parents ("the new agent should act as a couseller and also handle the parents accordingly"); runs the whole journey like a human executive including token collection ("asha can handle the complete process as a human exec, to completely collect the token amount also"); "conversate like the other person" = mirror language, script, length, formality; ethical persuasion only (no dark patterns, CCPA 2023, coaching rules 2024); Hinglish first message by default; max 3 follow-ups over 7 days, 09:00–20:00; token adjusted against fees and refundable within N days (fee table required before any link); fully automatic payments with rails (fee-table amounts only, parents / guardians only, refunds by a person, super-admin approval switch available); WhatsApp number to be decided later (default new SIM); providers Exotel (calls) and Razorpay (payments); AI voice calls out of scope. Orchestrator decisions pending counsel: under-18 counselling only with a parent's confirmation (path built, switch locked); adult students don't get the payment card from Asha; forward-only automatic CRM stage moves on verified events (Q-A9). All in `docs/admissions-agent-plan.md` (OD1–OD7), `docs/admissions-agent-voice.md`, `docs/admissions-agent-counselling.md`.
- **Development stays on the owner's PC** ("lets keep local"); don't propose the VPS or cloud for builds.

## 9. Waiting on the owner

Area heads and executives per centre; calling hours; Meta app for Lead Ads (guide in `docs/lead-routing-plan.md` Part 2); verified centre facts (address with PIN, phone, hours, map link); fee and token table with refund days; results with written consent; past question papers + final answer keys, Aspire's question files, the BOH pattern, staff roles for the question bank; final domain and go-live date; Google Business Profile access; WhatsApp Business verification + new SIM; Razorpay and Exotel accounts; a lawyer's view on consent wording, token terms, under-16 Foundation enrolment (MoE 2024 coaching guidelines) and Rancho answer review; two named safety contacts; Rancho official artwork; security items in section 3. In the question bank: confirm syllabus lists and publish the JEE Main pattern, otherwise exam mocks show "coming soon".

## 10. Docs index

Authoritative plans: `docs/lead-routing-plan.md`, `docs/question-bank-plan.md`, `docs/page-layout-plan.md`, `docs/admin-console-plan.md`, `docs/admin-phase-1b-plan.md`, `docs/admin-phase-2-plan.md`, `docs/seo-golive-plan.md`, `docs/admissions-agent-plan.md` (+ `-voice.md`, `-counselling.md`), `docs/lead-gate-plan.md`, `deploy/README.md`, `docs/api.md`, `docs/crm.md`, `docs/hindi-review-register.md` (machine-drafted Hindi awaiting native review), `docs/aspire-approval-checklist.md`, `docs/content-verification.md`.

## 11. Usage note

Since 22 Oct the build agents used roughly 48 million tokens (sum of the workflows' reported subagent tokens; most of it cached input), plus this chat's own tokens and the three runs that stopped on 28–29 Oct. The owner can see plan usage with `/usage` in Claude Code or in claude.ai settings.

## 12. Timeline (condensed)

- **≤ 20 Oct:** site built through milestones M1–M7 (homepage, inner pages, tools, Rancho, CRM basics, MCP server); deployed to the VPS in Docker; GitHub repo made private.
- **20–21 Oct:** homepage free-tools widget; Rancho naming, voice, photo in floating chat, tool integration; Rancho PWA with install prompt for all mobile visitors; admin console 1a; lead gate built and switched on; releases 806a938 then 3394b3d deployed.
- **21–22 Oct (night):** owner asked for multi-agent builds and went AFK with "complete and deploy it with best decision… start next 2 phases too and completely deploy them too". Built: lead-gate rule change, carousel fix, inner-page heroes, homepage tools redesign, page-layout editor, question bank + student screens, lead routing + Meta (rebuilt after the relayed-message failure). Aspire Ops created in the Console (tested on Haiku 5.5: correct, ~2¢/run). Asha designed (voice, counselling, plan). **Release 1 (5a2d7cb) deployed ~10:40 IST 22 Oct.** Phase 1b and SEO pack designed and building.
- **22 Oct afternoon:** network outage killed both builds; restarted. Owner asked for more parallelism → Asha build started in its own worktree. Owner approved Rancho answer review.
- **22 Oct evening:** weekly usage limit hit; all builds stopped.
- **28 Oct:** owner asked for verify-and-deploy, Fable, the features list and a WhatsApp API plan; builds restarted on Fable; client deck created (https://claude.ai/artifact/3kRWGQxhZPiwdsrYW9JyDm). The temp scratchpad had been wiped; deploy script and progress page recreated.
- **29–30 Oct:** the session ended while the three restarted builds were running (state in section 4). This file and `C:\Users\ADMIN\aspire-2\handoff\` were written on 30 Oct.
