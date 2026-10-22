import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { parseJsonBody } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getDb } from "@/lib/db/connection";
import { LAYOUT_API_MESSAGES, layoutLog, layoutServerError, requireLayoutEditor } from "@/lib/page-layout/access";
import { isLayoutPageKey, pageLayoutTag } from "@/lib/page-layout/registry";
import { layoutWriteSchema } from "@/lib/page-layout/schemas";
import { applyLayoutAction, getPageLayoutState } from "@/lib/page-layout/store";

type Context = { params: Promise<{ page: string }> };

/**
 * GET /api/admin/page-layout/:page — the page's layout state (published, draft, revision, the last
 * 20 history entries). Any admin (the editor's read-only view and its "Reload").
 * 401 / 403 · 404 unknown page.
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireLayoutEditor(request, { write: false, edit: false });
    if (!auth.ok) {
      layoutLog("get", "forbidden");
      return auth.response;
    }
    const { page } = await ctx.params;
    if (!isLayoutPageKey(page)) {
      layoutLog("get", "not_found");
      return portalApiError("not_found", LAYOUT_API_MESSAGES.unknownPage);
    }
    const state = getPageLayoutState(getDb(), page);
    layoutLog("get", "ok");
    return portalApiItem(state);
  } catch (error) {
    return layoutServerError("get", error);
  }
}

/**
 * POST /api/admin/page-layout/:page — super admin, same-origin, JSON ≤ 4 KB:
 * `{ action: "save_draft", revision, sections }` | `{ action: "discard_draft" | "publish" | "reset", revision }`.
 * 200 the new state · 401 / 403 · 404 · 409 stale revision · 422 rule codes (`not_last:<key>`,
 * `cannot_hide:<key>`, `duplicate:<key>`, `none_visible`, `no_draft`) in `fieldErrors.sections` · 429.
 * Publish and reset refresh only this page's cached layout (`revalidateTag(…, { expire: 0 })`);
 * drafts are never cached, so saving or discarding one revalidates nothing.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireLayoutEditor(request, { write: true, edit: true });
    if (!auth.ok) {
      layoutLog("write", "forbidden");
      return auth.response;
    }
    const { page } = await ctx.params;
    if (!isLayoutPageKey(page)) {
      layoutLog("write", "not_found");
      return portalApiError("not_found", LAYOUT_API_MESSAGES.unknownPage);
    }
    const body = await parseJsonBody(request, layoutWriteSchema);
    if (!body.ok) {
      layoutLog("write", "invalid", body.reason ?? body.outcome);
      return body.response;
    }
    const data = body.data;
    const result = applyLayoutAction(getDb(), {
      page,
      action: data.action,
      revision: data.revision,
      entries: data.action === "save_draft" ? data.sections : undefined,
      actorId: auth.session.userId,
      now: Date.now(),
    });
    if (!result.ok) {
      if (result.error === "conflict") {
        layoutLog(data.action, "conflict");
        return portalApiError("bad_request", LAYOUT_API_MESSAGES.conflict, { status: 409 });
      }
      layoutLog(data.action, "invalid", result.error);
      const issues = result.error === "invalid" ? result.issues : ["no_draft"];
      return portalApiError("validation", LAYOUT_API_MESSAGES.invalid, { fieldErrors: { sections: issues } });
    }
    if (data.action === "publish" || data.action === "reset") revalidateTag(pageLayoutTag(page), { expire: 0 });
    layoutLog(data.action, "ok");
    return portalApiItem(result.state);
  } catch (error) {
    return layoutServerError("write", error);
  }
}
