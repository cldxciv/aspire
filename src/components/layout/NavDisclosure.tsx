"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { NavItem } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { isActiveSection, isCurrentPage } from "./nav-utils";

/**
 * Desktop dropdown for a main-nav item with `children`, built as a disclosure
 * (button + `aria-expanded` / `aria-controls` + a panel of ordinary links), not
 * an ARIA menu. Opens on click/tap only (no hover), so it works on touch.
 *
 * Closes on: Escape (focus returns to the button), focus moving outside the
 * button + panel, a pointer press outside, or following one of its links.
 *
 * `pathname` is locale-free (active states); hrefs are localized for `locale`.
 */
export function NavDisclosure({
  item,
  pathname,
  locale,
  messages,
}: {
  item: NavItem;
  pathname: string | null;
  locale: Locale;
  messages: Messages<"common">["nav"];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const children = item.children ?? [];
  const sectionActive = isActiveSection(pathname, item);

  // Pointer presses outside close the panel (covers touch, where tapping plain content doesn't move focus).
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
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  // Keyboard focus leaving the button + panel closes it. A null relatedTarget (click on
  // non-focusable content, window blur) is left to the pointer handler above.
  function onBlur(event: FocusEvent<HTMLLIElement>) {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
  }

  return (
    <li ref={rootRef} className="relative" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(navLinkClasses(sectionActive), "gap-1")}
      >
        {messages.items[item.labelKey]}
        {sectionActive && <span className="sr-only"> {messages.currentSection}</span>}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        data-surface="light"
        className="absolute left-1/2 top-full z-10 mt-3.5 w-72 -translate-x-1/2 rounded-card border border-line bg-white p-2 text-ink shadow-card"
      >
        <ul className="flex flex-col gap-0.5">
          {children.map((child) => {
            const current = isCurrentPage(pathname, child.href);
            return (
              <li key={child.href}>
                <Link
                  href={localePath(child.href, locale)}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 flex-col justify-center rounded-control px-3 py-2 hover:bg-surface",
                    current && "bg-blue-soft",
                  )}
                >
                  <span className="text-sm font-semibold text-navy">{messages.items[child.labelKey]}</span>
                  {child.descriptionKey && (
                    <span className="mt-0.5 text-xs text-muted">{messages.descriptions[child.descriptionKey]}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

/** Shared look for top-level desktop nav links and disclosure buttons on the navy bar. */
export function navLinkClasses(active: boolean) {
  return cn(
    // px-2 at xl (narrowest desktop bar, which also holds the language switcher), px-2.5 from 2xl.
    "relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors 2xl:px-2.5",
    "after:absolute after:inset-x-2 after:-bottom-1 after:h-[3px] after:rounded-full 2xl:after:inset-x-2.5",
    active ? "text-gold after:bg-gold" : "text-white hover:text-gold",
  );
}
