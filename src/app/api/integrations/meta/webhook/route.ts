import type { NextRequest } from "next/server";

import { readMetaSecret } from "@/lib/crm/meta/config";
import { afterResponse, privateAnswer, requestOrigin, webhookLimiter } from "@/lib/crm/meta/http";
import { processMetaInbox } from "@/lib/crm/meta/inbox";
import { metaLog, safely } from "@/lib/crm/meta/runtime";
import { handleWebhookDelivery, readRawBodyWithLimit, recordHandshake, verifyHandshake, WEBHOOK_MAX_BYTES } from "@/lib/crm/meta/webhook";
import { getDb } from "@/lib/db/connection";
import { getClientIp } from "@/lib/server/request-guards";

/**
 * Meta's webhook for Page `leadgen` events (docs/lead-routing-plan.md §18.1–18.2; D-047). PUBLIC:
 * Meta calls it, so there is no session; it is exempt from the preview gate (src/proxy.ts) and
 * trusts nothing but the verify token (GET) and the app-secret signature over the raw bytes (POST).
 * Every answer is `no-store` + `noindex`; logs are fixed codes (never ids, bodies or signatures).
 */

const json = (body: unknown, status: number, extra?: Record<string, string>) => privateAnswer(JSON.stringify(body), status, "json", extra);

/**
 * GET — the verification handshake: `hub.mode=subscribe` and the stored verify token (constant
 * time) → 200 `text/plain` with `hub.challenge` (`[0-9A-Za-z_-]{1,128}`, else 400); anything else
 * 403. Records when, and for which site address, Meta verified.
 */
export async function GET(request: NextRequest) {
  try {
    // Request data first: this handler must never be prerendered (Cache Components), nor open the database at build time.
    const params = request.nextUrl.searchParams;
    const db = getDb();
    const verify = readMetaSecret(db, "verify_token");
    const result = verifyHandshake(params, verify.ok ? verify.value : null);
    if (!result.ok) {
      metaLog("webhook.verify", "warn", result.status === 400 ? "bad_challenge" : "refused");
      return privateAnswer(result.status === 400 ? "Bad request" : "Forbidden", result.status, "text");
    }
    recordHandshake(db, { siteUrl: requestOrigin(request), now: Date.now() });
    metaLog("webhook.verify", "success");
    return privateAnswer(result.challenge, 200, "text");
  } catch {
    metaLog("webhook.verify", "error", "exception");
    return privateAnswer("Error", 500, "text");
  }
}

/**
 * POST — a signed delivery. 503 when nothing can be verified (no server key or app secret);
 * 413 above 2 MB; 429 above 600 a minute per IP; 401 for a missing / malformed / wrong
 * `X-Hub-Signature-256`; 400 for unreadable JSON. Otherwise 200 `{"ok":true}` at once (ids go to
 * the inbox, `held` while the integration is not ready), then the inbox is processed after the
 * response (`after()`, wrapped so nothing escapes).
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    if (!readMetaSecret(db, "app_secret").ok) {
      metaLog("webhook", "error", "not_configured");
      return json({ ok: false, error: "not_configured" }, 503);
    }
    const body = await readRawBodyWithLimit(request, WEBHOOK_MAX_BYTES);
    if (!body.ok) {
      metaLog("webhook", "warn", body.reason);
      return json({ ok: false, error: "bad_request" }, body.reason === "too_large" ? 413 : 400);
    }
    const limit = webhookLimiter.check(getClientIp(request.headers));
    if (!limit.allowed) {
      metaLog("webhook", "warn", "rate_limited");
      return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    }
    const result = handleWebhookDelivery(db, { raw: body.bytes, signature: request.headers.get("x-hub-signature-256"), now: Date.now() });
    if (!result.ok) {
      metaLog("webhook", result.status === 503 ? "error" : "warn", result.reason);
      return json({ ok: false, error: result.status === 401 ? "unauthenticated" : result.status === 503 ? "not_configured" : "bad_request" }, result.status);
    }
    metaLog("webhook", "success", result.counts.samples > 0 ? "sample" : undefined);
    if (result.counts.queued > 0) afterResponse(() => safely(() => processMetaInbox({ limit: 25, budgetMs: 20_000 }), "webhook.after"));
    return json({ ok: true }, 200);
  } catch {
    metaLog("webhook", "error", "exception");
    return json({ ok: false, error: "server_error" }, 500);
  }
}
