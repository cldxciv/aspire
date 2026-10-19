import { Clock } from "lucide-react";
import { Badge, Card, DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DownloadItem } from "@/lib/types";

/**
 * Downloads (planners, papers, prospectus) as cards with their title, description and
 * size. None of the files exist in this project yet, so every card shows a static
 * "Available soon" label — never a link or button, so there are no dead downloads.
 * (DownloadItem has no file URL; once one is added, `available` items can link to it.)
 */
export function DownloadList({
  downloads,
  demo,
  columns = 3,
  className,
}: {
  downloads: DownloadItem[];
  /** The list is placeholder data: show a DEMO badge on every card. */
  demo: boolean;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", className)}>
      {downloads.map((item) => {
        const meta = [
          { label: "Subjects", value: item.subjects },
          { label: "For", value: item.audience },
          { label: "Pages", value: item.pages !== undefined ? String(item.pages) : undefined },
          { label: "Size", value: item.size },
        ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

        return (
          <li key={item.id}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">{item.category}</Badge>
                {demo && <DemoBadge />}
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
                  Available soon
                </span>
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
