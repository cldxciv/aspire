"use client";

import { MapPin } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { crmFailureMessage, sendCrm } from "./api";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import type { CrmMessages } from "./format";
import { leadOpsRequests } from "./lead-ops-api";

export type ChangeAreaMessages = Pick<CrmMessages, "common" | "errors"> & { routing: CrmMessages["lead"]["routing"] };

const NONE = "";

/**
 * "Change area" on a lead (docs/lead-routing-plan.md §13.7, §20): a super admin, or a manager who
 * can see the lead. The areas are fetched when the dialog opens (GET /api/crm/areas, ROUTING);
 * the change is PATCH /api/crm/leads/:leadId/area (ROUTING re-picks the executive when needed and
 * audits it). The server decides who may do it; this button is only shown to them.
 */
export function ChangeAreaButton({
  leadId,
  areaId,
  pagePath,
  t,
}: {
  leadId: string;
  areaId: string | null;
  pagePath: string;
  t: ChangeAreaMessages;
}) {
  const locale = useLocale();
  const id = useId();
  const action = useCrmAction(t, pagePath);
  const [open, setOpen] = useState(false);
  const [areas, setAreas] = useState<CrmArea[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(areaId ?? NONE);
  const [issue, setIssue] = useState<string | null>(null);
  const r = t.routing;

  async function openDialog() {
    setOpen(true);
    setChoice(areaId ?? NONE);
    setIssue(null);
    if (areas) return;
    setLoadError(null);
    const result = await sendCrm<CrmArea[]>(leadOpsRequests.listAreas());
    if (result.ok) setAreas(result.data.filter((area) => area.active));
    else setLoadError(result.error === "network" || result.error === "server_error" ? r.loadFailed : crmFailureMessage(result, t));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = choice === NONE ? null : choice;
    if (next === areaId) {
      setIssue(r.unchanged);
      return;
    }
    const result = await action.run(leadOpsRequests.changeLeadArea(leadId, next), r.saved);
    if (result !== null) setOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <MapPin aria-hidden="true" className="size-4" />
        {r.change}
      </Button>
      <ActionFeedback status={action.status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={save} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {r.changeTitle}
          </h2>
          <p className="text-sm text-muted">{r.changeIntro}</p>
          {areas === null && !loadError && (
            <p role="status" className="text-sm text-muted">
              {r.loading}
            </p>
          )}
          {loadError && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {loadError}
            </p>
          )}
          {areas && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-area`} className={labelClasses}>
                {r.chooseArea}
              </label>
              <select
                id={`${id}-area`}
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                aria-invalid={issue ? true : undefined}
                aria-describedby={issue ? `${id}-issue` : undefined}
                className={fieldClasses}
              >
                <option value={NONE}>{r.noAreaOption}</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {locale === "hi" ? area.nameHi : area.nameEn}
                  </option>
                ))}
              </select>
              {issue && (
                <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger">
                  {issue}
                </p>
              )}
            </div>
          )}
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending || !areas}>
              {action.pending ? t.common.saving : r.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
