"use client";

import { Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { ALIAS_KINDS, type AliasKind, type CrmArea } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { LOCALE_FREE_PATH, type AreasMessages } from "./model";

/**
 * An area's place names (§13.2): spellings, towns, Hindi names and, for towns just outside
 * Himachal, `border` names. Collapsed by default (the seeded lists are long). Super admins add
 * and remove; a name another area uses is refused (409).
 */
export function AliasEditor({ area, canEdit, t }: { area: CrmArea; canEdit: boolean; t: AreasMessages }) {
  const id = useId();
  const al = t.a.aliases;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AliasKind>("town");
  const [issue, setIssue] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim()) {
      setIssue(al.required);
      return;
    }
    setIssue(null);
    const result = await action.run<{ rerouted: number }>(
      leadOpsRequests.addAreaAlias(area.id, { label: label.trim(), kind }),
      undefined,
      (failure) => (failure.status === 409 ? al.taken : null),
    );
    if (result) {
      setLabel("");
      action.reset();
      setStatus(result.rerouted > 0 ? format(al.addedMoved, { count: result.rerouted }) : al.added);
    }
  }

  async function remove(key: string) {
    setStatus("");
    await action.run(leadOpsRequests.removeAreaAlias(area.id, key), al.removed);
  }

  return (
    <details className="mt-3 rounded-control border border-line bg-white px-3 py-2">
      <summary className="min-h-9 cursor-pointer py-1 text-sm font-bold text-navy">{format(t.a.area.placeNames, { count: area.aliases.length })}</summary>
      <p className="mt-1 text-sm text-muted">{al.intro}</p>
      {area.aliases.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{al.none}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {area.aliases.map((alias) => (
            <li key={alias.key} className="inline-flex items-center gap-1 rounded-full border border-line bg-[#f4f7fb] py-0.5 pr-1 pl-2.5 text-sm">
              <span>{alias.label}</span>
              <span className="text-xs text-muted">({al.kinds[alias.kind]})</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(alias.key)}
                  disabled={action.pending}
                  aria-label={format(al.remove, { label: alias.label })}
                  className="inline-flex size-7 items-center justify-center rounded-full text-[#4a5568] hover:bg-danger-soft hover:text-danger disabled:opacity-60"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} noValidate className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-label`} className={labelClasses}>
              {al.label}
            </label>
            <input
              id={`${id}-label`}
              value={label}
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              aria-invalid={issue ? true : undefined}
              aria-describedby={issue ? `${id}-issue` : undefined}
              className={fieldClasses}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-kind`} className={labelClasses}>
              {al.kind}
            </label>
            <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as AliasKind)} className={fieldClasses}>
              {ALIAS_KINDS.map((value) => (
                <option key={value} value={value}>
                  {al.kinds[value]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={action.pending}>
            <Plus aria-hidden="true" className="size-4" />
            {al.submit}
          </Button>
          {issue && (
            <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger sm:col-span-3">
              {issue}
            </p>
          )}
        </form>
      )}
      <ActionFeedback status={status || action.status} error={action.error} className="mt-2" />
    </details>
  );
}
