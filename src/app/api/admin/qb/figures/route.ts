import type { NextRequest } from "next/server";

import { detectImageType } from "@/lib/ask/image";
import { portalApiError } from "@/lib/auth/responses";

import {
  QB_FIGURE_MAX_BYTES,
  QB_FIGURE_MAX_REQUEST_BYTES,
  qbAdminLog,
  qbResponse,
  qbServerError,
  readBytesWithLimit,
  requireQbAdmin,
} from "../_lib/http";
import { saveFigure } from "../_lib/services";

const ROUTE = "figures";

const FIGURE_MESSAGES = {
  multipartOnly: "Send the figure as multipart/form-data with a `file` field.",
  tooLarge: "Figures must be 200 KB or less. The editor shrinks pasted images to 700 px; try again from the editor.",
  missingFile: "No figure file was sent.",
  unsupportedType: "Figures must be PNG, JPEG or WebP images.",
} as const;

/**
 * POST /api/admin/qb/figures — a cropped figure for a question (§B12; `edit_draft`):
 * `multipart/form-data` with `file` (PNG, JPEG or WebP, ≤ 200 KB; SVG and anything else 415,
 * checked by magic bytes, not the declared type). The browser editor has already scaled it to at
 * most 700 px wide. → 201 `QbFigureView`. The service checks the header dimensions, the quota
 * (409 `figure_quota`) and stores the file atomically under its content hash.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "edit_draft", write: true, route: ROUTE, limit: "upload" });
    if (!auth.ok) return auth.response;
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
      return portalApiError("bad_request", FIGURE_MESSAGES.multipartOnly, { status: 415 });
    }
    const raw = await readBytesWithLimit(request, QB_FIGURE_MAX_REQUEST_BYTES);
    if (!raw.ok) {
      qbAdminLog(ROUTE, "bad_request", raw.reason);
      return raw.reason === "too_large"
        ? portalApiError("bad_request", FIGURE_MESSAGES.tooLarge, { status: 413 })
        : portalApiError("bad_request", FIGURE_MESSAGES.missingFile);
    }
    let form: FormData;
    try {
      form = await new Response(raw.bytes, { headers: { "content-type": contentType } }).formData();
    } catch {
      return portalApiError("bad_request", FIGURE_MESSAGES.missingFile);
    }
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return portalApiError("bad_request", FIGURE_MESSAGES.missingFile);
    if (file.size > QB_FIGURE_MAX_BYTES) return portalApiError("bad_request", FIGURE_MESSAGES.tooLarge, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (detectImageType(bytes) === null) {
      qbAdminLog(ROUTE, "bad_request", "unsupported_type");
      return portalApiError("bad_request", FIGURE_MESSAGES.unsupportedType, { status: 415 });
    }
    const result = await saveFigure(auth.viewer, { bytes, declaredType: file.type.slice(0, 40) }, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result, { status: 201 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
