"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ActionFeedback, fieldClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type en from "@/i18n/messages/en/console-numbers";
import type { ApiFailure } from "@/lib/auth/client-api";
import { CONSOLE_PROGRAMS, type ConsoleProgram, type SessionKey, type TargetGrid, type TargetMetric } from "@/lib/crm/console/types";
import { cellKey, metricValues, parseTargetInput, sameValues, type TargetValues } from "./target-values";
import { formatCount } from "../shared/messages";
import { targetsRequests } from "./api";

export type TargetsMessages = (typeof en)["targets"];

export { cellKey, metricValues, parseTargetInput, sameValues, type TargetValues } from "./target-values";

/** The text boxes for `values` ("" = no target). */
function draftFrom(centres: readonly { slug: string }[], values: TargetValues): Record<string, string> {
  return Object.fromEntries(centres.flatMap((centre) => CONSOLE_PROGRAMS.map((program) => [cellKey(centre.slug, program), values[cellKey(centre.slug, program)]?.toString() ?? ""])));
}

function sameDraft(a: Record<string, string>, b: Record<string, string>): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => (a[key] ?? "").trim() === (b[key] ?? "").trim());
}

/** The version and values a draft started from. */
type DraftBase = { updatedAt: string | null; values: TargetValues };

/**
 * The targets editor for ONE metric of one session (docs/admin-phase-1b-plan.md §5.B; owner:
 * 1B-NUMBERS). Super admins only (the server re-checks every save). One group of five boxes per
 * centre (JEE, NEET, Foundation, Integrated, Any programme) with the centre's total; an empty box
 * is "no target". Saving replaces every cell of the session × metric and names the `updatedAt` it
 * its draft started from: when someone else saved meanwhile the server answers 409 and the editor
 * offers a reload. Key it by metric only: it stays mounted across page refreshes (its "saved"
 * status and other editors' unsaved boxes survive a save). A refresh that brings a newer version
 * moves the draft onto it when this metric's targets did not change (or nothing was typed yet);
 * when they did change under unsaved edits, the old version is kept so the save gets the 409.
 */
export function TargetsEditor({
  period,
  sessionLabel,
  metric,
  centres,
  values,
  updatedAt,
  pagePath,
  t,
  errors,
}: {
  period: SessionKey;
  sessionLabel: string;
  metric: TargetMetric;
  centres: readonly { slug: string; label: string }[];
  values: TargetValues;
  updatedAt: string | null;
  /** LOCALE-FREE path of the page (to come back after signing in again). */
  pagePath: string;
  t: TargetsMessages;
  errors: Pick<CrmMessages, "errors">;
}) {
  const id = useId();
  const locale = useLocale();
  const router = useRouter();
  const action = useCrmAction(errors, pagePath);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => draftFrom(centres, values));
  const [base, setBase] = useState<DraftBase>({ updatedAt, values });
  const [seen, setSeen] = useState(updatedAt);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  // A refreshed page (after a save of any metric here, or a reload) brought a newer version.
  if (updatedAt !== seen) {
    setSeen(updatedAt);
    if (updatedAt !== base.updatedAt) {
      if (sameValues(values, base.values)) {
        setBase({ updatedAt, values }); // only other metrics changed: keep what was typed
      } else if (sameDraft(draft, draftFrom(centres, base.values))) {
        setBase({ updatedAt, values }); // nothing typed here yet: show the new targets
        setDraft(draftFrom(centres, values));
      }
      // Else this metric changed under unsaved edits: keep the old version, so saving gets 409.
    }
  }

  function reload() {
    setBase({ updatedAt, values });
    setSeen(updatedAt);
    setDraft(draftFrom(centres, values));
    setInvalid({});
    setConflict(false);
    action.reset();
    router.refresh();
  }
  const metricName = t.metrics[metric];
  const hintId = `${id}-hint`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issues: Record<string, boolean> = {};
    const cells: { centreSlug: string; program: ConsoleProgram; value: number }[] = [];
    for (const centre of centres) {
      for (const program of CONSOLE_PROGRAMS) {
        const key = cellKey(centre.slug, program);
        const parsed = parseTargetInput(draft[key] ?? "");
        if (parsed === null) issues[key] = true;
        else if (parsed !== "") cells.push({ centreSlug: centre.slug, program, value: parsed });
      }
    }
    setInvalid(issues);
    setConflict(false);
    if (Object.keys(issues).length > 0) {
      action.setError(t.invalid);
      return;
    }
    const onFailure = (result: ApiFailure): string | null => {
      if (result.status === 409) {
        setConflict(true);
        return t.conflict;
      }
      return null;
    };
    const grid = await action.run<TargetGrid>(targetsRequests.save(period, metric, cells, base.updatedAt), format(t.saved, { metric: metricName }), onFailure);
    if (grid) {
      const saved = metricValues(grid, metric);
      setBase({ updatedAt: grid.updatedAt, values: saved });
      setDraft(draftFrom(centres, saved));
    }
  }

  return (
    <form onSubmit={save} noValidate aria-labelledby={`${id}-title`} className="space-y-4">
      <h3 id={`${id}-title`} className="text-base font-extrabold text-navy">
        {format(t.gridTitle, { metric: metricName, session: sessionLabel })}
      </h3>
      <p id={hintId} className="text-sm text-muted">
        {t.inputHint}
      </p>
      {centres.map((centre) => {
        const total = CONSOLE_PROGRAMS.reduce((sum, program) => {
          const parsed = parseTargetInput(draft[cellKey(centre.slug, program)] ?? "");
          return typeof parsed === "number" ? sum + parsed : sum;
        }, 0);
        const anySet = CONSOLE_PROGRAMS.some((program) => typeof parseTargetInput(draft[cellKey(centre.slug, program)] ?? "") === "number");
        return (
          <fieldset key={centre.slug} className="min-w-0 rounded-control border border-line p-3">
            <legend className="px-1 text-sm font-bold text-navy">{centre.label}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {CONSOLE_PROGRAMS.map((program) => {
                const key = cellKey(centre.slug, program);
                const inputId = `${id}-${centre.slug}-${program}`;
                const bad = invalid[key] === true;
                return (
                  <div key={program} className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={inputId} className="text-xs font-bold text-navy">
                      <span aria-hidden="true">{t.programs[program]}</span>
                      <span className="sr-only">{format(t.inputLabel, { metric: metricName, centre: centre.label, program: t.programs[program] })}</span>
                    </label>
                    <input
                      id={inputId}
                      name={key}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={6}
                      value={draft[key] ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                      aria-invalid={bad ? true : undefined}
                      aria-describedby={bad ? `${hintId} ${inputId}-issue` : hintId}
                      className={`${fieldClasses} text-right tabular-nums`}
                    />
                    {bad && (
                      <p id={`${inputId}-issue`} className="text-xs font-semibold text-danger">
                        {t.invalid}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-bold text-navy">{t.total}</span>
                <output htmlFor={CONSOLE_PROGRAMS.map((program) => `${id}-${centre.slug}-${program}`).join(" ")} className="flex min-h-11 items-center justify-end px-3 font-extrabold tabular-nums text-navy">
                  {anySet ? formatCount(total, locale) : "—"}
                </output>
              </div>
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={action.pending}
          className="inline-flex min-h-11 items-center rounded-control bg-navy px-4 text-sm font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {action.pending ? t.saving : format(t.save, { metric: metricName })}
        </button>
        {conflict && (
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-[#b9cbe0] bg-white px-4 text-sm font-bold text-navy hover:border-blue"
          >
            <RotateCw aria-hidden="true" className="size-4" />
            {t.reload}
          </button>
        )}
      </div>
      <ActionFeedback status={action.status} error={action.error} />
    </form>
  );
}
