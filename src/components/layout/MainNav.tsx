"use client";

import { ArrowRight, LogIn, Menu, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { mainNav, portalNav } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath, stripLocale } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NavDisclosure, navLinkClasses } from "./NavDisclosure";
import { ariaCurrentFor, isActiveSection, isCurrentPage } from "./nav-utils";

/** Hero enquiry form anchor on the homepage (owned by HomeHero / HeroEnquiryForm). */
const HOME_ENQUIRY_ANCHOR = "#home-enquiry";
const ENQUIRY_PAGE_HREF = "/admissions#enquiry";

/** The `common` messages the header's client components need (passed as props from SiteHeader). */
export type HeaderMessages = Pick<Messages<"common">, "nav" | "languageSwitcher">;

type HeaderNavProps = {
  /** Raw `usePathname()` value (`/about`, `/en/about` or `/hi/about`), or null when unknown. */
  pathname: string | null;
  locale: Locale;
  messages: HeaderMessages;
};

/** Reads the pathname for active states. Wrap in <Suspense> with `<HeaderNav pathname={null} … />` as the fallback. */
export function MainNav({ locale, messages }: Omit<HeaderNavProps, "pathname">) {
  const pathname = usePathname();
  return <HeaderNav pathname={pathname} locale={locale} messages={messages} />;
}

/**
 * Everything in the navy bar after the logo: desktop links + dropdowns (xl+),
 * Enquire Now, the language switcher (sm+), the login icon and the mobile menu (below xl).
 * `pathname={null}` renders the same layout without active states (Suspense fallback), so
 * there is no layout shift. Config hrefs are locale-free; every link goes through `localePath`.
 */
export function HeaderNav({ pathname, locale, messages }: HeaderNavProps) {
  // Active states compare locale-free paths: "/hi/about" and "/en/about" both become "/about".
  const path = pathname === null ? null : stripLocale(pathname);
  const t = messages.nav;
  const onLogin = isCurrentPage(path, "/login");
  return (
    <>
      <nav aria-label={t.mainLabel} className="hidden min-w-0 flex-1 justify-center xl:flex">
        <ul className="flex items-center gap-0.5 2xl:gap-1.5">
          {mainNav.map((item) =>
            item.children?.length ? (
              <NavDisclosure key={item.href} item={item} pathname={path} locale={locale} messages={t} />
            ) : (
              <li key={item.href}>
                <Link
                  href={localePath(item.href, locale)}
                  aria-current={ariaCurrentFor(path, item.href)}
                  className={navLinkClasses(isActiveSection(path, item))}
                >
                  {t.items[item.labelKey]}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Wrapper carries the breakpoint: `hidden` would compete with the button's own `inline-flex`. */}
        <div className="hidden sm:block">
          <EnquireLink path={path} locale={locale} label={t.enquireNow} />
        </div>
        {/* Same wrapper trick: below sm the switcher lives in the mobile menu only (bar width at 320px). */}
        <div className="hidden sm:block">
          <LanguageSwitcher path={path} locale={locale} label={messages.languageSwitcher.label} />
        </div>
        <Link
          href={localePath("/login", locale)}
          aria-label={t.loginLabel}
          aria-current={onLogin ? "page" : undefined}
          className={cn(
            "grid size-11 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-gold",
            onLogin ? "text-gold" : "text-white",
          )}
        >
          <UserRound aria-hidden="true" className="size-[22px]" />
        </Link>
        <MobileNav path={path} locale={locale} messages={messages} />
      </div>
    </>
  );
}

/** Gold CTA: the hero form on the homepage, the admissions enquiry form elsewhere. */
function EnquireLink({
  path,
  locale,
  label,
  className,
  onNavigate,
}: {
  path: string | null;
  locale: Locale;
  label: string;
  className?: string;
  onNavigate?: () => void;
}) {
  const classes = buttonClasses({ className: cn("whitespace-nowrap", className) });
  const content = (
    <>
      {label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </>
  );
  // Same-page anchor on the homepage: a plain <a> lets the browser scroll and move the focus start point.
  return path === "/" ? (
    <a href={HOME_ENQUIRY_ANCHOR} className={classes} onClick={onNavigate}>
      {content}
    </a>
  ) : (
    <Link href={localePath(ENQUIRY_PAGE_HREF, locale)} className={classes} onClick={onNavigate}>
      {content}
    </Link>
  );
}

/**
 * Below xl: hamburger toggle + full-width panel with every link (dropdown children
 * as nested lists), the portal logins, the language switcher and Enquire Now. Escape (from
 * the toggle or panel) closes it and returns focus to the toggle; focus or a pointer press
 * moving outside closes it too, so focus is never hidden behind the open panel.
 */
function MobileNav({ path, locale, messages }: { path: string | null; locale: Locale; messages: HeaderMessages }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const portalHeadingId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const t = messages.nav;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      toggleRef.current?.focus();
    }
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) close();
  }

  return (
    <nav ref={rootRef} aria-label={t.mainLabel} className="xl:hidden" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={toggleRef}
        type="button"
        className="grid size-11 place-items-center rounded-control border border-white/30 text-white transition-colors hover:bg-white/10"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t.closeMenu : t.openMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 bg-navy shadow-[0_18px_32px_rgb(3_16_32/0.35)] md:max-h-[calc(100dvh-4.5rem)]"
      >
        <div className="mx-auto w-full max-w-content px-4 pb-6 pt-2 sm:px-5">
          <ul className="md:columns-2 md:gap-10">
            {mainNav.map((item) => {
              const current = ariaCurrentFor(path, item.href);
              const subItems = (item.children ?? []).filter((child) => child.href !== item.href);
              return (
                <li key={item.href} className="break-inside-avoid border-b border-white/10">
                  <Link
                    href={localePath(item.href, locale)}
                    onClick={close}
                    aria-current={current}
                    className={cn(
                      "flex min-h-12 items-center rounded-md px-2 text-base font-semibold hover:text-gold",
                      current ? "text-gold" : "text-white",
                    )}
                  >
                    {t.items[item.labelKey]}
                  </Link>
                  {subItems.length > 0 && (
                    <ul className="mb-2 ml-2 border-l border-white/20 pl-3">
                      {subItems.map((child) => {
                        const childCurrent = isCurrentPage(path, child.href);
                        return (
                          <li key={child.href}>
                            <Link
                              href={localePath(child.href, locale)}
                              onClick={close}
                              aria-current={childCurrent ? "page" : undefined}
                              className={cn(
                                "flex min-h-11 items-center rounded-md px-2 text-[15px] hover:text-gold",
                                childCurrent ? "text-gold" : "text-[#d6e2f1]",
                              )}
                            >
                              {t.items[child.labelKey]}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p id={portalHeadingId} className="mt-5 px-2 text-xs font-bold uppercase tracking-[0.14em] text-[#b7c8db]">
            {t.portalLogin}
          </p>
          <ul aria-labelledby={portalHeadingId} className="mt-1 flex flex-wrap gap-x-4">
            {portalNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={localePath(item.href, locale)}
                  onClick={close}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[15px] font-semibold text-white hover:text-gold"
                >
                  <LogIn aria-hidden="true" className="size-4" />
                  {t.items[item.labelKey]}
                </Link>
              </li>
            ))}
          </ul>

          <LanguageSwitcher
            path={path}
            locale={locale}
            label={messages.languageSwitcher.label}
            tone="panel"
            onNavigate={close}
            className="mt-5"
          />

          <EnquireLink path={path} locale={locale} label={t.enquireNow} onNavigate={close} className="mt-5 w-full" />
        </div>
      </div>
    </nav>
  );
}
