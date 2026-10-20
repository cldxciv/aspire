import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { ASK_ENDPOINT, ASK_MAX_QUESTION_CHARS, type AskStatus } from "@/lib/ask/constants";
import { askRequestSchema } from "@/lib/ask/schema";

import { RanchoChatPanel, type RanchoLinks } from "./RanchoChatPanel";
import { askRancho, buildAskBody, fetchAskStatus, validateQuestion } from "./rancho-chat";

/** The Rancho chat panel: dialog semantics, the /api/ask contract, failure states, no storage (photos: rancho-photo.test.ts). */

const encoder = new TextEncoder();

/** A streamed 200 response; `chunks` are sent as-is (lines may be split across chunks). */
function streamResponse(chunks: string[], { keepOpen = false, signal }: { keepOpen?: boolean; signal?: AbortSignal } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!keepOpen) controller.close();
      signal?.addEventListener("abort", () => controller.error(new DOMException("The operation was aborted.", "AbortError")));
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const line = (event: unknown) => `${JSON.stringify(event)}\n`;

function ask(fetchImpl: typeof fetch, signal = new AbortController().signal) {
  const onStart = vi.fn();
  const onText = vi.fn();
  const result = askRancho({ question: "  Find the maximum height.  ", subject: "physics", language: "hi" }, { signal, fetchImpl, onStart, onText });
  return { result, onStart, onText };
}

describe("request contract", () => {
  it("POSTs exactly the Ask API body for a typed question: trimmed question, subject, language and no photo", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => streamResponse([line({ t: "done", stop: "end_turn", meta: null })]));
    await ask(fetchImpl).result;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ASK_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ question: "Find the maximum height.", subject: "physics", language: "hi" });
    expect(askRequestSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("image");
    expect(body).not.toHaveProperty("photoConsent");
  });

  it("builds the same body directly and validates questions like the API", () => {
    expect(buildAskBody({ question: " x ", subject: "auto", language: "en" })).toEqual({ question: "x", subject: "auto", language: "en" });
    expect(validateQuestion("   ")).toBe("required");
    expect(validateQuestion("a".repeat(ASK_MAX_QUESTION_CHARS + 1))).toBe("too_long");
    expect(validateQuestion(` ${"a".repeat(ASK_MAX_QUESTION_CHARS)} `)).toBeNull();
  });
});

describe("streaming answers", () => {
  it("reads the NDJSON stream (split lines too), reports the allowance and strips the topic trailer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      streamResponse([
        line({ t: "start", remaining: 3, limit: 5 }),
        '{"t":"delta","text":"**Step 1.** u = 10 m/s\\n"}\n{"t":"del',
        'ta","text":"**Final answer:** 5 m<aspire-meta>{\\"subject\\":\\"physics\\"}</aspire-meta>"}\n',
        line({ t: "done", stop: "end_turn", meta: { subject: "physics", topic: "Projectile motion", difficulty: "easy" } }),
      ]),
    );
    const { result, onStart, onText } = ask(fetchImpl);
    const answer = await result;

    expect(onStart).toHaveBeenCalledWith({ remaining: 3, limit: 5 });
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText.mock.calls[0][0]).toBe("**Step 1.** u = 10 m/s"); // trailing whitespace tidied
    expect(answer.failure).toBeNull();
    expect(answer.stop).toBe("end_turn");
    expect(answer.meta).toEqual({ subject: "physics", topic: "Projectile motion", difficulty: "easy" });
    expect(answer.text).toContain("**Final answer:** 5 m");
    expect(answer.text).not.toContain("aspire-meta");
    for (const [partial] of onText.mock.calls) expect(partial).not.toContain("aspire-meta");
  });

  it("keeps max_tokens and refusal stops", async () => {
    const truncated = await ask(async () => streamResponse([line({ t: "delta", text: "Long" }), line({ t: "done", stop: "max_tokens", meta: null })])).result;
    expect(truncated).toMatchObject({ text: "Long", stop: "max_tokens", failure: null });
    const refused = await ask(async () => streamResponse([line({ t: "done", stop: "refusal", meta: null })])).result;
    expect(refused).toMatchObject({ text: "", stop: "refusal", failure: null });
  });

  it("maps stream error events and a stream that ends without `done`", async () => {
    const upstream = await ask(async () => streamResponse([line({ t: "error", code: "upstream" })])).result;
    expect(upstream.failure).toEqual({ kind: "busy" });
    const interrupted = await ask(async () => streamResponse([line({ t: "delta", text: "Half" }), line({ t: "error", code: "interrupted" })])).result;
    expect(interrupted).toMatchObject({ text: "Half", failure: { kind: "interrupted" } });
    const cut = await ask(async () => streamResponse([line({ t: "delta", text: "Half" })])).result;
    expect(cut).toMatchObject({ text: "Half", failure: { kind: "interrupted" } });
  });

  it("stops cleanly when the panel aborts mid-answer (close / Stop / New chat)", async () => {
    const controller = new AbortController();
    let seen!: () => void;
    const textSeen = new Promise<void>((resolve) => (seen = resolve));
    const pending = askRancho(
      { question: "q", subject: "auto", language: "en" },
      {
        signal: controller.signal,
        fetchImpl: async (_url, init) => streamResponse([line({ t: "delta", text: "Partial" })], { keepOpen: true, signal: init?.signal ?? undefined }),
        onText: () => seen(),
      },
    );
    await textSeen;
    controller.abort();
    expect(await pending).toEqual({ text: "Partial", stop: "stopped", meta: null, failure: null });
  });
});

describe("failures before the answer", () => {
  it.each([
    [503, { ok: false, error: "not_configured", message: "Rancho isn't connected yet." }, {}, { kind: "not_configured" }],
    [429, { ok: false, error: "rate_limited", message: "Limit" }, { "Retry-After": "7200" }, { kind: "limit", retryAfterSeconds: 7200, message: "Limit" }],
    [503, { ok: false, error: "server_error", message: "Busy" }, { "Retry-After": "60" }, { kind: "busy" }],
    [403, { ok: false, error: "forbidden", message: "No" }, {}, { kind: "blocked" }],
    [500, { ok: false, error: "server_error", message: "x" }, {}, { kind: "generic" }],
  ] as const)("HTTP %i %j → %j", async (status, body, headers, failure) => {
    const answer = await ask(async () => jsonResponse(status, body, headers)).result;
    expect(answer).toEqual({ text: "", stop: null, meta: null, failure });
  });

  it("reports a network error, but nothing when the request itself was aborted", async () => {
    const offline = await ask(async () => {
      throw new TypeError("Failed to fetch");
    }).result;
    expect(offline.failure).toEqual({ kind: "network" });

    const controller = new AbortController();
    controller.abort();
    const aborted = await ask(async () => {
      throw new DOMException("aborted", "AbortError");
    }, controller.signal).result;
    expect(aborted).toEqual({ text: "", stop: "stopped", meta: null, failure: null });
  });
});

describe("GET /api/ask status", () => {
  const status: AskStatus = { configured: true, account: "guest", limit: 5, used: 1, remaining: 4, resetsInSeconds: 3600, maxImageBytes: 1 };

  it("returns the allowance, or null when it can't be read", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(200, { ok: true, data: status }));
    expect(await fetchAskStatus(new AbortController().signal, fetchImpl)).toEqual(status);
    expect(fetchImpl.mock.calls[0][0]).toBe(ASK_ENDPOINT);
    expect(fetchImpl.mock.calls[0][1]?.method).toBeUndefined(); // GET
    expect(await fetchAskStatus(new AbortController().signal, async () => jsonResponse(500, { ok: false }))).toBeNull();
    expect(await fetchAskStatus(new AbortController().signal, async () => jsonResponse(200, { ok: false }))).toBeNull();
    expect(
      await fetchAskStatus(new AbortController().signal, async () => {
        throw new TypeError("offline");
      }),
    ).toBeNull();
  });
});

describe("RanchoChatPanel", () => {
  const links = (locale: Locale): RanchoLinks => ({
    ask: locale === "hi" ? "/hi/tools/ask" : "/tools/ask",
    enquiry: locale === "hi" ? "/hi/admissions#enquiry" : "/admissions#enquiry",
    privacy: locale === "hi" ? "/hi/privacy" : "/privacy",
    signIn: locale === "hi" ? "/hi/login" : "/login",
  });
  const render = (locale: Locale) =>
    renderToStaticMarkup(
      createElement(RanchoChatPanel, {
        id: "rancho-panel",
        open: false,
        onClose: () => {},
        messages: messagesFor(locale, "rancho").panel,
        locale,
        links: links(locale),
      }),
    );
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

  it.each(["en", "hi"] as const)("is a labelled dialog with the chat controls (%s)", (locale) => {
    const html = render(locale);
    const t = messagesFor(locale, "rancho").panel;

    // Native <dialog>, labelled by its heading; modal (sheet) until the viewport is known to be ≥ 640px.
    expect(html).toMatch(/^<dialog id="rancho-panel" aria-labelledby="([^"]+)" aria-modal="true"/);
    const headingId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toContain(`<h2 id="${headingId}" tabindex="-1"`);
    expect(html).toContain(`>${escape(t.title)}</h2>`);
    expect(html).not.toMatch(/<dialog[^>]*\sopen/); // opened with show()/showModal() on the client

    // Close + reset buttons with accessible names; a labelled textarea; five subject radios.
    expect(html).toContain(`<span class="sr-only">${escape(t.close)}</span>`);
    expect(html).toContain(`<span class="sr-only">${escape(t.reset)}</span>`);
    const questionId = html.match(/<textarea[^>]*id="([^"]+)"/)?.[1];
    expect(html).toContain(`<label for="${questionId}" class="sr-only">${escape(t.questionLabel)}</label>`);
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="auto"/);
    // Photo questions in the panel itself: a camera button and one image input.
    expect(html).toContain(`<span class="sr-only">${escape(t.photo.add)}</span>`);
    expect(html.match(/type="file"/g)).toHaveLength(1);

    // Honest notes, privacy link, small link to the full page, polite status region.
    expect(html).toContain(escape(t.greeting));
    expect(html).toContain(escape(t.disclaimer));
    expect(html).toContain(escape(t.privacy));
    expect(html).toContain(`href="${links(locale).privacy}"`);
    expect(html).toContain(`href="${links(locale).ask}"`);
    expect(html).toContain(escape(t.fullPageLink));
    expect(html).toMatch(/role="status" aria-live="polite"/);
    expect(html).toContain("print:hidden");
  });
});

describe("rancho messages", () => {
  function leaves(value: unknown, prefix = ""): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
      }
    } else out.set(prefix, value);
    return out;
  }

  it("Hindi has exactly the English keys, non-empty, with the same placeholders", () => {
    const en = leaves(messagesFor("en", "rancho"));
    const hi = leaves(messagesFor("hi", "rancho"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
  });

  it("keeps the honest AI notes in both languages", () => {
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "rancho").panel;
      expect(t.disclaimer).toMatch(/AI/);
      expect(t.privacy).toContain("Anthropic");
      expect(t.aiNote).toMatch(/AI/);
    }
  });
});

describe("privacy", () => {
  it("never uses browser storage or cookies (the conversation lives in memory only)", () => {
    const dir = join(process.cwd(), "src", "components", "rancho");
    const sources = readdirSync(dir).filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."));
    expect(sources.length).toBeGreaterThanOrEqual(8);
    expect(sources).toEqual(expect.arrayContaining(["rancho-photo.ts", "RanchoPhotoAttachment.tsx", "RanchoChatPanel.tsx"]));
    for (const file of sources) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./);
    }
  });
});
