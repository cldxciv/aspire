"use client";

import { usePathname } from "next/navigation";
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";

import { useLocale } from "@/i18n/client";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";

import { RanchoMascot } from "./RanchoMascot";
import { isRanchoHiddenPath } from "./rancho-chat";
import { listenForRanchoOpen, type RanchoHandoff } from "./rancho-handoff";

// The chat panel (and the answer renderer it uses) only downloads when the student first opens it.
const loadPanel = () => import("./RanchoChatPanel");
const RanchoChatPanel = lazy(() => loadPanel().then((module) => ({ default: module.RanchoChatPanel })));

const TEXT_ENTRY =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, select, [contenteditable="true"]';

/** A text field / select outside the Rancho panel has focus (an on-screen keyboard may be up). */
function isTypingOutsidePanel(active: Element | null): boolean {
  return active instanceof HTMLElement && active.matches(TEXT_ENTRY) && !active.closest("dialog");
}

/** Part of a page form (not the panel) lies under the button. */
function isOverForm(button: HTMLElement): boolean {
  const r = button.getBoundingClientRect();
  const points: Array<[number, number]> = [
    [r.left + 4, r.top + 4],
    [r.right - 4, r.top + 4],
    [r.left + 4, r.bottom - 4],
    [r.right - 4, r.bottom - 4],
    [r.left + r.width / 2, r.top + r.height / 2],
  ];
  return points.some(([x, y]) =>
    document.elementsFromPoint(x, y).some((element) => !button.contains(element) && element.closest("form") && !element.closest("dialog")),
  );
}

/**
 * Floating "Ask Rancho" button, bottom-right on every public page (mounted by RanchoDock in the
 * (site) layout). 56px round, clear of the iOS home indicator / notch (safe-area insets), above page
 * content (z-30) but below the sticky header and its menu (z-40) and full-screen overlays. Hidden
 * on the Rancho pages (/tools/ask, /rancho), during a mock test attempt and in print.
 *
 * It also answers "Ask Rancho about this" from the student tools (`openRancho()` →
 * `RANCHO_OPEN_EVENT`, rancho-handoff.ts): the panel opens with the prompt prefilled and the tool's
 * context attached to the next question.
 */
export function RanchoLauncher({ messages: t, gateMessages }: { messages: Messages<"rancho">; gateMessages: Messages<"leadGate"> }) {
  const pathname = usePathname();
  const locale = useLocale();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const [stepAside, setStepAside] = useState(false);
  const [handoff, setHandoff] = useState<RanchoHandoff | null>(null);

  // Navigating (a link in the panel, back/forward) closes the panel; the conversation stays.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const links = useMemo(
    () => ({
      ask: localePath("/tools/ask", locale),
      enquiry: localePath("/admissions#enquiry", locale),
      privacy: localePath("/privacy", locale),
      signIn: localePath("/login", locale),
    }),
    [locale],
  );

  const hidden = isRanchoHiddenPath(pathname);

  // "Ask Rancho about this" from a tool on this page: open the panel with that context. (Where the
  // launcher is hidden, the page's own Rancho chat listens instead.)
  useEffect(() => {
    if (hidden) return;
    return listenForRanchoOpen((next) => {
      setHandoff(next);
      setLoaded(true);
      setOpen(true);
    });
  }, [hidden]);

  // Step aside (fade out, out of the tab order) while a form is underneath the button, e.g. the
  // home hero enquiry form on phones, and while typing in a form on touch screens, where the
  // on-screen keyboard would push the button over the field. Not while the panel is open.
  useEffect(() => {
    if (hidden || open) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const button = buttonRef.current;
      if (!button) return;
      const typing = isTypingOutsidePanel(document.activeElement) && window.matchMedia("(pointer: coarse)").matches;
      setStepAside(typing || isOverForm(button));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [hidden, open, pathname]);

  if (hidden) return null;

  const prefetch = () => void loadPanel().catch(() => undefined);
  const tucked = stepAside && !open;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={loaded ? panelId : undefined}
        title={t.launcher.hint}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onClick={() => {
          setLoaded(true);
          setOpen((value) => !value);
        }}
        data-rancho-launcher=""
        data-tucked={tucked ? "true" : undefined}
        className={
          "group fixed z-30 flex items-center gap-2 rounded-full bg-navy p-1 text-white print:hidden " +
          (tucked ? "invisible translate-y-3 opacity-0 " : "visible opacity-100 ") +
          "bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] " +
          "shadow-[0_10px_28px_-6px_rgb(11_45_91/0.55)] ring-2 ring-gold transition-[translate,opacity,visibility,background-color] duration-200 hover:-translate-y-0.5 hover:bg-navy-2 " +
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:pr-4 " +
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_6px_#1768d4]"
        }
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white">
          <RanchoMascot className="size-10" />
        </span>
        <span className="sr-only text-sm font-bold whitespace-nowrap sm:not-sr-only">{t.launcher.label}</span>
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <RanchoChatPanel
            id={panelId}
            open={open}
            onClose={() => setOpen(false)}
            returnFocusRef={buttonRef}
            messages={t.panel}
            gateMessages={gateMessages}
            locale={locale}
            links={links}
            handoff={handoff}
          />
        </Suspense>
      )}
    </>
  );
}
