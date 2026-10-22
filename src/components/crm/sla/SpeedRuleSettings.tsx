"use client";

import { useId, type ReactNode } from "react";
import { format } from "@/i18n/format";
import { SPEED_RULE_LIMITS, type SpeedRule } from "@/lib/crm/lead-ops-types";
import { CONTACT_OUTCOMES, type ContactOutcome } from "@/lib/crm/types";
import { fieldClasses, labelClasses } from "../client-kit";
import type { CrmMessages } from "../format";
import { clockSourceOptions, sourceText, type SpeedMessages } from "./model";

export type SpeedRuleMessages = {
  rule: SpeedMessages["rule"];
  sources: CrmMessages["sources"];
  outcomes: CrmMessages["lead"]["contact"]["outcomes"];
};

/**
 * The first-call rule (owner: LR-SLA; docs/lead-routing-plan.md §15, D-046): first call within N
 * working minutes, what counts as the first call (Q6), the two alert steps, "Call again" retries,
 * what "reached" means, and which enquiries start the clock (tool sign-ups off by default, Q2).
 * Controlled; `disabled` = read-only for area heads and admins.
 */
export function SpeedRuleSettings({
  value,
  onChange,
  disabled,
  issues,
  t,
}: {
  value: SpeedRule;
  onChange: (next: SpeedRule) => void;
  disabled: boolean;
  /** Field → message (`firstCallMinutes`, `tiers.areaHead`, `tiers.superAdmin`, `retry`, `reachedOutcomes`, `reachedTargetMinutes`). */
  issues: Readonly<Record<string, string>>;
  t: SpeedRuleMessages;
}) {
  const id = useId();
  const r = t.rule;
  const L = SPEED_RULE_LIMITS;
  const set = (patch: Partial<SpeedRule>) => onChange({ ...value, ...patch });
  const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));

  const number = (key: string, label: string, current: number, range: { min: number; max: number }, update: (next: number) => void, issueKey: string) => {
    const issue = issues[issueKey];
    const hintId = `${id}-${key}-hint`;
    const issueId = `${id}-${key}-issue`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${key}`} className={labelClasses}>
          {label}
        </label>
        <input
          id={`${id}-${key}`}
          type="number"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          step={1}
          value={Number.isFinite(current) ? current : ""}
          disabled={disabled}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${hintId} ${issueId}` : hintId}
          onChange={(event) => update(event.target.value === "" ? Number.NaN : Number(event.target.value))}
          className={`${fieldClasses} w-36`}
        />
        <p id={hintId} className="text-xs text-muted">
          {format(r.minutesRange, range)}
        </p>
        {issue && (
          <p id={issueId} className="text-sm font-semibold text-danger">
            {issue}
          </p>
        )}
      </div>
    );
  };

  const check = (key: string, label: ReactNode, checked: boolean, update: (on: boolean) => void, hint?: string) => (
    <div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? `${id}-${key}-hint` : undefined}
          onChange={(event) => update(event.target.checked)}
          className="size-5 accent-[#0755b5]"
        />
        {label}
      </label>
      {hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {number("first", r.firstCall, value.firstCallMinutes, L.firstCallMinutes, (next) => set({ firstCallMinutes: next }), "firstCallMinutes")}

      <fieldset className="min-w-0">
        <legend className={labelClasses}>{r.countOnly}</legend>
        <div className="mt-2 space-y-1">
          {(["any_attempt", "connected"] as const).map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`${id}-count-only`}
                value={option}
                checked={value.countOnly === option}
                disabled={disabled}
                onChange={() => set({ countOnly: option })}
                className="size-5 accent-[#0755b5]"
              />
              {r.countOnlyOptions[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className={labelClasses}>{r.tiersTitle}</legend>
        <p className="text-xs text-muted">{r.tiersNote}</p>
        {check("tier1", r.areaHead, value.tiers.areaHead.enabled, (on) => set({ tiers: { ...value.tiers, areaHead: { ...value.tiers.areaHead, enabled: on } } }))}
        {number(
          "tier1-after",
          r.areaHeadAfter,
          value.tiers.areaHead.afterMinutes,
          L.tierMinutes,
          (next) => set({ tiers: { ...value.tiers, areaHead: { ...value.tiers.areaHead, afterMinutes: next } } }),
          "tiers.areaHead",
        )}
        {check("tier2", r.superAdmin, value.tiers.superAdmin.enabled, (on) => set({ tiers: { ...value.tiers, superAdmin: { ...value.tiers.superAdmin, enabled: on } } }))}
        {number(
          "tier2-after",
          r.superAdminAfter,
          value.tiers.superAdmin.afterMinutes,
          L.tierMinutes,
          (next) => set({ tiers: { ...value.tiers, superAdmin: { ...value.tiers.superAdmin, afterMinutes: next } } }),
          "tiers.superAdmin",
        )}
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className={labelClasses}>{r.retryTitle}</legend>
        {check("retry", r.retryEnabled, value.retry.enabled, (on) => set({ retry: { ...value.retry, enabled: on } }), r.retryNote)}
        <div className="flex flex-wrap gap-4">
          {number("retry-first", r.retryFirst, value.retry.firstAfterMinutes, L.retryFirstAfterMinutes, (next) => set({ retry: { ...value.retry, firstAfterMinutes: next } }), "retry")}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-retry-max`} className={labelClasses}>
              {r.retryMax}
            </label>
            <input
              id={`${id}-retry-max`}
              type="number"
              inputMode="numeric"
              min={L.retryMaxAttempts.min}
              max={L.retryMaxAttempts.max}
              step={1}
              value={Number.isFinite(value.retry.maxAttempts) ? value.retry.maxAttempts : ""}
              disabled={disabled}
              aria-invalid={issues.retry ? true : undefined}
              aria-describedby={issues.retry ? `${id}-retry-first-issue` : undefined}
              onChange={(event) => set({ retry: { ...value.retry, maxAttempts: event.target.value === "" ? Number.NaN : Number(event.target.value) } })}
              className={`${fieldClasses} w-28`}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-2" aria-describedby={issues.reachedOutcomes ? `${id}-reached-issue` : undefined}>
        <legend className={labelClasses}>{r.reachedTitle}</legend>
        <p className="text-sm text-muted">{r.reachedOutcomes}</p>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {CONTACT_OUTCOMES.map((outcome: ContactOutcome) => (
            <label key={outcome} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={value.reachedOutcomes.includes(outcome)}
                disabled={disabled}
                onChange={(event) => set({ reachedOutcomes: toggle(value.reachedOutcomes, outcome, event.target.checked) })}
                className="size-5 accent-[#0755b5]"
              />
              {t.outcomes[outcome]}
            </label>
          ))}
        </div>
        {issues.reachedOutcomes && (
          <p id={`${id}-reached-issue`} className="text-sm font-semibold text-danger">
            {issues.reachedOutcomes}
          </p>
        )}
        {number("reached-target", r.reachedTarget, value.reachedTargetMinutes, L.reachedTargetMinutes, (next) => set({ reachedTargetMinutes: next }), "reachedTargetMinutes")}
      </fieldset>

      <fieldset className="min-w-0 space-y-2">
        <legend className={labelClasses}>{r.sourcesTitle}</legend>
        <p className="text-sm text-muted">{r.sourcesHint}</p>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {clockSourceOptions(value).map((source) => (
            <label key={source} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={value.sources.includes(source)}
                disabled={disabled}
                onChange={(event) => set({ sources: toggle(value.sources, source, event.target.checked) })}
                className="size-5 accent-[#0755b5]"
              />
              {Object.hasOwn(t.sources, source) ? sourceText(t.sources, source) : source}
            </label>
          ))}
        </div>
        {check("gate", r.leadGate, value.leadGate, (on) => set({ leadGate: on }), r.leadGateHint)}
      </fieldset>
    </div>
  );
}
