import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { portalAreas } from "@/components/portal/areas";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { QbDifficulty, QbFlag, QbSourceKind, QbStatus } from "@/lib/qb/types";
import type { QbMessages } from "./api";
import { isBlockingFlag } from "./format";

/**
 * Presentational blocks of the question-bank admin (no hooks, server- and client-safe). Status,
 * difficulty and flags are always written out (never colour alone).
 */

const admin = portalAreas.admin;

/** Page title row: the area eyebrow, the page's only `<h1>`, an optional badge and actions. */
export function QbPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        <p className={cn("mb-1.5 text-xs font-extrabold uppercase tracking-[0.14em]", admin.eyebrow)}>{eyebrow}</p>
        <h1 className="break-words text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-snug tracking-tight text-navy">{title}</h1>
        {description && <div className="mt-1.5 text-muted">{description}</div>}
      </div>
      {(badge || actions) && (
        <div className="flex shrink-0 flex-wrap items-start gap-2 sm:justify-end">
          {badge && (
            <Badge variant="demo" className="self-start">
              {badge}
            </Badge>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

/** A titled white panel (`<section>` labelled by its `<h2>`). */
export function QbPanel({
  id,
  title,
  description,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("rounded-card border border-line bg-white p-4 shadow-soft md:p-5", className)}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={id} className="text-lg font-extrabold text-navy">
            {title}
          </h2>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

const statusStyles: Record<QbStatus | "suspended", string> = {
  draft: "bg-[#f1f3f6] text-[#4a5568]",
  in_review: "bg-blue-soft text-[#0755b5]",
  approved: "bg-success-soft text-[#14744d]",
  rejected: "bg-[#fdecec] text-[#a61b1b]",
  retired: "bg-[#f1f3f6] text-[#4a5568] line-through",
  suspended: "bg-gold-soft text-[#7a5600]",
};

export function StatusBadge({ status, t }: { status: QbStatus | "suspended"; t: QbMessages }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold", statusStyles[status])}>{t.statuses[status]}</span>;
}

const difficultyStyles: Record<QbDifficulty, string> = {
  easy: "border-[#bfe5cf] text-[#0f5a3c]",
  medium: "border-[#f2dfa0] text-[#7a5600]",
  hard: "border-[#e7b4b4] text-[#a61b1b]",
};

export function DifficultyBadge({ difficulty, t, prefix }: { difficulty: QbDifficulty | null; t: QbMessages; prefix?: string }) {
  if (!difficulty) return <span className="text-xs text-muted">{prefix ? `${prefix}: ` : ""}—</span>;
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-md border bg-white px-1.5 py-0.5 text-xs font-semibold", difficultyStyles[difficulty])}>
      {prefix ? `${prefix}: ` : ""}
      {t.difficulties[difficulty]}
    </span>
  );
}

/** Source kind; samples are always visibly labelled "Sample". */
export function SourceKindBadge({ kind, t }: { kind: QbSourceKind; t: QbMessages }) {
  if (kind === "sample") {
    return (
      <Badge variant="demo" className="whitespace-nowrap">
        {t.common.sampleBadge}
      </Badge>
    );
  }
  return (
    <span className="inline-flex whitespace-nowrap rounded-md border border-line bg-white px-2 py-0.5 text-xs font-semibold text-[#354b66]">
      {kind === "official" ? t.common.officialBadge : t.common.aspireBadge}
    </span>
  );
}

export function FlagChip({ flag, t }: { flag: QbFlag; t: QbMessages }) {
  const blocking = isBlockingFlag(flag);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        blocking ? "bg-[#fdecec] text-[#a61b1b]" : "bg-gold-soft text-[#6b4c00]",
      )}
      title={blocking ? t.blocking : undefined}
    >
      {blocking && <Lock aria-hidden="true" className="size-3" />}
      {t.flags[flag]}
      {blocking && <span className="sr-only"> ({t.blocking})</span>}
    </span>
  );
}

/** "Ask an admin" / "not for your role" panel. */
export function QbNotAllowed({ title, body, homeHref, homeLabel }: { title: string; body: string; homeHref: string; homeLabel: string }) {
  return (
    <div role="note" className="rounded-card border border-line bg-white p-6 shadow-soft">
      <p className="flex items-center gap-2 font-bold text-navy">
        <Lock aria-hidden="true" className="size-4" />
        {title}
      </p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <Link href={homeHref} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
        {homeLabel}
      </Link>
    </div>
  );
}
