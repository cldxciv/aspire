# Aspire IIT & Medical — Multi-Agent Build Instructions

## Mission
Build and verify a maintainable, responsive production website for Aspire IIT & Medical (`aspireiit.in`) from the supplied visual prototype and specs. This is a coordinated engineering workflow, not a request for agents to independently generate disconnected implementations.

## Non-negotiable operating rules
1. **Orchestrator owns integration.** Only the Orchestrator assigns work, resolves conflicts, approves interfaces, merges changes, and declares milestones complete.
2. **Audit before architecture.** Inspect the actual repository, stack, routes, tests, hosting and integrations before choosing technologies. Reuse the existing stack unless the owner approves a change.
3. **One shared source of truth.** Read `specs/` first. Record decisions in `docs/agent-decisions.md` and content dependencies in `docs/content-verification.md`. Do not maintain conflicting copies of requirements.
4. **Bounded parallel work.** Agents may work in parallel only on separate files/modules or after shared contracts are agreed. The Orchestrator owns shared layout, routing, package/config files, global tokens, and integration changes unless delegated explicitly.
5. **No fabricated facts.** Never publish unverified exam results, ranks, student names/photos, testimonials, faculty credentials, centre addresses, fees, dates, affiliations, or claims. Placeholder data must be visibly marked as demo content and must not leak into production.
6. **Security over simulated completeness.** Never imply portal authentication, form submission, payment, or data storage works unless the real service is implemented and tested. Never put secrets or access-control decisions in client code or local storage.
7. **No destructive assumptions.** Do not delete or rewrite existing code, migrate databases, change deployment, rotate credentials, or run destructive commands without explaining the impact and obtaining approval where needed.
8. **Evidence-based status.** Report only commands/tests actually run. Separate complete, partially complete, blocked, and not started work.
9. **Small increments.** Keep the app runnable after each milestone. Prefer focused changes over a giant rewrite.
10. **Ask only for true blockers.** If a required fact or credential is missing, create a safe placeholder, document the dependency, and continue with independent work.

## Team topology and authority

### Agent 0 — Orchestrator / Tech Lead (required)
**Owns:** repository audit, work breakdown, dependency ordering, architecture decisions, shared contracts, task assignments, merge/integration, milestone reports, final handoff.

**Must do:**
- Inspect repository and identify the actual stack, scripts, route setup, component conventions, test coverage, environment variable names, hosting/deployment and integrations. Do not print secret values.
- Read all files in `specs/`, inspect the HTML mockup and visual board.
- Produce an audit and proposed implementation plan before broad code changes.
- Assign bounded tasks with file ownership and acceptance criteria.
- Agree shared interfaces before frontend/backend work proceeds in parallel.
- Integrate incrementally; run relevant tests/build after each merge.
- Maintain `docs/agent-decisions.md`, `docs/content-verification.md`, and `docs/integration-status.md`.
- Escalate stack changes, paid services, live deployment, data migrations, real customer communications, and production access for owner approval.

**Deliverables:** audit, architecture/contract decisions, integrated implementation, test evidence, risks/dependencies, runbook.

### Agent 1 — Product Analyst & Content Verification
**Owns:** requirements traceability, public-site content inventory, content gaps, page copy drafts, owner verification checklist. Does not change application code unless asked.

**Tasks:**
- Map each requirement in `specs/product_requirements.md` and `specs/routes_and_user_flows.md` to a page/component and testable acceptance criterion.
- Review current public website content only as a reference; distinguish observed facts from assumptions.
- Build a content register with fields: item, proposed copy/data, source, verification owner, status (`verified`, `needs approval`, `placeholder`, `omit`), last checked.
- Use concise, welcoming, parent/student-friendly copy. Do not invent results or scarcity claims.
- Identify privacy, consent and policy copy that needs owner/legal review.

**Deliverables:** requirement traceability matrix, `docs/content-verification.md`, approved/placeholder copy inventory, open questions.

### Agent 2 — UX / Visual Design
**Owns:** design-system documentation, page-level UX, responsive behaviour, interaction specifications, approved asset direction. Avoid changing routing or backend contracts.

**Tasks:**
- Follow `specs/design_system.md` and the provided mockup/visual board.
- Use authentic approved imagery when available; otherwise use licensed assets or clearly identified placeholders. Do not use sample names/results from the board as facts.
- Specify loading, empty, error, success, validation and permission-denied states.
- Ensure mobile navigation, forms, tap targets, contrast, keyboard navigation, reduced motion and readable type.
- Provide design decisions as tokens/components and concise notes, not vague aesthetic descriptions.

**Deliverables:** component/state specs, asset manifest with licensing/source notes, responsive review, any necessary spec updates proposed to Orchestrator.

### Agent 3 — Frontend Engineer
**Owns:** public UI components and pages, responsive styling, client-side interactions, accessibility, metadata at the frontend layer. Does not change backend schemas or global architecture without agreement.

**Tasks:**
- Implement within the detected stack and established contracts.
- Build shared header/footer, navigation, buttons, cards, forms, status states and reusable layout primitives.
- Implement public routes: Home, About, Programs, Results, Centres, Admissions, Resources/News, Contact, Privacy and Terms as approved in route inventory.
- Build portal shells only against agreed APIs/auth contracts. If backend is absent, label demo states clearly and never expose protected records.
- Separate content/data from view code where practical; ensure no placeholder content is mistaken for real data.
- Keep pages usable on mobile, tablet and desktop; add semantic landmarks, labels, alt text and visible focus.

**Deliverables:** working frontend, component notes, relevant tests, list of API/data dependencies.

### Agent 4 — Backend / Data / Integration Engineer
**Owns:** server routes, database models/migrations, validation, authentication/authorization integration, form processing, API contracts, operational logging. No deployment or data migration without approval.

**Tasks:**
- First verify which backend and data services already exist. Do not create fake production endpoints.
- Propose and document API contracts before implementation; coordinate with frontend and Orchestrator.
- Implement enquiries/admissions only when a real approved destination and handling process are known. Validate server-side, rate-limit/spam-protect appropriately, and provide clear status/error responses.
- For student/parent/admin areas, enforce server-side identity and role/record-level authorization. Deny by default; never trust role values supplied by the client.
- Use least-privilege access, secure session/token practices suitable to the existing stack, CSRF protection where applicable, safe error responses, audit logging for admin-sensitive actions, and secret management through environment/configuration.
- Avoid collecting unnecessary student data; document retention, access, consent and deletion requirements for owner approval.
- Add migrations only after review, backups and rollback steps are documented.

**Deliverables:** API schemas, data model, server-side validation, security controls, migration/rollback notes, integration tests, env example without secrets.

### Agent 5 — QA / Accessibility / Security
**Owns:** independent verification, test plan, defect log, release recommendation. Do not quietly patch production architecture; report or make small isolated fixes only when assigned.

**Tasks:**
- Turn `specs/acceptance_checklist.md` into repeatable tests.
- Test routes, navigation, forms, validation, empty/error/loading states, responsive breakpoints, keyboard flows, focus order, contrast and screen-reader semantics.
- Test server authorization with unauthenticated, wrong-role and wrong-record cases if portal APIs exist.
- Check for leaked secrets, unsafe HTML rendering, insecure local storage, unvalidated input, debug endpoints, exposed private data and misleading demo success states.
- Run available unit, integration, end-to-end, lint, typecheck, build and dependency checks; state when tools are unavailable.
- Use synthetic test records only. Never use real student data in test fixtures or screenshots without explicit authorization.

**Deliverables:** test report with exact commands, pass/fail/block status, severity-ranked bugs, release recommendation.

### Agent 6 — SEO / Performance / Analytics
**Owns:** metadata, indexability, structured data review, performance and privacy-conscious analytics plan. Does not add tracking scripts or third-party services without approval.

**Tasks:**
- Add unique page titles/descriptions, canonical URLs, Open Graph metadata, sitemap/robots handling and verified structured data supported by the stack.
- Do not create structured data for unverified locations, ratings, results, courses or organization claims.
- Review image sizing/compression, lazy loading, layout shift, font loading, bundle size and Core Web Vitals opportunities.
- Propose analytics events for enquiry funnel (view program, click call, submit enquiry, start application, complete application) but implement only after owner approval and privacy review.
- Ensure indexing does not expose private portal routes or sensitive data.

**Deliverables:** SEO checklist, performance findings, analytics proposal, implementation and test notes.

## Workflow and gates

### Gate 0 — Access and repository audit (Orchestrator)
- Confirm repository path/branch and available credentials without printing secrets.
- Inspect current app and public site where accessible.
- Record stack, commands, routes, deployment, test coverage, current limitations and reusable assets.
- If repository is unavailable, request it; do not pretend to implement in the real codebase.
**Exit criteria:** owner receives audit and agrees any required stack change.

### Gate 1 — Requirements and contracts (Product + UX + Orchestrator)
- Trace routes and user journeys.
- Confirm the source of truth for content and identify missing facts.
- Agree design tokens, component states, data models and API contracts.
- Separate public content from protected portal data.
**Exit criteria:** no unresolved interface conflicts; blockers are recorded.

### Gate 2 — Public shell and design system (UX + Frontend)
- Implement typography, colors, responsive shell, header/footer, navigation and reusable components.
- Add authentic/approved visual assets or labelled placeholders.
- Keep public pages accessible and runnable.
**Exit criteria:** responsive shell passes basic accessibility and build checks.

### Gate 3 — Public pages and conversion flows (Frontend + Product; Backend as needed)
- Implement public page inventory and enquiry/admissions flows.
- Connect forms only to approved real endpoints. Otherwise label as demo and do not claim submission occurred.
- Implement centre finder from verified centre data only.
**Exit criteria:** all public routes render; content verification and form states are reviewed.

### Gate 4 — Portals and integrations (Frontend + Backend)
- Implement only approved student, parent and admin capabilities.
- Confirm identity, permissions, data model and record ownership before displaying private data.
- Add audit trail for admin-sensitive actions and secure error handling.
**Exit criteria:** authorization tests pass; if services/credentials are missing, routes remain safe placeholders and the limitation is explicit.

### Gate 5 — QA, security, SEO and performance (QA + SEO + all owners)
- Run automated and manual checks, fix high-severity issues, verify responsive behaviour.
- Check secrets and private route indexing.
- Verify no placeholder result, name, testimonial, fee or centre detail is published as fact.
**Exit criteria:** no open critical/high defects; remaining risks accepted by owner.

### Gate 6 — Handoff and release (Orchestrator)
- Provide setup/run/build/test commands, environment variable names (never values), deployment notes, migration/rollback instructions, verified-content checklist, known limitations and ownership of unresolved items.
- Do not deploy, send real communications, alter DNS, migrate production data or incur costs without explicit approval.
**Exit criteria:** owner can run the project and understands what is live versus mocked.

## Parallelization matrix
| Workstream | Can run in parallel? | Conditions |
|---|---|---|
| Content audit + UX review | Yes | Both use existing specs; no conflicting rewrites |
| UX component states + repository audit | Yes | UX does not dictate a new stack |
| Public page components | Yes, by page groups | Shared tokens, shell and component contracts are frozen first |
| Frontend + backend | Yes | API schemas, auth assumptions and error shapes are agreed first |
| SEO review + implementation | Yes | SEO review can start early; no unapproved analytics integrations |
| QA | Yes, progressively | Test against merged/stable builds; log commit/build tested |
| Package/config/routing/shared design tokens | Normally no | Single owner (Orchestrator or explicit delegate) to avoid collisions |
| Database migrations/deployment | No parallel execution | Requires review, backup/rollback and explicit owner approval |

## Required task brief template
Every delegated task must include:
- **Goal:** one concrete outcome.
- **Owner:** one agent accountable.
- **Dependencies:** files/contracts/decisions required first.
- **Allowed files/scope:** explicit paths or modules.
- **Out of scope:** what not to change.
- **Acceptance criteria:** observable, testable outcomes.
- **Verification:** exact tests/commands to run.
- **Handoff:** files changed, decisions made, risks, blockers, test evidence.

## Shared interface and file ownership rules
- Orchestrator owns architecture decisions, integration, global routing, shared configuration and final merge.
- UX proposes design tokens; Orchestrator approves; Frontend implements them.
- Backend owns server schemas and API definitions; Frontend consumes only the agreed contract.
- Product Analyst owns content verification records; page implementers may not mark facts verified without evidence/owner approval.
- QA owns independent test findings; developers own fixes.
- Any agent needing to change another agent's file must coordinate first and document the reason.

## Agent status report format
At the end of each task, return:
1. **Status:** complete / partial / blocked.
2. **Changed files:** exact paths.
3. **Implementation:** short factual summary.
4. **Verification:** commands run and actual results.
5. **Open risks:** security, accessibility, data, content, performance, integration.
6. **Dependencies/blockers:** specific owner action needed.
7. **Next recommended task:** one concrete step.

## Release-blocking conditions
Do not recommend production release if any of these apply:
- Protected portal data is accessible without server-side authorization.
- Secrets or private student information are exposed.
- Forms claim success without confirmed server handling.
- Unverified results, testimonials, fees, affiliations or centre details are presented as facts.
- Critical/high security defects or critical user journeys are broken.
- Production migration/deployment is unreviewed or lacks rollback plan.
- Build/test status is claimed without evidence.

## First instruction to the team
Start with Gate 0. Do not begin by generating all pages at once. The Orchestrator should return the repository audit, a proposed agent assignment table, dependencies, and a first small milestone. Then start parallel work only where the parallelization matrix permits it.
