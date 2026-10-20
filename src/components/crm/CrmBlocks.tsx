import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { portalAreas } from "@/components/portal/areas";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  dueStatus,
  formatDate,
  formatDateTime,
  isoOrUndefined,
  maskPhone,
  sourceLabel,
  stageLabel,
  toolLabel,
  type CrmMessages,
} from "./format";
import type { LeadStage } from "./types";

/**
 * Presentational building blocks of the staff CRM (server-safe: no hooks). All copy comes in
 * as props from the `crm` messages of the page's locale.
 */

const staff = portalAreas.staff;

/** Page title row: area eyebrow, the page's only `<h1>`, optional badge and actions. */
export function CrmPageHeader({
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className={cn("mb-1.5 text-xs font-extrabold uppercase tracking-[0.14em]", staff.eyebrow)}>{eyebrow}</p>
        <h1 className="break-words text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-snug tracking-tight text-navy">
          {title}
        </h1>
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

const stageStyles: Record<LeadStage, string> = {
  new: "bg-blue-soft text-[#0755b5]",
  contacted: "bg-[#e6f4fb] text-[#0b5f86]",
  counselling_booked: "bg-[#f3eeff] text-[#5b3cc4]",
  visited_or_demo: "bg-[#f3eeff] text-[#5b3cc4]",
  applied: "bg-gold-soft text-[#7a5600]",
  test_taken: "bg-gold-soft text-[#7a5600]",
  offer: "bg-[#fff3d2] text-[#8b5b00]",
  enrolled: "bg-success-soft text-[#14744d]",
  lost: "bg-[#f1f3f6] text-[#4a5568]",
};

/** Stage as text (never colour alone). */
export function StageBadge({ stage, t, className }: { stage: LeadStage; t: CrmMessages; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold",
        stageStyles[stage] ?? "bg-surface text-muted",
        className,
      )}
    >
      {stageLabel(t, stage)}
    </span>
  );
}

/** Source badge plus, for tool leads, the tool. */
export function SourceBadges({ source, tool, t }: { source: string; tool: string | null; t: CrmMessages }) {
  const toolName = toolLabel(t, tool);
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className="inline-flex whitespace-nowrap rounded-md border border-line bg-white px-2 py-0.5 text-xs font-semibold text-[#354b66]">
        {sourceLabel(t, source)}
      </span>
      {toolName && (
        <span className="inline-flex whitespace-nowrap rounded-md bg-[#f3eeff] px-2 py-0.5 text-xs font-semibold text-[#5b3cc4]">
          {toolName}
        </span>
      )}
    </span>
  );
}

/** Masked phone: digits hidden except the last four; screen readers hear "Phone ending 1234". */
export function MaskedPhone({ last4, t }: { last4: string | null; t: CrmMessages }) {
  if (!last4) return <span className="text-muted">{t.common.none}</span>;
  return (
    <span className="whitespace-nowrap font-mono text-sm" lang="en">
      <span aria-hidden="true">{maskPhone(last4)}</span>
      <span className="sr-only">{format(t.common.phoneEnding, { last4 })}</span>
    </span>
  );
}

/** Due date with an "Overdue" / "Due today" label (text, not colour alone). */
export function DueLabel({
  dueAt,
  now,
  locale,
  t,
  empty,
}: {
  dueAt: string | null;
  now: number;
  locale: Locale;
  t: CrmMessages;
  empty?: string;
}) {
  const status = dueStatus(dueAt, now);
  if (!dueAt || !status) return <span className="text-muted">{empty ?? t.common.none}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <time dateTime={isoOrUndefined(dueAt)} className="whitespace-nowrap">
        {status === "upcoming" ? formatDate(dueAt, locale) : formatDateTime(dueAt, locale)}
      </time>
      {status === "overdue" && <Badge variant="warning" className="normal-case tracking-normal">{t.common.overdue}</Badge>}
      {status === "today" && <Badge variant="info" className="normal-case tracking-normal">{t.common.dueToday}</Badge>}
    </span>
  );
}

export function RelativeTime({ value, locale }: { value: string | null; locale: Locale }) {
  if (!value) return null;
  return (
    <time dateTime={isoOrUndefined(value)}>{formatDateTime(value, locale)}</time>
  );
}

/** Previous / next links that keep the current filters. Hrefs are passed in already localised. */
export function Pagination({
  page,
  pages,
  prevHref,
  nextHref,
  t,
}: {
  page: number;
  pages: number;
  prevHref: string | null;
  nextHref: string | null;
  t: CrmMessages;
}) {
  if (pages <= 1) return null;
  const link = "inline-flex min-h-11 items-center gap-1 rounded-control border border-line bg-white px-3 text-sm font-bold text-navy hover:border-blue";
  const disabled = "inline-flex min-h-11 items-center gap-1 rounded-control border border-line bg-[#f4f7fb] px-3 text-sm font-bold text-[#8a99ad]";
  return (
    <nav aria-label={t.common.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {prevHref ? (
        <Link href={prevHref} className={link} rel="prev">
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t.common.previous}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t.common.previous}
        </span>
      )}
      <p className="text-sm font-semibold text-muted">{format(t.common.pageOf, { page, pages })}</p>
      {nextHref ? (
        <Link href={nextHref} className={link} rel="next">
          {t.common.next}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          {t.common.next}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      )}
    </nav>
  );
}

/** Shown instead of a page the viewer's CRM role may not open. */
export function NotAllowed({ title, body, homeHref, homeLabel }: { title: string; body: string; homeHref: string; homeLabel: string }) {
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

export function crmHref(path: string, locale: Locale): string {
  return localePath(path, locale);
}
