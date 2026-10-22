import { Check } from "lucide-react";
import { DemoBadge } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import { HeroAction } from "./HeroAction";
import type { HeroLink } from "./NextBatchCard";
import type { PickerProgram } from "./program-picker-data";

/**
 * D · the white program card beside the picker (and the aside of a program page's hero): track
 * eyebrow, title, the record's short description, up to three of its own highlights and up to two
 * calls to action. Placeholder records carry the DEMO badge. `data-surface="light"`. Server-safe
 * and hook-free, so the `ProgramPicker` island renders it too.
 */
export function HeroProgramCard({
  program,
  action,
  secondary,
  demoLabel,
  id,
  className,
}: {
  program: Pick<PickerProgram, "eyebrow" | "title" | "summary" | "highlights" | "placeholder">;
  /** e.g. { label: "See the full program", href: program.href } — omit on the program's own page. */
  action?: HeroLink;
  secondary?: HeroLink;
  /** `common.labels.demo`. */
  demoLabel: string;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      data-surface="light"
      className={cn("rounded-[20px] bg-white p-5 text-ink shadow-[0_28px_56px_-28px_rgb(0_0_0/0.65)] sm:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {program.eyebrow && <p className="m-0 text-xs font-bold tracking-[0.12em] text-blue uppercase">{program.eyebrow}</p>}
        {program.placeholder && <DemoBadge label={demoLabel} />}
      </div>
      <p className="m-0 mt-1.5 font-serif text-[1.5rem] leading-tight font-bold text-balance break-words text-navy sm:text-[1.75rem]">
        {program.title}
      </p>
      {program.summary && <p className="m-0 mt-2.5 text-[15px] leading-relaxed text-[#334155]">{program.summary}</p>}
      {program.highlights.length > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0 text-sm">
          {program.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-px grid size-5.5 shrink-0 place-items-center rounded-full bg-gold-soft text-[#6b4e00]">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 break-words">{highlight}</span>
            </li>
          ))}
        </ul>
      )}
      {(action || secondary) && (
        // Side by side only when both labels fit on one line; otherwise each takes a full row.
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:[&>*]:flex-auto sm:[&>*]:text-center">
          {action && (
            <HeroAction href={action.href} variant="dark">
              {action.label}
            </HeroAction>
          )}
          {secondary && (
            <HeroAction href={secondary.href} variant="outline">
              {secondary.label}
            </HeroAction>
          )}
        </div>
      )}
    </div>
  );
}
