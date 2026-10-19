import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/roles";
import { portalAreas } from "./areas";
import { PortalNav, PortalNavLinks } from "./PortalNav";

/**
 * Portal chrome shared by the student, parent and admin areas: slim top bar
 * (logo, role badge, back link), persistent preview banner, sidebar navigation
 * and the page's `<main>` landmark. The skip link that targets `#main` lives in
 * `src/app/(portal)/layout.tsx`.
 *
 * Static and data-free, so it prerenders into the static shell. Access checks
 * happen per page inside `<PortalGate>`.
 */
export function PortalShell({ area, children }: { area: Role; children: ReactNode }) {
  const config = portalAreas[area];
  const AreaIcon = config.icon;
  return (
    <div className="flex flex-1 flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div aria-hidden="true" className={cn("h-1", config.strip)} />
        <Container className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
          <Logo className="shrink-0" />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide",
              config.badge,
            )}
          >
            <AreaIcon aria-hidden="true" className="size-3.5" />
            {config.label}
          </span>
          <Link
            href="/"
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-bold text-navy hover:text-blue hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to website
          </Link>
        </Container>
      </header>

      <div role="note" className="border-b border-[#f2dfa0] bg-gold-soft text-[#5c4a12]">
        <Container className="flex items-start gap-2 py-2 text-xs sm:items-center sm:text-sm">
          <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
          <p>
            <strong>Preview</strong> — no real accounts or records are connected.
          </p>
        </Container>
      </div>

      <Container className="grid flex-1 grid-cols-1 content-start gap-4 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 md:py-8">
        <div className="min-w-0 md:sticky md:top-4 md:self-start">
          <Suspense fallback={<PortalNavLinks area={area} pathname={null} />}>
            <PortalNav area={area} />
          </Suspense>
        </div>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </Container>
    </div>
  );
}
