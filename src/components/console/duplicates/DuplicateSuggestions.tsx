import { Copy } from "lucide-react";
import Link from "next/link";
import { StageBadge } from "@/components/crm/CrmBlocks";
import { centreLabel, formatDate, withBack } from "@/components/crm/format";
import { familyMessages } from "@/components/console/details/messages";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { consoleCentres } from "@/lib/crm/console/centres";
import { findDuplicates } from "@/lib/crm/console/duplicates/duplicates";
import type { DuplicateMatch } from "@/lib/crm/console/duplicates/types";
import type { CrmPermissions, CrmViewer, LeadDetail } from "@/lib/crm/types";
import { getDb } from "@/lib/db/connection";
import { DismissDuplicateButton, MarkDuplicateLostButton } from "./DuplicateActions";

/** Props of the lead page's "Possible duplicates" slot (docs/admin-phase-1b-plan.md §5.F, §13). */
export interface DuplicateSuggestionsProps {
  lead: LeadDetail;
  viewer: CrmViewer;
  permissions: CrmPermissions;
  locale: Locale;
  /** LOCALE-FREE path of the lead page (`/crm/leads/<id>`), for "Open" back links and refreshes. */
  pagePath: string;
  now: number;
}

/**
 * "Possible duplicates" at the top of the lead page (docs/admin-phase-1b-plan.md §5.F; owner:
 * 1B-FAMILY). Server component: renders ONLY when there are matches among the leads this viewer
 * can see. Nothing merges: staff open the other enquiry, mark the pair "Not the same family"
 * (never suggested again) or mark this enquiry lost as a duplicate. LeadDetailView mounts it
 * inside `<Suspense>`.
 */
export async function DuplicateSuggestions({ lead, viewer, locale, pagePath }: DuplicateSuggestionsProps) {
  if (lead.erased) return null;
  const result = findDuplicates(viewer, lead.id);
  if (!result.ok || result.data.length === 0) return null;
  const centres = Object.fromEntries((await consoleCentres(getDb(), locale)).flatMap((centre) => (centre.slug ? [[centre.slug, centre.label]] : [])));
  return <DuplicateSuggestionsPanel lead={lead} matches={result.data} locale={locale} pagePath={pagePath} centres={centres} />;
}

/** The suggestions box. Pure: data in, markup out. */
export function DuplicateSuggestionsPanel({
  lead,
  matches,
  locale,
  pagePath,
  centres = {},
}: {
  lead: Pick<LeadDetail, "id" | "stage" | "erased">;
  matches: DuplicateMatch[];
  locale: Locale;
  pagePath: string;
  /** Centre slug → name (unknown slugs are shown as they are). */
  centres?: Readonly<Record<string, string>>;
}) {
  if (matches.length === 0) return null;
  const f = familyMessages(locale).duplicates;
  const t = messagesFor(locale, "crm");
  const headingId = "crm-lead-duplicates";
  const canMarkLost = !lead.erased && lead.stage !== "lost" && lead.stage !== "enrolled";
  return (
    <section aria-labelledby={headingId} className="rounded-card border border-[#e9b431] bg-[#fffaf0] p-5 shadow-soft md:p-6">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-extrabold text-navy">
        <Copy aria-hidden="true" className="size-5 shrink-0" />
        {format(f.title, { n: matches.length })}
      </h2>
      <p className="mt-1 text-sm text-ink">{f.intro}</p>
      <ul className="mt-4 space-y-3">
        {matches.map((match) => {
          const name = match.name?.trim() || t.common.unnamed;
          const href = withBack(localePath(`/crm/leads/${encodeURIComponent(match.leadId)}`, locale), pagePath);
          return (
            <li key={match.leadId} className="rounded-control border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-bold text-navy">{name}</h3>
                <StageBadge stage={match.stage} t={t} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">{f.centre}</dt>
                <dd>{centreLabel(t, centres, match.centreSlug) ?? <span className="text-muted">{t.common.none}</span>}</dd>
                <dt className="text-muted">{f.assignee}</dt>
                <dd>{match.assignee?.displayName || t.common.unassigned}</dd>
                <dt className="text-muted">{f.received}</dt>
                <dd>
                  <time dateTime={match.createdAt}>{formatDate(match.createdAt, locale)}</time>
                </dd>
                <dt className="text-muted">{f.why}</dt>
                <dd>
                  <ul className="space-y-0.5">
                    {match.reasons.map((reason) => (
                      <li key={reason}>{f.reasons[reason]}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <Link
                  href={href}
                  aria-label={format(f.openLabel, { name })}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-[#b9cbe0] bg-white px-4 text-sm font-bold text-navy hover:border-blue"
                >
                  {f.open}
                </Link>
                {match.canDismiss && (
                  <DismissDuplicateButton leadId={lead.id} otherLeadId={match.leadId} label={f.notSame} ariaLabel={format(f.notSameLabel, { name })} done={f.notSameDone} t={{ errors: t.errors }} pagePath={pagePath} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!lead.erased && (
        <div className={canMarkLost ? "mt-4 border-t border-[#f0d9a0] pt-4" : "mt-2"}>
          <MarkDuplicateLostButton leadId={lead.id} lost={!canMarkLost} f={f} t={{ errors: t.errors, common: t.common }} pagePath={pagePath} />
        </div>
      )}
    </section>
  );
}
