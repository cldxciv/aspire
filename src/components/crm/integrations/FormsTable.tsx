"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";
import type { MetaActionResult } from "@/lib/crm/meta/types";
import type { MetaFormConfig } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, fieldClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import type { Option } from "../types";
import { actionSummary, INTEGRATIONS_PATH, type MetaIslandMessages } from "./model";

/**
 * The Page's lead forms (docs/lead-routing-plan.md §7 step 12, §18.3): defaults that fill blanks
 * (a single-purpose form such as "NEET Shimla") and each form's consent checkbox key (H4: without
 * it, leads are flagged "confirm consent on the first call"). "Sync forms" reads the list from
 * Meta. Super admins only; the server re-validates.
 */
export function FormsTable({
  forms,
  version,
  programs,
  centres,
  m,
  errors,
}: MetaIslandMessages & { forms: readonly MetaFormConfig[]; version: number; programs: readonly Option[]; centres: readonly Option[] }) {
  const f = m.forms;
  const id = useId();
  const save = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const sync = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const copy = () => forms.map((form) => ({ ...form, defaults: { ...form.defaults } }));
  const [rows, setRows] = useState<MetaFormConfig[]>(copy);
  const [syncNote, setSyncNote] = useState("");
  // A newer saved version (sync, another super admin) replaces the local rows; messages stay.
  const [baseVersion, setBaseVersion] = useState(version);
  if (baseVersion !== version) {
    setBaseVersion(version);
    setRows(copy());
  }

  const update = (index: number, patch: (form: MetaFormConfig) => MetaFormConfig) => setRows((current) => current.map((form, i) => (i === index ? patch(form) : form)));

  async function runSync() {
    setSyncNote("");
    const result = await sync.run<MetaActionResult>(leadOpsRequests.metaAction({ action: "sync_forms" }));
    if (result) setSyncNote(actionSummary(result, m));
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-heading`} className="text-lg font-extrabold text-navy">
            {f.heading}
          </h2>
          <p className="mt-1 text-sm text-muted">{f.lead}</p>
        </div>
        <Button variant="outline" disabled={sync.pending} aria-busy={sync.pending || undefined} onClick={() => void runSync()}>
          {f.sync}
        </Button>
      </div>
      <ActionFeedback status={syncNote} error={sync.error} />
      {rows.length === 0 ? (
        <p className="text-sm text-ink">{f.empty}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save.run(leadOpsRequests.saveMetaConfig({ forms: rows }, version), f.saved);
          }}
          className="space-y-4"
        >
          <div role="region" aria-labelledby={`${id}-heading`} tabIndex={0} className="overflow-x-auto rounded-control">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">{f.caption}</caption>
              <thead>
                <tr className="border-b border-line text-navy">
                  <th scope="col" className="py-2 pr-3">
                    {f.name}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {f.program}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {f.centre}
                  </th>
                  <th scope="col" className="py-2">
                    {f.consentKey}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((form, index) => {
                  const rowId = `${id}-${form.id}`;
                  return (
                    <tr key={form.id} className="border-b border-line align-top">
                      <th scope="row" id={`${rowId}-name`} className="py-3 pr-3 font-semibold text-ink">
                        <span className="block">{form.name || form.id}</span>
                        <span className="block text-xs font-normal text-muted">
                          {form.id}
                          {form.status ? ` · ${form.status}` : ""}
                        </span>
                      </th>
                      <td className="py-3 pr-3">
                        <select
                          aria-label={`${f.program}: ${form.name || form.id}`}
                          value={form.defaults.programInterest ?? ""}
                          onChange={(event) =>
                            update(index, (row) => ({ ...row, defaults: { ...row.defaults, programInterest: event.target.value || undefined } }))
                          }
                          className={fieldClasses}
                        >
                          <option value="">{f.none}</option>
                          {programs.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <select
                          aria-label={`${f.centre}: ${form.name || form.id}`}
                          value={form.defaults.centreSlug ?? ""}
                          onChange={(event) => update(index, (row) => ({ ...row, defaults: { ...row.defaults, centreSlug: event.target.value || undefined } }))}
                          className={fieldClasses}
                        >
                          <option value="">{f.none}</option>
                          {centres.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        <input
                          aria-label={`${f.consentKey}: ${form.name || form.id}`}
                          aria-describedby={`${id}-consent-hint`}
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={100}
                          value={form.consentCheckboxKey ?? ""}
                          onChange={(event) => update(index, (row) => ({ ...row, consentCheckboxKey: event.target.value.trim() === "" ? null : event.target.value }))}
                          className={fieldClasses}
                        />
                        {form.consentCheckboxKey === null && <p className="mt-1 text-xs font-semibold text-[#8b5b00]">{f.noConsentKey}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p id={`${id}-consent-hint`} className="text-sm text-muted">
            {f.consentKeyHint}
          </p>
          <Button type="submit" variant="dark" disabled={save.pending} aria-busy={save.pending || undefined}>
            {f.save}
          </Button>
          <ActionFeedback status={save.status} error={save.error} />
        </form>
      )}
    </section>
  );
}
