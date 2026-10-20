# i18n (D-028): how to localise a page

Locales: `en` (default) and `hi`. Hindi copy is a **machine draft**. List what you translate in the Hindi review register ("needs native review").

## URLs and routing

| Public URL   | Internal route  | Notes                                                  |
| ------------ | --------------- | ------------------------------------------------------ |
| `/about`     | `/en/about`     | The proxy rewrites it; the URL stays unprefixed        |
| `/en/about`  | n/a             | 307 redirect to `/about`                               |
| `/hi/about`  | `/hi/about`     | Served directly                                        |
| `/xx/about`  | n/a             | 404                                                    |

- Every page lives under `src/app/[lang]/` in `(site)` or `(portal)`. The root layout is `src/app/[lang]/layout.tsx`. It sets `<html lang="en-IN|hi-IN">`, the fonts and the `LocaleProvider`.
- API routes, `sitemap.ts`, `robots.ts`, `globals.css`, `fonts.ts` and `global-not-found.tsx` stay at `src/app/`, outside `[lang]`.
- URLs that match no route render `src/app/global-not-found.tsx`, which shows English and Hindi side by side. When a page calls `notFound()`, the 404 is localised: `[lang]/(site)/not-found.tsx` or `[lang]/not-found.tsx`.
- Route type helpers include the segment: `PageProps<"/[lang]/programs/[slug]">`, `LayoutProps<"/[lang]/student">`.

## Server Components (pages, layouts, `generateMetadata`, server utilities)

```tsx
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localePath } from "@/i18n/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("about");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates("/about") };
}

export default async function AboutPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("about")]);
  const programs = await getPrograms(locale);            // CONTENT-HI accessors take the locale as the last argument
  return <ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.cta}</ButtonLink>;
}
```

- `getLocale(): Promise<Locale>` reads the `[lang]` root param through `next/root-params` (`lang()`). An unsupported value calls `notFound()`.
- `getMessages(ns): Promise<Messages<ns>>` returns one namespace in the current locale.
- `localeAlternates(path)` returns `{ canonical, languages: { "en-IN", "hi-IN", "x-default" } }`. Pass the **locale-free** path. Every public page already uses it. Do not put `alternates` in a layout: every child page would inherit it.
- These helpers do **not** work in Client Components, Server Actions or Route Handlers. That is a Next restriction, and importing `next/root-params` in a client file fails the build.

## Links: always `localePath`

`localePath(href, locale)` from `@/i18n/paths` is pure and client-safe:

- `localePath("/about", "en")` gives `/about`.
- `localePath("/about", "hi")` gives `/hi/about`.
- `localePath("/", "hi")` gives `/hi`.
- Query strings and hashes are kept: `/admissions#enquiry` becomes `/hi/admissions#enquiry`.
- An existing prefix is replaced: `localePath("/hi/x", "en")` gives `/x`.
- These are returned unchanged: `#anchor`, external URLs, `mailto:`/`tel:`, `/api/…`, `/images/…`, `/assets/…`, `/sitemap.xml`, and file paths.

Every internal `<Link>` / `ButtonLink` / `PageHero` crumb needs it. `PageHero` takes `homeLabel` + `homeHref`, so pass `t.labels.home` and `localePath("/", locale)` from `common`. Other helpers in the same module are `stripLocale(pathname)`, `splitLocale(pathname)` and `localeFromPathname(pathname)`.

`usePathname()` can return `/about`, `/en/about` or `/hi/about`. Normalise it with `stripLocale()` before comparing paths, as `MainNav` does.

## Client Components: pass messages as props

The server parent loads the strings and passes only what the client needs:

```tsx
// Server parent
const t = await getMessages("forms");
return <HeroEnquiryForm messages={t.hero} />;

// Client child
"use client";
import type { Messages } from "@/i18n/messages/types";
export function HeroEnquiryForm({ messages }: { messages: Messages<"forms">["hero"] }) { … }
```

- `useLocale()` from `@/i18n/client` gives any Client Component the locale, for example for `localePath(href, useLocale())`. The root layout provides it.
- Import catalog types from `@/i18n/messages/types`. `@/i18n/messages` (`messagesFor`) is `server-only`.
- A client file that cannot get props, such as `error.tsx` (error boundaries only receive `error`/`retry`), may import its two small namespace files directly and pick one with `useLocale()`. For example: `import en from "@/i18n/messages/en/legal"; import hi from "@/i18n/messages/hi/legal"`. Keep those namespaces small, because both languages ship to the browser.
- Placeholders: `"Aspire on {platform}"` with `format(template, { platform })` from `@/i18n/format`. Messages are plain strings (serialisable), never functions.

## Adding messages

- Namespaces are already registered: `common` (I18N-CORE), `home programs results centres forms` (PAGES-A), `about hostels admissions contact resources legal` (PAGES-B), `portal auth` (AUTH-2). **Only edit your own** `messages/en/<ns>.ts` and `messages/hi/<ns>.ts`. `types.ts` and `index.ts` need no changes.
- English defines the shape. The Hindi file is typed `Messages<"<ns>">`, so a missing or extra Hindi key fails `tsc`. Write plain object literals and **never `as const`**, which would make Hindi have to equal English.
- `src/i18n/i18n.test.ts` also checks at runtime that every namespace has the same keys, no empty Hindi strings and the same `{placeholders}`.
- Use `common` for shared words: `buttons.*` (enquireNow, contactUs, readMore, …), `labels.*` (home, demo, demoPending, illustrativeImage, illustrativeStockPhoto, illustration, opensInNewTab, …) and `notFound.*`. Ask I18N-CORE or the lead before adding to `common`.
- Keep brand and exam names in Latin script (Aspire IIT & Medical, IIT JEE, NEET, JEE Main). Never translate a fact into a new claim (D-005/D-020).

## Typography for Hindi

- On `hi` pages, `font-sans` = Inter + Noto Sans Devanagari and `font-serif` = Source Serif 4 + Noto Serif Devanagari. Latin glyphs keep the English faces. See `src/app/fonts.ts` and the `:lang(hi)` rules in `globals.css`.
- `tracking-*` letter-spacing is reset on `hi` pages because it breaks Devanagari conjuncts. Give Latin text that must keep its tracking a `lang="en"` attribute.
- Devanagari needs vertical room. Avoid `leading-none` / `leading-tight` on Hindi body copy, and check that headings do not clip their matras.

## Portal and login

- The proxy sends signed-out portal visits to the login page of the same locale: `/hi/student` goes to `/hi/login?next=%2Fstudent`. `next` stays **locale-free** because `sanitizeNextPath` only accepts `/student|/parent|/admin…`. After sign-in, redirect to `localePath(next, locale)`.
- Portal pages get `X-Robots-Tag: noindex` in both locales. `robots.txt` disallows `/student`, `/parent`, `/admin` and `/login`, with and without `/hi`.

## Tests

- `next/root-params` is aliased in `vitest.config.ts` to `src/test/root-params-stub.ts`, so `lang()` resolves to `"en"` by default.
- Switch it with `setTestLang("hi")` (reset to `"en"` in `afterEach`) or `await withTestLang("hi", () => Page())`.
- Pages with params need `lang` in them: `params: Promise.resolve({ lang: "en", slug })`.
- Async server components cannot go through `createElement` with `renderToStaticMarkup`. Call them: `renderToStaticMarkup(await SiteFooter())`.
- Use `messagesFor(locale, ns)` from `@/i18n/messages` for expected strings.
