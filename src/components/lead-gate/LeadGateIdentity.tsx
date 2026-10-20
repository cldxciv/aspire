"use client";

import { useState } from "react";

import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";

import { leadGateStore, type LeadGateStore } from "./lead-gate-store";
import { useLeadGateState } from "./use-lead-gate";

/**
 * <LeadGateIdentity>: under a result unlocked by THIS browser's shared details. Never shows a name
 * (shared lab / cyber-café computers, critiques 0.6 / 1.0). Offers:
 *  - "Not you?": forget this browser (DELETE /api/lead-gate); the next result asks again;
 *  - "Stop Aspire contacting me": after a confirm step, withdraws consent on the family's record
 *    (DELETE ?withdraw=1) as easily as it was given (DPDP s.6(4)).
 * `onForgotten(withdrawn)` lets the host return to its gated state.
 */
export function LeadGateIdentity({
  messages: t,
  onForgotten,
  className,
  store = leadGateStore,
}: {
  messages: Messages<"leadGate">;
  onForgotten?: (withdrawn: boolean) => void;
  className?: string;
  store?: LeadGateStore;
}) {
  const gate = useLeadGateState(store);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The outcome plus the store's unlockSeq when it happened: a later unlock (this host, another tool
  // or tab) hides it, so "no longer has your details" never sits beside "shared" in hosts that keep
  // this line mounted (keying it by unlockSeq is no longer required).
  const [done, setDone] = useState<{ kind: "forgotten" | "withdrawn" | "failed"; seq: number } | null>(null);

  async function forget(withdraw: boolean) {
    if (busy) return;
    setBusy(true);
    const result = await store.forget({ withdraw });
    setBusy(false);
    setConfirming(false);
    const seq = store.getSnapshot().unlockSeq;
    if (!result) {
      setDone({ kind: "failed", seq });
      return;
    }
    setDone({ kind: result.withdrawn ? "withdrawn" : "forgotten", seq });
    onForgotten?.(result.withdrawn);
  }

  const outcome = done && done.seq === gate.unlockSeq ? done.kind : null;
  const message =
    outcome === "failed" ? t.identity.failed : outcome === "withdrawn" ? t.identity.withdrawn : outcome === "forgotten" ? t.identity.forgotten : "";
  if (gate.via !== "pass" && !message) return null;

  const linkButton =
    "min-h-11 cursor-pointer px-1 font-bold text-blue underline underline-offset-2 hover:text-navy aria-disabled:cursor-wait aria-disabled:opacity-60";

  return (
    <div className={cn("text-xs leading-relaxed text-muted", className)}>
      {gate.via === "pass" && (
        <>
          <p>
            {t.identity.shared} {gate.recordsUse ? t.identity.recordsUse : null}
          </p>
          {confirming ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <span>{t.identity.confirmStop}</span>
              <button type="button" className={linkButton} aria-disabled={busy || undefined} onClick={() => void forget(true)}>
                {t.identity.confirmYes}
              </button>
              <button type="button" className={linkButton} onClick={() => setConfirming(false)}>
                {t.identity.cancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2">
              <button type="button" className={linkButton} aria-disabled={busy || undefined} onClick={() => void forget(false)}>
                {t.identity.notYou}
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className={linkButton} onClick={() => setConfirming(true)}>
                {t.identity.stopContact}
              </button>
            </div>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className={message ? "mt-1 font-semibold text-navy" : "sr-only"}>
        {message}
      </p>
    </div>
  );
}
