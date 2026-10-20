"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RANCHO_MOTION_ONCE } from "@/components/ask/RanchoMediaPanel";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { openRancho, type RanchoOpenDetail } from "@/lib/ask/cards";
import { cn } from "@/lib/cn";

/**
 * "Ask Rancho about this" for the student tools (predictor, mock-test result, planner and the
 * homepage tools widget). Shared by all four; it lives here because of the tools track's file
 * ownership (a natural later home is src/components/rancho/).
 *
 * Progressive enhancement: it is a real link to /tools/ask, so before hydration (or without JS)
 * it simply opens the Ask page, with no context. After hydration a plain click hands the context
 * to the page's Rancho chat through `openRancho()` (a window CustomEvent; never a URL), which
 * opens the floating panel with the prompt prefilled; the visitor still presses Send. When the
 * page has no floating chat (no launcher, e.g. a route that hides it), the link navigates as usual,
 * and so it does when the launcher does not open (it was still hydrating, see below).
 */

/** The floating launcher (src/components/rancho/RanchoLauncher.tsx) marks itself with this attribute. */
export const RANCHO_LAUNCHER_SELECTOR = "[data-rancho-launcher]";

/** True when the page has the floating Rancho chat (its launcher is in the page). */
export function ranchoChatOnPage(doc: Pick<Document, "querySelector"> | null | undefined): boolean {
  return !!doc?.querySelector(RANCHO_LAUNCHER_SELECTOR);
}

/**
 * How long the launcher has to show its panel as open (`aria-expanded="true"`) after a hand-off
 * before the link is followed after all. React applies the launcher's state within the click
 * (a discrete event, flushed before any timer), so this only has to outlast that.
 */
export const RANCHO_OPEN_CHECK_MS = 150;

/** The launcher attributes the hand-off check reads. */
type LauncherLike = Pick<Element, "hasAttribute" | "getAttribute">;

/** The parts of a click this needs (a React or DOM `MouseEvent` fits). */
export interface ClickLike {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * Click handler of the link (exported for tests). A plain left click on a page with the floating
 * chat opens Rancho with `detail` and stops the navigation (returns true). Modified clicks (new
 * tab / window) and pages without the chat keep the normal link to /tools/ask (returns false).
 *
 * The launcher's HTML is server-rendered, but it listens for RANCHO_OPEN_EVENT only once its own
 * Suspense boundary has hydrated; on a slow phone this link can be clickable a moment earlier.
 * So when the launcher reports its panel (`aria-expanded`) and that is still closed shortly after
 * the hand-off, `followLink` runs (the link's normal navigation, without the context) instead of
 * the click doing nothing. An already open panel, or a launcher without `aria-expanded`, is
 * trusted as is.
 */
export function handleAskRanchoClick(
  event: ClickLike,
  detail: RanchoOpenDetail,
  doc: Pick<Document, "querySelector"> | null | undefined = typeof document === "undefined" ? null : document,
  followLink?: () => void,
): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const launcher: LauncherLike | null = doc?.querySelector(RANCHO_LAUNCHER_SELECTOR) ?? null;
  if (!launcher) return false;
  event.preventDefault();
  const follow = followLink && launcher.hasAttribute("aria-expanded") && launcher.getAttribute("aria-expanded") !== "true" ? followLink : null;
  openRancho(detail);
  if (follow) {
    setTimeout(() => {
      if (launcher.getAttribute("aria-expanded") !== "true") follow();
    }, RANCHO_OPEN_CHECK_MS);
  }
  return true;
}

export function AskRanchoLink({
  href,
  detail,
  children,
  // "light": a soft blue pill that reads as a secondary action on the tools' white cards.
  variant = "light",
  size = "md",
  mascot = true,
  className,
}: {
  /** The Ask page in the page's locale (`localePath("/tools/ask", locale)`): the no-JS / no-chat fallback. */
  href: string;
  /** Prompt to prefill and the short, non-sensitive tool context (summary already clamped). */
  detail: RanchoOpenDetail;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rancho's head before the label (decorative). Off where the mascot is already beside it. */
  mascot?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={(event) => handleAskRanchoClick(event, detail, document, () => window.location.assign(href))}
      className={buttonClasses({ variant, size, className })}
      data-ask-rancho=""
    >
      {mascot && (
        <span
          aria-hidden="true"
          className={cn(
            "-my-1 grid shrink-0 place-items-center rounded-full bg-white ring-1 ring-[#d3e2f5]",
            size === "sm" ? "size-6" : "size-7",
            RANCHO_MOTION_ONCE,
          )}
        >
          <RanchoMascot variant="head" className={size === "sm" ? "size-5" : "size-6"} />
        </span>
      )}
      {children}
    </Link>
  );
}
