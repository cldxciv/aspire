"use client";

import { MapPinned } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { ALIAS_KINDS, type AliasKind, type CrmArea, type UnmatchedPlace } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { areaName, areaPageRequests, LOCALE_FREE_PATH, suggestedKind, suggestedLabel, type AreasMessages } from "./model";

/**
 * "Unmatched places" (A8; super admins only — the examples are families' own words): what
 * families typed that matched no district, most frequent first. "Map to district" remembers the
 * place as a name of that district (a town outside Himachal as a `border` name) and moves the
 * families still waiting under it to that district's team.
 */
export function UnmatchedPlaces({ places, areas, t }: { places: UnmatchedPlace[]; areas: CrmArea[]; t: AreasMessages }) {
  const u = t.a.unmatched;
  if (places.length === 0) return <p className="text-sm text-muted">{u.none}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{u.caption}</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-bold">
              {u.typed}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-bold">
              {u.families}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-bold">
              {u.open}
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              {u.why}
            </th>
            <th scope="col" className="py-2 font-bold">
              <span className="sr-only">{u.map}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {places.map((place) => (
            <tr key={place.key} className="border-b border-line align-top last:border-0">
              <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                {place.sample}
              </th>
              <td className="py-2 pr-3 text-right tabular-nums">{place.count}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{place.open}</td>
              <td className="py-2 pr-3">{place.outcomes.map((outcome) => u.outcomes[outcome as keyof typeof u.outcomes] ?? outcome).join(", ")}</td>
              <td className="py-2">
                <MapPlace place={place} areas={areas} t={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapPlace({ place, areas, t }: { place: UnmatchedPlace; areas: CrmArea[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const u = t.a.unmatched;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState("");
  const [label, setLabel] = useState(suggestedLabel(place.sample));
  const [kind, setKind] = useState<AliasKind>(suggestedKind(place));
  const [issue, setIssue] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaId) return setIssue(u.chooseArea);
    if (!label.trim()) return setIssue(t.a.aliases.required);
    setIssue(null);
    const result = await action.run<{ rerouted: number }>(
      areaPageRequests.mapPlace(areaId, { label, kind, placeKey: place.key }),
      undefined,
      (failure) => (failure.status === 409 ? t.a.aliases.taken : null),
    );
    if (result) {
      setStatus(format(u.mapped, { count: result.rerouted }));
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={format(u.mapTitle, { place: place.sample })}>
        <MapPinned aria-hidden="true" className="size-3.5" />
        {u.map}
      </Button>
      <ActionFeedback status={status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={submit} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(u.mapTitle, { place: place.sample })}
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-area`} className={labelClasses}>
              {u.area}
            </label>
            <select id={`${id}-area`} value={areaId} onChange={(event) => setAreaId(event.target.value)} className={fieldClasses}>
              <option value="">{u.chooseArea}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {areaName(area, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-label`} className={labelClasses}>
              {u.label}
            </label>
            <input id={`${id}-label`} value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} aria-describedby={`${id}-label-hint`} className={fieldClasses} />
            <p id={`${id}-label-hint`} className="text-sm text-muted">
              {u.labelHint}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-kind`} className={labelClasses}>
              {u.kind}
            </label>
            <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as AliasKind)} className={fieldClasses}>
              {ALIAS_KINDS.filter((value) => value !== "district").map((value) => (
                <option key={value} value={value}>
                  {t.a.aliases.kinds[value]}
                </option>
              ))}
            </select>
          </div>
          {issue && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {issue}
            </p>
          )}
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : u.submit}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
