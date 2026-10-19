# Data & Content Contracts

These are conceptual entities, not a claim that an API or database already exists. Map them to the actual stack and source systems after repository inspection.

## Suggested entities
### Program
- `id`, `slug`, `title`, `shortDescription`, `description`, `targetAudience`, `highlights[]`, `deliveryMode`, `duration` (optional), `feeDisplay` (optional/verified only), `image`, `status`, `updatedAt`.

### Centre
- `id`, `slug`, `name`, `district`, `address`, `phone`, `email` (optional), `openingHours` (optional), `latitude`/`longitude` (optional verified), `directionsUrl` (optional), `image`, `status`, `verifiedAt`.

### Result/Achievement
- `id`, `year`, `exam`, `program`, `studentDisplayName` (only if approved), `rankOrOutcome`, `sourceReference`, `consentStatus`, `publishedAt`, `verifiedBy`, `verifiedAt`, `status`.
- Do not publish an entry unless its source is verified and all required permissions/consents are documented.

### Enquiry
- `id`, `name`, `phone`, `email` (optional), `programmeInterest`, `preferredCentre` (optional), `message` (optional), `consentAt`, `source`, `status`, `assignedTo` (optional), `createdAt`, `updatedAt`.
- Restrict access to authorized staff; minimize collection and retention; never send raw enquiry data to analytics tools.

### Resource/Article
- `id`, `slug`, `title`, `summary`, `body`, `coverImage`, `author` (optional), `publishedAt`, `status`, `seoTitle`, `seoDescription`.

### Portal user / learner link
Use the existing identity provider and domain model if present. Model roles and parent-to-learner relationships server-side. Never trust a client-supplied user ID or role to authorize record access.

## API boundary examples
Names below are illustrative. Do not call them until the real backend routes are confirmed or implemented.
- `GET /api/programs`, `GET /api/programs/:slug`
- `GET /api/centres`, `GET /api/centres/:slug`
- `GET /api/results?year=&program=`
- `POST /api/enquiries`
- Authenticated routes for student, parent, and admin data only after server authorization exists.

## Content publishing rules
- Use a clear `draft` / `pending_review` / `published` lifecycle where a CMS exists.
- Require an owner/editor verification step for results, fees, addresses, admissions dates, claims, and testimonials.
- Keep provenance (`sourceReference`, `verifiedAt`, `verifiedBy`) for results and other high-trust claims.
- Public UI should gracefully omit absent optional data rather than inventing it.
- Development fixtures must be labelled `DEMO` or `PLACEHOLDER` and must never be mistaken for production content.

## Security and privacy
- Validate/sanitize all server inputs and encode output appropriately.
- Use CSRF protections where relevant, secure session handling, rate limits, spam prevention, and server-side authorization.
- Keep secrets in environment/secret management, never source control or frontend bundles.
- Define data retention and privacy notices with the organization; collect only necessary fields.
