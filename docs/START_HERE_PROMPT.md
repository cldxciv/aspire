# Paste this prompt into Claude Code

You are the orchestrator and tech lead for the existing Aspire IIT & Medical website. Read `CLAUDE.md` and the docs under `docs/` before editing.

## Goal
Implement the approved homepage showcase design in the existing app, including a compact 3-step enquiry form inside the hero, while preserving all existing routes and functionality.

## First: inspect and report
1. Inspect Git status, repository structure, package scripts, existing homepage/components, content models, images, and existing docs.
2. Read `docs/integration-status.md`, `docs/demo-data-import.md`, `docs/content-verification.md`, and `docs/agent-decisions.md` if present.
3. Inspect `https://aspire2.thechunkmedia.com` with available permitted tools. If it cannot be reached, use existing inventory and report that limitation.
4. Delegate independent **read-only** work to the content researcher, UX designer, QA auditor, and content integrity reviewer. Ask each to report file paths, findings, risks, and recommendations; they should not modify application files during the initial audit.
5. Return an implementation plan, file ownership map, content gaps, and risk list. Do not start edits until the plan is presented.

## Implementation plan after approval
- Work in phases: shared contracts/data source → hero/form → homepage sections → responsive polish → QA.
- Assign the frontend engineer to implementation. Only one agent owns each file at a time.
- The 3-step form collects fields the current hero (`quick`) form does not (parent/guardian name, email, preferred centre, message). Before any UI work: agree the contract change (prefer a new `"hero"` source variant in `src/lib/contracts/enquiry.ts`), record it as a decision, and assign the **backend engineer** to the schema, `POST /api/enquiries` validation, tests and the privacy-notice field list. Parent/guardian name is new personal data — minimal, never logged, listed in the privacy notice.
- Approved design reference: if a homepage showcase design file (image/Figma) has been supplied, use it; if not, ask the user for it before Phase 3 rather than inventing one.
- The homepage must include: hero + 3-step enquiry form, verified stats, results showcase, programs, institute story/history, faculty, centres, student life/facilities, approved testimonials, resources, admissions CTA, and footer.
- Source institutional facts from the reference website and local content inventory; preserve provenance.
- Use real/approved imagery where available. Generated/sample images and sample names are placeholders only.
- Keep unverified results, student identities, testimonials, stats, fees, safety claims, and scholarship claims out of public output.
- Form behavior: step 1 student name and class/target exam; step 2 parent/guardian and contact details; step 3 preferred centre, optional message, privacy/consent, and review. Preserve data when going back; validate per step; accessible progress indicator; prevent duplicate submissions. Do not claim submission success unless a configured backend confirms receipt. If no backend is configured, show an honest non-submitting preview state or keep submit disabled with clear explanation.
- Do not add a new CRM/email/webhook, authentication system, or external service without approval.
- Keep desktop hero compact enough for first-fold intent, but prioritize readability and avoid fixed heights that clip content. Mobile should stack naturally.
- Maintain accessibility, SEO, image optimization, and reduced-motion support.

## Verification and deliverables
Run the actual typecheck, lint, tests, and production build. Use browser automation if available; otherwise clearly state visual QA was not performed and provide manual steps. Test desktop/tablet/mobile, every form step, validation, back/next, keyboard use, links, console/network errors, and production demo-data exclusion.

Create/update:
- `docs/homepage-showcase-content-map.md`
- `docs/homepage-implementation-report.md`
- `docs/visual-qa-report.md`
- `docs/aspire-approval-checklist.md`

Do not deploy or push. Finish with changed files, actual test outputs, visual checks actually performed, unresolved content questions, and next actions. Never fabricate results.
