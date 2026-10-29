"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Where a saved call outcome is announced when the button that opened the dialog goes away
 * (docs/admin-phase-1b-plan.md §5.C step 6; owner: 1B-CALLS). A task's Done button sits in the
 * task's row: after the save the page refreshes and the completed task's row — with the button and
 * any status line in it — is gone. This region wraps a task list, outlives the refresh, says the
 * result (role="status") and names the stable element that takes focus when the opener was removed.
 */
export type OutcomeStatus = {
  announce: (message: string) => void;
  /** The id of a stable element (the panel's heading) that takes focus when the opener is gone. */
  focusTargetId: string;
};

const OutcomeStatusContext = createContext<OutcomeStatus | null>(null);

/** The surrounding region, or null (then the opener keeps its own status line). */
export function useOutcomeStatus(): OutcomeStatus | null {
  return useContext(OutcomeStatusContext);
}

export function OutcomeStatusRegion({ focusTargetId, children }: { focusTargetId: string; children: ReactNode }) {
  const [message, setMessage] = useState("");
  const value = useMemo<OutcomeStatus>(() => ({ announce: setMessage, focusTargetId }), [focusTargetId]);
  return (
    <OutcomeStatusContext.Provider value={value}>
      {/* Always mounted, so screen readers announce the result when it appears (WCAG 4.1.3). */}
      <p role="status" className={message ? "mb-3 text-sm font-semibold text-success" : "sr-only"}>
        {message}
      </p>
      {children}
    </OutcomeStatusContext.Provider>
  );
}

/**
 * Moves focus to the element `id` (made focusable with tabindex="-1") ONLY when focus was lost —
 * the focused element was removed and the browser fell back to <body>. Never takes focus away from
 * an element that is still on the page.
 */
export function focusIfLost(id: string | null | undefined, doc: Document | undefined = typeof document === "undefined" ? undefined : document): boolean {
  if (!id || !doc) return false;
  const active = doc.activeElement;
  if (active && active !== doc.body && active.isConnected) return false;
  const target = doc.getElementById(id);
  if (!target) return false;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus();
  return true;
}
