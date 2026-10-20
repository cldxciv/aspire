import type { Metadata } from "next";
import { Logo } from "@/components/layout/Logo";
import { ButtonLink, Container } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import { inter, sourceSerif } from "./fonts";
import "./globals.css";

/**
 * URLs that match no route (D-028; `experimental.globalNotFound` in next.config.ts). The root
 * layout lives under `[lang]`, so this page renders outside it and cannot know the visitor's
 * locale: it shows English and Hindi side by side. notFound() inside pages still uses the
 * localized `[lang]/not-found.tsx` and `[lang]/(site)/not-found.tsx`.
 */
const en = messagesFor("en", "common");
const hi = messagesFor("hi", "common");

export const metadata: Metadata = {
  title: `${en.notFound.metaTitle} · ${hi.notFound.metaTitle} | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en-IN" className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-white px-4 py-2 font-bold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {en.skipLink}
        </a>
        <header data-surface="dark" className="bg-navy text-white">
          <Container className="flex h-16 items-center md:h-[72px]">
            <Logo tone="dark" />
          </Container>
        </header>
        <main id="main" className="flex-1 py-16 md:py-20">
          <Container className="grid max-w-3xl gap-10 text-center md:grid-cols-2 md:gap-8">
            <NotFoundBlock lang="en-IN" messages={en} homeHref="/" contactHref="/contact" />
            <NotFoundBlock lang="hi-IN" messages={hi} homeHref="/hi" contactHref="/hi/contact" />
          </Container>
        </main>
      </body>
    </html>
  );
}

function NotFoundBlock({
  lang,
  messages,
  homeHref,
  contactHref,
}: {
  lang: string;
  messages: typeof en;
  homeHref: string;
  contactHref: string;
}) {
  const Heading = lang === "en-IN" ? "h1" : "h2";
  return (
    <section lang={lang}>
      <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue">{messages.notFound.eyebrow}</p>
      <Heading className="mt-2 text-2xl font-extrabold text-navy">{messages.notFound.title}</Heading>
      <p className="mt-3 text-muted">{messages.notFound.body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href={homeHref}>{messages.notFound.home}</ButtonLink>
        <ButtonLink href={contactHref} variant="outline">
          {messages.notFound.contact}
        </ButtonLink>
      </div>
    </section>
  );
}
