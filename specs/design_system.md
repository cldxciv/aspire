# Design System & UI Guidance

## Brand direction
Premium, credible, welcoming education brand. Combine confident navy with generous white space, energetic blue for action, and restrained gold for emphasis. Keep pages visually rich with purposeful imagery and diagrams rather than decorative clutter.

## Core tokens
```css
:root {
  --color-navy: #09284B;
  --color-navy-2: #123E70;
  --color-blue: #1768D4;
  --color-gold: #FFC629;
  --color-ink: #14253D;
  --color-muted: #65758B;
  --color-line: #E2EAF3;
  --color-surface: #F3F7FC;
  --color-white: #FFFFFF;
  --radius-card: 18px;
  --radius-control: 10px;
  --shadow-card: 0 12px 32px rgba(9,40,75,.09);
  --content-max: 1200px;
}
```

## Typography
- Use the existing brand font if supplied. Otherwise use a modern, highly legible sans-serif stack.
- Clear heading scale; body text comfortable on mobile; avoid long lines.
- Use concise, action-oriented button labels and visible form labels.

## Layout
- Center content within a max-width around 1200px, with responsive side gutters.
- Use a strong hero with authentic photography or approved illustration, concise copy, and primary/secondary CTA.
- Alternate white and pale-blue sections for rhythm; reserve navy blocks for high-value emphasis.
- Programme cards, result cards, centre cards, FAQs, process steps, and testimonials should share spacing, radius, and interaction patterns.
- Add skeleton/loading states only where content loads asynchronously; provide empty/error states.

## Visual asset direction
Prioritize real Aspire-owned or properly licensed images: classroom, faculty teaching, students studying, campus/centre exteriors, labs/library if applicable. Use optimized responsive images, meaningful alt text, and crop focal points for mobile. If real assets are unavailable, use clearly temporary placeholders in development and maintain a list of assets required. Do not use the generated concept-board sample identities/results as actual content.

## Reusable components
- `SiteHeader`, `MobileNavigation`, `SiteFooter`, `Breadcrumbs`
- `Button`, `IconButton`, `SectionHeading`, `Hero`, `ImageFeature`
- `ProgramCard`, `ResultCard`, `CentreCard`, `ArticleCard`, `TestimonialCard` (only with approved content)
- `EnquiryForm`, `FormField`, `SelectField`, `ConsentNotice`, `StatusMessage`
- `FAQAccordion`, `FilterBar`, `SearchInput`, `EmptyState`, `ErrorState`, `LoadingState`
- `PortalShell`, `PortalSidebar`, `PortalHeader`, `MetricCard` (metrics only from real sources)

## Responsive behavior
- Desktop: full navigation and multi-column card grids.
- Tablet: collapse grids and preserve hierarchy; avoid horizontal overflow.
- Mobile: accessible menu, stacked CTAs, single-column cards, full-width form controls, tap targets ideally at least 44x44 CSS px.
- Test at approximately 360px, 390px, 768px, 1024px, and 1440px viewport widths.

## Accessibility
- Semantic landmarks and heading order.
- Keyboard-operable navigation, accordions, dialogs, filters, and forms.
- Visible focus indicators and accessible names for icon-only controls.
- Color contrast at WCAG AA where applicable; do not rely on color alone for status.
- Errors associated with fields; focus or announce submission errors/success appropriately.
- Respect reduced-motion preferences and avoid auto-playing audio/video.

## Motion and interaction
Use restrained transitions (hover elevation, menu transitions, accordion reveal). Ensure core functionality does not depend on hover and honor reduced-motion preferences.
