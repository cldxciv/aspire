import { isIP } from "node:net";

import type { NextRequest } from "next/server";

import { INTEGRATIONS_ENV } from "@/lib/crm/lead-ops-types";
import { privateAnswer, syncLimiter } from "@/lib/crm/meta/http";
import { processMetaInbox } from "@/lib/crm/meta/inbox";
import { metaLog } from "@/lib/crm/meta/runtime";
import { reconcileMetaLeads } from "@/lib/crm/meta/sync";
import { safeEqual } from "@/lib/crm/meta/webhook";
import { getMetaConfig } from "@/lib/crm/settings";
import { getDb } from "@/lib/db/connection";

/**
 * POST /api/integrations/meta/sync — the OPTIONAL loopback cron (docs/lead-routing-plan.md §18.5,
 * M12): reconcile the forms' recent lead ids, then process the inbox → `{ processed, enqueued }`.
 *
 * - 404 unless `INTEGRATIONS_CRON_TOKEN` (≥ 32 characters) is set;
 * - 403 for anything that came through the proxy (see `cameDirectly`) or whose `Host` is not
 *   `127.0.0.1` / `localhost`;
 * - 401 unless `Authorization: Bearer <token>` matches (constant time).
 * Exempt from the preview gate (exact path, src/proxy.ts). Never logs the token.
 */

const MIN_TOKEN = 32;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/;

const json = (body: unknown, status: number) => privateAnswer(JSON.stringify(body), status, "json");

/** A loopback, RFC 1918 or unique-local (fc00::/7) address, also IPv4-mapped (`::ffff:a.b.c.d`). */
function isPrivateOrLoopback(raw: string): boolean {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return kind === 6 && (ip === "::1" || /^f[cd][0-9a-f]{2}:/.test(ip));
}

/**
 * True unless the request shows signs of the proxy. Next fills `X-Forwarded-For` with the socket
 * address when it is absent (next/dist/server/base-server.js), so the cron's direct call through
 * Docker's port mapping arrives with exactly ONE private or loopback address (the bridge gateway,
 * e.g. 172.18.0.1). nginx appends the client's public address (`$proxy_add_x_forwarded_for`,
 * TRUSTED_PROXY_HOPS=1) and may set `X-Real-IP`: a list, a public address or `X-Real-IP` → refused.
 */
function cameDirectly(headers: Headers): boolean {
  if (headers.has("x-real-ip")) return false;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null || forwarded.trim() === "") return true;
  return !forwarded.includes(",") && isPrivateOrLoopback(forwarded);
}

export async function POST(request: NextRequest) {
  const token = process.env[INTEGRATIONS_ENV.cronToken]?.trim() ?? "";
  if (token.length < MIN_TOKEN) return json({ ok: false, error: "not_found" }, 404);
  if (!cameDirectly(request.headers)) {
    metaLog("sync.cron", "warn", "proxied");
    return json({ ok: false, error: "forbidden" }, 403);
  }
  if (!LOOPBACK_HOST.test((request.headers.get("host") ?? "").trim().toLowerCase())) {
    metaLog("sync.cron", "warn", "not_loopback");
    return json({ ok: false, error: "forbidden" }, 403);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const given = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!safeEqual(given, token)) {
    metaLog("sync.cron", "warn", "bad_token");
    return json({ ok: false, error: "unauthenticated" }, 401);
  }
  if (!syncLimiter.check("cron").allowed) return json({ ok: false, error: "rate_limited" }, 429);
  try {
    const enabled = getMetaConfig(getDb()).value.enabled;
    const sync = enabled ? await reconcileMetaLeads() : null;
    const report = await processMetaInbox({ limit: 50, budgetMs: 45_000 });
    metaLog("sync.cron", "success", sync && !sync.ok ? (sync.code ?? undefined) : undefined);
    return json({ ok: true, data: { processed: report.processed, enqueued: sync?.enqueued ?? 0 } }, 200);
  } catch {
    metaLog("sync.cron", "error", "exception");
    return json({ ok: false, error: "server_error" }, 500);
  }
}
