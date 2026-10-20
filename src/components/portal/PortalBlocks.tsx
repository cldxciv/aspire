import { ArrowRight, PlugZap, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState } from "@/components/ui";
import type { Messages } from "@/i18n/messages/types";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import type { ImageAsset } from "@/lib/types";
import { portalAreas } from "./areas";

/**
 * Presentational portal blocks. All copy arrives as props (from the `portal` messages of the
 * page's locale), so these stay synchronous and testable. Honesty rule (D-029): values are
 * account facts from the database, "—" or a "not connected" phrase — never invented data.
 */

/** Page title row: area eyebrow, the page's only `<h1>`, and a data-status badge. */
export function PortalPageHeader({
  area,
  eyebrow,
  title,
  description,
  badge,
}: {
  area: Role;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  /** e.g. "Preview · no live data" or "Account details only". */
  badge?: string;
}) {
  const config = portalAreas[area];
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className={cn("mb-1.5 text-xs font-extrabold uppercase tracking-[0.14em]", config.eyebrow)}>{eyebrow}</p>
        <h1 className="break-words text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-snug tracking-tight text-navy">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {badge && (
        <Badge variant="demo" className="shrink-0 self-start">
          {badge}
        </Badge>
      )}
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
 * Dashboard tiles (mockup `.dashstat`). Values are real account facts, "—" or a status
 * phrase such as "Not connected". A "—" is announced as `noValueLabel`. `label` becomes a
 * visually hidden `<h2>`.
 */
export function StatTiles({
  area,
  tiles,
  label,
  noValueLabel,
  defaultNote,
}: {
  area: Role;
  tiles: StatTileProps[];
  label: string;
  noValueLabel: string;
  defaultNote: string;
}) {
  const accent = portalAreas[area].tileAccent;
  return (
    <section className="mb-6">
      <h2 className="sr-only">{label}</h2>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ label: tileLabel, value = "—", note = defaultNote }) => (
          <div key={tileLabel} className={cn("rounded-control border border-t-4 border-line bg-white p-4 shadow-soft", accent)}>
            <dt className="text-xs font-semibold text-muted">{tileLabel}</dt>
            <dd className={cn("mt-1 font-extrabold text-navy", value === "—" ? "text-[27px] leading-tight" : "text-lg")}>
              {value === "—" ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{noValueLabel}</span>
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
        <div className="min-w-0">
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

/** Grid of link cards (mockup quick links). Headings are `<h3>` under a panel's `<h2>`. Hrefs must be localised. */
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
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
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
  requiresLabel,
  children,
  action,
}: {
  title: string;
  /** The system Aspire must connect, e.g. "batch timetable / scheduling system". */
  system: string;
  /** "Requires:" in the page's language. */
  requiresLabel: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      description={
        <>
          <p>
            {requiresLabel} <strong className="text-ink">{system}</strong>.
          </p>
          {children && <div className="mt-1">{children}</div>}
        </>
      }
      action={action}
    />
  );
}

export type AreaStatusCard = {
  title: string;
  system: string;
  body: string;
  icon: LucideIcon;
  /** Localised link to the area's page, if it has one. */
  href?: string;
};

/** Cards for areas that are not connected yet (student timetable, results, attendance, …). `<h3>` headings. */
export function AreaStatusCards({
  area,
  cards,
  labels,
}: {
  area: Role;
  cards: AreaStatusCard[];
  labels: Pick<Messages<"portal">["blocks"], "requires" | "notConnected" | "open">;
}) {
  const iconTile = portalAreas[area].iconTile;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map(({ title, system, body, icon: Icon, href }) => (
        <li key={title} className="flex h-full flex-col rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4">
          <div className="flex items-start justify-between gap-3">
            <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTile)}>
              <Icon className="size-5" />
            </span>
            <Badge variant="neutral">
              <PlugZap aria-hidden="true" className="size-3" />
              {labels.notConnected}
            </Badge>
          </div>
          <h3 className="mt-3 font-bold text-navy">{title}</h3>
          <p className="mt-1 text-sm text-muted">
            {labels.requires} <span className="font-semibold text-ink">{system}</span>.
          </p>
          <p className="mt-1 text-sm text-muted">{body}</p>
          {href && (
            <Link href={href} className="mt-auto inline-flex min-h-11 items-center gap-1 pt-2 text-sm font-bold text-blue hover:underline">
              {labels.open} <span className="sr-only">{title}</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The signed-in account's own details beside a landscape photo (50/50 on md+). Never pass
 * a person photo here: the panel shows a real name.
 */
export function AccountPanel({
  id,
  title,
  rows,
  emptyText,
  action,
  image,
  imageLabel,
}: {
  id: string;
  title: string;
  /** Account facts (name, login ID, …). Omit for previews and pass `emptyText`. */
  rows?: { label: string; value: string; latin?: boolean }[];
  emptyText?: string;
  action?: ReactNode;
  image: ImageAsset;
  imageLabel: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mb-6 grid overflow-hidden rounded-card border border-line bg-white shadow-soft md:grid-cols-2"
    >
      <div className="min-w-0 p-5 md:p-6">
        <h2 id={id} className="text-lg font-extrabold text-navy">
          {title}
        </h2>
        {rows ? (
          <dl className="mt-3 divide-y divide-line">
            {rows.map(({ label, value, latin }) => (
              <div key={label} className="grid gap-0.5 py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-3">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="break-words font-semibold text-ink" lang={latin ? "en" : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          emptyText && <p className="mt-2 text-muted">{emptyText}</p>
        )}
        {action && <div className="mt-4 flex flex-wrap gap-3">{action}</div>}
      </div>
      <figure className="relative m-0 min-h-48 bg-navy md:min-h-full">
        <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1200px) 480px, (min-width: 768px) 40vw, 100vw" className="object-cover" />
        <figcaption className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
          {imageLabel}
        </figcaption>
      </figure>
    </section>
  );
}
