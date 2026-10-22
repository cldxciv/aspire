import { ArrowRight, BarChart3 } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { portalAreas } from "@/components/portal/areas";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { DashboardData, SlaQueueItem, SpeedRow, SpeedStats } from "@/lib/crm/lead-ops-types";
import type { CrmPermissions } from "@/lib/crm/types";
import { formatDate, formatDateTime, type CrmMessages } from "../format";
import { EscalationList } from "../sla/EscalationList";
import { barWidth, minutesText, nowTileHref, outOf, percentText, rowLabel, rowMetRate, type DashboardMessages } from "./model";

/** The period the page shows (IST days, inclusive) and the quick ranges. */
export interface DashboardRange {
  fromDay: string;
  toDay: string;
  invalid: boolean;
}

export type DashboardPreset = { key: "last7" | "last30" | "last90"; fromDay: string; toDay: string };

const PAGE_PATH = "/crm/dashboard";
const tileClass = "rounded-control border border-t-4 border-line bg-white p-4 shadow-soft";

/**
 * The lead dashboard (owner: LR-SLA; docs/lead-routing-plan.md §16, A7, A9, A10, A27). Server-safe:
 * every number comes from `dashboardData`; tiles link to the filtered inbox. Comparisons are tables
 * (one series, a single-hue in-time bar beside the written value — never colour alone); imported
 * lists are reported apart from live enquiries. Super admins also get escalated calls and Meta health.
 */
export function DashboardView({
  data,
  escalated,
  permissions,
  range,
  presets,
  areaOptions,
  area,
  areaNames,
  now,
  locale,
  t,
}: {
  data: DashboardData;
  /** Super admins: the escalated list; null otherwise. */
  escalated: SlaQueueItem[] | null;
  permissions: CrmPermissions;
  range: DashboardRange;
  presets: DashboardPreset[];
  /** Areas the viewer may narrow to (id + name in the page's language). */
  areaOptions: { id: string; name: string }[];
  area: string | null;
  areaNames: Readonly<Record<string, string>>;
  now: number;
  locale: Locale;
  t: CrmMessages;
}) {
  const d = t.dashboard;
  const period = format(d.filters.period, {
    from: formatDate(`${range.fromDay}T06:30:00.000Z`, locale) ?? range.fromDay,
    to: formatDate(`${range.toDay}T06:30:00.000Z`, locale) ?? range.toDay,
  });
  const scopeText =
    data.scope.areaIds === "all"
      ? d.scopeAll
      : data.scope.areaIds.length === 0
        ? d.scopeNone
        : format(d.scopeAreas, { areas: data.scope.areaIds.map((id) => areaNames[id] ?? id).join(", ") });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{scopeText}</p>
        <Link href={localePath("/crm/reports", locale)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue hover:underline">
          <BarChart3 aria-hidden="true" className="size-4" />
          {d.reportsLink}
        </Link>
      </div>

      <DashboardFilters range={range} presets={presets} areaOptions={areaOptions} area={area} locale={locale} t={d} />

      <NowTiles data={data} area={area} locale={locale} t={d} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PortalPanel id="crm-dash-today" title={d.today.title}>
          <p className="text-[27px] font-extrabold leading-tight text-navy">{data.today.newLeads}</p>
          <p className="text-sm text-muted">{d.today.newLeads}</p>
          {data.today.bySource.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{d.today.none}</p>
          ) : (
            <ul aria-label={d.today.bySource} className="mt-3 flex flex-wrap gap-2">
              {data.today.bySource.map((row) => (
                <li key={row.key} className="rounded-control border border-line bg-surface px-3 py-1 text-sm">
                  {rowLabel("source", row.key, undefined, { tables: d.tables, sources: t.sources }, areaNames)}: <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </PortalPanel>
        <PortalPanel id="crm-dash-away" title={d.away.title}>
          {data.now.away.length === 0 ? (
            <p className="text-sm text-muted">{d.away.empty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.now.away.map((person) => (
                <li key={person.userId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span className="font-semibold">{person.name}</span>
                  <span className="text-muted">{format(d.away.until, { date: formatDate(person.until, locale) ?? "" })}</span>
                </li>
              ))}
            </ul>
          )}
        </PortalPanel>
      </div>

      <PortalPanel id="crm-dash-speed" title={d.speed.title} description={`${d.speed.intro} ${period}`}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SpeedCard title={d.speed.live} stats={data.speed.live} locale={locale} t={d} />
          <SpeedCard title={d.speed.imported} stats={data.speed.imported} locale={locale} t={d} />
        </div>
      </PortalPanel>

      <SpeedTable
        id="crm-dash-area"
        kind="area"
        title={d.tables.byArea}
        note={d.tables.byAreaNote}
        rows={data.byArea}
        period={period}
        areaNames={areaNames}
        locale={locale}
        t={t}
      />
      <SpeedTable
        id="crm-dash-exec"
        kind="executive"
        title={d.tables.byExecutive}
        note={d.tables.byExecutiveNote}
        rows={data.byExecutive}
        period={period}
        areaNames={areaNames}
        locale={locale}
        t={t}
      />
      <SpeedTable id="crm-dash-source" kind="source" title={d.tables.bySource} rows={data.bySource} period={period} areaNames={areaNames} locale={locale} t={t} />
      <CampaignTable data={data} period={period} areaNames={areaNames} t={t} />

      {escalated && (
        <PortalPanel id="crm-dash-escalated" title={t.speed.escalation.title} description={t.speed.escalation.intro}>
          <EscalationList items={escalated} now={now} locale={locale} areaNames={areaNames} backPath="/crm?sla=escalated" t={{ escalation: t.speed.escalation, common: t.common }} />
        </PortalPanel>
      )}
      {permissions.isSuperAdmin && <MetaHealth meta={data.meta ?? null} locale={locale} t={d} />}
    </div>
  );
}

function DashboardFilters({
  range,
  presets,
  areaOptions,
  area,
  locale,
  t,
}: {
  range: DashboardRange;
  presets: DashboardPreset[];
  areaOptions: { id: string; name: string }[];
  area: string | null;
  locale: Locale;
  t: DashboardMessages;
}) {
  const f = t.filters;
  const action = localePath(PAGE_PATH, locale);
  const field = "min-h-11 rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px]";
  return (
    <section aria-labelledby="crm-dash-filters" className="rounded-card border border-line bg-white p-4 shadow-soft md:p-5">
      <h2 id="crm-dash-filters" className="mb-3 text-base font-extrabold text-navy">
        {f.title}
      </h2>
      {range.invalid && (
        <p role="alert" className="mb-3 text-sm font-semibold text-danger">
          {f.invalid}
        </p>
      )}
      <Form action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="crm-dash-from" className="text-sm font-bold text-navy">
            {f.from}
          </label>
          <input id="crm-dash-from" name="from" type="date" defaultValue={range.fromDay} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="crm-dash-to" className="text-sm font-bold text-navy">
            {f.to}
          </label>
          <input id="crm-dash-to" name="to" type="date" defaultValue={range.toDay} className={field} />
        </div>
        {areaOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="crm-dash-area" className="text-sm font-bold text-navy">
              {f.area}
            </label>
            <select id="crm-dash-area" name="area" defaultValue={area ?? ""} className={field}>
              <option value="">{f.allAreas}</option>
              {areaOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2">
          {f.apply}
        </button>
      </Form>
      <nav aria-label={f.presetsLabel} className="mt-3">
        <ul className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const current = preset.fromDay === range.fromDay && preset.toDay === range.toDay;
            const query = new URLSearchParams({ from: preset.fromDay, to: preset.toDay, ...(area ? { area } : {}) });
            return (
              <li key={preset.key}>
                <Link
                  href={`${action}?${query.toString()}`}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-control border px-3 text-sm font-bold",
                    current ? "border-navy bg-navy text-white" : "border-[#b9cbe0] bg-white text-navy hover:border-blue",
                  )}
                >
                  {f.presets[preset.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}

function NowTiles({ data, area, locale, t }: { data: DashboardData; area: string | null; locale: Locale; t: DashboardMessages }) {
  const n = t.now;
  const tiles: { key: keyof DashboardData["now"]; label: string; value: number; tone: "plain" | "warn" | "danger"; note?: string }[] = [
    { key: "callNow", label: n.callNow, value: data.now.callNow, tone: "plain" },
    { key: "overdue", label: n.overdue, value: data.now.overdue, tone: data.now.overdue > 0 ? "warn" : "plain", note: n.overdueNote },
    { key: "escalated", label: n.escalated, value: data.now.escalated, tone: data.now.escalated > 0 ? "danger" : "plain" },
    { key: "unassignedInAreas", label: n.unassignedInAreas, value: data.now.unassignedInAreas, tone: data.now.unassignedInAreas > 0 ? "warn" : "plain" },
  ];
  if (data.now.unassignedNoArea !== undefined) tiles.push({ key: "unassignedNoArea", label: n.unassignedNoArea, value: data.now.unassignedNoArea, tone: data.now.unassignedNoArea > 0 ? "warn" : "plain" });
  if (data.now.toolSignups !== undefined) tiles.push({ key: "toolSignups", label: n.toolSignups, value: data.now.toolSignups, tone: "plain" });
  if (data.now.unmatchedPlaces !== undefined) tiles.push({ key: "unmatchedPlaces", label: n.unmatchedPlaces, value: data.now.unmatchedPlaces, tone: "plain" });
  const accent = { plain: portalAreas.staff.tileAccent, warn: "border-t-[#e9b431]", danger: "border-t-[#c62828]" } as const;
  return (
    <section aria-labelledby="crm-dash-now">
      <h2 id="crm-dash-now" className="mb-3 text-lg font-extrabold text-navy">
        {n.title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const href = nowTileHref(tile.key, area);
          const body = (
            <>
              <span className="block text-xs font-semibold text-muted">{tile.label}</span>
              <span className="mt-1 block text-[27px] font-extrabold leading-tight text-navy">{tile.value}</span>
              {tile.note && <span className="block text-xs text-muted">{tile.note}</span>}
            </>
          );
          return (
            <li key={tile.key} className={cn(tileClass, accent[tile.tone])}>
              {href ? (
                <Link href={localePath(href, locale)} className="group block rounded-control focus-visible:outline-2 focus-visible:outline-offset-4">
                  {body}
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-blue group-hover:underline">
                    {n.openList}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </span>
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SpeedCard({ title, stats, locale, t }: { title: string; stats: SpeedStats; locale: Locale; t: DashboardMessages }) {
  const s = t.speed;
  const metOf = outOf(stats.met, stats.metRate);
  const reachedOf = outOf(stats.reached, stats.reachedRate);
  return (
    <section aria-label={title} className="rounded-control border border-line p-4">
      <h3 className="font-extrabold text-navy">{title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-semibold text-muted">{s.clocks}</dt>
          <dd className="text-xl font-extrabold text-navy">{stats.clocks}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{s.metRate}</dt>
          <dd className="text-xl font-extrabold text-navy">{percentText(stats.metRate, locale, s.none)}</dd>
          {metOf !== null && <dd className="text-xs text-muted">{format(s.metOf, { met: stats.met, decided: metOf })}</dd>}
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{s.reachedRate}</dt>
          <dd className="text-xl font-extrabold text-navy">{percentText(stats.reachedRate, locale, s.none)}</dd>
          {reachedOf !== null && <dd className="text-xs text-muted">{format(s.reachedOf, { reached: stats.reached, decided: reachedOf })}</dd>}
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{s.median}</dt>
          <dd className="text-xl font-extrabold text-navy">{minutesText(s, stats.medianWorkMinutes, locale)}</dd>
        </div>
      </dl>
    </section>
  );
}

function SpeedTable({
  id,
  kind,
  title,
  note,
  rows,
  period,
  areaNames,
  locale,
  t,
}: {
  id: string;
  kind: "area" | "executive" | "source";
  title: string;
  note?: string;
  rows: SpeedRow[];
  period: string;
  areaNames: Readonly<Record<string, string>>;
  locale: Locale;
  t: CrmMessages;
}) {
  const d = t.dashboard;
  const c = d.tables.columns;
  const first = kind === "area" ? c.area : kind === "executive" ? c.executive : c.source;
  return (
    <PortalPanel id={id} title={title} description={note}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{d.tables.empty}</p>
      ) : (
        <div role="region" aria-labelledby={id} tabIndex={0} className="overflow-x-auto rounded-control">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{format(d.tables.caption, { title, period })}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-bold">{first}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.leads}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.attempted}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.met}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.missed}</th>
                <th scope="col" className="py-2 pr-3 font-bold">{c.metRate}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.reached}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.median}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.open}</th>
                <th scope="col" className="py-2 text-right font-bold">{c.overdue}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const metRate = rowMetRate(row);
                const pct = percentText(metRate, locale, d.speed.none);
                return (
                  <tr key={row.key} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {rowLabel(kind, row.key, row.label, { tables: d.tables, sources: t.sources }, areaNames)}
                    </th>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.leads}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.attempted}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.met}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.missed}</td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2" title={format(d.tables.rateBar, { rate: pct })}>
                        <span aria-hidden="true" className="relative h-3 w-20 overflow-hidden rounded-sm bg-[#e7eef8]">
                          <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[#0755b5]" style={{ width: `${barWidth(metRate)}%` }} />
                        </span>
                        <span className="tabular-nums">{pct}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.reached}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{minutesText(d.speed, row.medianWorkMinutes, locale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.open}</td>
                    <td className={cn("py-2 text-right tabular-nums", row.overdue > 0 && "font-bold text-[#8a1c14]")}>{row.overdue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}

function CampaignTable({ data, period, areaNames, t }: { data: DashboardData; period: string; areaNames: Readonly<Record<string, string>>; t: CrmMessages }) {
  const d = t.dashboard;
  const c = d.tables.columns;
  return (
    <PortalPanel id="crm-dash-campaign" title={d.tables.byCampaign} description={d.tables.byCampaignNote}>
      {data.byCampaign.length === 0 ? (
        <p className="text-sm text-muted">{d.tables.empty}</p>
      ) : (
        <div role="region" aria-labelledby="crm-dash-campaign" tabIndex={0} className="overflow-x-auto rounded-control">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">{format(d.tables.caption, { title: d.tables.byCampaign, period })}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-bold">{c.campaign}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.total}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.contacted}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.reached}</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">{c.enrolled}</th>
                <th scope="col" className="py-2 text-right font-bold">{c.junk}</th>
              </tr>
            </thead>
            <tbody>
              {data.byCampaign.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <th scope="row" className="break-words py-2 pr-3 font-semibold">
                    {rowLabel("campaign", row.key, undefined, { tables: d.tables, sources: t.sources }, areaNames)}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.total}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.contacted}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.reached}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.enrolled}</td>
                  <td className="py-2 text-right tabular-nums">{row.junk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}

function MetaHealth({ meta, locale, t }: { meta: DashboardData["meta"] | null; locale: Locale; t: DashboardMessages }) {
  const m = t.meta;
  const href = localePath("/crm/settings/integrations", locale);
  const link = (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue hover:underline">
      {m.open}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
  if (!meta) {
    return (
      <PortalPanel id="crm-dash-meta" title={m.title} action={link}>
        <p className="text-sm text-muted">{m.notConnected}</p>
      </PortalPanel>
    );
  }
  const status = meta.paused === "auth" ? m.pausedAuth : meta.paused === "permission" ? m.pausedPermission : m.running;
  return (
    <PortalPanel id="crm-dash-meta" title={m.title} action={link}>
      <p className={cn("mb-3 text-sm font-bold", meta.paused ? "text-[#8a1c14]" : "text-success")}>{status}</p>
      {meta.silentHours !== null && <p className="mb-3 text-sm font-bold text-[#6b4a00]">{format(m.silent, { hours: meta.silentHours })}</p>}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-muted">{m.lastWebhook}</dt>
          <dd className="font-bold">{formatDateTime(meta.lastWebhookAt, locale) ?? m.never}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{m.lastImport}</dt>
          <dd className="font-bold">{formatDateTime(meta.lastImportAt, locale) ?? m.never}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{m.pending}</dt>
          <dd className="font-bold tabular-nums">{meta.pending}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{m.failed}</dt>
          <dd className={cn("font-bold tabular-nums", meta.failed > 0 && "text-[#8a1c14]")}>{meta.failed}</dd>
        </div>
      </dl>
    </PortalPanel>
  );
}
