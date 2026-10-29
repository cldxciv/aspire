"use client";

import { PhoneCall } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CallOutcomeDialog } from "@/components/console/calls/CallOutcomeDialog";
import type { CallsMessages } from "@/components/console/calls/messages";
import { focusIfLost } from "@/components/console/calls/outcome-status";
import { Button } from "@/components/ui";
import { clearCallMark, markCallStarted, readCallMark, sessionStore, shouldPromptCallReturn, telLinkOf } from "./call-return";
import type { LeadIslandMessages } from "./LeadActions";

/**
 * Lead page island (docs/lead-routing-plan.md §20, A6): after a `tel:` call from this page, when
 * the member comes back (tab visible again, or the page reloaded), offer "Log the call". The `tel:`
 * tap itself only marks the call (no dialog on the tap); "Log the call" opens the one-step call
 * outcome dialog (admin console 1b §5.C: what happened + the next follow-up in one save). Nothing is
 * sent anywhere; only a lead id and a time are kept in this browser's session (see call-return.ts).
 */
export function CallReturnPrompt({
  leadId,
  leadName,
  t,
  c,
  pagePath,
  focusAfterId,
}: {
  leadId: string;
  leadName: string;
  t: LeadIslandMessages;
  c: CallsMessages;
  pagePath: string;
  /**
   * A stable element (the contact panel's heading) that takes focus after the call is logged: the
   * prompt — with the "Log the call" button the dialog would return focus to — is gone by then.
   */
  focusAfterId?: string;
}) {
  const [prompt, setPrompt] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [status, setStatus] = useState("");
  const refocus = useRef(false);

  // Runs after the dialog closed (child effects first) and the prompt was removed in the same commit.
  useEffect(() => {
    if (prompt || !refocus.current) return;
    refocus.current = false;
    focusIfLost(focusAfterId);
  }, [prompt, focusAfterId]);

  useEffect(() => {
    const storage = sessionStore();
    const check = () => {
      if (document.visibilityState === "visible" && shouldPromptCallReturn(readCallMark(storage), leadId, Date.now())) setPrompt(true);
    };
    const onClick = (event: MouseEvent) => {
      if (telLinkOf(event.target)) markCallStarted(storage, leadId, Date.now());
    };
    check();
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [leadId]);

  const r = t.lead.callReturn;
  const dismiss = () => {
    clearCallMark(sessionStore());
    setPrompt(false);
    setDialog(false);
  };

  return (
    <>
      {/* Always mounted (out of the layout flow), so screen readers announce the prompt when it appears (WCAG 4.1.3). */}
      <p role="status" className={prompt || !status ? "sr-only" : "text-sm font-semibold text-success"}>
        {prompt ? `${r.title} ${r.body}` : status}
      </p>
      {prompt && (
        <div role="region" aria-label={r.title} className="flex flex-wrap items-center gap-3 rounded-card border border-[#bcd6fb] bg-blue-soft p-4 shadow-soft">
          <PhoneCall aria-hidden="true" className="size-5 shrink-0 text-blue" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{r.title}</p>
            <p className="text-sm text-[#354b66]">{r.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" aria-haspopup="dialog" onClick={() => setDialog(true)}>
              {r.log}
            </Button>
            <Button variant="outline" onClick={dismiss}>
              {r.dismiss}
            </Button>
          </div>
        </div>
      )}
      <CallOutcomeDialog
        open={dialog}
        leadId={leadId}
        leadName={leadName}
        pagePath={pagePath}
        t={t}
        c={c}
        onClose={() => setDialog(false)}
        onDone={(message) => {
          refocus.current = true;
          dismiss();
          setStatus(message);
        }}
      />
    </>
  );
}
