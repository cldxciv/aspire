import { requireRole } from "@/lib/auth/guards";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiItem } from "@/lib/auth/responses";
import { getDb } from "@/lib/db/connection";
import { istDateKey } from "@/lib/planner/dates";
import { suggestNickname } from "@/lib/planner/nickname";
import { weeklyXp } from "@/lib/planner/progress";
import {
  plannerLog,
  plannerServerError,
  plannerWriteLimiter,
  putStateBodySchema,
  rateLimitedResponse,
  STATE_PUT_MAX_BYTES,
} from "@/lib/planner/server/api";
import { plausibleState } from "@/lib/planner/server/plausible";
import { getLeaderboardSetting, getStoredState, ownerTag, saveState } from "@/lib/planner/server/store";
import type { PlannerState } from "@/lib/planner/state";

/**
 * GET /api/planner/state — the signed-in student's own planner document (D-034).
 * Guests 401, other roles 403. `{ state | null, savedAt, owner, leaderboard }`; `owner` is an opaque
 * per-account tag so the browser can tell whose copy it holds. `Cache-Control: no-store`.
 */
export async function GET() {
  try {
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const { userId, displayName, loginId } = auth.session;
    const db = getDb();
    const stored = getStoredState(db, userId);
    const setting = getLeaderboardSetting(db, userId);
    return portalApiItem({
      state: stored?.state ?? null,
      savedAt: stored?.updatedAt ?? null,
      owner: ownerTag(userId),
      leaderboard: {
        optedIn: setting !== null,
        nickname: setting?.nickname ?? null,
        suggestedNickname: suggestNickname(displayName, loginId),
      },
    });
  } catch (error) {
    return plannerServerError("state_get", error);
  }
}

/**
 * PUT /api/planner/state — `{ state }` replaces the student's own document. Same-origin (403),
 * student only (401/403), JSON ≤ 64 KB (415/413), schema-valid (422), ≤ 60 saves a minute (429).
 * The server drops history older than 400 days or dated in the future, clamps each day's XP to
 * what its counts allow and caps the counts to what the student's own plan allows (blocks per plan
 * day, reviews and XP per day — src/lib/planner/caps.ts, QA-SEC-M6 L8). The points stay
 * self-reported; the caps only bound what an edited request can claim.
 */
export async function PUT(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      plannerLog("state_put", "rejected", crossOrigin.reason);
      return crossOrigin.response;
    }
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const { userId } = auth.session;

    const limit = plannerWriteLimiter.check(`state:${userId}`);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const body = await parseJsonBody(request, putStateBodySchema, STATE_PUT_MAX_BYTES);
    if (!body.ok) {
      plannerLog("state_put", "rejected", body.reason ?? body.outcome);
      return body.response;
    }

    const now = Date.now();
    const today = istDateKey(now);
    const state = plausibleState(body.data.state as PlannerState, today);
    saveState(getDb(), userId, state, now);
    return portalApiItem({ savedAt: now, weeklyXp: weeklyXp(state.activity, today) });
  } catch (error) {
    return plannerServerError("state_put", error);
  }
}
