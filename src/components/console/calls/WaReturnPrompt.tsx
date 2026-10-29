"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import type { CallsMessages } from "./messages";
import { readWaMark, sessionStore, shouldPromptWaReturn, WA_MARK_EVENT, type WaMark } from "./wa-return";

/**
 * "Back from WhatsApp?" on the lead page (docs/admin-phase-1b-plan.md §5.D step 2): when this
 * browser opened WhatsApp for this lead in the last two hours and the composer is not open (the page
 * was reloaded, the tab was discarded, or the dialog was closed without an answer), ask "Did you send
 * the message?" when the page regains focus. Yes → the composer's "I sent it" step; No → nothing is
 * logged. Opening WhatsApp alone never logs anything (O16).
 */
export function WaReturnPrompt({
  leadId,
  leadName,
  suppressed,
  c,
  onYes,
  onNo,
}: {
  leadId: string;
  leadName: string;
  /** The composer is open: it asks the question itself. */
  suppressed: boolean;
  c: Pick<CallsMessages["whatsapp"], "returnTitle" | "returnBody" | "yesSent" | "notSent">;
  onYes: (mark: WaMark) => void;
  onNo: () => void;
}) {
  const [mark, setMark] = useState<WaMark | null>(null);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const stored = readWaMark(sessionStore());
      setMark(shouldPromptWaReturn(stored, leadId, Date.now()) ? stored : null);
    };
    const timer = window.setTimeout(check, 0);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener(WA_MARK_EVENT, check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener(WA_MARK_EVENT, check);
    };
  }, [leadId]);

  const visible = mark !== null && !suppressed;
  return (
    <>
      {/* Always mounted, so screen readers announce the question when it appears (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {visible ? `${c.returnTitle} ${format(c.returnBody, { name: leadName })}` : ""}
      </p>
      {visible && mark && (
        <div role="region" aria-label={c.returnTitle} className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-[#bfe5cf] bg-[#e7f7ee] p-4">
          <MessageCircle aria-hidden="true" className="size-5 shrink-0 text-[#0f5a3c]" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{c.returnTitle}</p>
            <p className="text-sm text-[#354b66]">{format(c.returnBody, { name: leadName })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => onYes(mark)}>
              {c.yesSent}
            </Button>
            <Button variant="outline" onClick={onNo}>
              {c.notSent}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
