"use client";

import { Merge } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { areaName, LOCALE_FREE_PATH, mergeIssue, nameOfArea, type AreasMessages } from "./model";

/**
 * "Merge areas" (super admins, L5): pick the area to merge and the one to keep; for EACH person in
 * the first area choose "move" or "remove" (nobody moves silently). Place names, centres and
 * enquiries move; the first area is switched off.
 */
export function MergeDialog({ areas, t }: { areas: CrmArea[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const m = t.a.merge;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");
  const [choices, setChoices] = useState<Record<string, "move" | "remove" | undefined>>({});
  const [issue, setIssue] = useState<string | null>(null);
  const source = areas.find((area) => area.id === from) ?? null;
  const members = source?.members ?? [];

  function openDialog() {
    setFrom("");
    setInto("");
    setChoices({});
    setIssue(null);
    action.reset();
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = mergeIssue({ from, into, people: members.map((member) => member.userId), choices });
    if (problem) {
      setIssue(m[problem]);
      return;
    }
    setIssue(null);
    const people = members.map((member) => ({ userId: member.userId, action: choices[member.userId] as "move" | "remove" }));
    const merged = await action.run(leadOpsRequests.mergeAreas({ from, into, people }), m.merged);
    if (merged) setOpen(false);
  }

  const areaSelect = (value: string, onChange: (next: string) => void, label: string, field: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${field}`} className={labelClasses}>
        {label}
      </label>
      <select id={`${id}-${field}`} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClasses}>
        <option value="">—</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {areaName(area, locale)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <Merge aria-hidden="true" className="size-4" />
        {m.open}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)} wide>
        <form onSubmit={submit} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {m.title}
          </h2>
          <p className="text-sm text-muted">{m.intro}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {areaSelect(from, (next) => {
              setFrom(next);
              setChoices({});
            }, m.from, "from")}
            {areaSelect(into, setInto, m.into, "into")}
          </div>
          {source && (
            <fieldset className="space-y-2">
              <legend className={labelClasses}>{format(m.people, { area: areaName(source, locale) })}</legend>
              {members.length === 0 ? (
                <p className="text-sm text-muted">{m.noPeople}</p>
              ) : (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {members.map((member) => (
                    <li key={member.userId} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-ink">{member.displayName}</span>
                      <span role="radiogroup" aria-label={member.displayName} className="flex flex-wrap gap-3">
                        {(["move", "remove"] as const).map((choice) => (
                          <label key={choice} className="flex min-h-11 items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              name={`${id}-${member.userId}`}
                              checked={choices[member.userId] === choice}
                              onChange={() => setChoices((current) => ({ ...current, [member.userId]: choice }))}
                            />
                            {choice === "move" ? format(m.move, { area: into ? nameOfArea(areas, into, locale) : "…" }) : m.remove}
                          </label>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          )}
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
              {action.pending ? t.common.saving : m.submit}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
