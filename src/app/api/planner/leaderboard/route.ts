import { requireRole } from "@/lib/auth/guards";
import { parseJsonBody, REQUEST_MESSAGES, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getDb } from "@/lib/db/connection";
import { addDays, istDateKey, weekStart } from "@/lib/planner/dates";
import { nicknameIssue, normaliseNickname } from "@/lib/planner/nickname";
import {
  LEADERBOARD_PUT_MAX_BYTES,
  LEADERBOARD_SIZE,
  PLANNER_MESSAGES,
  plannerLog,
  plannerServerError,
  plannerWriteLimiter,
  putLeaderboardBodySchema,
  rateLimitedResponse,
} from "@/lib/planner/server/api";
import { getLeaderboardSetting, setLeaderboardSetting, weeklyLeaderboard } from "@/lib/planner/server/store";

/**
 * GET /api/planner/leaderboard — this IST week's (Monday–Sunday) XP leaderboard (D-034).
 * Signed-in students only (guests 401, other roles 403). Lists ONLY students who opted in, by the
 * nickname they chose — never login ids, real names or schools. `me` is the caller's own row.
 */
export async function GET() {
  try {
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const { userId } = auth.session;
    const today = istDateKey(Date.now());
    const from = weekStart(today);
    const db = getDb();
    const setting = getLeaderboardSetting(db, userId);
    const board = weeklyLeaderboard(db, { from, to: today, limit: LEADERBOARD_SIZE, userId });
    return portalApiItem({
      week: { start: from, end: addDays(from, 6) },
      entries: board.top.map(({ rank, nickname, xp, me }) => ({ rank, nickname, xp, me })),
      participants: board.participants,
      me: {
        optedIn: setting !== null,
        nickname: setting?.nickname ?? null,
        rank: board.mine?.rank ?? null,
        xp: board.mine?.xp ?? null,
      },
    });
  } catch (error) {
    return plannerServerError("leaderboard_get", error);
  }
}

/**
 * PUT /api/planner/leaderboard — `{ optIn: true, nickname }` joins (or renames), `{ optIn: false }`
 * leaves and deletes the row. Same-origin, student only, JSON ≤ 1 KB. Nicknames: 2–20 letters,
 * numbers, spaces, `._-`; no phone/roll numbers (5+ digits), not containing the account's login id,
 * and no "Aspire"/"admin"-style names.
 */
export async function PUT(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      plannerLog("leaderboard_put", "rejected", crossOrigin.reason);
      return crossOrigin.response;
    }
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const { userId, loginId } = auth.session;

    const limit = plannerWriteLimiter.check(`leaderboard:${userId}`);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const body = await parseJsonBody(request, putLeaderboardBodySchema, LEADERBOARD_PUT_MAX_BYTES);
    if (!body.ok) return body.response;

    const db = getDb();
    if (!body.data.optIn) {
      setLeaderboardSetting(db, userId, null, Date.now());
      return portalApiItem({ optedIn: false, nickname: null });
    }
    const raw = body.data.nickname ?? "";
    // D-034: never a login id on the leaderboard (QA-SEC-M6).
    const issue = raw.trim() === "" ? "required" : nicknameIssue(raw, { loginId });
    if (issue) {
      return portalApiError("validation", REQUEST_MESSAGES.validation, {
        fieldErrors: { nickname: [PLANNER_MESSAGES.nickname[issue]] },
      });
    }
    const nickname = normaliseNickname(raw);
    setLeaderboardSetting(db, userId, nickname, Date.now());
    return portalApiItem({ optedIn: true, nickname });
  } catch (error) {
    return plannerServerError("leaderboard_put", error);
  }
}
