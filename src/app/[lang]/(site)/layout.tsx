import type { Metadata } from "next";
import { AttributionCapture } from "@/components/forms/AttributionCapture";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipLink } from "@/components/layout/SkipLink";
import { EarlyInstallCapture } from "@/components/pwa/EarlyInstallCapture";
import { RanchoDock } from "@/components/rancho/RanchoDock";

/**
 * Home-screen icon and name for iPhone / iPad (Safari's "Add to Home Screen" reads these, not the
 * manifest icons): the Rancho app icon (/api/rancho/icon, full navy square at 180 px) and "Rancho".
 * The web app manifest itself (src/app/manifest.ts) is linked on every page by Next.
 */
export const metadata: Metadata = {
  icons: { apple: [{ url: "/api/rancho/icon?size=180", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "Rancho", statusBarStyle: "default" },
};

/** Public-site shell: skip link, header, main landmark, footer. Portal routes use their own (portal) layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Inline script that catches Chrome's install prompt before any bundle runs (components/pwa). */}
      <EarlyInstallCapture />
      <SkipLink />
      {/* Remembers the visit's landing campaign tags / referrer for enquiry attribution (sessionStorage only, D-039). */}
      <AttributionCapture />
      <SiteHeader />
      {/* Soft backdrop the section panels float on; spacing comes from SECTION_PANEL / HERO_PANEL (components/ui/Layout). */}
      <main id="main" className="flex-1 bg-gap pb-3 sm:pb-5 lg:pb-7">
        {children}
      </main>
      <SiteFooter />
      {/* Floating "Ask Rancho" button + lazy chat panel (hidden on /tools/ask; components/rancho). */}
      <RanchoDock />
    </>
  );
}
