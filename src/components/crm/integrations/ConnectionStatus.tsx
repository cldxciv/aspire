import type { ReactNode } from "react";
import { Badge, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { META_INBOX_STATUSES } from "@/lib/crm/lead-ops-types";
import type { MetaStatusView } from "@/lib/crm/meta/types";
import { formatDay, formatWhen, type MetaMessages } from "./model";

/**
 * The connection's health (everyone allowed to see it: admins, area heads, super admins): ready /
 * not ready / off, the pause with its fix, the silence and expiry warnings, the timestamps Meta
 * and the CRM recorded, and the inbox counts. No secrets, no family data. Server-safe.
 */
export function ConnectionStatus({ view, locale, m, actions }: { view: MetaStatusView; locale: Locale; m: MetaMessages; actions?: ReactNode }) {
  const s = m.status;
  const { status, readiness } = view;
  const when = (iso: string | null) => formatWhen(iso, locale, s.never);
  const state = !readiness.enabled ? "off" : readiness.ready ? "ready" : "notReady";
  const headline = s[state];
  const token = status.tokenInfo;
  const facts: { label: string; value: string }[] = [
    { label: s.facts.verified, value: status.lastVerifyAt ? `${when(status.lastVerifyAt)}${status.verifiedSiteUrl ? ` · ${status.verifiedSiteUrl}` : ""}` : s.never },
    { label: s.facts.lastWebhook, value: when(status.lastWebhookAt) },
    { label: s.facts.lastImport, value: when(status.lastImportAt) },
    { label: s.facts.lastTest, value: when(status.lastTestAt) },
    { label: s.facts.lastSync, value: when(status.lastSyncAt) },
    { label: s.facts.lastSignatureFailure, value: when(status.lastSignatureFailureAt) },
    { label: s.facts.token, value: token ? `${token.type || "?"} · ${formatWhen(token.checkedAt, locale, s.notChecked)}` : s.notChecked },
    { label: s.facts.tokenExpiry, value: token ? (token.expiresAt ? formatDay(token.expiresAt, locale) : s.tokenNever) : s.notChecked },
    { label: s.facts.scopes, value: token ? token.scopes.join(", ") || s.never : s.notChecked },
    { label: s.facts.pageSubscribed, value: status.pageSubscribed === null ? s.notChecked : status.pageSubscribed ? s.yes : s.no },
    {
      label: s.facts.fields,
      value: status.fieldsMode.mode === "basic" && status.fieldsMode.until ? format(s.fieldsBasic, { time: when(status.fieldsMode.until) }) : s.fieldsFull,
    },
  ];
  if (status.lastErrorCode) facts.push({ label: s.facts.lastError, value: status.lastErrorCode });

  return (
    <section aria-labelledby="meta-status-heading" className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="meta-status-heading" className="text-lg font-extrabold text-navy">
          {s.heading}
        </h2>
        <Badge variant={readiness.ready ? "success" : readiness.enabled ? "warning" : "neutral"}>{s.badge[state]}</Badge>
      </div>
      <p className="text-sm text-ink">{headline}</p>
      {view.paused && (
        <Notice variant="error" role="alert">
          {s.paused[view.paused]}
        </Notice>
      )}
      {view.silentHours !== null && <Notice variant="warning">{format(s.silent, { hours: view.silentHours })}</Notice>}
      {view.siteUrlChanged && status.verifiedSiteUrl && <Notice variant="warning">{format(s.siteChanged, { url: status.verifiedSiteUrl })}</Notice>}
      {view.tokenExpiresSoon && token?.expiresAt && <Notice variant="warning">{format(s.tokenExpiresSoon, { date: formatDay(token.expiresAt, locale) })}</Notice>}
      {view.testMode.active && view.testMode.until && <Notice variant="info">{format(s.testModeOn, { time: when(view.testMode.until) })}</Notice>}

      <dl aria-label={s.factsLabel} className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="font-bold text-navy">{fact.label}</dt>
            <dd className="break-words text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="text-base font-extrabold text-navy">{s.countsHeading}</h3>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {META_INBOX_STATUSES.map((key) => (
            <li key={key} className="rounded-control border border-line bg-[#f8fbff] px-3 py-1.5">
              <span className="text-muted">{s.counts[key]}</span> <span className="font-extrabold text-navy">{view.counts[key]}</span>
            </li>
          ))}
        </ul>
      </div>
      {actions}
    </section>
  );
}
