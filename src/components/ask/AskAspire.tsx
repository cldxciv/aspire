"use client";

import { RanchoChat } from "@/components/rancho/RanchoChat";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";

const FEEDBACK_KEY = "aspire.ask.feedback.v1";

/** Counts helpful / not helpful on this device only (no question or answer is kept). */
function saveFeedback(value: "yes" | "no") {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY);
    const counts = raw ? (JSON.parse(raw) as { yes?: number; no?: number }) : {};
    counts[value] = (Number(counts[value]) || 0) + 1;
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify({ yes: counts.yes ?? 0, no: counts.no ?? 0 }));
  } catch {
    // storage unavailable: feedback is optional
  }
}

/**
 * Rancho, the AI doubt solver, as a full chat card: on /tools/ask and in the Rancho app (/rancho).
 * The same chat as the floating panel (`RanchoChat`, variant "page"): one-row composer with photo,
 * voice typing and Send, tool cards in answers, Listen / Copy / 👍👎 under each answer, an
 * answer-language select, and "Ask Rancho about this" handoffs from the student tools. Strings come
 * from `ask.chat` (= the `rancho.panel` strings), so the page and the panel always say the same.
 * `className` replaces the card's default size (up to 720px tall, within the viewport), e.g.
 * "h-full min-h-0" for a full-height layout inside a sized flex parent.
 */
export function AskAspire({
  messages: t,
  locale,
  links,
  className,
}: {
  messages: Messages<"ask">;
  locale: Locale;
  links: { enquiry: string; signIn: string; privacy: string; ask?: string };
  className?: string;
}) {
  return (
    <RanchoChat
      variant="page"
      messages={t.chat}
      locale={locale}
      links={{ ask: links.ask ?? localePath("/tools/ask", locale), enquiry: links.enquiry, signIn: links.signIn, privacy: links.privacy }}
      onFeedback={saveFeedback}
      className={className}
    />
  );
}
