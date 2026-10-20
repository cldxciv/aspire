import { messagesFor } from "@/i18n/messages";

import { PlannerClient, type PlannerClientProps } from "./PlannerClient";

export { CounsellorCta } from "./PlannerClient";

/**
 * Server wrapper of the study planner (no "use client"): adds the `leadGate` strings in the page's
 * locale (D-028: messages reach client components as props from the server) so the planner can show
 * the one-time contact step (docs/lead-gate-plan.md §8.5). Synchronous on purpose (`messagesFor`, the
 * locale comes in as a prop): /tools/planner stays static and tests can render it directly.
 * The browser side is PlannerClient.tsx.
 */
export function PlannerApp(props: Omit<PlannerClientProps, "gateMessages">) {
  return <PlannerClient {...props} gateMessages={messagesFor(props.locale, "leadGate")} />;
}
