"use client";

import { MonitorDown } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { Messages } from "@/i18n/messages/types";

import { shouldShowDesktopInstallCard } from "./install-platform";
import { promptInstall, useHandheld, useInstallState, useStandalone } from "./install-store";
import { RANCHO_ICON_SMALL } from "./rancho-icon";

/**
 * Desktop install card on /rancho. Desktops never get the site-wide bar, so this is where Chrome /
 * Edge visitors can install Rancho as a desktop app. It shows only when the browser handed us its
 * install prompt (shared with the bar through ./install-store, one listener site-wide), and never
 * on phones/tablets (the bar covers those) or inside the installed app. Renders nothing on the
 * server.
 */
export function RanchoInstallCard({ messages: t }: { messages: Messages<"ranchoApp">["install"]["card"] }) {
  const { canPrompt, installed } = useInstallState();
  const handheld = useHandheld();
  const standalone = useStandalone();
  const [busy, setBusy] = useState(false);

  if (!shouldShowDesktopInstallCard({ handheld, standalone, installed, canPrompt })) return null;

  async function install() {
    setBusy(true);
    await promptInstall();
    setBusy(false);
  }

  return (
    <section aria-labelledby="rancho-install-card" className="rounded-card border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <Image src={RANCHO_ICON_SMALL} alt="" width={48} height={48} unoptimized className="size-12 shrink-0" />
        <div className="min-w-0">
          <h2 id="rancho-install-card" className="text-lg font-extrabold leading-snug text-navy">
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.body}</p>
        </div>
      </div>
      <Button onClick={install} disabled={busy} className="mt-4 w-full">
        <MonitorDown aria-hidden="true" className="size-4" />
        {t.install}
      </Button>
    </section>
  );
}
