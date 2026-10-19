import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/roles";
import { portalAreas } from "./areas";

/** Page title row: area eyebrow, the page's only `<h1>`, and a "no live data" label. */
export function PortalPageHeader({
  area,
  title,
  description,
}: {
  area: Role;
  title: string;
  description?: ReactNode;
}) {
  const config = portalAreas[area];
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-2xl">
        <p className={cn("mb-1.5 text-xs font-extrabold uppercase tracking-[0.14em]", config.eyebrow)}>
          {config.label}
        </p>
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      <Badge variant="demo" className="shrink-0 self-start">
        Preview · no live data
      </Badge>
    </div>
  );
}

export type StatTileProps = {
  label: string;
  /** Use "—" for "no value". Never pass a number that is not from a live source. */
  value?: string;
  note?: string;
};

/**
 * Dashboard tiles (mockup `.dashstat`). Data-free: values are "—" or a status
 * phrase such as "Not connected". A "—" is announced as "No value". `label`
 * becomes a visually hidden `<h2>`.
 */
export function StatTiles({ area, tiles, label }: { area: Role; tiles: StatTileProps[]; label: string }) {
  const accent = portalAreas[area].tileAccent;
  return (
    <section className="mb-6">
      <h2 className="sr-only">{label}</h2>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ label: tileLabel, value = "—", note = "No live data" }) => (
          <div key={tileLabel} className={cn("rounded-control border border-t-4 border-line bg-white p-4 shadow-soft", accent)}>
            <dt className="text-xs font-semibold text-muted">{tileLabel}</dt>
            <dd className={cn("mt-1 font-extrabold text-navy", value === "—" ? "text-[27px] leading-tight" : "text-lg")}>
              {value === "—" ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">No value</span>
                </>
              ) : (
                value
              )}
            </dd>
            <dd className="text-xs text-muted">{note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** White panel section with an `<h2>`. `id` must be unique on the page. */
export function PortalPanel({
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
    <section aria-labelledby={id} className={cn("rounded-card border border-line bg-white p-5 shadow-soft md:p-6", className)}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={id} className="text-lg font-extrabold text-navy">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type QuickLink = { title: string; description: string; href: string; icon: LucideIcon };

/** Grid of link cards (mockup quick links). Headings are `<h3>` under a panel's `<h2>`. */
export function QuickLinks({ area, links }: { area: Role; links: QuickLink[] }) {
  const iconTile = portalAreas[area].iconTile;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {links.map(({ title, description, href, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            className="group flex h-full gap-3 rounded-control border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue hover:shadow-card motion-reduce:hover:translate-y-0"
          >
            <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTile)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1 font-bold text-navy group-hover:text-blue">
                {title}
                <ArrowRight aria-hidden="true" className="size-4" />
              </h3>
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Honest empty state for an area whose data source does not exist yet. Always
 * names the system that must be connected before anything can be shown.
 */
export function NotConnected({
  title,
  system,
  children,
  action,
}: {
  title: string;
  /** The system Aspire must connect, e.g. "batch timetable / scheduling system". */
  system: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      description={
        <>
          <p>
            Requires: <strong className="text-ink">{system}</strong>.
          </p>
          {children && <div className="mt-1">{children}</div>}
        </>
      }
      action={action}
    />
  );
}
