# Aspire platform: full progress and handoff (updated 30 Oct 2026)

For the next agent. This file covers everything: the live site, the main checkout (`aspire-web`), the SEO worktree (`aspire-web-seo`), the Asha worktree (`aspire-web-asha`), the Console agent, servers, decisions and what to do next. It replaces `docs/RESUME.md`, `docs/START_HERE_PROMPT.md` and `docs/AGENT_WORKFLOW.md` (older).

Raw chat history: `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53.jsonl` (very large; search it). Every finished agent report from the recent builds is saved in `C:\Users\ADMIN\aspire-2\handoff\reports\` (see §2).

---

## 1. The project

- **Client:** Aspire IIT & Medical, JEE / NEET / Foundation coaching in Himachal Pradesh. Centres: Shimla (HQ), Dharamshala, Kullu, Hamirpur. Students from Himachal's 12 districts; many are under 18; parents decide and pay.
- **Product:** a bilingual (English / Hindi) website plus a complete lead and admissions engine. The owner: "that's just a website and this is a complete lead management engine".
- **Live:** https://aspire.thechunkmedia.com in **demo mode** (sample data with DEMO labels; robots `Disallow: /`, `noindex`). Production domain later: aspireiit.in (today the client's old WordPress site, which still ranks on Google).
- **Stack:** Next.js 16 (Cache Components; read `AGENTS.md` and `node_modules/next/dist/docs` before writing pages, route handlers, metadata or the proxy), Tailwind 4, TypeScript, `node:sqlite` (no external DB), Anthropic SDK (Rancho), en/hi namespaces with parity tests, vitest (~3,600+ tests).

## 2. Where things are

| What | Where |
|---|---|
| Main checkout, branch `main` | `C:\Users\ADMIN\aspire-2\aspire-web` |
| SEO worktree, branch `feature/seo-golive` | `C:\Users\ADMIN\aspire-2\aspire-web-seo` (based on 5a2d7cb; `node_modules` is a junction to the main checkout's: never `npm install` there) |
| Asha worktree, branch `feature/asha` | `C:\Users\ADMIN\aspire-2\aspire-web-asha` (based on 5a2d7cb; same junction rule) |
| Handoff folder | `C:\Users\ADMIN\aspire-2\handoff\`: `deploy-release.sh`, `agent-board\` (local progress page: `node server.mjs` → http://localhost:3999, edit `runs.json`), `reports\` (all builder / verifier / fixer reports), `r2-deploy.log` |
| Workflow scripts | `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\workflows\scripts\` |
| Workflow journals | `...\b14df18b-965d-49a0-b7d8-e2fc393bfa53\subagents\workflows\<run id>\journal.jsonl` |
| Memory | `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\memory\` |
| GitHub | private `cldxciv/aspire`. `main` = **d1b9997** (Release 2), tags `release-2026-10-22.1` (5a2d7cb) and `release-2026-10-30.1` (d1b9997). Subproject branches `feature/seo-golive` and `feature/asha` are on GitHub with their own `progress.md` (only that file is committed; their code is still uncommitted in the local worktrees) |
| Progress files | this file (on `main`) covers the whole project; each subproject branch has its own `progress.md` at its root with that package's detail. Keep them in step: update the branch file while working on a branch, and this file's §6 / §8 summary when a subproject's status changes |
| VPS | `root@69.62.76.109`, key `~/.ssh/aspire_deploy`; `/opt/aspire-web` (Docker compose, app on `127.0.0.1:3011`, nginx in front; root-only `.env`, chmod 600). Shared with thechunkmedia.com, aspire2.thechunkmedia.com, heimat-web: check they still answer after every deploy |
| Live admin | login id **aspire.admin** (super admin). The owner holds the password; resets happen in the owner's own terminal: `docker compose exec app npm run auth:super-admin -- reset-password aspire.admin` |
| Local dev accounts | `aspire-web\.data\dev-credentials.txt` (never print or commit) |
| MCP server | `https://aspire.thechunkmedia.com/api/mcp` (tokens at `/admin/mcp`, scoped per service; CRM explicit-only) |
| Claude Console | workspace **Aspire**: agent `aspire-ops` `agent_01SwmZ144epAkMutn46UGrqq` (Claude Haiku 5.5, read-only), env `env_01B8KhAHbPFYpiyexB7bwwaP`, vault `vlt_011CgG9eWeaQbgQdU8JvYY28` (read-only MCP token), deployments daily 08:30 IST `depl_019uQCuZ1UEv61rcgUuRcQby`, weekly Mon 09:00 IST `depl_01NVw7az1iWcs2435xJmwDxv`. Files: `aspire-web\agents\aspire-ops\` (sync with `ant apply`; `ant` 1.44 at `~\.local\bin\ant.exe`; IDs in `claude-lock.json`) |
| Artifacts (private until the owner shares) | client deck (16 slides, .pptx/PDF download) https://claude.ai/artifact/3kRWGQxhZPiwdsrYW9JyDm; platform doc https://claude.ai/artifact/RBqYerE7edDnVESBoazCCM; hero canvas https://claude.ai/artifact/MEzJFNUxa92drA3HPhxz3n |

Allow rules exist in `C:\Users\ADMIN\aspire-2\.claude\settings.local.json` for `git push`, `git -c core.autocrlf=false archive` and `ssh -i ~/.ssh/aspire_deploy root@69.62.76.109 …`.

## 3. Rules

**Owner preferences**
- No Zapier / Make; integrations native; integration and routing settings super-admin only.
- Never invent facts, numbers, results, dates, fees or quotes; unverified → omitted or DEMO.
- English + natural Hindi for every UI string; WCAG 2.2 AA; 44 px targets; tablet (768 px) matters.
- Release gate: tsc, full vitest, eslint, production `next build`, browser smoke, DB snapshot, rollback image. Release 2 was deployed on the owner's explicit "deploy now" with only the server build as the type gate (§4); finish its integration check next.
- "Deploy with best decision" (owner, AFK) covers removing the oldest rollback image when the disk needs it; report it afterwards. Otherwise ask before deleting images.
- Off-server backups deferred ("leave the backup for now"); don't raise them until asked.
- Development stays on the owner's PC ("lets keep local").
- `docs/agent-decisions.md` was the owner's log; agents have added D-044–D-058 and D-084, and plans reserve D-059–D-068 (Asha), D-070–D-077 (Phase 2), D-078–D-083 (Phase 1b). The owner hasn't answered whether that's OK; keep additions minimal.

**Security**
- Never print, paste or commit secrets; never ask the owner to paste tokens in chat (use the Integrations page, the Console vault, or a hidden prompt like `agents/aspire-ops/add-token.ps1`).
- Open items for the owner: rotate the Anthropic API key in `aspire-web\.env.local` (exposed in chat on 23 Oct through an editor selection) and on the server if it is the same key; confirm the two MCP tokens pasted in chat (23 Oct) are revoked at `/admin/mcp`; change the VPS root password; revoke the old `sk-ant-usr` key; set an Anthropic spend limit.

**The owner's PC**
- 15.4 GB RAM, often < 2 GB free. Other heavy apps open at times: Chrome 2–5 GB, VS Code 1.5–4 GB, Java / Gradle ~1.8 GB and Dart / Flutter ~1.2 GB (the owner's other project `sel_app`), Docker Desktop + WSL ~0.8–2.3 GB. tsc needs ~3 GB and `next build` ~4 GB: check free memory first and ask the owner to close apps if needed.
- The 9 user-scope **Hostinger MCP servers** reload in every Claude tab (up to 40 node processes, 1–2 GB). Kill them when memory is low: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'hostinger' | % { Stop-Process -Id $_.ProcessId -Force }`. Don't use Hostinger tools.
- The Windows temp scratchpad gets wiped: keep anything important in `C:\Users\ADMIN\aspire-2\handoff\`.

**Multi-agent workflows**
- Run at most ~3 workflows at once. Builders run only their own vitest files (`--maxWorkers=1`) and eslint; only integrators run tsc / full suite / dev server / one headless Chrome, after waiting until no other tsc / vitest / next build runs.
- Every workflow prompt starts with an **AUTHORIZATION** block quoting the owner's real request: agents see the owner's latest chat message and once refused to build because it was a side question. After each run, scan results for "not started / BLOCKED / wrote no files".
- Builds were cut by a network outage and by the weekly usage limit (hit 22 Oct, reset 25 Oct 08:30 IST). `resumeFromRunId` only works within one session; after a restart write a continuation script that skips finished packages and points agents at `handoff\reports\`.
- The chat model is the owner's `/model` choice. The 28 Oct restarts set `model: 'fable'` on agents because the owner said they had Fable allowance.
- Commits: no global git identity on this PC. Use `git -c user.name="attri.anshuman" -c user.email="attri.anshuman@gmail.com" commit …` plus the Co-Authored-By line the harness gives. Ask before changing the commit identity.

## 4. Status at a glance (30 Oct)

| Item | Where | State |
|---|---|---|
| **Release 1** (5a2d7cb) | live 22 Oct → 30 Oct | lead gate rules, carousels, heroes, homepage tools, page layout, lead routing + Meta, question bank + student screens |
| **Release 2** (d1b9997, admin Phase 1b) | `main`, tag `release-2026-10-30.1` | **LIVE 30 Oct** (`handoff\r2-deploy.log`): server build (type-checks) passed, container healthy, 10 pages + both other sites OK, new console pages answer 307 (login), Hindi pages 200, no errors in app logs, 75 tables incl. `crm_targets`, `crm_wa_templates`, `crm_lost_reviews`, `crm_duplicate_dismissals`; DB `user_version` 2; super admin `aspire.admin` intact. DB snapshot `backups/backup-pre-d1b9997.sqlite`. Server disk 4.1 GB free. The local 1b integration check (full vitest / eslint / browser smoke signed in) **was not run** (owner said "deploy now"); run it next on `main` and hot-fix if needed. Rollback image: `aspire-web:5a2d7cb-demo` (the 3394b3d image is gone). |
| **Release 3** (admin Phase 2 + Rancho answer review) | not started | designed in `docs/admin-phase-2-plan.md` |
| **Release 4** (SEO go-live pack) | `aspire-web-seo` | all 7 packages built, verified and fixed; **integration not done**; merge into `main` after the Release 2 check; ships switched off |
| **Release 5** (Asha) | `aspire-web-asha` | AA-0 done; AA-WA and AA-CALL **partly built** (files exist, unverified); 6 packages + integrate to go; ships dark |
| **Aspire Ops** | Claude Console | running; reports every morning and Monday |

## 5. Main checkout (`aspire-web`) — everything built

### 5.1 Live in Release 1 (and earlier)
- **Website (en / hi):** every public page. Homepage: hero + enquiry form, stats, programs, results showcase, free-tools section (tiles: predictor, mock tests, Rancho, planner; countdown behind the contact form), why Aspire, campus life, testimonials, impact chart, resources, centres, CTA. Carousels: 5 s per image, no hover pause, Pause sticks, rotation independent of scroll events (`src/components/ui/ImageCarousel.tsx`, `carousel-env.ts`, `carousel-utils.ts`, `home/ResultRail.tsx`, `results/ResultMarqueeFrame.tsx`).
- **Inner-page heroes** (`src/components/hero/**`, README there): About / Admissions "proof up front" (stats, collage, Rancho chip / Next batch card); Programs Himalayan frame + program picker; program pages with their own facts; Results ribbon (5 s, Pause, year pills); Centres / Contact centre finder (12 districts → nearest centre; Contact adds call / WhatsApp); Hostels / Resources / Tools Himalayan frame; quiet hero on legal / login.
- **Page-layout editor** (`src/lib/page-layout/**`, `/admin/page-layout`, `docs/page-layout-plan.md`): super admin moves / shows / hides sections on the homepage and 9 inner pages; draft, preview (Draft Mode), publish (cache-tag revalidation), reset, history; hero first, CTA last, tools never last.
- **Student tools:** rank predictor; mock tests (weekly sample tests + exam-pattern papers generated per attempt from the question bank: JEE Main, NEET, JEE Advanced, BOH placeholder; server-timed runner; results; monthly ranked paper + leaderboard; exam pages say "coming soon" until a blueprint is published); study planner + offline service worker (`public/planner-sw.js`); **Rancho** (`src/lib/ask/**`, `src/components/rancho/**`): text, photo (floating chat), voice in/out, tool use with cards; snow-leopard persona; **Rancho app** PWA `/rancho`.
- **Lead gate** (`src/lib/lead-gate/**`, `src/components/lead-gate/**`, `docs/lead-gate-plan.md`): contact form before every tool result; `LEAD_GATE=required`; once per browser (180 days); staff / admins see it too; signed-in students / parents skip only with a mobile on their account (none have one yet); enforced on `/api/ask`, `/api/mocktest/score`, `/api/mocktest/attempts`.
- **CRM / lead routing** (`src/lib/crm/**`, `/crm/*`, `docs/lead-routing-plan.md`): one lead per family (E.164 dedupe, consent records) from forms, tools, Rancho, walk-ins, phone, Meta webhook, Meta Leads Center CSV (Excel-damage detection); inbox, today's calls, pipeline, tasks, reports, export, add / edit / erase; super admin; 12 district areas with area heads and executives; routing area → centre → next executive; Unassigned and Tool sign-ups queues; 1-hour rule with calling hours and escalation (area head 1 h, super admin 4 working hours); dashboards; Integrations → Meta (tokens encrypted with `INTEGRATIONS_SECRET`). Meta setup guide: `docs/lead-routing-plan.md` Part 2.
- **Question bank** (`src/lib/qb/**`, `/admin/questions`, `docs/question-bank-plan.md`, D-050–D-058): approved-only pool, blueprints, syllabus, coverage, review queue, imports (AI import off: `QB_IMPORT_ENABLED=0`), generator; deps added: katex, mammoth, pdf-lib, read-excel-file. Bank holds 45 JEE / 40 NEET sample questions only.
- **Admin console:** overview, users, activity log, MCP tokens, website status, question bank, page layout, CRM settings.

### 5.2 Release 2 (d1b9997) — admin Phase 1b (`docs/admin-phase-1b-plan.md`)
Packages, each built, verified and fixed (reports in `handoff\reports\p1b-prior\`):
- **1B-CORE:** console schema (`src/lib/db/features/crm-console.ts`), shared contracts (`src/lib/crm/console/**`), inbox query additions, erase hook, nav, role home (`/crm/home`).
- **1B-CALLS:** one-step call outcome (`src/components/console/calls/**`), next follow-up picker from calling hours, attempts and "not reachable" after 5 misses, follow-up rhythm, 8 WhatsApp templates (super-admin approval; staff send via their own WhatsApp; logged only after "Did you send it?").
- **1B-SOURCES:** where enquiries come from (`/crm/sources`): channels, AI assistants, Google Maps (tagged GBP links per centre), free tools and Rancho card, search overview.
- **1B-NUMBERS:** five numbers per centre against targets + Needs attention on `/admin` and `/crm/dashboard`; Targets (`/crm/targets`, per session April–March); Admissions done; counsellor activity in Reports.
- **1B-FAMILY:** more family details (second number, school / board, hostel, target exam, how they heard, who decides), duplicate suggestions (never auto-merge), lost review (`/crm/lost`), inbox quick views and filter chips.
- **1B-HOUSEKEEPING:** People list with required role choice, AI-assistant wording ("Rancho"), `/admin/status` (site status and go-live summary), readable activity log.
- **Still to do for Release 2:** the integration check (prompt in `admin-phase-1b-integrate-wf_11c8b664-4e5.js`): tsc, full vitest, eslint, browser smoke; apply the FAMILY fixer's `src/components/crm/format.ts` patch (BackKind `"lead"` + `parseBackParam`, see `fix_1B-FAMILY.md`); record deviations (409 + `bad_request` for version conflicts; duplicates already lost as "duplicate" leave the duplicate list) in D-078..D-083. Owner steps after release: set admission targets, approve the WhatsApp templates, add each centre's Google Maps link.

## 6. SEO worktree (`aspire-web-seo`, branch `feature/seo-golive`) — Release 4

Plan: `docs/seo-golive-plan.md` (in the worktree). Everything is gated: demo mode stays robots `Disallow` + `noindex`; one super-admin switch "Open the site to search engines with the go-live pack" refuses to turn on until the site is out of demo mode on aspireiit.in. 65 uncommitted files. Reports: `handoff\reports\seo-prior\`.

- **SEO-CORE:** schema `src/lib/db/features/seo.ts`; `src/lib/seo/*` (types, prereq, mode, settings, runtime, pages, breadcrumbs, routes, metadata `withSeo`, hindi, access, audit, warnings, card glyphs, go-live, robots rules, tags, reserved paths); crawler registry; redirect safe-path / normalize / match; JSON-LD script component. Built before Phase 1b landed (merge notes in its report).
- **SEO-FACTS:** verified business facts sheet (`src/lib/seo/facts/**`, `/admin/search/facts`), verify / unverify per field, consistency checks incl. footer and Contact page; JSON-LD builders (Organization, LocalBusiness per centre, BreadcrumbList, Course, Event) using **verified facts only**.
- **SEO-SHARE:** share images `/og/<kind>/<key>.<lang>.<v>.png` (no remote fetches; admins only until live), social profiles page, WhatsApp share texts (en / hi / Hinglish) with tagged links, public share links (`/admin/search/social`).
- **SEO-ROUTING:** proxy step in `src/proxy.ts` with its own sqlite handle (`src/lib/seo/proxy/**`): host guard (any non-production host is `noindex` and robots `Disallow` even after launch), 301 redirect map with "Test a URL", 108 suggested forwards from the old aspireiit.in sitemaps (accepted group by group). Proof needed at integration: `/neet-coaching-in-mandi/` → 308 then 301 to `/centres/kullu` on Host aspireiit.in; else Plan B catch-all page.
- **SEO-META:** page titles / descriptions / share previews console (`/admin/search/pages`) with missing / too-long / duplicate / restricted-claim warnings and Google + WhatsApp previews; 20 public pages wired through `withSeo` (no change while hidden).
- **SEO-CENTRES:** centre pages `/centres/[slug]` (NAP from verified facts, Open in Google Maps, courses, next scholarship test, results only with consent + disclosure, enquiry form preset to the centre), centres console, GBP checklist.
- **SEO-CRAWLERS:** crawler policy console (answer vs training crawlers; decision 22 default allows both on public pages; private paths always blocked), robots preview, Search Console / Bing verification codes, crawler visit counts without IPs, `/llms.txt` (only when live).
- **Next:** SEO-INTEGRATE in the worktree (prompt in `seo-golive-pack-finish-wf_394caf39-57a.js`; dev server port 3001), then merge into `main` after Release 2's check. Expect conflicts in `src/lib/db/features/index.ts`, `src/proxy.ts`, `src/components/portal/areas.ts`, `src/i18n/messages/{index,types}.ts`, portal messages, audit labels, `src/app/sitemap.ts` / `robots.ts`. Re-run the full gate on `main`, deploy (switched off). Owner inputs: verified centre facts, GBP access, any old URLs printed on brochures / QR codes.

## 7. Not part of this project: edwyz

On 30 Oct the owner sent some messages here by mistake about **edwyz.com / review.edwyz.com** (a DNS record, "complete the deployment on machine", "db is already there if its needed"). They belong to another project. Ignore every edwyz message in the chat history: configure nothing for it on the Aspire VPS and don't treat it as an Aspire domain.

## 8. Asha worktree (`aspire-web-asha`, branch `feature/asha`) — Release 5

Plan: `docs/admissions-agent-plan.md` (rev 2.1, owner decisions OD1–OD7, Q-A9 decided), `docs/admissions-agent-voice.md`, `docs/admissions-agent-counselling.md`. Asha ships **dark**: `ADMISSIONS_AGENT_ENABLED=0` hard kill, every super-admin switch off, every provider fake by default, tests block global fetch. Reports: `handoff\reports\asha-prior\`.

- **AA-0 (done, verified, fixed):** schema `src/lib/db/features/admissions.ts`; `src/lib/admissions/*` (types, settings, secrets, hash, tx, seam, outbound, handoff, alerts, consent, env, log), repos, 11 policy modules (caps, consent coverage, contact role, DPDP dates, eligibility, freshness, minor guidance, portfolio budget, risk phrases, send window, stop words), job queue / worker / lease, provider fakes (whatsapp, payments, telephony, model), `src/instrumentation.ts`, test kit, en/hi message namespaces (`pay`, `crm-assistant-*`); lead-routing follow-ups R1, R4, R6, R10, R11, R12 made (R3 and the R2 part of R11 on fallbacks). 202 tests passed.
- **AA-WA (partly built, unverified):** `src/lib/admissions/whatsapp/` has cloud client, config, contacts, handshake, human inbox, inbound, messages, outreach, provider, register, safety, send, simulator, statuses, templates, webhook + fixtures.
- **AA-CALL (partly built, unverified):** `src/lib/admissions/telephony/` has account, checks, click-to-call, consent window, exotel, provider, recording, staff phones, status token, status.
- **Remaining:** finish + verify AA-WA and AA-CALL, then AA-CONSENT + AA-AGENT, AA-INT1, AA-PAY + AA-DASH, AA-INT2, integrate (dev port 3002). Continuation script: `asha-build-continue-wf_48e66ec0-bde.js` (edit `const M` to drop the Fable override if needed). Merge after Release 3; deploy dark.
- **WhatsApp API plan for lead handling** (client deck slides 12–13): stage 1 Meta setup (owner: business verification, WhatsApp Business account, new SIM, display name, 13 templates); stage 2 WhatsApp in the CRM (instant hello 9 AM–9 PM, shared inbox, chats become leads, STOP + caps) = AA-WA; stage 3 Asha replies (Shimla pilot); stage 4 Razorpay token links. Cost ≈ ₹160–1,400 / month at 300–1,000 leads (Meta India rates; confirm on the live rate card).

## 9. Release procedure

1. `git status` clean of `.env*`, `.data/`, `private/`, scratch, logs, screenshots.
2. Commit (identity in §3), tag, `git push origin main <tag>`.
3. Server disk first: `docker builder prune -af` (freed ~5 GB on 30 Oct). Keep current + one rollback image (now: live d1b9997 after Release 2, rollback `aspire-web:5a2d7cb-demo`, plus the old `aspire-web:demo`).
4. `bash C:/Users/ADMIN/aspire-2/handoff/deploy-release.sh <sha>` (Git Bash): archive → sha256-checked upload → `VACUUM INTO` snapshot `/opt/aspire-web/backups/backup-pre-<sha>.sqlite` → extract → `docker compose build` with a <300 MB watchdog that restores `RELEASE` on failure → `up -d` → health checks (10 pages + the two other sites) → DB `user_version`.
5. After deploy: `docker compose exec -T app npm run -s auth:super-admin -- list`; check new tables; read the release's owner steps.
6. Server `.env` keys (never print values): `RELEASE`, `SHOW_PLACEHOLDER_CONTENT=true`, `LEAD_GATE=required`, `LEAD_GATE_SECRET`, `LEAD_GATE_SINCE`, `INTEGRATIONS_SECRET`, `QB_IMPORT_ENABLED=0`, others from before; backups `.env.bak-pre-leadgate`, `.env.bak-pre-r1`. Data dirs `data/qb-figures`, `data/qb-imports` exist. Asha and SEO will add env keys (see their integration reports) when they ship.
7. Rollback: `RELEASE=<previous>-demo` in `.env`, `docker compose up -d`; restore the pre-deploy DB snapshot only if a migration misbehaved.

## 10. Owner decisions (verbatim where quoted)

- **Lead gate:** "every tool should be a data collection point before showing the result" → required, once per browser, staff see it, students / parents skip only with a mobile on file, countdown gated.
- **Routing:** replace CMO → area heads → executives forwarding; "should be a super admin functionality… for now it should be 1 hour"; "for now there are 12 districts in himachal"; "no zapier please"; "meta ads leads should directly go into crm".
- **Question bank:** official papers (last 10 years) + Aspire's bank; easy / medium / hard; a fresh paper per attempt in the real pattern; JEE Main, NEET UG, JEE Advanced, Aspire BOH.
- **Admin console plan:** all 23 defaults approved; phases 1b and 2 next; editors Phase 3; SEO Phase 4 at go-live (aspireiit.in; decision 22 allows AI crawlers on public pages).
- **Page layout:** "set the section's position up or down", homepage and inner pages.
- **Rancho:** snow-leopard mascot; photo only in the floating chat; voice; uses all tools; Rancho is the PWA with sign-in; chats not stored (D-035) except the approved **Rancho answer review** (opt-in; strip names incl. the student's, phones, emails, addresses, IDs, school and coaching names; never store photos; keep exam, subject, date, helpful flag and the answer; no account / phone / IP / lead link; delete after 30 days; super admins only; privacy notice en / hi; counsel review recommended) → Release 3.
- **Aspire Ops:** cheapest model with correct results → Haiku 5.5 (tested, ~2 cents per report).
- **Asha:** separate from Rancho; female, feminine Hindi / Hinglish; "Main Asha hoon, Aspire ki AI admission counsellor"; always says she is an AI; counsellor who handles parents; runs the whole journey incl. token collection; mirrors the family; ethical persuasion only; Hinglish first message; ≤3 follow-ups in 7 days, 09:00–20:00; token adjusted against fees, refundable within N days (fee table required before any link); automatic payments with rails; Exotel + Razorpay; no AI voice calls. Pending counsel: under-18 counselling only with parent confirmation (built, locked); adult students get no payment card from Asha; forward-only automatic stage moves on verified events.

## 11. Waiting on the owner

Area heads and executives per centre; calling hours; Meta app for Lead Ads; verified centre facts (address with PIN, phone, hours, map link); fee and token table with refund days; consented results; question papers + answer keys, Aspire's question files, BOH pattern, question-bank staff roles; confirm syllabus lists and publish the JEE Main blueprint; final domain and go-live date; GBP access; WhatsApp Business verification + new SIM; Razorpay and Exotel accounts; a lawyer's view on consent wording, token terms, under-16 Foundation enrolment and the Rancho answer review; two safety contacts; Rancho artwork; Release 2 owner steps (§5.2); security items (§3).

## 12. Docs index

`docs/lead-routing-plan.md`, `docs/question-bank-plan.md`, `docs/page-layout-plan.md`, `docs/admin-console-plan.md`, `docs/admin-phase-1b-plan.md`, `docs/admin-phase-2-plan.md`, `docs/seo-golive-plan.md`, `docs/admissions-agent-plan.md` (+ `-voice.md`, `-counselling.md`), `docs/lead-gate-plan.md`, `deploy/README.md`, `docs/api.md`, `docs/crm.md`, `docs/hindi-review-register.md` (machine Hindi awaiting native review), `docs/aspire-approval-checklist.md`, `docs/content-verification.md`, `src/components/hero/README.md`.

## 13. Usage

Since 22 Oct the build agents used roughly 48 million tokens (most of it cached input), plus chat tokens and the runs of 28–29 Oct. The owner checks plan usage with `/usage` or claude.ai settings.

## 14. Timeline

- **≤ 20 Oct:** milestones M1–M7 (site, tools, Rancho, CRM basics, MCP server); Docker deploy on the VPS; repo made private.
- **20–21 Oct:** homepage tools widget; Rancho naming / voice / photo / tools; Rancho PWA + install prompt; admin console 1a; lead gate on; releases 806a938, 3394b3d.
- **21–22 Oct:** multi-agent builds while the owner was AFK; Aspire Ops created and tested; Asha designed; **Release 1 (5a2d7cb) live ~10:40 IST 22 Oct**; Phase 1b and SEO designed; SEO and Asha worktrees created.
- **22 Oct:** network outage, then the weekly usage limit stopped all builds.
- **28 Oct:** builds restarted on Fable; client deck created; scratchpad found wiped (deploy script / progress page recreated); the session then ended mid-build.
- **30 Oct:** handoff folder and this file written; owner said "deploy now" → **Release 2 (d1b9997) committed, pushed, tagged and live**.
