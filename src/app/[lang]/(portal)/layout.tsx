import type { Metadata } from "next";
import { SkipLink } from "@/components/layout/SkipLink";

export const metadata: Metadata = {
  // Portal pages are never indexed; the proxy also sends X-Robots-Tag.
  robots: { index: false, follow: false },
};

/**
 * Portal route group. NOT under the (site) layout: no public header/footer.
 * Provides the skip link; each area layout (student / parent / admin) renders
 * <PortalShell>, which supplies the top bar, preview banner, sidebar and the
 * `<main id="main">` landmark the skip link targets.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      {children}
    </>
  );
}
