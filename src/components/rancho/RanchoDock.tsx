import { Suspense } from "react";

import { getMessages } from "@/i18n/server";

import { RanchoLauncher } from "./RanchoLauncher";

/**
 * Server wrapper for the floating Rancho launcher in the public (site) layout: loads the `rancho`
 * strings for the current locale and passes them as props (D-028). The launcher reads
 * `usePathname()`, which can suspend while prerendering routes with unknown params, so it sits in
 * its own Suspense boundary (nothing is shown until it resolves).
 */
export async function RanchoDock() {
  const messages = await getMessages("rancho");
  return (
    <Suspense fallback={null}>
      <RanchoLauncher messages={messages} />
    </Suspense>
  );
}
