import { draftMode } from "next/headers";
import type { NextRequest } from "next/server";

import { isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { rejectCrossOrigin } from "@/lib/auth/request";
import { layoutLog, layoutServerError, readLayoutForm, requireLayoutEditor, seeOther } from "@/lib/page-layout/access";
import { isLayoutPageKey, LAYOUT_PAGES, PAGE_LAYOUT_ADMIN_PATH } from "@/lib/page-layout/registry";

/**
 * POST /api/admin/page-layout/preview — form `page`, `lang` (≤ 1 KB), from the editor's "Preview
 * draft" button (a new tab). Super admin, same-origin (D6, docs/page-layout-plan.md §9):
 * turns Next Draft Mode on for this browser and 303s to the public page, which then renders the
 * page's saved draft under a "Draft preview" banner. Never cached, never shown to visitors.
 * - cross-origin → 403 envelope (never a real click from the editor);
 * - unknown page, or not a super admin → 303 back to the editor (which explains why).
 */
export async function POST(request: NextRequest) {
  try {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      layoutLog("preview", "forbidden", rejection.reason);
      return rejection.response;
    }
    const form = await readLayoutForm(request);
    const langValue = form.get("lang");
    const lang = isLocale(langValue) ? langValue : "en";
    const pageValue = form.get("page");
    const page = isLayoutPageKey(pageValue) ? pageValue : null;
    const editor = localePath(PAGE_LAYOUT_ADMIN_PATH, lang);
    if (!page) {
      layoutLog("preview", "not_found");
      return seeOther(editor);
    }
    const auth = await requireLayoutEditor(request, { write: true, edit: true });
    if (!auth.ok) {
      layoutLog("preview", "forbidden");
      return seeOther(`${editor}?page=${page}`);
    }
    (await draftMode()).enable();
    layoutLog("preview", "ok");
    return seeOther(localePath(LAYOUT_PAGES[page].path, lang));
  } catch (error) {
    return layoutServerError("preview", error);
  }
}
