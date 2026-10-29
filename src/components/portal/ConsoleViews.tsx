import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { consoleRoadmap, type RoadmapPhase } from "./console-roadmap";
import { PortalPageHeader, PortalPanel, StatTiles } from "./PortalBlocks";
import type { WebsiteInventory } from "./website-inventory";

/**
 * Admin console status pages (docs/admin-console-plan.md, Phase 1a): "What's on the website"
 * (replaces the old Content / Centres / Results "not connected" pages) and "What's coming"
 * (every planned page by phase, so no sidebar item is ever an empty screen). Pure and
 * synchronous: data and copy arrive as props.
 */

/** "What's on the website": honest counts of what the public site shows right now. */
export function WebsiteStatusView({
  inventory,
  preview,
  locale,
  t,
}: {
  inventory: WebsiteInventory;
  preview: boolean;
  locale: Locale;
  t: Messages<"portal">;
}) {
  const w = t.admin.website;
  const sum = (pick: (row: WebsiteInventory["rows"][number]) => number | null) =>
    inventory.rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
  const note = w.totalsNote;
  return (
    <>
      <PortalPageHeader
        area="admin"
        eyebrow={t.navGroups.website}
        title={w.title}
        description={w.lead}
        badge={preview ? t.blocks.previewBadge : undefined}
      />

      <Notice variant={inventory.demoMode ? "warning" : "success"} title={inventory.demoMode ? w.modeDemoTitle : w.modeLiveTitle} className="mb-6">
        {inventory.demoMode ? w.modeDemoBody : w.modeLiveBody}
      </Notice>

      <StatTiles
        area="admin"
        label={w.totalsLabel}
        noValueLabel={t.blocks.noValue}
        defaultNote={note}
        tiles={[
          { label: w.totals.shown, value: String(sum((row) => row.shown)), note },
          { label: w.totals.demo, value: String(sum((row) => row.demo)), note },
          { label: w.totals.withoutConsent, value: String(sum((row) => row.withoutConsent)), note },
        ]}
      />

      <PortalPanel id="admin-website-types" title={w.listTitle} description={w.listDescription} className="mb-6">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {inventory.rows.map((row) => {
            const type = w.types[row.key];
            return (
              <li key={row.key} className="flex h-full flex-col rounded-control border border-line bg-white p-4">
                <h3 className="font-bold text-navy">{type}</h3>
                <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">{w.shown}</dt>
                  <dd className="text-right font-extrabold text-navy">{row.shown}</dd>
                  <dt className="text-muted">{w.approved}</dt>
                  <dd className="text-right font-semibold text-ink">{row.approved}</dd>
                  <dt className="text-muted">{w.demo}</dt>
                  <dd className="text-right font-semibold text-ink">{row.demo}</dd>
                  {row.withoutConsent !== null && (
                    <>
                      <dt className="text-muted">{w.withoutConsent}</dt>
                      <dd className={cn("text-right font-semibold", row.withoutConsent > 0 ? "text-[#8b5b00]" : "text-ink")}>
                        {row.withoutConsent}
                      </dd>
                    </>
                  )}
                </dl>
                {row.withoutConsent !== null && row.withoutConsent > 0 && (
                  <p className="mt-2 rounded-md bg-[#fff3d2] px-2 py-1 text-xs text-[#5c4a12]">
                    {format(w.consentWarning, { count: row.withoutConsent })}
                  </p>
                )}
                <Link
                  href={localePath(row.href, locale)}
                  className="mt-auto inline-flex min-h-11 items-center gap-1 pt-2 text-sm font-bold text-blue hover:underline"
                >
                  {w.openPage}
                  <span className="sr-only"> ({type})</span>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      </PortalPanel>

      <PortalPanel id="admin-website-change" title={w.changeTitle}>
        <p className="text-muted">{w.changeBody}</p>
        <p className="mt-2 text-muted">{w.changeNext}</p>
        <Link
          href={localePath("/admin/coming", locale)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue hover:underline"
        >
          {w.comingLink}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </PortalPanel>
    </>
  );
}

/** "What's coming": planned pages and features by phase, each tagged with its console section. */
export function ComingView({
  preview,
  t,
  roadmap = consoleRoadmap,
}: {
  preview: boolean;
  t: Messages<"portal">;
  roadmap?: RoadmapPhase[];
}) {
  const c = t.admin.coming;
  return (
    <>
      <PortalPageHeader
        area="admin"
        eyebrow={t.navGroups.dashboard}
        title={c.title}
        description={c.lead}
        badge={preview ? t.blocks.previewBadge : undefined}
      />
      <div className="space-y-6">
        {roadmap.map(({ phase, current, items }) => {
          const p = c.phases[phase];
          return (
            <PortalPanel
              key={phase}
              id={`coming-${phase}`}
              title={p.name}
              description={p.outcome}
              action={<Badge variant={current ? "warning" : "neutral"}>{p.status}</Badge>}
            >
              {items.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map(({ key, section }) => (
                    <li key={key} className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#7a5600]">
                        <span className="sr-only">{c.sectionLabel}: </span>
                        {t.navGroups[section]}
                      </p>
                      <h3 className="mt-1 font-bold text-navy">{c.items[key].title}</h3>
                      <p className="mt-1 text-sm text-muted">{c.items[key].body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </PortalPanel>
          );
        })}
      </div>
    </>
  );
}
