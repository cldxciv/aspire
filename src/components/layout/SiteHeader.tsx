import { Suspense } from "react";
import { InstallBar } from "@/components/pwa/InstallBar";
import { Container } from "@/components/ui/Layout";
import { getLocale, getMessages } from "@/i18n/server";
import { showPlaceholderContent } from "@/lib/content-mode";
import { Logo } from "./Logo";
import { HeaderNav, MainNav, type HeaderMessages } from "./MainNav";

/**
 * Site header per the approved design (reference/homepage/01, D-022): one sticky
 * navy bar (72px from md, 64px below) — logo, main nav with Programs/Resources
 * disclosures from xl, Enquire Now, language switcher, login icon, hamburger below xl.
 * Gold focus rings come from `data-surface="dark"` (D-024). Strings come from the
 * `common` messages of the current locale (D-028).
 *
 * Preview builds get a slim, non-sticky banner above the bar.
 *
 * Phones and tablets also get the slim "Get the Rancho app" install bar hanging under the nav
 * (components/pwa/InstallBar; it renders nothing on desktop or once installed). It is positioned
 * over the page, not in flow, so it never shifts the layout and the header keeps its height. The
 * nav row is its own positioned layer above the bar, so the mobile menu and dropdowns still open
 * right under the nav and cover the bar.
 */
export async function SiteHeader() {
  const [locale, t, ranchoApp] = await Promise.all([getLocale(), getMessages("common"), getMessages("ranchoApp")]);
  const preview = showPlaceholderContent();
  const navMessages: HeaderMessages = { nav: t.nav, languageSwitcher: t.languageSwitcher };

  return (
    <>
      {preview && (
        <p
          role="note"
          className="h-6 overflow-hidden text-ellipsis whitespace-nowrap bg-gold-soft px-4 text-center text-[11px] leading-6 text-[#5c4a12] sm:text-xs sm:leading-6"
        >
          <span className="sm:hidden">
            <strong>{t.previewBanner.shortTitle}</strong> · {t.previewBanner.shortDetail}
          </span>
          <span className="hidden sm:inline">
            <strong>{t.previewBanner.longTitle}</strong> · {t.previewBanner.longDetail}
          </span>
        </p>
      )}

      <header
        data-surface="dark"
        className="sticky top-0 z-40 bg-navy text-white shadow-[0_4px_18px_rgb(3_16_32/0.18)]"
      >
        <div className="relative z-10">
          <Container className="flex h-16 items-center gap-3 md:h-[72px] xl:gap-5">
            <Logo tone="dark" locale={locale} label={t.logo.homeLabel} className="shrink-0" />
            {/* usePathname may suspend while prerendering routes with unknown params: same layout, no active state. */}
            <Suspense fallback={<HeaderNav pathname={null} locale={locale} messages={navMessages} />}>
              <MainNav locale={locale} messages={navMessages} />
            </Suspense>
          </Container>
        </div>
        {/* Client-only, appears after ~3 s / first scroll, absolutely positioned under the nav; nothing in the prerendered HTML. */}
        <Suspense fallback={null}>
          <InstallBar messages={ranchoApp.install} />
        </Suspense>
      </header>
    </>
  );
}
