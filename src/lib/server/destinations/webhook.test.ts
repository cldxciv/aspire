import { createHmac, timingSafeEqual } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { EnquiryPayload } from "./types";
import { createWebhookDestination, signWebhookBody, WEBHOOK_SIGNATURE_HEADER } from "./webhook";

const SECRET = "test-secret-0123456789abcdef0123";
const URL_ = "https://hooks.example.com/enquiries";

const payload: EnquiryPayload = {
  reference: "ENQ-ABCDEFGH12",
  receivedAt: "2026-10-19T10:00:00.000Z",
  consentAt: "2026-10-19T10:00:00.000Z",
  enquiry: {
    source: "contact",
    name: "Test Student",
    phone: "9876543210",
    consent: true,
    topic: "admissions",
  },
};

describe("signWebhookBody", () => {
  it("is sha256=<hex HMAC of the raw body> and verifiable by a receiver", () => {
    const body = JSON.stringify(payload);
    const header = signWebhookBody(body, SECRET);
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Receiver-side verification as documented in docs/api.md.
    const expected = Buffer.from(`sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`);
    expect(timingSafeEqual(Buffer.from(header), expected)).toBe(true);
    expect(signWebhookBody(body, "other-secret-0123456789")).not.toBe(header);
    expect(signWebhookBody(body + " ", SECRET)).not.toBe(header);
  });
});

describe("createWebhookDestination", () => {
  it("POSTs the signed JSON payload and reports 2xx as accepted", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok", { status: 202 }));
    const destination = createWebhookDestination({ url: URL_, secret: SECRET, fetchImpl });

    await expect(destination.deliver(payload)).resolves.toEqual({ status: "accepted" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json; charset=utf-8");
    const body = init?.body as string;
    expect(JSON.parse(body)).toEqual(payload);
    expect(headers.get(WEBHOOK_SIGNATURE_HEADER)).toBe(signWebhookBody(body, SECRET));
    expect(headers.get("x-aspire-enquiry-reference")).toBe(payload.reference);
  });

  it.each([400, 401, 404, 500, 503])("reports HTTP %i as failed", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status }));
    const destination = createWebhookDestination({ url: URL_, secret: SECRET, fetchImpl });
    await expect(destination.deliver(payload)).resolves.toEqual({
      status: "failed",
      reason: "http_status",
      httpStatus: status,
    });
  });

  it("reports network errors as failed", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND hooks.example.com");
    });
    const destination = createWebhookDestination({ url: URL_, secret: SECRET, fetchImpl });
    await expect(destination.deliver(payload)).resolves.toEqual({ status: "failed", reason: "network" });
  });

  it("aborts after the timeout and reports it", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const destination = createWebhookDestination({ url: URL_, secret: SECRET, fetchImpl, timeoutMs: 20 });
    await expect(destination.deliver(payload)).resolves.toEqual({ status: "failed", reason: "timeout" });
  });

  it("defaults to an 8 second timeout", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImpl = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      const result = createWebhookDestination({ url: URL_, secret: SECRET, fetchImpl }).deliver(payload);
      await vi.advanceTimersByTimeAsync(7_999);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(aborted).toBe(true);
      await expect(result).resolves.toEqual({ status: "failed", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});
