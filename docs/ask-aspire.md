# Ask Aspire — AI doubt solver (M6, D-035)

Students type or photograph a Physics, Chemistry, Maths or Biology question and get a step-by-step answer in English or Hindi from Claude (Anthropic). Page: `/tools/ask` and `/hi/tools/ask`. API: `GET|POST /api/ask`. Owner: A3-ASK.

## How it works

1. The page is static. In the browser it calls `GET /api/ask` → `{ configured, account, limit, used, remaining, resetsInSeconds, maxImageBytes }`. Without a key it shows **"Ask Aspire isn't connected yet"**. The how-it-works, honest notes and enquiry link stay on the page.
2. The student picks a subject (or "not sure") and the answer language, then types the question and/or adds one photo (`accept="image/*" capture="environment"`). The browser re-encodes the photo through a canvas to a JPEG of at most 1600 px on the longer side. This also removes EXIF metadata such as GPS. The student must tick "this photo shows only the question: no faces, names…" before sending a photo.
3. `POST /api/ask` (JSON, at most about 5.6 MB) runs these checks in order. Same-origin (403) → key configured (503 `not_configured`) → JSON and size (415 / 413 / 400) → zod and cross-field rules (422) → photo re-checked by magic bytes (JPEG/PNG/WebP) and limited to 4 MB decoded (422 / 413) → daily allowance (429 + `Retry-After`) → Claude.
4. The answer streams back as NDJSON events: `start` (remaining/limit), `delta` (text), `done` (stop reason + topic tag) and `error`. If Claude fails before the answer starts, the API returns 503 (busy) or 502, or `not_configured` for a rejected key, and the question is **not counted**.
5. The model ends every answer with a hidden trailer, `<aspire-meta>{"subject","topic","difficulty"}</aspire-meta>`. The server strips it from the stream (`src/lib/ask/trailer.ts`) and the browser strips it again as a safety net. For signed-in **students** the subject and topic are counted in `ask_topics` (weak-topic tracking).
6. The answer renderer (`src/lib/ask/markdown.ts` + `src/components/ask/AnswerContent.tsx`) is a whitelist parser. It handles headings, lists, bold/italic, inline code, code blocks, superscripts and a highlighted **Final answer** line. All model text is rendered as escaped React text; there is no `dangerouslySetInnerHTML`.
7. The answer view also has a copy button, "Was this helpful?" (counts are kept in this browser's `localStorage` only, never sent), a "Still stuck?" link to `/admissions#enquiry` (there is no booking system, D-033) and the disclaimer "AI can make mistakes — check with your teacher".

## Model, request and costs

| Setting | Value |
|---|---|
| Default model | `claude-opus-5-5`: the current default Claude model, vision-capable, $4 / $20 per million input / output tokens |
| Thinking / effort | Model default (adaptive on Opus 5.5), `output_config.effort: "medium"` set explicitly. Effort is left out for older model ids that reject it |
| Output cap | `ASK_ASPIRE_MAX_TOKENS`, default 8000, clamped to 1024–32000. It includes the hidden reasoning tokens |
| Prompt caching | The system prompt is identical for every request and marked `cache_control: ephemeral`. Language and subject go in the user turn |
| Refusal fallback | Beta `server-side-fallback-2026-07-01` with `fallbacks: "default"`. If a safety classifier wrongly declines a textbook question (for example NEET biology), the API retries it on a fallback model in the same call. Models without fallback support ignore it |
| Client | Official `@anthropic-ai/sdk` (`client.beta.messages.stream`), 1 retry, 120 s timeout. If the browser disconnects, the upstream stream is aborted |

**Estimated** cost per question (not measured yet; check the `inputTokens` / `outputTokens` log fields after launch). Assumptions: about 1.5k input tokens (system prompt plus question), plus about 1.6k for a photo, and 2–4k output tokens typical (answer plus reasoning; Hindi uses more tokens). With those numbers:

| Model | Typical | Worst case at the 8k cap with a photo |
|---|---|---|
| `claude-opus-5-5` (default) | ≈ $0.05–0.10 | ≈ $0.17 |
| `claude-sonnet-5-5` | ≈ $0.03–0.05 | ≈ $0.09 |
| `claude-haiku-5-5` | ≈ $0.002 | ≈ $0.005 |

Opus gives the most reliable working on hard JEE Advanced and NEET problems. Sonnet 5.5 halves the cost. Haiku 5.5 is about 40× cheaper but weaker on multi-step problems. Before switching, try 20–30 real Aspire questions (with photos, in both languages) on the cheaper model.

With the default limits the daily bill is bounded by `ASK_ASPIRE_GLOBAL_DAILY` × the worst case. For example, 500 × $0.17 ≈ $85/day worst case on Opus; a typical day will be far lower. Set a spend limit in the Anthropic Console as well.

## Limits

| Who | Allowance per day (midnight India time) | Keyed by |
|---|---|---|
| Guest (also an account that must still change its temporary password) | `ASK_ASPIRE_GUEST_DAILY`, default **5** | client IP (`getClientIp`, `TRUSTED_PROXY_HOPS`) |
| Signed-in student | `ASK_ASPIRE_STUDENT_DAILY`, default **30** | account id |
| Signed-in parent / admin | guest number | account id |
| Everyone together | `ASK_ASPIRE_GLOBAL_DAILY`, default **500** | site-wide circuit breaker |

The owner asked for "unlimited for enrolled students". That is not offered because every answer costs money and a leaked student login could run up the bill. Thirty a day is generous for genuine doubts, and the owner can raise it. `0` switches a group off.

Counters live in SQLite `ask_usage`. Each key is a SHA-256 of the day, the scope and the IP or account id, so no raw IP or id is stored and rows of different days cannot be linked. Rows older than 2 days are deleted. The check and the increment run in one write transaction.

Weakness: guests on a shared IP (a school or a mobile carrier's NAT) share 5 questions, and IP rotation can get more. The global cap bounds that.

## Privacy (lines for the privacy notice: lead)

- **Photos:** checked and held in server memory for the one request, sent to Anthropic to write the answer, never written to disk, the database or the logs. EXIF metadata, including location, is removed in the browser before upload.
- **Questions and answers:** sent to and returned from Anthropic's API (Claude). They are **not stored** by Aspire. Anthropic processes them under its commercial API terms; check the current retention and no-training terms for the account.
- **Students:** students are asked not to include faces, names or personal details, and must confirm this before sending a photo. The model is told to ignore personal details and never ask for them.
- **Signed-in students only:** the subject, a short topic label (for example "Projectile motion") and a count and dates per topic are stored in `ask_topics` to show weak areas. These rows are deleted with the account (FK cascade) or with `clearDoubtTopics(userId)`.
- **Guests:** nothing is stored except a hashed per-day question counter.
- **"Was this helpful?":** kept in the browser's `localStorage` (counts only). Nothing is sent to the server.
- **Logs:** fixed codes only, such as outcome, reason, account kind, photo yes/no, language, prompt version, model, duration and token counts. Never the question, photo, answer, topic, IP, account id or API key.

## Prompt versioning

The prompt lives in `src/lib/ask/prompt.ts`. `ASK_PROMPT_VERSION` (date + counter) is logged with every request. Any wording change gets a new version and a changelog line in that file. Rules (D-035):

- Physics, Chemistry, Maths and Biology only, for Class 9–12, JEE and NEET; it politely declines anything else.
- Numbered steps, the concepts named, and a **Final answer:** line.
- "You can revise: NCERT Class N Subject, chapter …". It never quotes NCERT and never claims to use Aspire's notes, lectures or DPPs (none are connected).
- It answers in the requested language: Hindi in Devanagari, with technical terms in English in brackets.
- It says when it is unsure or the photo is unreadable.
- It refuses harmful requests and answers to a live exam.
- It never asks for personal data and keeps a kind tone for minors.
- It ends with the metadata trailer.

## Configure

1. Create an API key in the Anthropic Console (a workspace with a monthly spend limit is recommended).
2. Set `ANTHROPIC_API_KEY` in the server environment (`.env.local` or the container env; **never** `NEXT_PUBLIC_*` and never in git). Optionally set `ASK_ASPIRE_MODEL`, `ASK_ASPIRE_MAX_TOKENS`, `ASK_ASPIRE_GUEST_DAILY`, `ASK_ASPIRE_STUDENT_DAILY` and `ASK_ASPIRE_GLOBAL_DAILY`. These are read on every request, so no rebuild is needed; restart the container to load them.
3. Check `GET /api/ask` → `configured: true`, then ask one test question per language.
4. Behind nginx, streaming needs response buffering off for `/api/ask`. The API sends `X-Accel-Buffering: no`; `proxy_buffering off` for that location also works.

## For Phase 2 (portal / planner)

`src/lib/ask/weak-topics.ts` (server-only):

- `getWeakTopicsFromDoubts(userId, { limit?: 1–100 (default 10), subject? })` returns `WeakTopic[]`: `{ subject, topic, count, firstSeen, lastSeen }`, most-asked first. The caller must authorise access: the student themself, or a linked parent via `requireStudentRecord`.
- `clearDoubtTopics(userId)` deletes a student's topics.
- SQL helpers: `src/lib/db/features/ask.ts` (`listTopics`, `upsertTopic`, `deleteTopics`, usage counters).

## Files

`src/app/api/ask/route.ts`, `src/lib/ask/*` (config, constants, prompt, trailer, image, schema, usage, asker, claude, log, weak-topics, markdown), `src/lib/db/features/ask.ts`, `src/components/ask/*` (AskAspire, AnswerContent, ask-client, prepare-photo), `src/app/[lang]/(site)/tools/ask/page.tsx`, messages `ask`.

Tests (SDK mocked, no network): `src/lib/ask/ask-lib.test.ts`, `src/app/api/ask/ask-route.test.ts`, `src/components/ask/ask-page.test.ts`.
