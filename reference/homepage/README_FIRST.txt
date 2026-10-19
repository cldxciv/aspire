ASPIRE IIT & MEDICAL — CLAUDE CODE DESIGN HANDOFF

START HERE
1. Extract this ZIP.
2. In your existing aspire-web repository, copy the files from the included current Claude setup ZIP (if you have it) into the repository root; merge folders carefully.
3. Open 01_APPROVED_HOMEPAGE_REFERENCE.png first. Use it as the primary visual reference for the homepage direction. Use 02_FULL_HOMEPAGE_REFERENCE.png to understand the longer page layout.
4. Open 03_INTERACTIVE_MOCKUP.html in a browser to inspect the earlier interactive prototype.
5. Read the included product/design specs in 04_PRODUCT_DESIGN_SPEC_AND_OLDER_AGENT_HANDOFF.zip if more context is needed.

IMPLEMENTATION NOTES
- The approved direction is premium navy, white and gold; student/mountain hero imagery; and a compact 3-step enquiry form on the right of the hero.
- Keep the navigation, hero headline and first form step within the first desktop viewport where practical. On mobile, stack the form below the headline.
- Preserve entered values between steps, validate each step, show progress, support keyboard/screen-reader use, and do not show a success state unless a real submission endpoint is configured and the server confirms success.
- The PNGs and prototype are visual references, not production source code. Recreate the design in the existing Next.js/Tailwind project rather than embedding the screenshots.
- Any names, ranks, statistics, testimonials, campus imagery, or claims visible in mockups are placeholders unless independently verified and approved by Aspire. Do not publish fabricated or unapproved student identities/results. Do not invent claims. Keep unresolved content flagged for client approval.
- Do not deploy, push, connect live forms, enable authentication, or expose preview/admin/student APIs without explicit approval.

TASK FOR CLAUDE CODE
Inspect the existing repository and this visual reference before editing. Produce a concise implementation plan and identify any conflicts with the current code. Then implement the homepage to match the visual direction while preserving the existing architecture, route behavior, accessibility, responsive behavior, and content-integrity safeguards. Run typecheck, lint, tests, and production build; report the exact results and any remaining blockers.
