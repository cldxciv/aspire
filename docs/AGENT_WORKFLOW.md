# Agent workflow and file ownership

## Roles
- Main Claude Code session: orchestrator/tech lead and final integrator.
- Content Researcher: source inventory, no app edits during audit.
- Homepage UX Designer: responsive design/form recommendations, no app edits during audit.
- Frontend Engineer: implementation after approved scope.
- Backend Engineer: enquiry contract (`src/lib/contracts/enquiry.ts`), `POST /api/enquiries`, `src/lib/server/**`, their tests, `docs/api.md`, and the privacy-notice field list — only after the lead approves the contract change.
- QA Auditor: independent tests and findings.
- Content Integrity Reviewer: provenance, consent, claims, demo-data audit.

## Parallelization
Phase 1 (parallel, read-only): Content Researcher + UX Designer + QA Auditor + Content Integrity Reviewer.
Phase 2 (lead synthesizes): choose data contracts, route/component ownership, section plan.
Phase 3 (controlled implementation): the lead first approves and records (in `docs/agent-decisions.md`) any shared-contract change — e.g. the 3-step hero form's new fields. Backend Engineer then implements the contract + API + tests while Frontend Engineer builds UI against the agreed contract; Frontend Engineer owns designated UI files; lead owns integration, `src/lib/data.ts`, `src/content/**`, `src/config/**`, layout and shared UI. Do not let two agents edit the same file concurrently, and only the lead runs `next build`.
Phase 4 (parallel, read-only): QA Auditor and Content Integrity Reviewer examine the integrated result.
Phase 5: lead fixes integration issues, reruns checks, and produces report.

## Shared handoff format
Each agent reports:
1. Summary
2. Files/routes inspected
3. Evidence/source URLs
4. Findings and severity
5. Recommendations
6. Unknowns/blockers
7. Files edited (should be none during initial audit)

## Stop conditions
Stop and ask the user for a decision if a task requires a new external service, live enquiry destination, portal auth change, production deployment, paid resource, or publication of unverified personal/academic data.
