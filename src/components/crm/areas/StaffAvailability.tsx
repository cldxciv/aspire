"use client";

import { ArrowRightLeft, CalendarOff, UserCheck } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { AVAILABILITY_MAX_DAYS, AVAILABILITY_NOTE_MAX, type CrmArea, type ReassignScope } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { formatDate, istDayStart } from "../format";
import { leadOpsRequests } from "../lead-ops-api";
import { awayDayIssue, LOCALE_FREE_PATH, nameOfArea, peopleInReach, type AreaPersonView, type AreasMessages } from "./model";

/**
 * "People and availability" (A5): super admins see everyone, area heads the members of their
 * districts. "Mark away" (new families go to colleagues while away; at most 60 days) and "Move
 * leads" (the enquiries they have not called yet, or all open ones, re-picked or to a chosen
 * person). The server re-checks who may do this for whom.
 */
export function StaffAvailability({
  areas,
  people,
  viewer,
  t,
}: {
  areas: CrmArea[];
  people: AreaPersonView[];
  viewer: { userId: string; superAdmin: boolean; areaIds: string[] };
  t: AreasMessages;
}) {
  const locale = useLocale();
  const s = t.a.staff;
  const rows = peopleInReach(
    people.filter((person) => !person.disabled),
    viewer,
  );
  if (rows.length === 0) return <p className="text-sm text-muted">{s.none}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-bold">
              {s.name}
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              {s.role}
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              {s.areas}
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              {s.status}
            </th>
            <th scope="col" className="py-2 font-bold">
              {s.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => (
            <tr key={person.userId} className="border-b border-line align-top last:border-0">
              <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                {person.displayName}
              </th>
              <td className="py-2 pr-3">{person.crmRole === "manager" ? t.a.area.head : t.a.area.executive}</td>
              <td className="py-2 pr-3">{person.areaIds.length > 0 ? person.areaIds.map((areaId) => nameOfArea(areas, areaId, locale)).join(", ") : s.noAreas}</td>
              <td className="py-2 pr-3">
                {person.awayUntil ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#5c4a12]">
                    <CalendarOff aria-hidden="true" className="size-4" />
                    {format(s.awayUntil, { date: formatDate(person.awayUntil, locale) ?? "" })}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#14744d]">
                    <UserCheck aria-hidden="true" className="size-4" />
                    {s.available}
                  </span>
                )}
              </td>
              <td className="py-2">
                <div className="flex flex-wrap gap-2">
                  <AwayControl person={person} t={t} />
                  <ReassignControl person={person} people={rows} t={t} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AwayControl({ person, t }: { person: AreaPersonView; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const s = t.a.staff;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = awayDayIssue(day, Date.now());
    if (problem) return setIssue(problem === "tooFar" ? format(s.tooFar, { days: AVAILABILITY_MAX_DAYS }) : s[problem]);
    setIssue(null);
    const until = istDayStart(day);
    const saved = await action.run(
      leadOpsRequests.setAvailability({ userId: person.userId, awayUntil: new Date(until).toISOString(), note: note.trim() || null }),
      format(s.awayDone, { name: person.displayName, date: formatDate(until, locale) ?? day }),
    );
    if (saved) setOpen(false);
  }

  if (person.awayUntil) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          disabled={action.pending}
          onClick={() => action.run(leadOpsRequests.setAvailability({ userId: person.userId, awayUntil: null }), format(s.backDone, { name: person.displayName }))}
        >
          {s.back}
        </Button>
        <ActionFeedback status={action.status} error={action.error} />
      </>
    );
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={format(s.awayTitle, { name: person.displayName })}>
        <CalendarOff aria-hidden="true" className="size-3.5" />
        {s.setAway}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={save} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(s.awayTitle, { name: person.displayName })}
          </h2>
          <p className="text-sm text-muted">{format(s.awayIntro, { days: AVAILABILITY_MAX_DAYS })}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-day`} className={labelClasses}>
              {s.until}
            </label>
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              aria-invalid={issue ? true : undefined}
              aria-describedby={issue ? `${id}-issue` : undefined}
              className={fieldClasses}
            />
            {issue && (
              <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger">
                {issue}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-note`} className={labelClasses}>
              {s.note}
            </label>
            <input id={`${id}-note`} value={note} maxLength={AVAILABILITY_NOTE_MAX} onChange={(event) => setNote(event.target.value)} className={fieldClasses} />
          </div>
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : s.awaySave}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}

function ReassignControl({ person, people, t }: { person: AreaPersonView; people: AreaPersonView[]; t: AreasMessages }) {
  const id = useId();
  const s = t.a.staff;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ReassignScope>("uncalled");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const targets = people.filter((other) => other.userId !== person.userId && other.active && !other.awayUntil);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    const data = await action.run<{ moved: number; unassigned: number }>(leadOpsRequests.reassignLeads({ fromUserId: person.userId, scope, toUserId: to || null }));
    if (data) {
      setStatus(format(s.reassigned, data));
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={format(s.reassignTitle, { name: person.displayName })}>
        <ArrowRightLeft aria-hidden="true" className="size-3.5" />
        {s.reassign}
      </Button>
      <ActionFeedback status={status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(s.reassignTitle, { name: person.displayName })}
          </h2>
          <fieldset className="space-y-1">
            <legend className={labelClasses}>{s.scope}</legend>
            {(["uncalled", "open"] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input type="radio" name={`${id}-scope`} checked={scope === value} onChange={() => setScope(value)} />
                {value === "uncalled" ? s.uncalled : s.open}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-to`} className={labelClasses}>
              {s.to}
            </label>
            <select id={`${id}-to`} value={to} onChange={(event) => setTo(event.target.value)} className={fieldClasses}>
              <option value="">{s.auto}</option>
              {targets.map((other) => (
                <option key={other.userId} value={other.userId}>
                  {other.displayName}
                </option>
              ))}
            </select>
          </div>
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : s.reassignSubmit}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
