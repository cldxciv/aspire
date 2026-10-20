# M6 — lead integration to-do (collected from agent reports)

## Privacy notice (`src/i18n/messages/{en,hi}/legal.ts` + privacy page section)
- Planner: guests' data stays in the browser; signed-in students' plan, ticks, review progress and XP are stored in their Aspire account; weekly leaderboard is opt-in and shows only a chosen nickname; linked parents see streak, XP and day counts only.
- Predictor: no server storage; share-card URL carries only exam + score bucket.
- Mock tests: (pending A2 report)
- Ask Aspire: photos checked, held in memory for one request and sent to Anthropic's API (processor), never stored or logged; EXIF/GPS stripped in the browser; questions/answers processed by Anthropic, not stored by Aspire; signed-in students only: subject + short topic label + count + first/last dates (`ask_topics`, deleted with the account); guests: only a per-day counter hashed with the day, rows older than 2 days deleted; "helpful?" votes stay in the browser; logs carry fixed codes + token counts only; photo upload requires a "no faces or names" tick.

## From QA-SEC-M6 (2026-10-20)
- `docs/ask-aspire.md` step 3: add the read-only `exhaustedAllowance()` check that now runs before the body is read.
- nginx for `/api/ask`: `client_max_body_size 6m;` + `limit_req` / `limit_conn` (bursts of large bodies from fresh IPs); `proxy_buffering off;` for streaming.
- `anthropic-workspace-id` header: only needed for account-level keys (the API said so for the first key); the deployed key is workspace-scoped and doesn't use it.
- MOCK-HARDEN agent fixing M1 (server-issued starts, answer-key release), L6 (nickname = real name, schools on rows, admin reset), L7 (certificate verification), L8 (XP caps), L9 (clear tool localStorage on sign-out).

## Deployment (Ask Aspire)
- Set `ANTHROPIC_API_KEY` (owner, server `.env` only) + optionally `ASK_ASPIRE_MODEL` (default claude-opus-5-5 ≈ $0.05–0.10/question; Sonnet ≈ half; Haiku ≈ $0.002), daily caps; recommend an Anthropic Console spend limit.
- nginx: `proxy_buffering off;` for `/api/ask` (streaming); app already sends `X-Accel-Buffering: no`.
- Tools hub: switch Ask status from "Needs connection" once the key is set.

## Hindi review register (`docs/hindi-review-register.md`)
- `hi/predictor.ts`, `hi/planner.ts` (+ Hindi topic names and flashcards in `src/content/planner/*`), `hi/tools.ts`, `common` nav additions; pending: mocktest, ask.

## Checklist (`docs/aspire-approval-checklist.md`)
- Predictor: official score/percentile + cutoff tables per exam session (schema `src/lib/predictor/types.ts`); quota structure + BOH marking to confirm.
- Planner: syllabus topic map + flashcards to review.
- Mock tests / Ask Aspire: pending reports.

## Code follow-ups
- `src/components/predictor/predictor-page.test.ts` — tsc error (missing `children` prop).
- Manifest is site-wide (`start_url /tools/planner`, scope `/`): install prompt may appear on any page — acceptable for now; revisit.
- Service worker only registers in production builds — verify offline mode after the next build/deploy.
- Convert tool pages' heroes to carousels (round 2).
- Phase 2: PORTAL-INTEGRATION (`getPlannerSummary`, mock-test `summariseAttempts`, Ask `getWeakTopicsFromDoubts`), CONTENT-VERIFY (questions + flashcards), QA/security of new APIs.

## From MOCK-HARDEN (2026-10-20)
- Done: privacy text updated (server-timed starts, verification page, school totals ≥ 3, sign-out clearing).
- Portal audit label for `admin.mocktest_profile_remove` (shows the raw code).
- Planner nickname real-name rule (mock tests have it; planner only blocks the login id).
- Clear `aspire.ask.feedback.v1` on sign-out too (counts only).
- Real weekly tests need a new question set (test id) per window; the sample weekly test reuses 15 questions for 26 windows.
- Per-question right/wrong for guests lets the MCQ key be inferred in ~3 tries — boards stay labelled "practice"; a fair board needs proctoring or hiding per-question outcomes during the window (owner decision).
- Practice tests no longer have an all-time leaderboard (their key is public).
- `docs/api.md`: new `/api/mocktest/start`, `/api/mocktest/verify/:id`, `DELETE /api/admin/mocktest/profile/:userId`, changed score/attempts/leaderboard/profile responses (see MOCK-HARDEN report).
