import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LocaleProvider } from "@/i18n/client";
import { htmlLang, locales, ogLocale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { showPlaceholderContent } from "@/lib/content-mode";
import { inter, notoSansDevanagari, notoSerifDevanagari, sourceSerif } from "../fonts";
import "../globals.css";

/**
 * Root layout for both locales (D-028). `[lang]` is the root param: `en` (served at
 * unprefixed URLs via the proxy rewrite) or `hi` (`/hi/...`). Any other value is a 404.
 */
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getMessages("common");
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: t.meta.defaultTitle,
      template: `%s | ${siteConfig.name}`,
    },
    description: t.meta.description,
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: ogLocale[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
    },
    // Builds that show placeholder content must never be indexed.
    robots: showPlaceholderContent() ? { index: false, follow: false } : undefined,
    // No `alternates` here: canonical/hreflang are per page (`localeAlternates(path)` from
    // @/i18n/server); a layout-level value would be inherited by every page and point at the wrong URL.
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const fontVariables = [inter.variable, sourceSerif.variable];
  // Devanagari faces only for Hindi; globals.css wires them in under :lang(hi).
  if (locale === "hi") fontVariables.push(notoSansDevanagari.variable, notoSerifDevanagari.variable);

  return (
    <html lang={htmlLang[locale]} className={`${fontVariables.join(" ")} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
