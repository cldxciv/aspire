"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { ApiFailure } from "@/lib/auth/client-api";
import type { MetaActionResult } from "@/lib/crm/meta/types";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { actionSummary, formatWhen, INTEGRATIONS_PATH, type MetaIslandMessages } from "./model";

const MOBILE = /^(?:\+91|91|0)?[6-9]\d{9}$/;

/**
 * "Accept test leads (24 h)" (docs/lead-routing-plan.md §7 step 11, §18.7, A14): with the super
 * admin's OWN mobile number, Meta's dummy test leads arrive as "TEST – Meta test lead", run end to
 * end and are erased after 24 hours. Super admins only; the server re-checks the number.
 */
export function TestLeadsPanel({ active, until, phone, m, errors }: MetaIslandMessages & { active: boolean; until: string | null; phone: string | null }) {
  const t = m.testLeads;
  const id = useId();
  const locale = useLocale();
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const [value, setValue] = useState(phone ? phone.replace(/^\+91/, "") : "");
  const [message, setMessage] = useState("");

  const onFailure = (result: ApiFailure) => (Object.hasOwn(result.fieldErrors, "phone") ? t.phoneInvalid : null);

  async function turnOn(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const compact = value.replace(/[\s\-.()]/g, "");
    if (!MOBILE.test(compact)) return action.setError(t.phoneInvalid);
    const result = await action.run<MetaActionResult>(leadOpsRequests.metaAction({ action: "test_mode", on: true, phone: compact }), undefined, onFailure);
    if (result) setMessage(actionSummary(result, m));
  }

  async function turnOff() {
    setMessage("");
    const result = await action.run<MetaActionResult>(leadOpsRequests.metaAction({ action: "test_mode", on: false }));
    if (result) setMessage(actionSummary(result, m));
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-extrabold text-navy">
          {t.heading}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.lead}</p>
      </div>
      <p className="text-sm font-bold text-navy">{active && until ? format(t.activeUntil, { time: formatWhen(until, locale, "") }) : t.inactive}</p>
      <form onSubmit={(event) => void turnOn(event)} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 max-w-xs flex-1 space-y-1">
          <label htmlFor={`${id}-phone`} className={labelClasses}>
            {t.phone}
          </label>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={`${id}-phone-hint`}
            className={fieldClasses}
          />
          <p id={`${id}-phone-hint`} className="text-sm text-muted">
            {t.phoneHint}
          </p>
        </div>
        <Button type="submit" variant="dark" disabled={action.pending} aria-busy={action.pending || undefined} className="sm:mb-6">
          {t.turnOn}
        </Button>
        {active && (
          <Button variant="outline" disabled={action.pending} onClick={() => void turnOff()} className="sm:mb-6">
            {t.turnOff}
          </Button>
        )}
      </form>
      <ActionFeedback status={message} error={action.error} />
    </section>
  );
}
