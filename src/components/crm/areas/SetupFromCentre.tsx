"use client";

import { UsersRound } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { areaName, areasServedBy, LOCALE_FREE_PATH, nameOfArea, type AreaPersonView, type AreasMessages, type CentreOption } from "./model";

/**
 * "Set up from centre" (A1, super admins): one centre, its area heads and executives → they join
 * the centre's own district and every district it serves. Executives are tied to the centre.
 * Additive: nobody is removed (use "Choose people" on a district for that).
 */
export function SetupFromCentre({ areas, people, centres, t }: { areas: CrmArea[]; people: AreaPersonView[]; centres: CentreOption[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const s = t.a.setup;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [centre, setCentre] = useState("");
  const [heads, setHeads] = useState<string[]>([]);
  const [executives, setExecutives] = useState<string[]>([]);
  const [headsTakeCalls, setHeadsTakeCalls] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const usable = people.filter((person) => person.active && !person.disabled);
  const managers = usable.filter((person) => person.crmRole === "manager");
  const counsellors = usable.filter((person) => person.crmRole === "counsellor");
  const served = centre ? areasServedBy(centre, areas) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    if (!centre) return setIssue(s.needCentre);
    if (heads.length + executives.length === 0) return setIssue(s.needPerson);
    setIssue(null);
    const data = await action.run<{ areaIds: string[]; heads: number; executives: number }>(
      leadOpsRequests.setupFromCentre({ centreSlug: centre, headIds: heads, executiveIds: executives, headsTakeCalls }),
    );
    if (data) {
      setStatus(format(s.done, { heads: data.heads, executives: data.executives, areas: data.areaIds.map((areaId) => nameOfArea(areas, areaId, locale)).join(", ") }));
      setHeads([]);
      setExecutives([]);
    }
  }

  const peopleBoxes = (list: AreaPersonView[], value: string[], set: (next: string[]) => void, legend: string, empty: string) => (
    <fieldset className="space-y-1">
      <legend className={labelClasses}>{legend}</legend>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        list.map((person) => (
          <label key={person.userId} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={value.includes(person.userId)}
              onChange={(event) => set(event.target.checked ? [...value, person.userId] : value.filter((userId) => userId !== person.userId))}
              className="size-4"
            />
            {person.displayName}
          </label>
        ))
      )}
    </fieldset>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-busy={action.pending || undefined}>
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label htmlFor={`${id}-centre`} className={labelClasses}>
          {s.centre}
        </label>
        <select id={`${id}-centre`} value={centre} onChange={(event) => setCentre(event.target.value)} aria-describedby={served.length > 0 ? `${id}-serves` : undefined} className={fieldClasses}>
          <option value="">{s.chooseCentre}</option>
          {centres.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {served.length > 0 && (
          <p id={`${id}-serves`} className="text-sm text-muted">
            {format(s.serves, { areas: served.map((area) => areaName(area, locale)).join(", ") })}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {peopleBoxes(managers, heads, setHeads, s.heads, s.noManagers)}
        {peopleBoxes(counsellors, executives, setExecutives, s.executives, s.noCounsellors)}
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={headsTakeCalls} onChange={(event) => setHeadsTakeCalls(event.target.checked)} className="size-4" />
        {s.headsTakeCalls}
      </label>
      {issue && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {issue}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="dark" disabled={action.pending}>
          <UsersRound aria-hidden="true" className="size-4" />
          {action.pending ? t.common.saving : s.submit}
        </Button>
        <ActionFeedback status={status} error={action.error} />
      </div>
    </form>
  );
}
