import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { ConsoleTable, type ConsoleColumn } from "@/components/console/shared/ConsoleTable";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { GO_LIVE_ITEMS, GO_LIVE_NOTE, goLiveStatusText, type GoLiveItem, type GoLiveTone } from "@/lib/console/go-live";
import { STATUS_ROWS, type SiteStatus, type StatusRow, type StatusTone } from "@/lib/console/status";

/**
 * Site status words: an owner-only technical page, ENGLISH ONLY (decision 5; plan §1.2 rule 6), so
 * the strings live here and not in a message catalogue.
 */
export const STATUS_TEXT = {
  metaTitle: "Site status",
  metaDescription: "How the website is set up right now: content mode, indexing, enquiries, release, database size, free disk and backups.",
  title: "Site status",
  lead: "How the website is set up right now, and what is still open before going live. Nothing secret is shown here.",
  statusTitle: "Set-up right now",
  statusCaption: "Site status",
  statusRegion: "Site status: scroll sideways for more columns",
  item: "Item",
  value: "Status",
  goLiveTitle: "Go-live summary",
  goLiveCaption: "Go-live summary",
  goLiveRegion: "Go-live summary: scroll sideways for more columns",
  refs: "Checklist refs",
  previewValue: "—",
  previewNote: "Preview · no live data",
  asOf: "As of {time}",
  tone: { ok: "OK", warn: "Needs attention", info: "For information" },
} as const;

const TONE_STYLE: Record<StatusTone, { className: string; Icon: typeof Info }> = {
  ok: { className: "text-[#14744d]", Icon: CheckCircle2 },
  warn: { className: "text-[#8b5b00]", Icon: AlertTriangle },
  info: { className: "text-muted", Icon: Info },
};

const GO_LIVE_TONE: Record<GoLiveTone, string> = {
  open: "bg-[#fff3d2] text-[#8b5b00]",
  done: "bg-success-soft text-[#14744d]",
  later: "bg-surface text-muted",
  unknown: "bg-surface text-muted",
};

/** The data-free preview: every row's label, value "—". Nothing is read. */
function previewRows(): StatusRow[] {
  return STATUS_ROWS.map(({ key, label }): StatusRow => ({ key, label, value: STATUS_TEXT.previewValue, tone: "info", notes: [] }));
}

/**
 * `/admin/status` body (docs/admin-phase-1b-plan.md §5.M; owner: 1B-HOUSEKEEPING). `status: null` =
 * the data-free console preview ("—" everywhere, nothing read). No webhook test button. On a Hindi
 * URL the English body is marked `lang="en"` (WCAG 3.1.2). Server-rendered, no client code.
 */
export function StatusView({ status, asOf, locale }: { status: SiteStatus | null; asOf: string | null; locale: Locale }) {
  const preview = status === null;
  const rows = status?.rows ?? previewRows();
  const demoMode = status?.demoMode ?? null;

  function statusValue(row: StatusRow) {
    const tone = TONE_STYLE[row.tone];
    return (
      <div className="min-w-0">
        <p className={cn("flex items-start gap-1.5 font-semibold", preview ? "text-navy" : tone.className)}>
          {!preview && (
            <>
              <tone.Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="sr-only">{STATUS_TEXT.tone[row.tone]}: </span>
            </>
          )}
          <span className="min-w-0 break-words text-ink">{row.value}</span>
        </p>
        {row.notes.length > 0 && (
          <ul className="mt-1 space-y-0.5 break-words text-sm text-muted">
            {row.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {row.link && !preview && (
          <Link href={localePath(row.link.href, locale)} className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-blue underline-offset-2 hover:underline">
            {row.link.label}
          </Link>
        )}
      </div>
    );
  }

  function goLiveBadge(item: GoLiveItem) {
    const { text, tone } = goLiveStatusText(item.status, preview ? null : demoMode);
    return <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-bold", GO_LIVE_TONE[tone])}>{text}</span>;
  }

  const statusColumns: ConsoleColumn<StatusRow>[] = [
    { key: "item", header: STATUS_TEXT.item, cell: (row) => row.label },
    { key: "value", header: STATUS_TEXT.value, cell: statusValue },
  ];

  const goLiveColumns: ConsoleColumn<GoLiveItem>[] = [
    { key: "item", header: STATUS_TEXT.item, cell: (item) => item.item },
    { key: "refs", header: STATUS_TEXT.refs, cell: (item) => <span className="whitespace-nowrap">{item.refs}</span> },
    { key: "status", header: STATUS_TEXT.value, cell: goLiveBadge },
  ];

  // Phones (below `md`): this page's own cards, each value under its label and left-aligned, because
  // the values are sentences that would squeeze ConsoleTable's side-by-side card layout. Tablets and
  // up keep ConsoleTable (focusable scroll region, sticky first column).
  const phoneCard = "rounded-card border border-line bg-white p-4 shadow-soft";
  const phonePair = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1";

  return (
    <div className="space-y-5" lang={locale === "en" ? undefined : "en"}>
      <PortalPanel
        id="site-status"
        title={STATUS_TEXT.statusTitle}
        description={preview ? STATUS_TEXT.previewNote : asOf ? STATUS_TEXT.asOf.replace("{time}", asOf) : undefined}
      >
        <ConsoleTable
          id="site-status-table"
          caption={STATUS_TEXT.statusCaption}
          regionLabel={STATUS_TEXT.statusRegion}
          columns={statusColumns}
          rows={rows}
          rowKey={(row) => row.key}
          minWidth="36rem"
          className="hidden md:block"
        />
        <ul aria-label={STATUS_TEXT.statusCaption} className="space-y-3 md:hidden">
          {rows.map((row) => (
            <li key={row.key} className={phoneCard}>
              <p className="font-bold text-navy">{row.label}</p>
              <div className="mt-1.5 text-sm">{statusValue(row)}</div>
            </li>
          ))}
        </ul>
      </PortalPanel>
      <PortalPanel id="go-live-summary" title={STATUS_TEXT.goLiveTitle} description={GO_LIVE_NOTE}>
        <ConsoleTable
          id="go-live-table"
          caption={STATUS_TEXT.goLiveCaption}
          regionLabel={STATUS_TEXT.goLiveRegion}
          columns={goLiveColumns}
          rows={GO_LIVE_ITEMS}
          rowKey={(item) => item.key}
          minWidth="36rem"
          className="hidden md:block"
        />
        <ul aria-label={STATUS_TEXT.goLiveCaption} className="space-y-3 md:hidden">
          {GO_LIVE_ITEMS.map((item) => (
            <li key={item.key} className={phoneCard}>
              <p className="font-bold text-navy">{item.item}</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className={phonePair}>
                  <dt className="text-muted">{STATUS_TEXT.refs}</dt>
                  <dd className="min-w-0 break-words">{item.refs}</dd>
                </div>
                <div className={phonePair}>
                  <dt className="text-muted">{STATUS_TEXT.value}</dt>
                  <dd className="min-w-0">{goLiveBadge(item)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </PortalPanel>
    </div>
  );
}
