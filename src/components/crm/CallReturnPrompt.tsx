"use client";

import { PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { clearCallMark, markCallStarted, readCallMark, sessionStore, shouldPromptCallReturn, telLinkOf } from "./call-return";
import { LogContactDialog, type LeadIslandMessages } from "./LeadActions";

/**
 * Lead page island (docs/lead-routing-plan.md §20, A6): after a `tel:` call from this page, when
 * the member comes back (tab visible again, or the page reloaded), offer "Log the call" — which
 * opens the same "log this contact" dialog. Nothing is sent anywhere; only a lead id and a time
 * are kept in this browser's session (see call-return.ts).
 */
export function CallReturnPrompt({ leadId, t, pagePath }: { leadId: string; t: LeadIslandMessages; pagePath: string }) {
  const [prompt, setPrompt] = useState(false);
  const [dialog, setDialog] = useState(false);

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
  const done = () => {
    clearCallMark(sessionStore());
    setPrompt(false);
    setDialog(false);
  };

  return (
    <>
      {/* Always mounted (out of the layout flow), so screen readers announce the prompt when it appears (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {prompt ? `${r.title} ${r.body}` : ""}
      </p>
      {prompt && (
        <div role="region" aria-label={r.title} className="flex flex-wrap items-center gap-3 rounded-card border border-[#bcd6fb] bg-blue-soft p-4 shadow-soft">
          <PhoneCall aria-hidden="true" className="size-5 shrink-0 text-blue" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{r.title}</p>
            <p className="text-sm text-[#354b66]">{r.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => setDialog(true)}>
              {r.log}
            </Button>
            <Button variant="outline" onClick={done}>
              {r.dismiss}
            </Button>
          </div>
        </div>
      )}
      <LogContactDialog open={dialog} initialChannel="call" leadId={leadId} t={t} pagePath={pagePath} onClose={() => setDialog(false)} onDone={done} />
    </>
  );
}
