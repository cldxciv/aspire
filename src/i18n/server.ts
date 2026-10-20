import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "./config";
import { messagesFor, type Messages, type Namespace } from "./messages";
import { alternatesFor } from "./metadata";

/**
 * Server-side locale access (D-028). Works in any Server Component, layout, page,
 * `generateMetadata` or server utility rendered under `src/app/[lang]/` — the locale comes
 * from the `[lang]` root param via `next/root-params`, so nothing is prop-drilled.
 * Not available in Client Components, Server Actions or Route Handlers (Next restriction).
 */

/** The current route's locale. An unsupported `[lang]` value is a 404. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return value;
}

/** One namespace of messages in the current locale: `const t = await getMessages("common")`. */
export async function getMessages<N extends Namespace>(namespace: N): Promise<Messages<N>> {
  return messagesFor(await getLocale(), namespace);
}

/**
 * `alternates` for a page's metadata in the current locale: canonical + hreflang
 * (`en-IN`, `hi-IN`, `x-default`). Pass the locale-free path:
 * `alternates: await localeAlternates("/about")`.
 */
export async function localeAlternates(path: string): Promise<NonNullable<Metadata["alternates"]>> {
  return alternatesFor(path, await getLocale());
}
