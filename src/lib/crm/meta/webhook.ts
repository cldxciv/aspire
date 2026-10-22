import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import { hasExternalRef } from "../repo/intake";
import { insertInboxRow } from "../repo/meta";
import { getMetaConfig } from "../settings";
import { metaReadiness, readMetaSecret } from "./config";
import { readMetaStatus, updateMetaStatus } from "./status";

/**
 * The Meta webhook (docs/lead-routing-plan.md §18.1–18.2): the verification handshake and the
 * signed `leadgen` deliveries. Deliveries carry IDS only; they go into `crm_meta_inbox` and are
 * fetched later (./inbox.ts). Nothing here logs ids, bodies or signatures.
 */

export const WEBHOOK_MAX_BYTES = 2 * 1024 * 1024;
/** `lastSignatureFailureAt` is written at most this often (a bad signature is unauthenticated). */
export const SIGNATURE_FAILURE_WRITE_MS = 60_000;
const CHALLENGE = /^[0-9A-Za-z_-]{1,128}$/;
const SIGNATURE = /^sha256=[0-9a-f]{64}$/;
const BIG_IDS = /"(leadgen_id|page_id|form_id|ad_id|adgroup_id)"\s*:\s*(\d{6,})/g;
const DIGITS = /^\d{1,30}$/;

/** Constant-time string comparison (equal-length buffers only; different lengths are simply unequal). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------------------------
// GET: verification handshake (§18.1)

export type HandshakeResult = { ok: true; challenge: string } | { ok: false; status: 400 | 403 };

/**
 * `hub.mode` must be `subscribe` and `hub.verify_token` must equal the stored verify token
 * (constant time) → 200 with `hub.challenge` (only `[0-9A-Za-z_-]{1,128}`, else 400). Anything
 * else → 403.
 */
export function verifyHandshake(params: URLSearchParams, verifyToken: string | null): HandshakeResult {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  if (mode !== "subscribe" || !verifyToken || !safeEqual(token, verifyToken)) return { ok: false, status: 403 };
  const challenge = params.get("hub.challenge") ?? "";
  return CHALLENGE.test(challenge) ? { ok: true, challenge } : { ok: false, status: 400 };
}

// ---------------------------------------------------------------------------------------------
// POST: signature, parsing (§18.2)

/** `X-Hub-Signature-256` over the RAW request bytes with the app secret (HMAC-SHA256). */
export function verifySignature(raw: Uint8Array, header: string | null, appSecret: string): boolean {
  if (!header || !SIGNATURE.test(header)) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Quotes large numeric ids before JSON.parse so no digit is lost to floating point. */
export function quoteBigIds(body: string): string {
  return body.replace(BIG_IDS, '"$1":"$2"');
}

export interface LeadgenChange {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
  /** Epoch ms (Meta sends unix seconds). */
  createdAt: number | null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === "string" && DIGITS.test(value) ? value : null;
}

/** Every `object: "page"` change with `field: "leadgen"` (bounded; malformed entries are skipped). */
export function leadgenChanges(payload: unknown): LeadgenChange[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as { object?: unknown; entry?: unknown };
  if (record.object !== "page" || !Array.isArray(record.entry)) return [];
  const out: LeadgenChange[] = [];
  for (const entry of record.entry.slice(0, 1000)) {
    const changes = typeof entry === "object" && entry !== null ? (entry as { changes?: unknown }).changes : null;
    if (!Array.isArray(changes)) continue;
    for (const change of changes.slice(0, 1000)) {
      if (typeof change !== "object" || change === null || (change as { field?: unknown }).field !== "leadgen") continue;
      const value = (change as { value?: unknown }).value;
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      const leadgenId = idOf(v.leadgen_id);
      if (!leadgenId || leadgenId.length < 5) continue;
      const created = typeof v.created_time === "number" && Number.isFinite(v.created_time) ? v.created_time : typeof v.created_time === "string" && /^\d{9,11}$/.test(v.created_time) ? Number(v.created_time) : null;
      out.push({
        leadgenId,
        pageId: idOf(v.page_id),
        formId: idOf(v.form_id),
        adId: idOf(v.ad_id),
        adgroupId: idOf(v.adgroup_id),
        createdAt: created === null ? null : created * 1000,
      });
      if (out.length >= 1000) return out;
    }
  }
  return out;
}

/** Meta's dashboard sample ("Test" next to leadgen): every id is made of 4s (M7). */
export function isDashboardSample(change: LeadgenChange): boolean {
  const ids = [change.leadgenId, change.pageId, change.formId, change.adId, change.adgroupId].filter((id): id is string => id !== null);
  return /^4+$/.test(change.leadgenId) && ids.every((id) => /^4+$/.test(id));
}

// ---------------------------------------------------------------------------------------------
// Raw body (the signature needs the exact bytes; CORE's readBodyWithLimit decodes to text)

export type RawBodyResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "invalid_content_length" };

/** Reads at most `maxBytes` raw bytes (rejects early on a larger Content-Length, counts streamed bytes too). */
export async function readRawBodyWithLimit(request: Request, maxBytes: number): Promise<RawBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) return { ok: false, reason: "invalid_content_length" };
    if (Number(declared) > maxBytes) return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

// ---------------------------------------------------------------------------------------------
// Delivery handling

export interface DeliveryCounts {
  queued: number;
  held: number;
  duplicates: number;
  ignored: number;
  samples: number;
}

export type DeliveryResult =
  | { ok: true; counts: DeliveryCounts }
  /** 503: nothing can be verified (no key / no app secret); 401: bad signature; 400: unreadable JSON. */
  | { ok: false; status: 503 | 401 | 400; reason: string };

/**
 * One signed delivery: verify → parse → for each leadgen change: Meta's sample first (→ "sample
 * received", stop), a foreign page (ignored), an id already imported (duplicate, M9), else
 * INSERT OR IGNORE into the inbox — `pending` when the integration is ready, otherwise `held`
 * (ids only, still 200; M10).
 */
export function handleWebhookDelivery(db: DatabaseSync, input: { raw: Uint8Array; signature: string | null; now: number }): DeliveryResult {
  const secret = readMetaSecret(db, "app_secret");
  if (!secret.ok) return { ok: false, status: 503, reason: secret.reason === "missing" ? "no_app_secret" : `secret_${secret.reason}` };
  if (!verifySignature(input.raw, input.signature, secret.value)) {
    // Unauthenticated: at most one status write a minute (a plain read otherwise), so junk POSTs
    // cannot keep taking the database's write lock.
    const last = Date.parse(readMetaStatus(db).lastSignatureFailureAt ?? "");
    if (!Number.isFinite(last) || input.now - last >= SIGNATURE_FAILURE_WRITE_MS || input.now < last) {
      updateMetaStatus(db, { lastSignatureFailureAt: new Date(input.now).toISOString() }, input.now);
    }
    return { ok: false, status: 401, reason: input.signature && SIGNATURE.test(input.signature) ? "bad_signature" : "malformed_signature" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(quoteBigIds(new TextDecoder("utf-8", { fatal: true }).decode(input.raw))) as unknown;
  } catch {
    return { ok: false, status: 400, reason: "bad_json" };
  }
  const changes = leadgenChanges(payload);
  const at = new Date(input.now).toISOString();
  return withTransaction(db, (): DeliveryResult => {
    const config = getMetaConfig(db).value;
    const ready = metaReadiness(db, config).ready;
    const counts: DeliveryCounts = { queued: 0, held: 0, duplicates: 0, ignored: 0, samples: 0 };
    for (const change of changes) {
      if (isDashboardSample(change)) {
        counts.samples += 1;
        continue;
      }
      if (config.pageId !== null && change.pageId !== config.pageId) {
        counts.ignored += 1;
        continue;
      }
      if (hasExternalRef(db, "meta", change.leadgenId)) {
        counts.duplicates += 1;
        continue;
      }
      const status = ready ? "pending" : "held";
      const inserted = insertInboxRow(db, { ...change, metaCreatedAt: change.createdAt, via: "webhook", status, now: input.now });
      if (!inserted) counts.duplicates += 1;
      else if (status === "pending") counts.queued += 1;
      else counts.held += 1;
    }
    updateMetaStatus(db, counts.samples > 0 ? { lastWebhookAt: at, lastTestAt: at } : { lastWebhookAt: at }, input.now);
    return { ok: true, counts };
  });
}

/** Records a successful handshake: when, and for which site address. */
export function recordHandshake(db: DatabaseSync, input: { siteUrl: string | null; now: number }): void {
  updateMetaStatus(db, { lastVerifyAt: new Date(input.now).toISOString(), verifiedSiteUrl: input.siteUrl ? input.siteUrl.slice(0, 200) : null }, input.now);
}
