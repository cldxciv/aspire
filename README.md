# Aspire IIT & Medical — website

Public website and portal foundation for Aspire IIT & Medical (`aspireiit.in`).

**Stack:** Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · zod · vitest.

> **Status: skeleton / preview.** Content marked **DEMO** is placeholder and unverified. Enquiry forms only deliver data when a destination is configured. Portals have no identity provider and show data-free preview shells. See `docs/integration-status.md`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values; never commit secrets
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit/integration tests (vitest) |

Environment variable **names** and their meaning are listed in `.env.example`.

## Project layout

```
src/
  app/(site)/        public pages (shared header/footer layout)
  app/(portal)/      student / parent / admin shells (noindex, guarded)
  app/api/           route handlers (JSON envelope: src/lib/contracts/api.ts)
  proxy.ts           Next 16 "middleware": portal headers + optimistic access checks
  components/ui/     design-system primitives (Button, Card, Notice, PageHero…)
  components/layout/ header, mobile nav, footer, logo
  config/site.ts     site name, navigation, verified contact details (null until verified)
  content/           placeholder content records (status-tagged)
  lib/data.ts        the only way pages/APIs read content
  lib/contracts/     shared client/server contracts (enquiry schema, API envelope)
specs/               product requirements, routes, design system, acceptance checklist
reference/           design mockup (markup only) and visual board — fictional sample data
docs/                decisions, content verification register, integration status, agent briefs
```

## Content rules

Nothing is published as fact until it is `verified` in `docs/content-verification.md`. Placeholder records render only in development (or when `SHOW_PLACEHOLDER_CONTENT=true`) and always carry a DEMO badge; such builds are `noindex`.

## Deployment

Not configured. No deployment, DNS change or production data migration without owner approval.
