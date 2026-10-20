import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { enquirySchema, heroStepOfField, validateHeroStep } from "@/lib/contracts/enquiry";
import { FIELD_ORDER, buildHeroPayload, buildPayload, pickErrors } from "./enquiry-payload";
import { firstHeroError, pickHeroErrors } from "./hero-steps";
import { submitEnquiry } from "./submit-enquiry";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const validQuick = {
  name: "  Test Student ",
  currentClass: "class-11",
  programInterest: "jee",
  phone: "+91 98765 43210",
  consent: "on",
  website: "",
};

describe("buildPayload", () => {
  it("builds a valid quick payload with intent and trimmed values", () => {
    const payload = buildPayload("quick", formData(validQuick), "scholarship", false);
    expect(payload).toMatchObject({ source: "quick", name: "Test Student", intent: "scholarship", consent: true });
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("omits blank optional admissions fields and the centre when no centre field is rendered", () => {
    const data = formData({ ...validQuick, email: "", message: "  ", preferredCentre: "shimla" });
    const payload = buildPayload("admissions", data, "enquiry", false);
    expect(payload.email).toBeUndefined();
    expect(payload.message).toBeUndefined();
    expect(payload.preferredCentre).toBeUndefined();
    expect("intent" in payload).toBe(false);
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("includes the preferred centre when the field is rendered", () => {
    const data = formData({ ...validQuick, preferredCentre: "not-sure" });
    const payload = buildPayload("admissions", data, "enquiry", true);
    expect(payload.preferredCentre).toBe("not-sure");
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("builds a valid contact payload", () => {
    const data = formData({
      name: "Parent",
      phone: "9876543210",
      email: "parent@example.com",
      topic: "admissions",
      consent: "on",
    });
    const payload = buildPayload("contact", data, "enquiry", false);
    expect(payload).toMatchObject({ source: "contact", topic: "admissions", website: "" });
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("forwards a filled honeypot untouched", () => {
    const payload = buildPayload("quick", formData({ ...validQuick, website: "spam" }), "enquiry", false);
    expect(payload.website).toBe("spam");
  });

  it("reports consent as false when unchecked, which the schema rejects", () => {
    const rest: Record<string, string> = { ...validQuick };
    delete rest.consent;
    const payload = buildPayload("quick", formData(rest), "enquiry", false);
    expect(payload.consent).toBe(false);
    expect(enquirySchema.safeParse(payload).success).toBe(false);
  });
});

describe("buildHeroPayload (home hero, D-021)", () => {
  const validHero = {
    name: "Test Student",
    classOrExam: "jee-class-11",
    guardianName: "Parent Name",
    phone: "+91 98765 43210",
    preferredCentre: "not-sure",
    consent: "on",
    website: "",
  };

  it("builds a valid hero payload with no intent and no mapped fields", () => {
    const payload = buildHeroPayload(formData(validHero), true);
    expect(payload).toMatchObject({ source: "hero", classOrExam: "jee-class-11", consent: true });
    expect("intent" in payload).toBe(false);
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("sends blank required fields as empty strings so the server reports them", () => {
    const payload = buildHeroPayload(formData({}), false);
    expect(payload).toMatchObject({ name: "", classOrExam: "", guardianName: "", phone: "", consent: false });
    const result = enquirySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = pickHeroErrors(z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>);
    expect(Object.keys(errors)).toEqual(["name", "classOrExam", "guardianName", "phone", "consent"]);
    expect(firstHeroError(errors)).toEqual({ field: "name", step: 0 });
  });

  it("maps every field to the step that renders it", () => {
    expect(["name", "classOrExam"].map(heroStepOfField)).toEqual([0, 0]);
    expect(["guardianName", "phone"].map(heroStepOfField)).toEqual([1, 1]);
    expect(["preferredCentre", "message", "consent"].map(heroStepOfField)).toEqual([2, 2, 2]);
  });

  it("passes each step on its own before the full schema", () => {
    const payload = buildHeroPayload(formData(validHero), true);
    expect(validateHeroStep(0, payload)).toBeNull();
    expect(validateHeroStep(1, payload)).toBeNull();
    expect(validateHeroStep(2, payload)).toBeNull();
  });
});

describe("pickErrors", () => {
  it("maps zod field errors to the variant's fields in DOM order", () => {
    const payload = buildPayload("admissions", formData({ phone: "123", email: "nope" }), "enquiry", true);
    const result = enquirySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const picked = pickErrors(
      z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>,
      FIELD_ORDER.admissions,
    );
    expect(Object.keys(picked)).toEqual(["name", "currentClass", "programInterest", "phone", "email", "consent"]);
    expect(picked.phone).toBe("Enter a valid 10-digit mobile number");
  });

  it("ignores fields the variant does not render", () => {
    expect(pickErrors({ source: ["bad"], topic: ["Select a topic"] }, FIELD_ORDER.quick)).toEqual({});
  });
});

describe("submitEnquiry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function respond(body: unknown, status: number, headers: Record<string, string> = {}) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const fetchMock = vi.fn(async () => new Response(text, { status, headers }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("POSTs JSON to /api/enquiries", async () => {
    const fetchMock = respond({ ok: true, status: "not_configured", message: "x" }, 200);
    await submitEnquiry({ source: "quick" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/enquiries");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ source: "quick" }));
  });

  it("POSTs the raw hero payload, including classOrExam", async () => {
    const fetchMock = respond({ ok: true, status: "not_configured", message: "x" }, 200);
    const payload = buildHeroPayload(
      formData({
        name: "Asha",
        classOrExam: "foundation-class-9",
        guardianName: "Parent Name",
        phone: "9876543210",
        consent: "on",
      }),
      false,
    );
    await submitEnquiry(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      source: "hero",
      name: "Asha",
      classOrExam: "foundation-class-9",
      guardianName: "Parent Name",
      phone: "9876543210",
      consent: true,
      website: "",
    });
  });

  it("reports received only with a reference on a 2xx response", async () => {
    respond({ ok: true, status: "received", reference: "ENQ-ABC123", message: "ok" }, 201);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "received", reference: "ENQ-ABC123" });
  });

  it("never reports received without a reference", async () => {
    respond({ ok: true, status: "received", reference: "", message: "ok" }, 201);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "unavailable" });
  });

  it("never reports received on a non-2xx status", async () => {
    respond({ ok: true, status: "received", reference: "ENQ-1", message: "ok" }, 500);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "unavailable" });
  });

  it("maps not_configured", async () => {
    respond({ ok: true, status: "not_configured", message: "Nothing was sent" }, 200);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "not_configured" });
  });

  it("maps 422 validation field errors", async () => {
    respond({ ok: false, error: "validation", message: "x", fieldErrors: { phone: ["Bad phone"] } }, 422);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "validation", fieldErrors: { phone: ["Bad phone"] } });
  });

  it("maps 429 with Retry-After", async () => {
    respond({ ok: false, error: "rate_limited", message: "x" }, 429, { "Retry-After": "120" });
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
  });

  it("maps 403 forbidden and 400 bad_request to rejected", async () => {
    respond({ ok: false, error: "forbidden", message: "x" }, 403);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "rejected" });
    respond({ ok: false, error: "bad_request", message: "x" }, 400);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "rejected" });
  });

  it("maps 500 server_error", async () => {
    respond({ ok: false, error: "server_error", message: "x" }, 500);
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "server_error" });
  });

  it("treats a 404 HTML page (API not deployed) as unavailable", async () => {
    respond("<!doctype html><title>404</title>", 404, { "Content-Type": "text/html" });
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "unavailable" });
  });

  it("treats a network failure as network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(submitEnquiry({})).resolves.toEqual({ kind: "network" });
  });

  it("times out when the server never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const pending = submitEnquiry({});
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toEqual({ kind: "timeout" });
  });
});
