import { MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { portalNav, siteConfig } from "@/config/site";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getContactDetails } from "@/lib/data";
import { Logo } from "./Logo";
import { DesktopNavLinks, MainNav } from "./MainNav";

export async function SiteHeader() {
  const preview = showPlaceholderContent();
  // Imported contact details are placeholders: getContactDetails() returns null in production until verified.
  const contact = await getContactDetails();
  const verifiedPhone = siteConfig.contact.phone;
  const phone = contact?.phone ?? (verifiedPhone ? { display: verifiedPhone, tel: verifiedPhone.replace(/\s/g, "") } : null);

  return (
    <>
      {preview && (
        <p className="bg-gold-soft px-4 py-1.5 text-center text-xs text-[#5c4a12]">
          <strong>Preview build.</strong> Items marked DEMO are placeholders awaiting verification by Aspire.
        </p>
      )}

      <div className="bg-navy text-xs text-[#eaf2ff]">
        <Container className="flex flex-wrap items-center justify-between gap-x-4 py-0.5">
          <span className="hidden sm:inline">{siteConfig.tagline}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5" /> {siteConfig.region}
            </span>
            {phone && (
              <a href={`tel:${phone.tel}`} className="inline-flex min-h-9 items-center gap-1 hover:underline">
                <Phone aria-hidden="true" className="size-3.5" /> {phone.display}
              </a>
            )}
          </span>
          <nav aria-label="Portal and admissions links" className="flex items-center gap-1">
            {portalNav.map((item) => (
              <Link key={item.href} href={item.href} className="inline-flex min-h-9 items-center px-1.5 hover:underline">
                {item.label}
              </Link>
            ))}
            <Link href="/admissions" className="inline-flex min-h-9 items-center px-1.5 hover:underline">
              Admissions
            </Link>
          </nav>
        </Container>
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-white shadow-[0_3px_12px_rgb(9_40_75/0.04)]">
        <nav aria-label="Main" className="relative">
          <Container className="flex items-center gap-6 py-3">
            <Logo className="shrink-0" />
            {/* usePathname may suspend during prerender; fall back to links without active state. */}
            <Suspense fallback={<DesktopNavLinks pathname={null} />}>
              <MainNav />
            </Suspense>
            <div className="hidden items-center gap-3 lg:flex">
              <Link href="/login" className="text-[13px] font-extrabold text-blue hover:underline">
                Login
              </Link>
              <ButtonLink href="/admissions#enquiry" size="sm">
                Enquire Now
              </ButtonLink>
            </div>
          </Container>
        </nav>
      </header>
    </>
  );
}
