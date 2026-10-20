import { describe, expect, it } from "vitest";

import { checkSameOrigin, getClientIp, isJsonContentType, readBodyWithLimit, trustedProxyHops } from "./request-guards";

function req(headers: Record<string, string>, url = "http://localhost:3000/api/enquiries") {
  return new Request(url, { method: "POST", headers });
}

describe("checkSameOrigin", () => {
  it("allows an Origin matching the Host header", () => {
    expect(checkSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toEqual({ ok: true });
  });

  it("falls back to the request URL host when there is no Host header", () => {
    expect(checkSameOrigin(req({ origin: "http://localhost:3000" }))).toEqual({ ok: true });
  });

  it("prefers X-Forwarded-Host (TLS-terminating proxy) and ignores scheme differences", () => {
    const request = req(
      { host: "internal:3000", "x-forwarded-host": "aspireiit.in", origin: "https://aspireiit.in" },
      "http://internal:3000/api/enquiries",
    );
    expect(checkSameOrigin(request)).toEqual({ ok: true });
  });

  it("treats an explicit default port in Host as equal", () => {
    expect(checkSameOrigin(req({ host: "aspireiit.in:443", origin: "https://aspireiit.in" }))).toEqual({ ok: true });
  });

  it("allows the NEXT_PUBLIC_SITE_URL origin even if Host differs", () => {
    const request = req({ host: "preview.internal", origin: "https://aspireiit.in" });
    expect(checkSameOrigin(request, { siteOrigin: "https://aspireiit.in" })).toEqual({ ok: true });
  });

  it("rejects a cross-site Origin", () => {
    expect(checkSameOrigin(req({ host: "aspireiit.in", origin: "https://evil.example" }))).toEqual({
      ok: false,
      reason: "origin_mismatch",
    });
  });

  it("rejects a look-alike Origin (suffix / subdomain)", () => {
    for (const origin of ["https://aspireiit.in.evil.example", "https://evil-aspireiit.in", "https://sub.aspireiit.in"]) {
      expect(checkSameOrigin(req({ host: "aspireiit.in", origin }), { siteOrigin: "https://aspireiit.in" }).ok).toBe(
        false,
      );
    }
  });

  it("rejects a different port on the same hostname", () => {
    expect(checkSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:4000" })).ok).toBe(false);
  });

  it("rejects Origin: null", () => {
    expect(checkSameOrigin(req({ host: "aspireiit.in", origin: "null" }))).toEqual({ ok: false, reason: "origin_null" });
  });

  it("rejects malformed and non-http Origins", () => {
    expect(checkSameOrigin(req({ host: "aspireiit.in", origin: "not a url" }))).toEqual({
      ok: false,
      reason: "origin_invalid",
    });
    expect(checkSameOrigin(req({ host: "aspireiit.in", origin: "file://aspireiit.in" }))).toEqual({
      ok: false,
      reason: "origin_invalid",
    });
  });

  it("rejects Sec-Fetch-Site: cross-site even when Origin matches", () => {
    const request = req({ host: "aspireiit.in", origin: "https://aspireiit.in", "sec-fetch-site": "cross-site" });
    expect(checkSameOrigin(request)).toEqual({ ok: false, reason: "cross_site_fetch" });
  });

  describe("without Origin", () => {
    it.each(["same-origin", "none"])("allows Sec-Fetch-Site: %s", (value) => {
      expect(checkSameOrigin(req({ host: "aspireiit.in", "sec-fetch-site": value }))).toEqual({ ok: true });
    });

    it.each(["same-site", "cross-site"])("rejects Sec-Fetch-Site: %s", (value) => {
      expect(checkSameOrigin(req({ host: "aspireiit.in", "sec-fetch-site": value }))).toEqual({
        ok: false,
        reason: "cross_site_fetch",
      });
    });

    it("rejects when neither Origin nor Sec-Fetch-Site is present (deny by default)", () => {
      expect(checkSameOrigin(req({ host: "aspireiit.in" }))).toEqual({ ok: false, reason: "missing_origin" });
    });
  });
});

describe("isJsonContentType", () => {
  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON;charset=\"UTF-8\""])(
    "accepts %j",
    (value) => expect(isJsonContentType(value)).toBe(true),
  );

  it.each([
    null,
    "",
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "application/json-patch+json",
    "application/json; charset=latin1",
  ])("rejects %j", (value) => expect(isJsonContentType(value)).toBe(false));
});

describe("getClientIp", () => {
  it("uses the entry appended by the trusted proxy (rightmost by default)", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-forwarded-for": "10.9.9.9, 203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("ignores client-forged entries to the left (cannot pick its own rate-limit bucket)", () => {
    const forged = (spoof: string) => new Headers({ "x-forwarded-for": `${spoof}, 198.51.100.9` });
    expect(getClientIp(forged("1.1.1.1"), 1)).toBe("198.51.100.9");
    expect(getClientIp(forged("2.2.2.2"), 1)).toBe("198.51.100.9");
  });

  it("counts TRUSTED_PROXY_HOPS from the right", () => {
    const chain = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1" });
    expect(getClientIp(chain, 2)).toBe("203.0.113.7");
    expect(getClientIp(chain, 3)).toBe("6.6.6.6");
    expect(getClientIp(chain, 9)).toBe("6.6.6.6");
  });

  it("reads TRUSTED_PROXY_HOPS with a safe default of 1", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "abc" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "99" })).toBe(1);
  });

  it("falls back to X-Real-IP", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("strips ports and brackets and normalises IPv6 case", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
  });

  it("ignores garbage and falls through", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(getClientIp(new Headers({ "x-forwarded-for": "x".repeat(500) }))).toBe("unknown");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("readBodyWithLimit", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/enquiries", { method: "POST", body, headers });

  it("reads a body within the limit", async () => {
    expect(await readBodyWithLimit(post('{"a":1}'), 100)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("rejects a declared Content-Length over the limit without reading", async () => {
    expect(await readBodyWithLimit(post("{}", { "content-length": "99999" }), 100)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("counts streamed bytes when no Content-Length is declared", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 20; i++) controller.enqueue(new Uint8Array(10).fill(32));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/enquiries", {
      method: "POST",
      body: stream,
      // @ts-expect-error -- `duplex` is required by Node's fetch for streaming bodies but missing from lib.dom.
      duplex: "half",
    });
    expect(await readBodyWithLimit(request, 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("counts bytes, not characters", async () => {
    const text = "ह".repeat(40); // Devanagari: 3 bytes each → 120 bytes
    expect(await readBodyWithLimit(post(text), 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects invalid UTF-8", async () => {
    expect(await readBodyWithLimit(post(new Uint8Array([0x7b, 0xff, 0x7d])), 100)).toEqual({
      ok: false,
      reason: "invalid_encoding",
    });
  });

  it("returns empty text for a request without a body", async () => {
    expect(await readBodyWithLimit(new Request("http://localhost/x", { method: "POST" }), 100)).toEqual({
      ok: true,
      text: "",
    });
  });
});
