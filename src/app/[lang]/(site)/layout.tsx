import { AttributionCapture } from "@/components/forms/AttributionCapture";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipLink } from "@/components/layout/SkipLink";

/** Public-site shell: skip link, header, main landmark, footer. Portal routes use their own (portal) layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      {/* Remembers the visit's landing campaign tags / referrer for enquiry attribution (sessionStorage only, D-039). */}
      <AttributionCapture />
      <SiteHeader />
      {/* Soft backdrop the section panels float on; spacing comes from SECTION_PANEL / HERO_PANEL (components/ui/Layout). */}
      <main id="main" className="flex-1 bg-gap pb-3 sm:pb-5 lg:pb-7">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
