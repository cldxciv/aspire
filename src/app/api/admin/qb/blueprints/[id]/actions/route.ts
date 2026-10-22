import type { NextRequest } from "next/server";

import type { QbBlueprintActionName } from "@/components/qb-admin/contract";
import type { QbCapability } from "@/lib/qb/types";

import {
  invalidId,
  isQbId,
  parseQbBody,
  QB_AUDIT,
  qbAdminLog,
  qbAudit,
  qbResponse,
  qbServerError,
  requireCapability,
  requireQbAdmin,
  type QbAuditAction,
} from "../../../_lib/http";
import { blueprintActionSchema } from "../../../_lib/schemas";
import { blueprintAction } from "../../../_lib/services";

const ROUTE = "blueprint_action";

type Context = { params: Promise<{ id: string }> };

const CAPABILITY: Readonly<Record<QbBlueprintActionName, QbCapability>> = {
  new_version: "edit_blueprint",
  publish: "publish_blueprint",
  archive: "publish_blueprint",
  confirm_pattern: "publish_blueprint",
  signoff: "publish_blueprint",
};

const AUDIT: Readonly<Record<QbBlueprintActionName, QbAuditAction>> = {
  new_version: QB_AUDIT.blueprintNewVersion,
  publish: QB_AUDIT.blueprintPublish,
  archive: QB_AUDIT.blueprintArchive,
  confirm_pattern: QB_AUDIT.patternConfirm,
  signoff: QB_AUDIT.blueprintSignoff,
};

/**
 * POST /api/admin/qb/blueprints/:id/actions — `{ action, note?, label? }` → `QbBlueprintDetail`:
 *
 * - `publish` (admin): refused with 409 `placeholder_blueprint` while the BOH placeholder pattern is
 *   unconfirmed, 409 `taxonomy_unconfirmed` while the exam's taxonomy is unconfirmed, 409
 *   `blueprint_invalid` with validation issues; the previous published version is archived;
 * - `archive` (admin); `confirm_pattern` (admin: "pattern confirmed by Aspire", lifts the
 *   placeholder block); `signoff` (admin, public wording in `label`, no names by default);
 * - `new_version` (reviewer): a new draft copied from this version.
 *
 * Every action is audited (§B6).
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const body = await parseQbBody(request, blueprintActionSchema, ROUTE);
    if (!body.ok) return body.response;
    const denied = requireCapability(auth.viewer, CAPABILITY[body.data.action], ROUTE);
    if (denied) return denied;
    const now = Date.now();
    const result = await blueprintAction(auth.viewer, id, body.data, now);
    if (result.ok) {
      const blueprint = result.data.blueprint;
      qbAudit(auth.viewer, {
        action: AUDIT[body.data.action],
        target: blueprint.id,
        details: { slot: blueprint.slot, version: blueprint.version, status: blueprint.status, from: id },
        now,
      });
      qbAdminLog(ROUTE, "success", body.data.action);
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
