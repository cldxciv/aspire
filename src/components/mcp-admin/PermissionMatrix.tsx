"use client";

import { TriangleAlert } from "lucide-react";
import { useId, type Ref } from "react";
import { Badge, Button } from "@/components/ui";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { permissionSummaryLines, serviceDescription, serviceName, type McpTokenManagerMessages } from "./labels";
import {
  accessOf,
  applyPreset,
  hasAnyWrite,
  matchingPreset,
  setRead,
  setWrite,
  type McpServiceView,
  type PermissionPreset,
  type PermissionState,
} from "./permissions";

/**
 * The create form's permission matrix: one row per MCP service (name, what it covers, its tools),
 * Read / Write checkboxes, presets above and a live summary below. A real table on wide screens
 * (row headers + column headers); each row stacks as a card on narrow ones. Ticking Write ticks
 * Read, unticking Read unticks Write; Write is disabled where a service has no write tools, and
 * unavailable services are disabled and marked "coming soon". Explicit-only services (CRM lead
 * data) carry a note that the quick choices never tick them.
 */
export function PermissionMatrix({
  services,
  state,
  onChange,
  m,
  error,
  firstInputRef,
}: {
  services: readonly McpServiceView[];
  state: PermissionState;
  onChange: (next: PermissionState) => void;
  m: McpTokenManagerMessages["mcp"];
  error?: string;
  firstInputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const t = m.create;
  const preset = matchingPreset(services, state);
  const lines = permissionSummaryLines(services, state, t, m.services);
  const anyWrite = hasAnyWrite(services, state);
  const firstAvailable = services.find((service) => service.available)?.id;
  const presets: { key: PermissionPreset; label: string }[] = [
    { key: "readOnly", label: t.presetReadOnly },
    { key: "full", label: t.presetFull },
    { key: "clear", label: t.presetClear },
  ];
  const describedBy = [`${id}-hint`, `${id}-summary`, error ? `${id}-error` : null].filter(Boolean).join(" ");

  return (
    <fieldset className="min-w-0" aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-bold text-navy">{t.permissions}</legend>
      <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
        {t.permissionsHint}
      </p>

      <div role="group" aria-label={t.presetsLabel} className="mt-3 flex flex-wrap gap-2">
        {presets.map(({ key, label }) => (
          <Button
            key={key}
            variant={preset === key ? "dark" : "outline"}
            aria-pressed={preset === key}
            onClick={() => onChange(applyPreset(services, key))}
          >
            {label}
          </Button>
        ))}
      </div>

      <table role="table" className="mt-3 block w-full text-sm md:table md:border-collapse">
        <caption className="sr-only">{t.matrixCaption}</caption>
        <thead role="rowgroup" className="sr-only md:not-sr-only md:table-header-group">
          <tr role="row" className="border-b border-line text-left text-xs font-bold text-[#354b66]">
            <th role="columnheader" scope="col" className="px-3 py-2">
              {t.columnService}
            </th>
            <th role="columnheader" scope="col" className="w-28 px-3 py-2 text-center">
              {t.columnRead}
            </th>
            <th role="columnheader" scope="col" className="w-28 px-3 py-2 text-center">
              {t.columnWrite}
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="grid gap-2 md:table-row-group">
          {services.map((service) => {
            const name = serviceName(service.id, m.services);
            const description = serviceDescription(service.id, m.services);
            const access = accessOf(state, service.id);
            const rowId = `${id}-${service.id}`;
            const writeDisabled = !service.available || !service.hasWrite;
            return (
              <tr
                key={service.id}
                role="row"
                className={cn(
                  "grid grid-cols-2 gap-x-2 rounded-control border p-3 md:table-row md:rounded-none md:border-0 md:border-b md:p-0",
                  !service.available
                    ? "border-line bg-[#f8f9fb]"
                    : access === "write"
                      ? "border-[#f2dfa0] bg-gold-soft"
                      : access === "read"
                        ? "border-[#d7e7fb] bg-[#f5f9ff]"
                        : "border-line bg-white",
                )}
              >
                <th role="rowheader" scope="row" className="col-span-2 min-w-0 text-left font-normal md:px-3 md:py-3 md:align-top">
                  <span className="flex flex-wrap items-center gap-2 font-bold text-navy">
                    {name}
                    {!service.available && <Badge variant="neutral">{t.comingSoon}</Badge>}
                  </span>
                  {description && (
                    <span id={`${rowId}-desc`} className="mt-0.5 block text-xs text-muted">
                      {description}
                    </span>
                  )}
                  {service.available && service.explicitOnly && (
                    <span className="mt-1 block text-xs font-semibold text-[#8b5b00]">{t.explicitOnly}</span>
                  )}
                  <ToolList label={t.columnRead} tools={service.readTools} />
                  <ToolList label={t.columnWrite} tools={service.writeTools} />
                </th>
                <td role="cell" className="mt-2 md:mt-0 md:px-3 md:py-3 md:text-center md:align-top">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-1 has-[:disabled]:cursor-not-allowed">
                    <input
                      ref={service.id === firstAvailable ? firstInputRef : undefined}
                      type="checkbox"
                      checked={access !== "none"}
                      disabled={!service.available}
                      onChange={(event) => onChange(setRead(state, service, event.target.checked))}
                      aria-label={format(t.readLabel, { service: name })}
                      aria-describedby={description ? `${rowId}-desc` : undefined}
                      className="size-5 shrink-0 accent-navy"
                    />
                    <span aria-hidden="true" className="font-semibold text-navy md:sr-only">
                      {t.columnRead}
                    </span>
                  </label>
                </td>
                <td role="cell" className="mt-2 md:mt-0 md:px-3 md:py-3 md:text-center md:align-top">
                  <label
                    title={!service.available ? t.comingSoonHint : !service.hasWrite ? t.noWriteHint : undefined}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-1 has-[:disabled]:cursor-not-allowed"
                  >
                    <input
                      type="checkbox"
                      checked={access === "write"}
                      disabled={writeDisabled}
                      onChange={(event) => onChange(setWrite(state, service, event.target.checked))}
                      aria-label={format(t.writeLabel, { service: name })}
                      aria-describedby={
                        service.available && !service.hasWrite
                          ? `${rowId}-nowrite`
                          : description
                            ? `${rowId}-desc`
                            : undefined
                      }
                      className="size-5 shrink-0 accent-[#8b5b00]"
                    />
                    <span aria-hidden="true" className={cn("font-semibold md:sr-only", writeDisabled ? "text-muted" : "text-navy")}>
                      {t.columnWrite}
                    </span>
                  </label>
                  {service.available && !service.hasWrite && (
                    <span id={`${rowId}-nowrite`} className="block text-xs text-muted">
                      {t.noWrite}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p id={`${id}-summary`} aria-live="polite" className="mt-3 rounded-control bg-[#f8fbff] p-3 text-sm text-ink">
        {lines ? (
          <>
            <span className="block">{lines.read}</span>
            <span className={cn("block", anyWrite && "font-semibold text-[#8b5b00]")}>{lines.write}</span>
          </>
        ) : (
          t.summaryNone
        )}
      </p>
      {anyWrite && (
        <div role="note" className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t.writeWarning}</p>
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ToolList({ label, tools }: { label: string; tools: readonly string[] }) {
  if (tools.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-muted">
      <span className="font-semibold">{label}:</span>
      {tools.map((tool) => (
        <code key={tool} lang="en" translate="no" className="break-all rounded bg-[#eef3f9] px-1 py-px font-mono text-[11px] text-[#354b66]">
          {tool}
        </code>
      ))}
    </span>
  );
}
