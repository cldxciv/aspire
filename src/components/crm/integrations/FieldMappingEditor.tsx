"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { IMPORT_TARGETS, type ImportTarget } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { cleanQuestionKey, fieldMapRows, INTEGRATIONS_PATH, type MetaIslandMessages } from "./model";

/** Field choices for a form question (ids and dates come from the lead itself, not from answers). */
const QUESTION_TARGETS: readonly ImportTarget[] = IMPORT_TARGETS.filter(
  (target) => !["metaLeadId", "createdTime", "formId", "formName", "adId", "adName", "adsetName", "campaignId", "campaignName", "platform", "isOrganic"].includes(target),
);

/**
 * Meta form question → CRM field (docs/lead-routing-plan.md §18.3, §7 step 12). "Sync forms" adds
 * new questions with a guess; the super admin checks district / city, the parent-or-student
 * question and the consent checkbox. Unknown questions are kept as answers. Super admins only.
 */
export function FieldMappingEditor({ fieldMap, version, m, errors }: MetaIslandMessages & { fieldMap: Readonly<Record<string, ImportTarget>>; version: number }) {
  const t = m.fieldMap;
  const id = useId();
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const [rows, setRows] = useState(() => fieldMapRows(fieldMap));
  // A newer saved version (Sync forms adds questions) replaces the local rows; messages stay.
  const [baseVersion, setBaseVersion] = useState(version);
  if (baseVersion !== version) {
    setBaseVersion(version);
    setRows(fieldMapRows(fieldMap));
  }
  const [newKey, setNewKey] = useState("");
  const [issue, setIssue] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    const key = cleanQuestionKey(newKey);
    if (!key) return;
    if (rows.some((row) => row.question === key)) {
      setIssue(t.duplicate);
      return;
    }
    setIssue("");
    setRows((current) => [...current, { question: key, target: "answer" }]);
    setNewKey("");
  }

  async function save() {
    const map: Record<string, ImportTarget> = {};
    for (const row of rows) map[row.question] = row.target;
    await action.run(leadOpsRequests.saveMetaConfig({ fieldMap: map }, version), t.saved);
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-extrabold text-navy">
          {t.heading}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink">{t.empty}</p>
      ) : (
        <div role="region" aria-labelledby={`${id}-heading`} tabIndex={0} className="overflow-x-auto rounded-control">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead>
              <tr className="border-b border-line text-navy">
                <th scope="col" className="py-2 pr-3">
                  {t.question}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.target}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{m.actions.heading}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.question} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 font-mono text-xs font-semibold break-all text-ink">
                    {row.question}
                  </th>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`${t.target}: ${row.question}`}
                      value={row.target}
                      onChange={(event) =>
                        setRows((current) => current.map((item, i) => (i === index ? { ...item, target: event.target.value as ImportTarget } : item)))
                      }
                      className={fieldClasses}
                    >
                      {QUESTION_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {t.targets[target]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Button variant="outline" size="sm" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                      {format(t.remove, { question: row.question })}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`${id}-key`} className={labelClasses}>
            {t.addLabel}
          </label>
          <input
            id={`${id}-key`}
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            aria-describedby={`${id}-key-issue`}
            className={fieldClasses}
          />
        </div>
        <Button type="submit" variant="outline">
          {t.add}
        </Button>
      </form>
      <p id={`${id}-key-issue`} role="alert" className="text-sm font-semibold text-danger">
        {issue}
      </p>
      <Button variant="dark" disabled={action.pending} aria-busy={action.pending || undefined} onClick={() => void save()}>
        {t.save}
      </Button>
      <ActionFeedback status={action.status} error={action.error} />
    </section>
  );
}
