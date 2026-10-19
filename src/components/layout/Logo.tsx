import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Text logo recreated from the mockup. PLACEHOLDER until Aspire supplies
 * official brand files (docs/content-verification.md).
 */
export function Logo({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 font-black", className)} aria-label="Aspire IIT & Medical — home">
      <span
        aria-hidden="true"
        className="grid size-9 -rotate-12 place-items-center rounded-[12px_12px_12px_3px] border-[3px] border-gold-2 border-r-blue text-lg text-blue"
      >
        A
      </span>
      <span className={cn("leading-none tracking-wide", dark ? "text-white" : "text-navy")}>
        ASPIRE
        <small className={cn("block text-[10px] font-extrabold tracking-[0.15em]", dark ? "text-[#c2d3e6]" : "text-muted")}>
          IIT &amp; MEDICAL
        </small>
      </span>
    </Link>
  );
}
