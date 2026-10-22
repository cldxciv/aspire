import { draftMode } from "next/headers";
import type { NextRequest } from "next/server";

import { isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { rejectCrossOrigin } from "@/lib/auth/request";
import { layoutLog, layoutServerError, readLayoutForm, seeOther } from "@/lib/page-layout/access";
import { isLayoutPageKey, LAYOUT_PAGES } from "@/lib/page-layout/registry";

/**
 * POST /api/page-layout/preview/exit — form `page?`, `lang?` (≤ 1 KB), from the "Exit preview"
 * button of the draft-preview banner. Anyone, same-origin, no session needed: it lives OUTSIDE the
 * portal API (`/api/admin/**` answers 401 before the handler once signed out), so leaving preview
 * still works after sign-out (D6). Turns Draft Mode off and 303s to that page (registry paths
 * only: no open redirect), else to the home page of `lang`.
 */
export async function POST(request: NextRequest) {
  try {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      layoutLog("preview_exit", "forbidden", rejection.reason);
      return rejection.response;
    }
    const form = await readLayoutForm(request);
    const langValue = form.get("lang");
    const lang = isLocale(langValue) ? langValue : "en";
    const pageValue = form.get("page");
    (await draftMode()).disable();
    layoutLog("preview_exit", "ok");
    return seeOther(localePath(isLayoutPageKey(pageValue) ? LAYOUT_PAGES[pageValue].path : "/", lang));
  } catch (error) {
    return layoutServerError("preview_exit", error);
  }
}
