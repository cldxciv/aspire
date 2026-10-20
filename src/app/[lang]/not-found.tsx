import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipLink } from "@/components/layout/SkipLink";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("common");
  return { title: t.notFound.metaTitle };
}

/**
 * notFound() thrown outside the (site) layout (e.g. portal pages) — renders inside the root
 * layout only, so it supplies the site chrome itself. URLs that match no route at all are
 * handled by src/app/global-not-found.tsx.
 */
export default function NotFound() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </>
  );
}
