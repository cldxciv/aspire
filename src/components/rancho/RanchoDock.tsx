import { Suspense } from "react";

import { getMessages } from "@/i18n/server";

import { RanchoLauncher } from "./RanchoLauncher";

/**
 * Server wrapper for the floating Rancho launcher in the public (site) layout: loads the `rancho`
 * strings and the lead gate's `leadGate` strings (the contact form in the chat, docs/lead-gate-plan.md
 * §8.6) for the current locale and passes them as props (D-028). The launcher reads
 * `usePathname()`, which can suspend while prerendering routes with unknown params, so it sits in
 * its own Suspense boundary (nothing is shown until it resolves).
 */
export async function RanchoDock() {
  const [messages, gateMessages] = await Promise.all([getMessages("rancho"), getMessages("leadGate")]);
  return (
    <Suspense fallback={null}>
      <RanchoLauncher messages={messages} gateMessages={gateMessages} />
    </Suspense>
  );
}
