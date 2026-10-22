"use client";

import { RichText } from "@/components/qb/RichText";
import { cn } from "@/lib/cn";
import type { QbFigureRef } from "@/lib/qb/types";

/**
 * Live preview of question text through QB-CORE-A's `<RichText>` (escaped text, KaTeX for
 * `\(…\)` / `\[…\]` only, mhchem, pipe tables, `[[figure:N]]` = the N-th figure of the field's
 * slot). Staff mode: figures come from the staff route, drafts included.
 */
export function RichPreview({
  text,
  lang,
  emptyLabel,
  figures,
  slot = "stem",
  className,
}: {
  text: string;
  lang: "en" | "hi";
  emptyLabel: string;
  figures?: readonly QbFigureRef[];
  slot?: QbFigureRef["slot"];
  className?: string;
}) {
  return (
    <div lang={lang} className={cn("min-h-11 rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] px-3 py-2 text-[15px] leading-relaxed text-ink", className)}>
      {text.trim() ? <RichText text={text} locale={lang} figures={figures} slot={slot} staff /> : <span className="text-sm text-muted">{emptyLabel}</span>}
    </div>
  );
}
