"use client";

import type { CsvRow } from "@/lib/crm/intake/csv";
import { IMPORT_TARGETS, isImportTarget, mappingIssues, type ImportTarget } from "@/lib/crm/intake/rows";
import { fieldClasses } from "../client-kit";
import type { CrmImportMessages } from "./types";
import { columnExample } from "./wizard-model";

/** Column → field mapping: one select per column, first value shown (phones masked). */
export function MappingTable({
  header,
  rows,
  mapping,
  onChange,
  disabled = false,
  t,
}: {
  header: readonly string[];
  rows: readonly CsvRow[];
  mapping: readonly ImportTarget[];
  onChange: (column: number, target: ImportTarget) => void;
  disabled?: boolean;
  t: CrmImportMessages;
}) {
  const issues = mappingIssues(mapping);
  return (
    <div>
      <p className="text-sm text-muted">{t.mapping.intro}</p>
      <div role="region" aria-label={t.steps.mapping} tabIndex={0} className="mt-3 max-h-[28rem] overflow-auto rounded-control border border-line">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#354b66]">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-bold">
                {t.mapping.column}
              </th>
              <th scope="col" className="px-3 py-2.5 font-bold">
                {t.mapping.example}
              </th>
              <th scope="col" className="px-3 py-2.5 font-bold">
                {t.mapping.target}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {header.map((name, column) => {
              const id = `import-map-${column}`;
              return (
                <tr key={`${column}-${name}`} className="align-middle">
                  <th scope="row" className="max-w-[16rem] break-words px-3 py-2 font-semibold text-ink">
                    <label htmlFor={id}>{name || `#${column + 1}`}</label>
                  </th>
                  <td className="max-w-[14rem] break-words px-3 py-2 text-muted">{columnExample(rows, column, mapping[column] ?? "ignore")}</td>
                  <td className="px-3 py-2">
                    <select
                      id={id}
                      value={mapping[column] ?? "ignore"}
                      disabled={disabled}
                      onChange={(event) => {
                        const target = event.target.value;
                        if (isImportTarget(target)) onChange(column, target);
                      }}
                      className={fieldClasses}
                    >
                      {IMPORT_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {t.mapping.targets[target]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="alert" className="mt-2 text-sm font-semibold text-danger">
        {issues.includes("phone_unmapped") ? t.mapping.phoneRequired : issues.includes("duplicate_target") ? t.mapping.duplicateTarget : ""}
      </p>
    </div>
  );
}
