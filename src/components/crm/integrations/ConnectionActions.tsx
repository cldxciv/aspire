"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { MetaActionResult, MetaCheckLine } from "@/lib/crm/meta/types";
import { ActionFeedback, useCrmAction } from "../client-kit";
import { leadOpsRequests, type MetaActionBody } from "../lead-ops-api";
import { actionSummary, formatDay, INTEGRATIONS_PATH, type MetaIslandMessages, type MetaMessages } from "./model";

/**
 * Super-admin buttons on the connection (docs/lead-routing-plan.md §18.7): Check connection,
 * Subscribe Page, fetch waiting leads, look for missed leads, retry failed and (after a key
 * rotation) re-encrypt. Results are fixed codes turned into sentences; the check lists each line
 * with its fix. The server re-checks the super admin on every call.
 */
export function ConnectionActions({ needsReseal, m, errors }: MetaIslandMessages & { needsReseal: boolean }) {
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<MetaCheckLine[] | null>(null);
  const a = m.actions;

  async function run(body: MetaActionBody) {
    setMessage("");
    const result = await action.run<MetaActionResult>(leadOpsRequests.metaAction(body));
    if (!result) return;
    setMessage(actionSummary(result, m));
    if (result.action === "check") setChecks(result.checks ?? []);
  }

  const buttons: { key: string; label: string; body: MetaActionBody; primary?: boolean }[] = [
    { key: "check", label: a.check, body: { action: "check" }, primary: true },
    { key: "subscribe", label: a.subscribe, body: { action: "subscribe_page" } },
    { key: "process", label: a.processNow, body: { action: "process_now" } },
    { key: "sync", label: a.syncLeads, body: { action: "sync_leads" } },
    { key: "retry", label: a.retryFailed, body: { action: "retry_failed" } },
    ...(needsReseal ? [{ key: "reseal", label: a.reseal, body: { action: "reseal" } as MetaActionBody }] : []),
  ];

  return (
    <section aria-labelledby="meta-actions-heading" className="space-y-3">
      <h3 id="meta-actions-heading" className="text-base font-extrabold text-navy">
        {a.heading}
      </h3>
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => (
          <Button
            key={button.key}
            variant={button.primary ? "dark" : "outline"}
            disabled={action.pending}
            aria-busy={action.pending || undefined}
            onClick={() => void run(button.body)}
          >
            {button.label}
          </Button>
        ))}
      </div>
      {action.pending && (
        <p role="status" className="text-sm text-muted">
          {a.working}
        </p>
      )}
      <ActionFeedback status={message} error={action.error} />
      {checks && checks.length > 0 && <CheckResults checks={checks} m={m} />}
    </section>
  );
}

/** "Check connection: results": one line per check, with the fix for each problem. */
export function CheckResults({ checks, m }: { checks: readonly MetaCheckLine[]; m: MetaMessages }) {
  const locale = useLocale();
  const c = m.check;
  return (
    <div className="rounded-control border border-line bg-[#f8fbff] p-4">
      <h4 className="font-extrabold text-navy">{c.heading}</h4>
      <ul className="mt-2 space-y-2">
        {checks.map((line) => {
          const details: string[] = [];
          if (line.tokenType) details.push(format(c.tokenType, { type: line.tokenType }));
          if (line.key === "expiry") details.push(line.expiresAt ? format(c.expires, { date: formatDay(line.expiresAt, locale) }) : c.neverExpires);
          if (line.missingScopes && line.missingScopes.length > 0) details.push(format(c.missingScopes, { scopes: line.missingScopes.join(", ") }));
          const fix = !line.ok && line.key in c.fixes ? c.fixes[line.key as keyof typeof c.fixes] : null;
          return (
            <li key={line.key} className="flex gap-2 text-sm">
              {line.ok ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
              )}
              <span>
                <span className="font-bold text-navy">{c.lines[line.key]}</span>
                {": "}
                <span className={line.ok ? "text-success" : "text-danger"}>{line.ok ? c.ok : c.problem}</span>
                {details.length > 0 && <span className="block text-muted">{details.join(" · ")}</span>}
                {fix && <span className="block text-ink">{fix}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
