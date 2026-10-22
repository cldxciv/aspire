"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, labelClasses, useCrmAction } from "../client-kit";
import { areaName, areaPageRequests, LOCALE_FREE_PATH, nameOfArea, type AreaPersonView, type AreasMessages } from "./model";

/**
 * "Review: area heads who see all leads" (§13.5, H2): managers with no explicit scope still see
 * every lead of their centres (or every lead). Super admins give them their districts ("Switch to
 * areas" → PUT /api/crm/areas/people/:userId), after which they see only those districts.
 */
export function LegacyScopeReview({ managers, areas, canEdit, t }: { managers: AreaPersonView[]; areas: CrmArea[]; canEdit: boolean; t: AreasMessages }) {
  const locale = useLocale();
  const l = t.a.legacy;
  if (managers.length === 0) return <p className="text-sm text-muted">{l.none}</p>;
  return (
    <ul className="divide-y divide-line rounded-control border border-line">
      {managers.map((manager) => (
        <li key={manager.userId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="font-semibold text-ink">{manager.displayName}</span>
            {manager.areaIds.length > 0 && <span className="text-sm text-muted"> · {manager.areaIds.map((id) => nameOfArea(areas, id, locale)).join(", ")}</span>}
          </span>
          {canEdit && <SwitchToAreas manager={manager} areas={areas} t={t} />}
        </li>
      ))}
    </ul>
  );
}

function SwitchToAreas({ manager, areas, t }: { manager: AreaPersonView; areas: CrmArea[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const l = t.a.legacy;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(manager.areaIds);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await action.run(areaPageRequests.setPersonAreas(manager.userId, chosen), l.saved);
    if (saved) setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setChosen(manager.areaIds);
          setOpen(true);
        }}
        aria-label={format(l.switchTitle, { name: manager.displayName })}
      >
        {l.switch}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(l.switchTitle, { name: manager.displayName })}
          </h2>
          <p className="text-sm text-muted">{format(l.switchIntro, { name: manager.displayName })}</p>
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className={`${labelClasses} mb-1`}>{t.a.staff.areas}</legend>
            {areas.map((area) => (
              <label key={area.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen.includes(area.id)}
                  onChange={(event) => setChosen((current) => (event.target.checked ? [...current, area.id] : current.filter((value) => value !== area.id)))}
                  className="size-4"
                />
                {areaName(area, locale)}
              </label>
            ))}
          </fieldset>
          {chosen.length === 0 && (
            <p role="note" className="text-sm font-semibold text-[#5c4a12]">
              {l.noAreasWarning}
            </p>
          )}
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : l.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
