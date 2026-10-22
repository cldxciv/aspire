"use client";

import { Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import type { AreaResolution, CrmArea } from "@/lib/crm/lead-ops-types";
import { crmFailureMessage, sendCrm } from "../api";
import { fieldClasses, labelClasses } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { resolutionText, type AreasMessages } from "./model";

/**
 * "Test a place name" (§13.6): runs the resolver on what a family might type (GET
 * /api/crm/areas/resolve). Nothing is saved; area heads and admins can use it.
 */
export function PlaceTester({ areas, t }: { areas: CrmArea[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const tt = t.a.tester;
  const [place, setPlace] = useState("");
  const [state, setState] = useState("");
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!place.trim()) {
      setResult(tt.results.empty);
      return;
    }
    setPending(true);
    const response = await sendCrm<AreaResolution>(leadOpsRequests.resolvePlace(place, state || undefined));
    setPending(false);
    if (response.ok) setResult(resolutionText(response.data, areas, locale, t.a));
    else {
      setResult("");
      setError(crmFailureMessage(response, t));
    }
  }

  return (
    <form onSubmit={test} noValidate className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-place`} className={labelClasses}>
          {tt.place}
        </label>
        <input id={`${id}-place`} value={place} maxLength={60} onChange={(event) => setPlace(event.target.value)} className={fieldClasses} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-state`} className={labelClasses}>
          {tt.state}
        </label>
        <input id={`${id}-state`} value={state} maxLength={60} onChange={(event) => setState(event.target.value)} className={fieldClasses} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        <Search aria-hidden="true" className="size-4" />
        {tt.submit}
      </Button>
      <p role="status" className="text-sm font-bold text-navy sm:col-span-3">
        {result}
      </p>
      <p role="alert" className="text-sm font-semibold text-danger sm:col-span-3">
        {error ?? ""}
      </p>
    </form>
  );
}
