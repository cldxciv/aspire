"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { mainNav, portalNav } from "@/config/site";
import { cn } from "@/lib/cn";

function isActive(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** Desktop link list. Also used (without a pathname) as the Suspense fallback in SiteHeader. */
export function DesktopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="hidden flex-1 items-center gap-5 text-[13px] font-semibold lg:flex">
      {mainNav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("py-2 hover:text-blue", active && "text-blue")}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Primary navigation: desktop links + accessible mobile disclosure menu (below lg). */
export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  // Escape works from the toggle or anywhere in the panel, and returns focus to the toggle.
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      toggleRef.current?.focus();
    }
  }

  return (
    <>
      <DesktopNavLinks pathname={pathname} />
      <button
        ref={toggleRef}
        type="button"
        className="ml-auto grid size-11 place-items-center rounded-control border border-line bg-white text-navy lg:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
      >
        {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-white shadow-card lg:hidden"
        onKeyDown={handleKeyDown}
      >
        <ul className="mx-auto flex max-w-content flex-col px-4 py-3 sm:px-5">
          {[...mainNav, ...portalNav].map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-control px-2 font-semibold hover:bg-surface",
                    active && "text-blue",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="pt-2">
            <Link href="/admissions#enquiry" onClick={close} className={buttonClasses({ className: "w-full" })}>
              Enquire Now
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}
