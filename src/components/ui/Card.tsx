import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type CardTint = "none" | "blue" | "gold" | "green" | "violet";

const tints: Record<CardTint, string> = {
  none: "bg-white",
  blue: "bg-linear-to-br from-[#f1f7ff] to-white",
  gold: "bg-linear-to-br from-[#fff8e4] to-white",
  green: "bg-linear-to-br from-[#eefaf3] to-white",
  violet: "bg-linear-to-br from-[#f5f0ff] to-white",
};

/** Base card surface. Add `interactive` for cards that are wholly clickable (hover lift + focus ring via a child link). */
export function Card({
  tint = "none",
  interactive = false,
  className,
  ...props
}: ComponentProps<"div"> & { tint?: CardTint; interactive?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-line shadow-soft",
        tints[tint],
        interactive && "transition hover:-translate-y-0.5 hover:shadow-card motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}
