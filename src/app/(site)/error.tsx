"use client"; // Error boundaries must be Client Components.

import { House, RefreshCw } from "lucide-react";
import { Button, ButtonLink, Container } from "@/components/ui";

/**
 * Error boundary for public pages. Renders inside the (site) layout, so the header,
 * footer and <main> remain. Never shows error details (message, digest, stack) to users.
 */
export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <Container className="max-w-xl py-16 text-center md:py-20">
      <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">We couldn&apos;t load this page</h1>
      <p className="mt-3 text-muted">
        This is usually temporary. Please try again — if it keeps happening, come back a little later.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>
          <RefreshCw aria-hidden="true" className="size-4" /> Try again
        </Button>
        <ButtonLink href="/" variant="outline">
          <House aria-hidden="true" className="size-4" /> Go to home
        </ButtonLink>
      </div>
    </Container>
  );
}
