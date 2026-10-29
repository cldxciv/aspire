import type { AttemptSummary } from "@/lib/crm/console/types";
import type { CallsMessages } from "./messages";
import { attemptText } from "./outcome-form";

/** "Attempt 4 · 3 unanswered in a row" — plain text under the family's name, never a coloured badge. */
export function AttemptLine({ attempts, c }: { attempts: Pick<AttemptSummary, "calls" | "unansweredStreak">; c: Pick<CallsMessages["calls"], "attempt" | "attemptFirst"> }) {
  return <p className="text-sm font-semibold text-muted">{attemptText(attempts, c)}</p>;
}
