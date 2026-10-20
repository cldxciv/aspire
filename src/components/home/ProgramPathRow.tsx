import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { EXAM_META } from "@/components/programs/exam-meta";
import { Card, DemoBadge, type CardTint } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Program } from "@/lib/types";
import { TRACK_META } from "./track-meta";

/** Icon tile colours matching each card tint (icons are decorative). */
const ICON_TILE: Record<CardTint, string> = {
  none: "bg-surface text-navy",
  blue: "bg-[#dcebff] text-[#0b4fa8]",
  gold: "bg-[#ffefc2] text-[#7a5600]",
  green: "bg-[#d9f2e4] text-[#11683f]",
  violet: "bg-[#ebe3ff] text-[#5532b8]",
};

/** Row-level focus ring, shown when the stretched title link has keyboard focus. */
const rowFocus =
  "has-[.row-link:focus-visible]:outline-3 has-[.row-link:focus-visible]:outline-offset-2 has-[.row-link:focus-visible]:outline-blue";

/**
 * One tinted program row (plan §4.4): track icon, the program's own title and class
 * level as stated in the data, an arrow, and a link to /programs/[slug] stretched over
 * the row. Placeholder programs carry a DEMO badge.
 */
export function ProgramPathRow({
  program,
  locale,
  demoLabel,
}: {
  program: Program;
  locale: Locale;
  /** Localised DEMO label (common.labels.demo). */
  demoLabel: string;
}) {
  const { tint } = TRACK_META[program.exam];
  const { Icon } = EXAM_META[program.exam];
  const classLevel = program.classLevel?.trim();
  const placeholder = program.status === "placeholder";

  return (
    <Card tint={tint} interactive className={cn("relative flex items-center gap-4 p-3.5 sm:p-4", rowFocus)}>
      <span aria-hidden="true" className={cn("grid size-12 shrink-0 place-items-center rounded-control", ICON_TILE[tint])}>
        <Icon className="size-6" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="break-words font-serif text-[1.05rem] font-semibold leading-snug text-navy">
          <Link
            href={localePath(`/programs/${program.slug}`, locale)}
            className="row-link after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden"
          >
            {program.title}
          </Link>
        </h3>
        {(classLevel || placeholder) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {classLevel && <span>{classLevel}</span>}
            {placeholder && <DemoBadge label={demoLabel} />}
          </p>
        )}
      </div>
      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-navy" />
    </Card>
  );
}
