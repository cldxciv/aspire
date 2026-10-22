"use client";

import { IMPORT_CONSENT_BASES, type ImportConsentBasis } from "@/lib/crm/intake/rows";
import { labelClasses } from "../client-kit";
import type { CrmImportMessages } from "./types";

/**
 * The required consent basis (H4) and the "start the first-call clock" switch. The Meta choice only
 * covers rows with a Meta lead id; the staff choices are recorded as staff-recorded consent.
 */
export function ConsentBasisPicker({
  basis,
  startClock,
  onBasis,
  onStartClock,
  disabled = false,
  showRequired = false,
  t,
}: {
  basis: ImportConsentBasis | null;
  startClock: boolean;
  onBasis: (basis: ImportConsentBasis) => void;
  onStartClock: (on: boolean) => void;
  disabled?: boolean;
  showRequired?: boolean;
  t: CrmImportMessages;
}) {
  return (
    <div className="space-y-4">
      <fieldset aria-describedby="import-basis-hint" disabled={disabled}>
        <legend className={labelClasses}>{t.consent.legend}</legend>
        <div className="mt-2 grid gap-1">
          {IMPORT_CONSENT_BASES.map((value) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-consent-basis"
                value={value}
                checked={basis === value}
                onChange={() => onBasis(value)}
                className="size-4 accent-[#1768d4]"
              />
              <span className={value === "meta_lead_form" ? "font-semibold text-navy" : undefined}>{t.consent.bases[value]}</span>
            </label>
          ))}
        </div>
        <p id="import-basis-hint" className="mt-1 text-xs text-muted">
          {basis === null || basis === "meta_lead_form" ? t.consent.metaHint : t.consent.staffHint}
        </p>
        {showRequired && basis === null && (
          <p role="alert" className="mt-1 text-sm font-semibold text-danger">
            {t.consent.required}
          </p>
        )}
      </fieldset>
      <div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-navy">
          <input
            type="checkbox"
            checked={startClock}
            disabled={disabled}
            onChange={(event) => onStartClock(event.target.checked)}
            aria-describedby="import-clock-hint"
            className="size-4 accent-[#1768d4]"
          />
          {t.consent.startClock}
        </label>
        <p id="import-clock-hint" className="text-xs text-muted">
          {t.consent.startClockHint}
        </p>
      </div>
    </div>
  );
}
