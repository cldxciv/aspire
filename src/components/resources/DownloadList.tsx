import { ChevronDown, Clock } from "lucide-react";
import { Badge, buttonClasses, Card, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import { getDownloadCategoryLabel } from "@/lib/data";
import type { DownloadItem } from "@/lib/types";

/**
 * Downloads (planners, papers, prospectus) as cards with their title, description and
 * size. None of the files exist in this project yet, so every card shows a static
 * "Available soon" label — never a link or button, so there are no dead downloads.
 * (DownloadItem has no file URL; once one is added, `available` items can link to it.)
 * Server-only (category labels come from the data layer).
 *
 * With `initialCount` + `more`, only the first cards show; the rest sit in a native
 * <details> disclosure ("Show all {count} downloads"), so a long list does not bury the page.
 */
export function DownloadList({
  downloads,
  locale,
  labels,
  demoLabel,
  columns = 3,
  initialCount,
  more,
  className,
}: {
  downloads: DownloadItem[];
  locale: Locale;
  labels: Messages<"resources">["downloadCard"];
  /** DEMO badge label (localised) when the list is placeholder data; omitted for verified content. */
  demoLabel?: string;
  /** Cards per row on wide screens: 3 from `lg`, or "3md" (three from `md`, for a 3-card preview). */
  columns?: 1 | 2 | 3 | "3md";
  /** Show this many cards, the rest behind a disclosure (needs `more`). */
  initialCount?: number;
  /** Disclosure labels: "Show all {count} downloads" / "Show fewer downloads". */
  more?: { showAll: string; showFewer: string };
  className?: string;
}) {
  // While two columns show, an odd last card spans both (no orphan beside an empty cell).
  const gridClass = cn(
    "grid gap-4",
    columns !== 1 && "sm:grid-cols-2",
    columns === 2 && "sm:[&>li:last-child:nth-child(odd)]:col-span-2",
    columns === 3 && "lg:grid-cols-3 sm:max-lg:[&>li:last-child:nth-child(odd)]:col-span-2",
    columns === "3md" && "md:grid-cols-3 sm:max-md:[&>li:last-child:nth-child(odd)]:col-span-2",
  );
  const collapse = initialCount !== undefined && more !== undefined && downloads.length > initialCount;
  const card = (item: DownloadItem) => {
    const meta = [
      { label: labels.subjects, value: item.subjects },
      { label: labels.audience, value: item.audience },
      { label: labels.pages, value: item.pages !== undefined ? String(item.pages) : undefined },
      { label: labels.size, value: item.size },
    ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

    return (
      <li key={item.id}>
        <Card className="flex h-full flex-col p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">{getDownloadCategoryLabel(item.category, locale)}</Badge>
            {demoLabel && <DemoBadge label={demoLabel} />}
          </div>
          <h3 className="mt-3 font-extrabold leading-snug text-navy">{item.title}</h3>
          {item.description && <p className="mt-1 text-sm text-muted">{item.description}</p>}
          {meta.length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {meta.map((entry) => (
                <div key={entry.label} className="contents">
                  <dt className="font-bold text-muted">{entry.label}</dt>
                  <dd className="text-navy">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-auto pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-muted">
              <Clock aria-hidden="true" className="size-3.5" />
              {labels.availableSoon}
            </span>
          </p>
        </Card>
      </li>
    );
  };

  if (!collapse) return <ul className={cn(gridClass, className)}>{downloads.map(card)}</ul>;

  return (
    <div className={className}>
      <ul className={gridClass}>{downloads.slice(0, initialCount).map(card)}</ul>
      <details className="group mt-5">
        <summary
          className={buttonClasses({
            variant: "outline",
            className: "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          })}
        >
          <span className="group-open:hidden">{format(more.showAll, { count: downloads.length })}</span>
          <span className="hidden group-open:inline">{more.showFewer}</span>
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <ul className={cn(gridClass, "mt-5")}>{downloads.slice(initialCount).map(card)}</ul>
      </details>
    </div>
  );
}
