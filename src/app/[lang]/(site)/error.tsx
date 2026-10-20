"use client"; // Error boundaries must be Client Components.

import { House, RefreshCw } from "lucide-react";
import { Button, ButtonLink, Container } from "@/components/ui";
import { useLocale } from "@/i18n/client";
// Error boundaries only receive `error`/`retry`, so the strings come straight from the two small
// `common` catalogs (src/i18n/README.md, "Client Components").
import en from "@/i18n/messages/en/common";
import hi from "@/i18n/messages/hi/common";
import { localePath } from "@/i18n/paths";

const catalogs = { en, hi };

/**
 * Error boundary for public pages. Renders inside the (site) layout, so the header,
 * footer and <main> remain. Never shows error details (message, digest, stack) to users.
 */
export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  const locale = useLocale();
  const t = catalogs[locale];
  return (
    <Container className="max-w-xl py-16 text-center md:py-20">
      <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue">{t.errorPage.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold leading-snug tracking-tight text-navy">{t.errorPage.title}</h1>
      <p className="mt-3 text-muted">{t.errorPage.body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>
          <RefreshCw aria-hidden="true" className="size-4" /> {t.buttons.tryAgain}
        </Button>
        <ButtonLink href={localePath("/", locale)} variant="outline">
          <House aria-hidden="true" className="size-4" /> {t.buttons.goHome}
        </ButtonLink>
      </div>
    </Container>
  );
}
