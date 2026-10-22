/**
 * TEST HELPER (not shipped): synthetic Meta credentials and ids, the JSON fixtures, request
 * signing, a fake Graph API (`fakeGraph`: an injected `fetchImpl` that answers from fixtures and
 * records every call), and a one-call setup of the stored Meta settings. Nothing here reaches the
 * network; tests also replace the global `fetch` with a function that throws. Synthetic people only.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

import type { DatabaseSync } from "node:sqlite";

import type { MetaConfig } from "../../lead-ops-types";
import { patchMetaConfigAsSystem, storeMetaSecret } from "../config";
import type { CentreOption } from "../../intake/fields";

/** ≥ 43 characters; never a real key. */
export const TEST_INTEGRATIONS_SECRET = "meta-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
export const TEST_INTEGRATIONS_SECRET_NEXT = "meta-test-secret-next-0123456789-abcdefghijklmnopqrstu";
/** 32 hex characters, like a Meta App Secret (synthetic). */
export const TEST_APP_SECRET = "0123456789abcdef0123456789abcdef";
export const TEST_ACCESS_TOKEN = "EAAsyntheticSystemUserTokenForTestsOnly0123456789";
export const APP_ID = "1234567890123";
export const PAGE_ID = "112233445566778";
export const FORM_ID = "998877665544332";
/** 17 digits: beyond 2^53, so a JSON number would lose its last digits. */
export const LEAD_ID = "12345678901234567";
export const CONSENT_KEY = "consent_contact";
export const TEST_CENTRES: CentreOption[] = [
  { slug: "dharamshala", names: ["Dharamshala Centre"] },
  { slug: "shimla", names: ["Shimla Centre"] },
];

export function fixtureText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

export function fixtureJson<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

/** `X-Hub-Signature-256` for a body (HMAC-SHA256 with the app secret over the exact bytes). */
export function sign(body: string | Uint8Array, secret = TEST_APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * A delivery whose non-ASCII text is \u-escaped, as Meta sends it. Built from char codes so no
 * editor or tool can turn the escapes into the characters (which would change the signed bytes).
 */
export function unicodeEscapedBody(): string {
  const backslash = String.fromCharCode(92);
  const esc = (hex: string) => `${backslash}u${hex}`;
  const hindi = ["0927", "0930", "094d", "092e", "0936", "093e", "0932", "093e"].map(esc).join("");
  const note = `Dharamshala ${hindi} caf${esc("00e9")} ${backslash}/ ${esc("2013")} dash`;
  return `{"object":"page","entry":[{"id":"${PAGE_ID}","time":1792046730,"changes":[{"field":"leadgen","value":{"leadgen_id":"12345678901234568","page_id":"${PAGE_ID}","form_id":"${FORM_ID}","created_time":1792046730,"note":"${note}"}}]}]}`;
}

/** A delivery for any lead ids (string ids, so precision is not the point). */
export function deliveryBody(leadIds: readonly string[], pageId = PAGE_ID): string {
  const changes = leadIds.map((id) => ({ field: "leadgen", value: { leadgen_id: id, page_id: pageId, form_id: FORM_ID, ad_id: "120200000000000001", created_time: 1792046730 } }));
  return JSON.stringify({ object: "page", entry: [{ id: pageId, time: 1792046730, changes }] });
}

// ---------------------------------------------------------------------------------------------
// Fake Graph

export type GraphReply = { status?: number; body: unknown; headers?: Record<string, string> } | { throws: "network" | "timeout" };
export interface GraphCall {
  method: string;
  version: string;
  path: string;
  params: URLSearchParams;
  authorization: string | null;
}
type Route = GraphReply | GraphReply[] | ((call: GraphCall) => GraphReply);

export function reply(name: string, status = 400, headers?: Record<string, string>): GraphReply {
  return { status, body: fixtureJson(name), headers };
}

/** The lead fixture with another id / phone (field_data copied). */
export function leadBody(overrides: { id?: string; phone?: string; formId?: string; createdTime?: string; consentTicked?: boolean } = {}): Record<string, unknown> {
  const lead = fixtureJson<Record<string, unknown> & { field_data: { name: string; values: string[] }[] }>("lead-full.json");
  if (overrides.id) lead.id = overrides.id;
  if (overrides.formId) lead.form_id = overrides.formId;
  if (overrides.createdTime) lead.created_time = overrides.createdTime;
  if (overrides.phone) lead.field_data = lead.field_data.map((field) => (field.name === "phone_number" ? { ...field, values: [overrides.phone as string] } : field));
  if (overrides.consentTicked === false) lead.custom_disclaimer_responses = [{ checkbox_key: CONSENT_KEY, is_checked: "0" }];
  return lead;
}

/**
 * A `fetch` that answers Graph calls from `routes` (`"GET <path>"`, `"POST <path>"`, or `"GET *"`);
 * an array answers in turn (the last repeats); unknown routes get a Graph-style 404.
 */
export function fakeGraph(routes: Record<string, Route>) {
  const calls: GraphCall[] = [];
  const turns = new Map<string, number>();
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const segments = url.pathname.split("/").filter(Boolean);
    const method = init?.method ?? "GET";
    const call: GraphCall = { method, version: segments[0] ?? "", path: segments.slice(1).join("/"), params: url.searchParams, authorization: new Headers(init?.headers).get("authorization") };
    calls.push(call);
    const key = routes[`${method} ${call.path}`] !== undefined ? `${method} ${call.path}` : `${method} *`;
    const route = routes[key];
    if (route === undefined) return new Response(JSON.stringify({ error: { code: 803, message: "unknown route" } }), { status: 404 });
    let answer: GraphReply;
    if (typeof route === "function") answer = route(call);
    else if (Array.isArray(route)) {
      const turn = turns.get(key) ?? 0;
      turns.set(key, turn + 1);
      answer = route[Math.min(turn, route.length - 1)];
    } else answer = route;
    if ("throws" in answer) throw answer.throws === "timeout" ? Object.assign(new Error("timed out"), { name: "TimeoutError" }) : new TypeError("fetch failed");
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "content-type": "application/json", ...(answer.headers ?? {}) } });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

/** Calls that reached the guarded global `fetch` (must stay 0: a background job may swallow the throw). */
export const globalFetchCalls = { count: 0 };

/** Replaces the global fetch with one that fails the test (and counts). Returns the restore function. */
export function guardGlobalFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (() => {
    globalFetchCalls.count += 1;
    throw new Error("network access in a test");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

// ---------------------------------------------------------------------------------------------
// Stored settings

/** Stores the synthetic secrets and config (needs INTEGRATIONS_SECRET stubbed). */
export function configureMeta(
  db: DatabaseSync,
  options: { enabled?: boolean; appSecret?: boolean; token?: boolean; pageId?: string | null; consentKey?: string | null; config?: Partial<MetaConfig> } = {},
): void {
  const now = Date.now();
  if (options.appSecret !== false) storeMetaSecret(db, "app_secret", TEST_APP_SECRET, { actorId: null, now, audit: false });
  if (options.token !== false) storeMetaSecret(db, "access_token", TEST_ACCESS_TOKEN, { actorId: null, now, audit: false });
  patchMetaConfigAsSystem(
    db,
    () => ({
      enabled: options.enabled ?? true,
      appId: APP_ID,
      pageId: options.pageId === undefined ? PAGE_ID : options.pageId,
      forms: [
        {
          id: FORM_ID,
          name: "NEET Kangra Oct",
          status: "ACTIVE",
          defaults: { programInterest: "jee", centreSlug: "dharamshala" },
          consentCheckboxKey: options.consentKey === undefined ? CONSENT_KEY : options.consentKey,
        },
      ],
      ...(options.config ?? {}),
    }),
    { actorId: null, now },
  );
}
