"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Container } from "@/components/ui/Layout";
import { useLocale } from "@/i18n/client";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";

import {
  DISMISS_DAYS,
  INSTALL_BAR_ID,
  INSTALLED_DAYS,
  installActionFor,
  shouldShowInstallBar,
  type DeviceInfo,
  type InstallAction,
} from "./install-platform";
import {
  currentDevice,
  hasCoarsePointer,
  isStandaloneDisplay,
  promptInstall,
  readInstallMemory,
  rememberInstallChoice,
  useInstallState,
} from "./install-store";
import { InstallSheet, type SheetAction } from "./InstallSheet";
import { RANCHO_ICON_SMALL } from "./rancho-icon";

/** The bar waits this long (or for the first scroll) so it never competes with the page's first paint. */
export const INSTALL_BAR_DELAY_MS = 3000;

interface Env {
  device: DeviceInfo;
  coarsePointer: boolean;
  viewportWidth: number;
  standalone: boolean;
  hiddenUntil: number | null;
  now: number;
}

function readEnv(): Env {
  return {
    device: currentDevice(),
    coarsePointer: hasCoarsePointer(),
    viewportWidth: window.innerWidth,
    standalone: isStandaloneDisplay(),
    hiddenUntil: readInstallMemory(),
    now: Date.now(),
  };
}

function isSheetAction(action: InstallAction): action is SheetAction {
  return action.kind === "ios" || action.kind === "menu" || action.kind === "in-app";
}

/**
 * "Get the Rancho app" — a slim, dismissible bar that hangs under the nav of the sticky site header
 * (mounted once by SiteHeader). It is absolutely positioned over the top of the page rather than
 * inserted into the flow, so showing or hiding it never shifts the layout (no CLS); it stays clear
 * of the floating Rancho button at the bottom. Phones and tablets only (rules in
 * ./install-platform), never in the installed app, and not on sign-in pages or during a mock test
 * attempt. It appears after ~3 s or the first scroll and never takes focus.
 *
 * Install: the browser's own dialog when Chrome / Edge / Samsung Internet offered one; otherwise
 * an instruction sheet (iOS Share steps, the browser's menu, or "open in Chrome/Safari" for
 * Instagram / Facebook / … in-app browsers). × hides it for 7 days on this device.
 */
export function InstallBar({ messages: t }: { messages: Messages<"ranchoApp">["install"] }) {
  const pathname = usePathname();
  const locale = useLocale();
  const { canPrompt, installed } = useInstallState();
  const [env, setEnv] = useState<Env | null>(null);
  const [closed, setClosed] = useState(false);
  const [sheet, setSheet] = useState<SheetAction | null>(null);
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    let armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      window.clearTimeout(timer);
      window.removeEventListener("scroll", arm);
      setEnv(readEnv());
    };
    const timer = window.setTimeout(arm, INSTALL_BAR_DELAY_MS);
    window.addEventListener("scroll", arm, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", arm);
    };
  }, []);

  if (!env || closed) return null;
  const action = installActionFor(env.device, canPrompt);
  const visible = shouldShowInstallBar({ ...env, installed, pathname, action });
  if (!visible) return null;

  function hide(days: number) {
    rememberInstallChoice(days);
    setSheet(null);
    setClosed(true);
  }

  async function onInstall() {
    if (action.kind === "prompt") {
      const outcome = await promptInstall();
      if (outcome === "accepted") return hide(INSTALLED_DAYS);
      if (outcome === "dismissed") return hide(DISMISS_DAYS);
      // The prompt was already used up: explain the browser's menu instead.
      const fallback = env ? installActionFor(env.device, false) : null;
      if (fallback && isSheetAction(fallback)) openSheet(fallback);
      return;
    }
    if (isSheetAction(action)) openSheet(action);
  }

  function openSheet(next: SheetAction) {
    setAppUrl(`${window.location.origin}${localePath("/rancho", locale)}`);
    setSheet(next);
  }

  return (
    <section
      id={INSTALL_BAR_ID}
      aria-label={t.bar.label}
      className="absolute inset-x-0 top-full border-t border-white/10 bg-navy-deep shadow-[0_4px_18px_rgb(3_16_32/0.18)] transition-[opacity,translate] duration-300 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none print:hidden"
    >
      <Container className="flex min-h-14 items-center gap-3 py-1.5">
        <Image src={RANCHO_ICON_SMALL} alt="" width={36} height={36} unoptimized className="size-9 shrink-0" />
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-bold text-white">{t.bar.title}</span>
          <span className="line-clamp-2 text-[13px] text-[#c9d8ea]">{t.bar.value}</span>
        </p>
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex min-h-11 shrink-0 items-center rounded-control bg-gold px-4 text-sm font-bold text-ink transition-colors hover:bg-gold-2"
        >
          {t.bar.install}
        </button>
        <button
          type="button"
          onClick={() => hide(DISMISS_DAYS)}
          aria-label={t.bar.dismiss}
          title={t.bar.dismiss}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-[#c9d8ea] transition-colors hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </Container>
      <InstallSheet action={sheet} messages={t.sheet} appUrl={appUrl} onClose={() => setSheet(null)} />
    </section>
  );
}
