import { ArrowRight } from "lucide-react";
import Image from "next/image";

import { ButtonLink } from "@/components/ui/Button";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";

import { RANCHO_ICON_SMALL } from "./rancho-icon";

/**
 * "The Rancho app" promo card (server-safe, no client JS): Rancho's app icon, what the app is and
 * a link to /rancho, the installable app home. Used on the /tools hub.
 */
export function RanchoAppCard({
  messages: t,
  href,
  className,
}: {
  messages: Messages<"ranchoApp">["toolsCard"];
  /** Localised /rancho. */
  href: string;
  className?: string;
}) {
  return (
    <div
      data-surface="dark"
      className={cn(
        "flex flex-col gap-5 rounded-card bg-linear-to-br from-navy to-navy-2 p-5 text-white sm:flex-row sm:items-center sm:p-6",
        className,
      )}
    >
      <Image
        src={RANCHO_ICON_SMALL}
        alt={t.iconLabel}
        width={80}
        height={80}
        unoptimized
        className="size-16 shrink-0 sm:size-20"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{t.eyebrow}</p>
        <h2 id="rancho-app-card" className="mt-1 text-[clamp(1.35rem,2.4vw,1.75rem)] font-extrabold leading-tight">
          {t.title}
        </h2>
        <p className="mt-2 max-w-2xl text-[#d3e1f3]">{t.body}</p>
      </div>
      <ButtonLink href={href} className="shrink-0 self-start sm:self-center">
        {t.cta}
        <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </div>
  );
}
