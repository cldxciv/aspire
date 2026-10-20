import { Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { mailtoHref, socialHref, telHref, whatsappHref } from "@/components/contact/contact-links";
import { DemoBadge } from "@/components/ui/Feedback";
import { Container } from "@/components/ui/Layout";
import { mainNav, portalNav, siteConfig } from "@/config/site";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getContactDetails, getInstituteProfile, isPlaceholder } from "@/lib/data";
import { Logo } from "./Logo";
import { SocialIcon } from "./SocialIcon";

/**
 * Footer per the approved design (reference/homepage/02): navy, logo + blurb,
 * site links, social icons, and a small row with legal, sitemap and portal links.
 * Contact details and social links are imported placeholders: their accessors
 * return null in production until Aspire verifies them (D-005/D-020), so both
 * blocks disappear there. No copyright year (no `new Date()` while rendering).
 * Strings come from the current locale's `common` messages; internal links go through `localePath` (D-028).
 */
export async function SiteFooter() {
  const locale = await getLocale();
  const [t, contact, profile] = await Promise.all([
    getMessages("common"),
    getContactDetails(locale),
    getInstituteProfile(locale),
  ]);
  const href = (path: string) => localePath(path, locale);

  const phone =
    contact?.phone ??
    (siteConfig.contact.phone ? { display: siteConfig.contact.phone, tel: siteConfig.contact.phone } : null);
  const email = contact?.email ?? siteConfig.contact.email;
  const whatsapp = contact?.whatsapp ?? null;
  // Each link is validated; an unusable value is shown as plain text rather than a broken link.
  const contactItems: ContactItem[] = [];
  if (phone) contactItems.push({ key: "phone", Icon: Phone, label: phone.display, href: telHref(phone.tel) });
  if (whatsapp) {
    contactItems.push({
      key: "whatsapp",
      Icon: MessageCircle,
      label: format(t.footer.whatsapp, { number: whatsapp.display }),
      href: whatsappHref(whatsapp),
      external: true,
    });
  }
  if (email) contactItems.push({ key: "email", Icon: Mail, label: email, href: mailtoHref(email) });

  // Only links that pass validation (https, no credentials, tracking parameters stripped).
  const socials = (profile?.socialLinks ?? []).flatMap((link) => {
    const href = socialHref(link.url);
    return href ? [{ ...link, href }] : [];
  });

  // Top-level pages plus dropdown children that are separate pages (e.g. Admissions), without anchors or duplicates.
  const siteLinks = mainNav.flatMap((item) => [
    { labelKey: item.labelKey, href: item.href },
    ...(item.children ?? []).filter((child) => child.href !== item.href && !/[?#]/.test(child.href)),
  ]);

  return (
    <footer data-surface="dark" className="bg-navy-deep text-[#dce8f7]">
      {/* pb-24: the last row (legal + login links) scrolls clear of the floating Rancho button (components/rancho). */}
      <Container className="pb-24 pt-10 md:pt-12 print:pb-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] lg:gap-10">
          <div>
            <Logo tone="dark" locale={locale} label={t.logo.homeLabel} />
            <p className="mt-3 max-w-xs text-sm text-[#b7c8db]">{t.footer.blurb}</p>
            {contactItems.length > 0 && (
              <ul className="mt-3 text-sm">
                {contactItems.map(({ key, Icon, label, href, external }) => (
                  <li key={key}>
                    {href ? (
                      <a
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex min-h-9 items-center gap-2 break-all rounded-md hover:text-gold hover:underline"
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {label}
                        {external && <span className="sr-only"> {t.labels.opensInNewTab}</span>}
                      </a>
                    ) : (
                      <span className="inline-flex min-h-9 items-center gap-2 break-all">
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {label}
                      </span>
                    )}
                  </li>
                ))}
                {contact && isPlaceholder(contact) && (
                  <li className="pt-1">
                    <DemoBadge label={t.footer.contactDemo} />
                  </li>
                )}
              </ul>
            )}
          </div>

          <nav aria-label={t.footer.navLabel} className="lg:pt-1">
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:gap-x-4 xl:grid-cols-4">
              {siteLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={href(link.href)}
                    className="inline-flex min-h-11 items-center rounded-md text-sm hover:text-gold hover:underline lg:min-h-9"
                  >
                    {t.nav.items[link.labelKey]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {socials.length > 0 && profile && (
            <div className="lg:pt-1">
              <p id="footer-social-heading" className="text-sm font-semibold text-white">
                {t.footer.followUs}
              </p>
              <ul aria-labelledby="footer-social-heading" className="-ml-2.5 mt-1 flex flex-wrap gap-1">
                {socials.map((link) => (
                  <li key={link.platform}>
                    <a
                      href={link.href}
                      rel="noopener noreferrer"
                      aria-label={format(t.footer.socialLink, { platform: link.label })}
                      className="grid size-11 place-items-center rounded-full text-white transition-colors hover:bg-white/10 hover:text-gold"
                    >
                      <SocialIcon platform={link.platform} className="size-5" />
                    </a>
                  </li>
                ))}
              </ul>
              {isPlaceholder(profile) && (
                <DemoBadge label={t.footer.socialDemo} className="mt-2" />
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/15 pt-4 text-xs text-[#b7c8db] sm:flex-row sm:items-center sm:justify-between">
          <p>© {siteConfig.name}</p>
          <nav aria-label={t.footer.legalNavLabel}>
            <ul className="-ml-2 flex flex-wrap sm:ml-0 sm:justify-end">
              <li>
                <Link href={href("/privacy")} className={smallLinkClasses}>
                  {t.footer.privacy}
                </Link>
              </li>
              <li>
                <Link href={href("/terms")} className={smallLinkClasses}>
                  {t.footer.terms}
                </Link>
              </li>
              <li>
                {/* XML file, not a page: plain anchor. */}
                <a href="/sitemap.xml" className={smallLinkClasses}>
                  {t.footer.sitemap}
                </a>
              </li>
              {portalNav.map((item) => (
                <li key={item.href}>
                  <Link href={href(item.href)} className={smallLinkClasses}>
                    {t.nav.items[item.labelKey]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}

type ContactItem = { key: string; Icon: LucideIcon; label: string; href: string | null; external?: boolean };

const smallLinkClasses =
  "inline-flex min-h-11 items-center rounded-md px-2 hover:text-gold hover:underline sm:min-h-8";
