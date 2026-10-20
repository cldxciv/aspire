import "server-only";
import { cache } from "react";
import { getSession } from "./session";

/**
 * `getSession()` memoised per request for Server Components, so a portal page's gate, the
 * header's account menu and the preview banner share one verified lookup. Request-time only:
 * render callers under `<Suspense>`. Route handlers keep using `getSession()` / the guards.
 */
export const getPageSession = cache(() => getSession());
