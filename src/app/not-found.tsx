import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export const metadata: Metadata = { title: "Page not found" };

/** Unmatched URLs — renders inside the root layout only, so it supplies the site chrome itself. */
export default function NotFound() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-white px-4 py-2 font-bold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </>
  );
}
