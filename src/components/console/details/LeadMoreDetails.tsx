import { MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { areaName, displayPhone, formatDate, telHref, whatsAppHref } from "@/components/crm/format";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { getLeadMoreDetails } from "@/lib/crm/console/details/details";
import { intakeSessionChoices, targetYearChoices } from "@/lib/crm/console/details/rules";
import { sessionRef } from "@/lib/crm/console/session";
import type { LeadMoreDetails as Details, SessionKey } from "@/lib/crm/console/types";
import type { CrmPermissions, CrmViewer, LeadDetail } from "@/lib/crm/types";
import { DetailsForm } from "./DetailsForm";
import { familyMessages, type FamilyMessages } from "./messages";

/** Props of the lead page's "More details" slot (docs/admin-phase-1b-plan.md §5.E, §13). */
export interface LeadMoreDetailsProps {
  lead: LeadDetail;
  viewer: CrmViewer;
  permissions: CrmPermissions;
  locale: Locale;
  /** LOCALE-FREE path of the lead page (`/crm/leads/<id>`), for refreshes after a save. */
  pagePath: string;
  now: number;
}

/**
 * "More details" under Details on the lead page (docs/admin-phase-1b-plan.md §5.E; owner:
 * 1B-FAMILY). Server component: reads the lead's details for this viewer (who already sees the
 * lead) and renders `LeadMoreDetailsPanel`; "Edit more details" is the only client island. Lead
 * routing's district and the place the family typed are shown read-only (changed only with
 * "Change area"). LeadDetailView mounts it inside `<Suspense>`.
 */
export async function LeadMoreDetails({ lead, viewer, locale, pagePath, now }: LeadMoreDetailsProps) {
  // The lead page's own read already recorded this view (`crm.lead_view`).
  const result = getLeadMoreDetails(viewer, lead.id, { audit: false });
  if (!result.ok) return null;
  return <LeadMoreDetailsPanel lead={lead} details={result.data} locale={locale} pagePath={pagePath} now={now} />;
}

/** Joining-session label: "2026–27 session". */
export function sessionLabel(f: FamilyMessages, key: SessionKey): string {
  return format(f.details.sessionLabel, { label: sessionRef(key).label });
}

/** The read view (and, for live leads, the edit dialog). Pure: data in, markup out. */
export function LeadMoreDetailsPanel({
  lead,
  details,
  locale,
  pagePath,
  now,
}: {
  lead: LeadDetail;
  details: Details;
  locale: Locale;
  pagePath: string;
  now: number;
}) {
  const f = familyMessages(locale);
  const d = f.details;
  const t = messagesFor(locale, "crm");
  const editable = !lead.erased;
  const notRecorded = <span className="text-muted">{d.notRecorded}</span>;
  const value = (text: string | null | undefined): ReactNode => (text ? text : notRecorded);
  const alt = details.altPhone;
  const routing = lead.routing ?? null;
  const district = areaName(locale, routing?.areaName ?? lead.area ?? null);
  const yearChoices = targetYearChoices(now, details.targetYear);
  const sessionChoices = intakeSessionChoices(now, details.intakeSession).map((key) => ({ value: key, label: sessionLabel(f, key) }));

  return (
    <PortalPanel
      id="crm-lead-more-details"
      title={d.title}
      description={d.description}
      action={
        editable ? (
          <DetailsForm
            leadId={lead.id}
            initial={details}
            mainPhone={lead.phone}
            yearChoices={yearChoices}
            sessionChoices={sessionChoices}
            f={d}
            t={{ errors: t.errors, common: t.common }}
            pagePath={pagePath}
          />
        ) : undefined
      }
    >
      {lead.erased && <p className="mb-3 text-sm text-muted">{d.erasedNote}</p>}
      <dl className="divide-y divide-line">
        <Row label={d.fields.altPhone}>
          {alt ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold tabular-nums">{displayPhone(alt)}</span>
              <a href={telHref(alt) ?? undefined} aria-label={d.callAlt} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control text-blue hover:underline">
                <Phone aria-hidden="true" className="size-4" />
                {d.call}
              </a>
              <a
                href={whatsAppHref(alt) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={d.whatsAppAlt}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control text-blue hover:underline"
              >
                <MessageCircle aria-hidden="true" className="size-4" />
                {d.whatsApp}
              </a>
            </span>
          ) : (
            notRecorded
          )}
        </Row>
        <Row label={d.fields.school}>{value(details.school)}</Row>
        <Row label={d.fields.board}>{value(details.board && d.boards[details.board])}</Row>
        <Row label={d.fields.hostel}>{value(details.hostel && d.hostel[details.hostel])}</Row>
        <Row label={d.fields.targetExam}>{value(details.targetExam && d.exams[details.targetExam])}</Row>
        <Row label={d.fields.targetYear}>{value(details.targetYear === null ? null : String(details.targetYear))}</Row>
        <Row label={d.fields.heardVia}>{value(details.heardVia && d.heardVia[details.heardVia])}</Row>
        <Row label={d.fields.referredBy}>{value(details.referredBy)}</Row>
        <Row label={d.fields.intakeSession}>{value(details.intakeSession && sessionLabel(f, details.intakeSession))}</Row>
        <Row label={d.fields.preferredTime}>{value(details.preferredTime && d.preferredTime[details.preferredTime])}</Row>
        <Row label={d.fields.decisionMaker}>{value(details.decisionMaker && d.decisionMakers[details.decisionMaker])}</Row>
        <Row label={d.district}>
          <span className="flex flex-col gap-0.5">
            <span>
              {district ?? <span className="text-muted">{d.districtNone}</span>}
              {routing?.placeInput && <span className="text-muted"> · {format(d.districtTyped, { place: routing.placeInput })}</span>}
            </span>
            {editable && <span className="text-xs text-muted">{d.districtHint}</span>}
          </span>
        </Row>
      </dl>
      {details.updatedAt && <p className="mt-3 text-xs text-muted">{format(d.updated, { date: formatDate(details.updatedAt, locale) ?? "" })}</p>}
    </PortalPanel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}
