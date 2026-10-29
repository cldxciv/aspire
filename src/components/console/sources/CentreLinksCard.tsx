"use client";

import { ExternalLink, PencilLine } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { format } from "@/i18n/format";
import type en from "@/i18n/messages/en/console-sources";
import type { ApiFailure } from "@/lib/auth/client-api";
import { sourcesRequests } from "./api";
import { CopyLinkButton } from "./CopyLinkButton";

export type CentreLinksMessages = (typeof en)["links"];

/** One centre of the card: its Google Maps link (null = not set) and its tagged website link. */
export interface CentreLinkRow {
  slug: string;
  label: string;
  mapsUrl: string | null;
  /** Absolute tagged link for the centre's Google Business Profile (`gbpTaggedPath`). */
  taggedUrl: string;
}

const MAX_URL = 300;

/** The part of a link worth showing: host and path, without the scheme. */
function shortUrl(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/\/$/, "");
}

/**
 * The Centre links card (docs/admin-phase-1b-plan.md §5.J item 2; owner: 1B-SOURCES): per centre
 * the Google Maps link (opens in a new tab) and the tagged website link with a copy button, under
 * the decision-17 domain warning. Super admins edit every link in one form (PUT with the version
 * they loaded: 409 when someone saved meanwhile); everyone else reads. The server re-checks every
 * write (super admin only, https Google Maps hosts, ≤ 300 characters).
 */
export function CentreLinksCard({
  rows,
  version,
  canEdit,
  pagePath,
  notSet,
  t,
  errors,
}: {
  rows: readonly CentreLinkRow[];
  version: number;
  canEdit: boolean;
  /** LOCALE-FREE path of the page (to come back after signing in again). */
  pagePath: string;
  notSet: string;
  t: CentreLinksMessages;
  errors: Pick<CrmMessages, "errors">;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const editButton = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const action = useCrmAction(errors, pagePath);

  function startEditing() {
    setDraft(Object.fromEntries(rows.map((row) => [row.slug, row.mapsUrl ?? ""])));
    setFieldErrors({});
    action.reset();
    setEditing(true);
    requestAnimationFrame(() => firstInput.current?.focus());
  }

  function stopEditing() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issues: Record<string, string> = {};
    const centres: Record<string, { mapsUrl: string | null }> = {};
    for (const row of rows) {
      const value = (draft[row.slug] ?? "").trim();
      if (value.length > MAX_URL) issues[row.slug] = t.tooLong;
      else if (value !== "" && !/^https:\/\/\S+$/i.test(value)) issues[row.slug] = t.invalidUrl;
      centres[row.slug] = { mapsUrl: value === "" ? null : value };
    }
    setFieldErrors(issues);
    if (Object.keys(issues).length > 0) {
      // A generic summary: each field says what is wrong with it (bad link or too long).
      action.setError(errors.errors.validation);
      return;
    }
    const onFailure = (result: ApiFailure): string | null => {
      if (result.status === 409) return t.conflict;
      const fromServer: Record<string, string> = {};
      for (const key of Object.keys(result.fieldErrors)) {
        const match = /^centres\.([^.]+)\.mapsUrl$/.exec(key);
        if (match) fromServer[match[1]] = t.invalidUrl;
      }
      if (Object.keys(fromServer).length > 0) {
        setFieldErrors(fromServer);
        return errors.errors.validation;
      }
      return null;
    };
    const saved = await action.run(sourcesRequests.saveCentreLinks(centres, version), t.saved, onFailure);
    if (saved) stopEditing();
  }

  if (rows.length === 0) return <p className="text-sm text-muted">{t.noCentres}</p>;

  return (
    <div>
      <p role="note" className="mb-4 rounded-control border border-[#f2dfa0] bg-gold-soft px-3 py-2 text-sm font-semibold text-[#5c4a12]">
        {t.domainWarning}
      </p>

      {editing ? (
        <form onSubmit={save} noValidate aria-labelledby={`${id}-form-title`} className="space-y-4">
          <p id={`${id}-form-title`} className="text-sm font-bold text-navy">
            {t.edit}
          </p>
          <p id={`${id}-hint`} className="text-sm text-muted">
            {t.fieldHint}
          </p>
          {rows.map((row, index) => {
            const inputId = `${id}-${row.slug}`;
            const issue = fieldErrors[row.slug];
            return (
              <div key={row.slug} className="flex flex-col gap-1.5">
                <label htmlFor={inputId} className={labelClasses}>
                  {format(t.fieldLabel, { centre: row.label })}
                </label>
                <input
                  ref={index === 0 ? firstInput : undefined}
                  id={inputId}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={2048}
                  value={draft[row.slug] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [row.slug]: event.target.value }))}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? `${id}-hint ${inputId}-issue` : `${id}-hint`}
                  className={fieldClasses}
                />
                {issue && (
                  <p id={`${inputId}-issue`} className="text-sm font-semibold text-danger">
                    {issue}
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={action.pending}
              className="inline-flex min-h-11 items-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {action.pending ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={stopEditing}
              className="inline-flex min-h-11 items-center rounded-control border border-[#b9cbe0] bg-white px-4 text-sm font-bold text-navy hover:border-blue"
            >
              {t.cancel}
            </button>
          </div>
          <ActionFeedback status={action.status} error={action.error} />
        </form>
      ) : (
        <>
          <ul aria-label={t.caption} className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <li key={row.slug} className="min-w-0 rounded-control border border-line bg-white p-4">
                <p className="font-bold text-navy">{row.label}</p>
                <dl className="mt-2 space-y-3 text-sm">
                  <div>
                    <dt className="font-semibold text-muted">{t.mapsLink}</dt>
                    <dd className="mt-0.5">
                      {row.mapsUrl ? (
                        <>
                          <a
                            href={row.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-blue hover:underline"
                          >
                            {t.openMaps}
                            <span className="sr-only">: {row.label}</span>
                            <ExternalLink aria-hidden="true" className="size-4" />
                          </a>
                          <span className="block break-all text-xs text-muted">{shortUrl(row.mapsUrl)}</span>
                        </>
                      ) : (
                        <span className="text-muted">{notSet}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted">{t.taggedLink}</dt>
                    <dd className="mt-0.5 space-y-1.5">
                      <code className="block break-all rounded bg-surface px-2 py-1 text-xs text-ink">{row.taggedUrl}</code>
                      <CopyLinkButton value={row.taggedUrl} centre={row.label} t={t} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {canEdit ? (
              <button
                ref={editButton}
                type="button"
                onClick={startEditing}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2"
              >
                <PencilLine aria-hidden="true" className="size-4" />
                {t.edit}
              </button>
            ) : (
              <p className="text-sm text-muted">{t.readOnly}</p>
            )}
            <ActionFeedback status={action.status} error={null} />
          </div>
        </>
      )}
    </div>
  );
}
