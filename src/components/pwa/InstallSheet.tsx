"use client";

import { Check, Copy, ExternalLink, Share, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";

import { chromeIntentUrl, type InstallAction } from "./install-platform";
import { RANCHO_ICON_SMALL } from "./rancho-icon";

export type SheetAction = Extract<InstallAction, { kind: "ios" | "menu" | "in-app" }>;
export type InstallSheetMessages = Messages<"ranchoApp">["install"]["sheet"];

/**
 * How to install Rancho where the browser can't show its own install dialog: a native modal
 * `<dialog>` (focus moves in and back, Esc and the backdrop close it) that sits at the bottom of
 * the screen on phones, like the iOS share sheet it points to, and centred from `sm`.
 *
 * - `ios`: Share → Add to Home Screen → Add.
 * - `menu`: the browser's menu steps (Chrome, Edge, Samsung Internet, Firefox, Opera, other).
 * - `in-app`: "Open in Chrome or Safari" — Android gets an intent link that opens Chrome; both get
 *   Copy link (the Rancho app home in the current language).
 */
export function InstallSheet({
  action,
  messages: t,
  appUrl,
  onClose,
}: {
  action: SheetAction | null;
  messages: InstallSheetMessages;
  /** Absolute URL of /rancho in the current language (for Copy link / Open in Chrome). */
  appUrl: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = action !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-surface="light"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-0 mb-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border-0 bg-white p-0 text-ink shadow-card backdrop:bg-navy/60 sm:m-auto sm:w-[min(calc(100vw-2rem),28rem)] sm:rounded-card"
    >
      {action && (
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex items-start gap-3">
            <Image src={RANCHO_ICON_SMALL} alt="" width={44} height={44} unoptimized className="size-11 shrink-0" />
            <h2 id={titleId} className="min-w-0 flex-1 pt-1 text-lg font-extrabold leading-snug text-navy">
              {action.kind === "ios" ? t.ios.title : action.kind === "menu" ? t.menu.title : t.inApp.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-navy"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          {action.kind === "ios" && <IosSteps browser={action.browser} t={t.ios} />}
          {action.kind === "menu" && (
            <ol className="mt-4 grid gap-3 text-[15px]">
              <Step n={1}>{t.menu[action.browser]}</Step>
              <Step n={2}>{t.menu.confirm}</Step>
            </ol>
          )}
          {action.kind === "in-app" && <InAppHelp action={action} t={t.inApp} appUrl={appUrl} />}

          <button type="button" onClick={onClose} className={buttonClasses({ variant: "light", className: "mt-5 w-full" })}>
            {t.close}
          </button>
        </div>
      )}
    </dialog>
  );
}

function Step({ n, icon, children }: { n: number; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-soft text-sm font-bold text-blue">
        {n}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">{children}</span>
      {icon && (
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-navy">
          {icon}
        </span>
      )}
    </li>
  );
}

function IosSteps({ browser, t }: { browser: Extract<SheetAction, { kind: "ios" }>["browser"]; t: InstallSheetMessages["ios"] }) {
  return (
    <>
      <ol className="mt-4 grid gap-3 text-[15px]">
        <Step n={1} icon={<Share className="size-4.5" />}>
          {browser === "safari" ? t.stepShareSafari : t.stepShareOther}
        </Step>
        <Step n={2} icon={<SquarePlus className="size-4.5" />}>
          {t.stepAdd}
        </Step>
        <Step n={3}>{t.stepConfirm}</Step>
      </ol>
      {browser !== "safari" && <p className="mt-3 text-sm text-muted">{t.notListed}</p>}
    </>
  );
}

function InAppHelp({
  action,
  t,
  appUrl,
}: {
  action: Extract<SheetAction, { kind: "in-app" }>;
  t: InstallSheetMessages["inApp"];
  appUrl: string;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const intent = action.os === "android" ? chromeIntentUrl(appUrl) : null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="mt-3 text-[15px]">
      <p className="text-muted">{format(t.body, { app: t.apps[action.app] })}</p>
      <p className="mt-3">{action.os === "ios" ? t.iosMenu : t.androidMenu}</p>
      {intent && (
        <a href={intent} className={buttonClasses({ variant: "primary", className: "mt-4 w-full" })}>
          <ExternalLink aria-hidden="true" className="size-4" />
          {t.openChrome}
        </a>
      )}
      <button type="button" onClick={copyLink} className={buttonClasses({ variant: "dark", className: "mt-4 w-full" })}>
        {copy === "copied" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
        {t.copy}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm text-muted">
        {copy === "copied" ? t.copied : copy === "failed" ? t.copyFailed : ""}
      </p>
      {copy === "failed" && (
        <p className="mt-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm text-navy select-all">{appUrl}</p>
      )}
    </div>
  );
}
