"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { ButtonLink, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import enLeadGate from "@/i18n/messages/en/leadGate";
import hiLeadGate from "@/i18n/messages/hi/leadGate";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { gateRelaxed } from "@/lib/mocktest/lead-gate";
import type { MocktestMessages } from "./format";

/**
 * The lead gate in the mock tests (docs/lead-gate-plan.md §8.4). Owner decision (21 Oct 2026):
 * sample tests are gated too; <LeadGateForm> itself says when results use sample data.
 *
 * Messages: AttemptPage (server) provides the `leadGate` namespace to the result, certificate and
 * report views. The test page renders the runner without it (that page lives outside the mock-test
 * package), so the hook falls back to the two small catalog files (src/i18n/README.md: client
 * files that cannot get props). Integrate: once the test page wraps the runner in
 * <MocktestLeadGateMessages>, drop the fallback and the two catalog imports.
 */

export type LeadGateMessages = Messages<"leadGate">;

/** How an unlock reached a mock-test host (`byThisHost`: its own form, skip or continue). */
export type MocktestUnlock = { byThisHost: boolean };

const LeadGateMessagesContext = createContext<LeadGateMessages | null>(null);

export function MocktestLeadGateMessages({ messages, children }: { messages: LeadGateMessages; children?: ReactNode }) {
  return <LeadGateMessagesContext.Provider value={messages}>{children}</LeadGateMessagesContext.Provider>;
}

export function useMocktestLeadGateMessages(): LeadGateMessages {
  const provided = useContext(LeadGateMessagesContext);
  const locale = useLocale();
  return provided ?? (locale === "hi" ? hiLeadGate : enLeadGate);
}

/** The latest callback without re-running effects that depend on it. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Result page, gate 401 from /api/mocktest/score: the attempt is kept on this device and the score
 * waits for contact details. The form is enforced (no "show without saving"); `onUnlocked` (this
 * form, another tool or another tab) reloads the result. If a later status answer shows the gate
 * relaxed meanwhile (the flood breaker degraded it to optional, or it was switched off), the result
 * is asked for again too, so a "paused" form never leaves the family stuck. `body` replaces the
 * default note (a ranked paper's save: no solutions until the month closes).
 */
export function LockedResult({ t, onUnlocked, body }: { t: MocktestMessages; onUnlocked: (info: MocktestUnlock) => void; body?: string }) {
  const tGate = useMocktestLeadGateMessages();
  const gate = useLeadGate({ tool: "mock-test", enforced: true, onUnlocked });
  const { markRequired, mode, formProps } = gate;
  const { store } = formProps;
  const latest = useLatest(onUnlocked);
  // The server said "required": forget a stale local hint and wait for an unlock.
  useEffect(() => {
    markRequired();
  }, [markRequired]);
  // Runs after markRequired (declared later), so it reads the live mode, never the stale one it
  // replaced. An unlock (status "open") already reloads through onUnlocked.
  useEffect(() => {
    if (gateRelaxed(store.getSnapshot())) latest.current({ byThisHost: false });
  }, [mode, store, latest]);

  return (
    <div className="space-y-4" data-mocktest-gate="result">
      <Notice variant="success" title={t.gate.lockedTitle}>
        <p>{body ?? t.gate.lockedBody}</p>
      </Notice>
      {/* Appears on page load, not after a click: focus stays where the visitor is. */}
      <LeadGateForm {...formProps} messages={tGate} variant="panel" headingLevel={2} focusOnMount={false} />
    </div>
  );
}

/**
 * Result page in optional mode (the flood breaker's degrade, or LEAD_GATE=optional), first result
 * of an attempt on this device: /score would answer without the gate, so the page offers the form
 * itself, with "Continue without sharing" (and, after a failed send, "Show my result without
 * saving"). Any unlock or skip shows the result; an unlock elsewhere meanwhile shows it too.
 */
export function OptionalContactStep({ t, onUnlocked }: { t: MocktestMessages; onUnlocked: (info: MocktestUnlock) => void }) {
  const tGate = useMocktestLeadGateMessages();
  const gate = useLeadGate({ tool: "mock-test", onUnlocked });
  const { requestAccess, gateOpen, formProps } = gate;
  const latest = useLatest(onUnlocked);
  useEffect(() => {
    let active = true;
    void requestAccess().then((open) => {
      if (open && active) latest.current({ byThisHost: false });
    });
    return () => {
      active = false;
    };
  }, [requestAccess, latest]);

  return (
    <div className="space-y-4" data-mocktest-gate="optional">
      <Notice variant="success" title={t.gate.lockedTitle}>
        <p>{t.gate.optionalBody}</p>
      </Notice>
      {/* Appears on page load, not after a click: focus stays where the visitor is. */}
      {gateOpen && <LeadGateForm {...formProps} messages={tGate} variant="panel" headingLevel={2} focusOnMount={false} />}
    </div>
  );
}

/** Certificate / report for parents of a locked attempt: a note and a link to the result page (never a second form). */
export function LockedPrintNote({ t, resultHref }: { t: MocktestMessages; resultHref: string }) {
  const locale = useLocale();
  return (
    <Notice variant="info" title={t.gate.lockedTitle}>
      <p>{t.gate.printLocked}</p>
      {/* Default size: a 44 px target (plan §6). */}
      <ButtonLink href={localePath(resultHref, locale)} className="mt-3">
        {t.gate.printLockedCta}
      </ButtonLink>
    </Notice>
  );
}
