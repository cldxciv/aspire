import Link from "next/link";
import { Container } from "@/components/ui/Layout";
import { DemoBadge } from "@/components/ui/Feedback";
import { footerNav, siteConfig } from "@/config/site";
import { getContactDetails, isPlaceholder } from "@/lib/data";
import { Logo } from "./Logo";

export async function SiteFooter() {
  // Imported contact details are placeholders: null in production until verified (D-020).
  const contact = await getContactDetails();
  const phone = contact?.phone ?? (siteConfig.contact.phone ? { display: siteConfig.contact.phone, tel: siteConfig.contact.phone.replace(/\s/g, "") } : null);
  const email = contact?.email ?? siteConfig.contact.email;
  const whatsapp = contact?.whatsapp;
  return (
    <footer className="bg-navy-deep pb-5 pt-10 text-[#dce8f7]">
      <Container>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Logo tone="dark" />
            <p className="mt-3 max-w-xs text-sm text-[#b7c8db]">
              Helping students move forward with clarity, effort and guidance.
            </p>
            {(phone || email) && (
              <ul className="mt-3 space-y-1 text-sm">
                {phone && (
                  <li>
                    <a href={`tel:${phone.tel}`} className="inline-flex min-h-9 items-center hover:underline">
                      {phone.display}
                    </a>
                  </li>
                )}
                {whatsapp && (
                  <li>
                    <a
                      href={whatsapp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center hover:underline"
                    >
                      WhatsApp {whatsapp.display}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                )}
                {email && (
                  <li>
                    <a href={`mailto:${email}`} className="inline-flex min-h-9 items-center break-all hover:underline">
                      {email}
                    </a>
                  </li>
                )}
                {contact && isPlaceholder(contact) && (
                  <li className="pt-1">
                    <DemoBadge label="Demo · contact details pending verification" />
                  </li>
                )}
              </ul>
            )}
          </div>
          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="mb-3 text-sm font-bold text-white">{group.title}</h2>
              <ul className="lg:space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 items-center text-sm text-[#d2deed] hover:text-white hover:underline lg:min-h-0 lg:py-1"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-8 flex flex-col justify-between gap-3 border-t border-[#28435f] pt-4 text-xs text-[#aabbd0] sm:flex-row">
          <span>© {siteConfig.name}</span>
          <span className="flex gap-3">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <a href="/sitemap.xml" className="hover:underline">
              Sitemap
            </a>
          </span>
        </div>
      </Container>
    </footer>
  );
}
