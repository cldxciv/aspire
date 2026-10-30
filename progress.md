# Asha (AI admission counsellor): progress (branch `feature/asha`, updated 30 Oct 2026)

For the next agent working on this branch. Project-wide context, rules, servers and owner decisions are in `progress.md` on `main` (read it first: `git show main:progress.md`, or `C:\Users\ADMIN\aspire-2\aspire-web\progress.md`). This file covers only Asha.

## 1. Where it is

- **Worktree:** `C:\Users\ADMIN\aspire-2\aspire-web-asha`, branch `feature/asha`, based on **5a2d7cb** (Release 1). `main` is now d1b9997 (Release 2); merge `main` in before integration.
- **Code is not committed yet.** About 36 changed / new paths (incl. the whole `src/lib/admissions/` tree) live only in this worktree; only this `progress.md` is on GitHub. Commit the code to this branch (owner's go-ahead) before risky steps.
- `node_modules` is a junction to the main checkout's: never run `npm install` here. Dev server for this worktree: port **3002**.
- **Plan:** `docs/admissions-agent-plan.md` (rev 2.1, owner decisions OD1–OD7, Q-A9 decided), `docs/admissions-agent-voice.md`, `docs/admissions-agent-counselling.md`. **Reports:** `C:\Users\ADMIN\aspire-2\handoff\reports\asha-prior\` (AA-0 build / verify / fix). **Continuation workflow:** `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\workflows\scripts\asha-build-continue-wf_48e66ec0-bde.js` (run as a new script; edit `const M` to drop the Fable override if needed; tell its AA-WA / AA-CALL agents to verify and finish the partial files, not start over).

## 2. Who Asha is (owner decisions)

- A separate agent from Rancho (Rancho stays the students' study helper). Female; feminine Hindi / Hinglish; "Main Asha hoon, Aspire ki AI admission counsellor"; **always says she is an AI**.
- Works like a human admissions executive and counsellor: first contact within a minute of a new lead from a web form, a Meta Lead Ad or an inbound WhatsApp (walk-in and phone entries are skipped: staff press **Start WhatsApp** only after the family agrees in person), handles parents, matches programs from Aspire's real data, books centre visits and the scholarship test, and collects the **token amount automatically** through a payment link.
- Hinglish first message, then mirrors the family's language. Ethical persuasion only (no false urgency, no invented scarcity or results).
- At most 3 follow-ups in 7 days, 09:00–20:00 IST; STOP works at once; a person can take over any chat.
- Token is adjusted against fees and refundable within N days; amounts only from the fee table (none before it exists). Under-18 students: counselling only after a parent confirms; no money talk with them. Adult students get no payment card from Asha (pending counsel).
- Stage moves are automatic but forward-only on verified events (new → contacted, booked call → counselling_booked, attended → visited_or_demo, gateway-verified token → offer); never backwards or to lost; super-admin switch to turn it off.
- Providers: WhatsApp Cloud API (Meta), Exotel click-to-call (staff phone first, then the family; no AI voice calls), Razorpay. No Zapier / Make.

## 3. How it stays dark

Ships as **Release 5**, dark. `ADMISSIONS_AGENT_ENABLED=0` is the hard kill (default; the arrival seam writes nothing). Every super-admin switch defaults off; every provider defaults to its fake (`WHATSAPP_PROVIDER` must be `meta` for the real one); tests block global fetch. `ADMISSIONS_HASH_KEYS` must be set before any assistant feature is switched on. To stop housekeeping jobs while dark, set `ADMISSIONS_WORKER=off`. Real payments need `PAYMENTS_LIVE` on top of the super-admin switch (two locks).

## 4. Packages

| Package | State | Notes |
|---|---|---|
| **AA-0 foundations** | **done: built, verified, fixed** (224 tests) | schema `src/lib/db/features/admissions.ts`; `src/lib/admissions/*` (types, settings, secrets, hash, tx, seam, outbound, handoff, alerts, consent, env, log); repos; 11 policy modules (caps, consent coverage, contact role, DPDP dates, eligibility, freshness, minor guidance, portfolio budget, risk phrases, send window, stop words); job queue / worker / lease; provider fakes (whatsapp, payments, telephony, model); `src/instrumentation.ts`; test kit `src/test/admissions/`; en / hi namespaces (`pay`, `crm-assistant-*`); lead-routing follow-ups R1, R4, R6, R10, R11, R12 |
| **AA-WA** WhatsApp | **partly built, unverified** | `src/lib/admissions/whatsapp/`: cloud client, config, contacts, handshake, human inbox, inbound, messages, outreach, provider, register, safety, send, simulator, statuses, templates, webhook + fixtures |
| **AA-CALL** calling | **partly built, unverified** | `src/lib/admissions/telephony/`: account, checks, click-to-call, consent window, exotel, provider, recording, staff phones, status token, status |
| AA-CONSENT | not started | consent v3 split by purpose (`src/lib/server/enquiry-consent.ts`), "I am" / "this number is" questions, optional unticked WhatsApp box and, for parents, the "my child may chat with Asha" box (OD6), Meta custom-answer mapping, thank-you **Continue on WhatsApp** |
| AA-AGENT | not started | `src/lib/admissions/agent/**`: prompt, tools per speaker, guard + grounding (corpus ≥ 250 lines), budget pools and breakers, `programme_fit`, hand-off, assist mode; settings page `crm/settings/assistant`; routing follow-up R8 |
| AA-INT1 | not started | integrates slices 1–2 into shared files (lead page panels, inbox, today, settings hub, nav "Assistant", proxy exemptions R5, health field, MCP CRM tools) + docs and `deploy/README.md`; needs owner approval of the deploy changes (nginx 4 MB location for the WhatsApp webhook, Docker log limits, hourly export, status cron) |
| AA-PAY | not started | `src/lib/admissions/payments/**` (replaces the AA-0 `payments/seam.ts` stubs): Razorpay token links, `/pay/[token]`, webhook, receipts, refunds, disputes; no payment intent before the family taps Yes; `PAYMENTS_LIVE` two-lock; live refused without GSTIN or declaration |
| AA-DASH | not started | dashboard and status: page `crm/assistant` (funnel, cost, worker health; managers see only their areas), loopback + token status endpoint |
| AA-INT2 + integrate | not started | slice 3 into shared files, legal copy (counsel's text), then the full gate: tsc, full vitest, eslint, `next build`, browser smoke on port 3002 |

**AA-0 interface changes later packages must follow** (from `fix_AA-0.md`): `JobContext` has an `env` field; `WorkerState` has a `running` set; only the worker holding the lock claims jobs; the outreach handler's claim-time eligibility re-check must pass `newSibling` from the child row (`source === "submission"`); `countUnfinishedSendsBefore` and `listExpiredLeases` were removed (`recoverExpiredLeases` kept).

## 5. Open questions for the owner

- **Test mode** (`fix_AA-0.md` item 10): currently "test mode" means the WhatsApp provider is the fake; a lead on a test number is then skipped as `test_lead`. Confirm or change.
- Counsel review: consent wording, token terms and refund days, under-16 Foundation enrolment, adult students and payment cards.
- Two named safety contacts; who takes over when a family asks for a person.

## 6. WhatsApp API plan for lead handling (also in the client deck, slides 12–13)

1. **Meta setup (owner):** business verification, WhatsApp Business account, a new SIM for the number, display name, 13 message templates approved.
2. **WhatsApp in the CRM (AA-WA):** instant approved hello 9 AM–9 PM to families who agreed, shared inbox on the lead's record routed by area, click-to-WhatsApp ad chats and direct messages become leads (matched by phone, with the campaign), STOP + caps + quality-rating watch.
3. **Asha replies:** pilot at Shimla first.
4. **Token links:** Razorpay, amounts from the fee table.

Running cost ≈ ₹160–1,400 a month at 300–1,000 leads (Meta India rates; Meta charges only for business-started messages; confirm on Meta's live rate card).

## 7. Owner inputs needed before going live

WhatsApp Business verification + new SIM; Razorpay and Exotel accounts; fee and token table with refund days; staff phone numbers for click-to-call; calling hours per centre; safety contacts; counsel review (§5).

## 8. Order of work

Finish + verify AA-WA and AA-CALL → AA-CONSENT + AA-AGENT → AA-INT1 → AA-PAY + AA-DASH → AA-INT2 → merge `main` → integrate → after Release 3 (admin Phase 2) ships, merge into `main` and deploy dark.

## 9. Log

- 21–22 Oct: Asha designed with the owner (plan rev 2.1, OD1–OD7); worktree created; AA-0 built.
- 22 Oct: network outage, then the weekly usage limit stopped the build mid AA-WA / AA-CALL.
- 28 Oct: AA-0 verified and fixed (202 → 224 tests) on Fable; AA-WA / AA-CALL partly built before the session ended.
- 30 Oct: this file pushed to `feature/asha`.
