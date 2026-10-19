# Acceptance Checklist — Definition of Done

## Visual and responsive
- [ ] Prototype/reference reviewed and design tokens applied consistently.
- [ ] Site looks intentional at 360, 390, 768, 1024, and 1440px widths.
- [ ] No horizontal overflow, clipped navigation, overlapping text, or broken imagery.
- [ ] Authentic approved imagery is used or temporary assets are clearly tracked.
- [ ] Buttons, links, cards, forms, menus, accordions, and filters have visible interaction states.

## Public pages
- [ ] Home, About, Programs, Program detail, Results, Centres, Admissions, Resources, Contact, Privacy, and Terms routes work or approved scope exclusions are documented.
- [ ] Header/footer/navigation are consistent and mobile navigation is keyboard-accessible.
- [ ] Programme and centre pages support empty states when no verified records exist.
- [ ] Results are sourced, verified, and consent-aware; no illustrative values are published.
- [ ] Enquiry form validates inputs, shows field-level errors, prevents accidental double submission, and has clear success/error handling.
- [ ] Forms are not labelled live unless they are connected to a working server destination.

## Portals and security
- [ ] Student, parent, and admin experiences are visually distinct and role-appropriate.
- [ ] Real data routes require server-side authentication and authorization.
- [ ] Parent access is restricted to linked/authorized learners.
- [ ] Admin operations are protected and sensitive changes are auditable.
- [ ] No secrets or sensitive student/enquiry data are stored in client-only code or exposed in logs.
- [ ] Missing auth/backend services are documented and screens clearly identified as demo/preview.

## Accessibility and quality
- [ ] Semantic landmarks, heading hierarchy, form labels, alt text, and keyboard navigation are in place.
- [ ] Visible focus, accessible names, contrast, and non-color status cues are checked.
- [ ] Loading, empty, error, and permission-denied states exist for dynamic content.
- [ ] Page titles/meta descriptions and appropriate social metadata are configured.
- [ ] Images are appropriately sized; below-the-fold images are lazy-loaded where supported.
- [ ] Build and tests run successfully; failures and exceptions are documented accurately.

## Handoff
- [ ] Setup, development, build, test, and deployment instructions are documented.
- [ ] Environment variable example contains names/placeholders only, no secrets.
- [ ] Owner verification list covers results, fees, centre details, contacts, images, testimonials, legal content, and admissions dates.
- [ ] Known limitations, pending credentials, and external dependencies are documented.
