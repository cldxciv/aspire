"use client";

import Link from "next/link";
import { htmlLang, localeNames, locales, type Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

/**
 * English | हिन्दी switcher (D-028). Keeps the current page: `path` is the locale-free
 * pathname (null while the pathname is unknown, e.g. a Suspense fallback → home of the
 * other language). Query strings and hashes are not carried over.
 *
 * A labelled group of links: the current language is plain text with `aria-current`,
 * the other is a link with `lang` / `hrefLang` so screen readers pronounce it correctly.
 */
export function LanguageSwitcher({
  path,
  locale,
  label,
  tone = "bar",
  className,
  onNavigate,
}: {
  path: string | null;
  locale: Locale;
  /** Accessible name of the group, from `common.languageSwitcher.label`. */
  label: string;
  /** "bar": compact pill in the navy header; "panel": larger targets in the mobile menu. */
  tone?: "bar" | "panel";
  className?: string;
  onNavigate?: () => void;
}) {
  const item = tone === "bar" ? "min-h-9 px-2" : "min-h-11 px-3";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-white/30 p-0.5 font-semibold leading-none",
        tone === "bar" ? "text-[13px]" : "text-[15px]",
        className,
      )}
    >
      {locales.map((option) =>
        option === locale ? (
          <span
            key={option}
            lang={htmlLang[option]}
            aria-current="true"
            className={cn("inline-flex items-center rounded-full bg-white/15 text-gold", item)}
          >
            {localeNames[option]}
          </span>
        ) : (
          <Link
            key={option}
            href={localePath(path ?? "/", option)}
            hrefLang={htmlLang[option]}
            lang={htmlLang[option]}
            prefetch={false}
            onClick={onNavigate}
            className={cn(
              "inline-flex items-center rounded-full text-white transition-colors hover:bg-white/10 hover:text-gold",
              item,
            )}
          >
            {localeNames[option]}
          </Link>
        ),
      )}
    </div>
  );
}
