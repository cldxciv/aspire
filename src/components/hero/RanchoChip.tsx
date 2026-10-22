import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { cn } from "@/lib/cn";

/**
 * A · "Stuck on a doubt? Ask Rancho →" chip in the collage's corner: a link to the Rancho page
 * with Rancho's face (the snow-leopard mascot, decorative). The link's name is its visible text.
 * Server-safe.
 */
export function RanchoChip({
  href,
  title,
  action,
  className,
}: {
  href: string;
  /** e.g. "Stuck on a doubt?" */
  title: string;
  /** e.g. "Ask Rancho" */
  action: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center gap-3 rounded-2xl border border-white/20 bg-navy-2 px-4 py-3 text-sm text-white",
        "shadow-[0_18px_36px_-20px_rgb(0_0_0/0.6)] transition hover:border-white/50",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gold-soft">
        <RanchoMascot variant="head" className="size-9" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{title}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-gold">
          {action}
          <ArrowRight aria-hidden="true" className="size-4" />
        </span>
      </span>
    </Link>
  );
}
