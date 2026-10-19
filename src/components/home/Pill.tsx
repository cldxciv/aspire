import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Mockup `.pill`: rounded informational tag (not a status colour). */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[#eaf2ff] px-2.5 py-1 text-[11px] font-bold text-[#245a98]",
        className,
      )}
    >
      {children}
    </span>
  );
}
