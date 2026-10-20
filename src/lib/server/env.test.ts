import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnquiryDeliveryStatus, getSiteOrigin, parseEnquiryDestination, parseEnquiryStore } from "./env";

const SECRET = "s".repeat(32);

describe("parseEnquiryDestination", () => {
  it.each([undefined, "", "none", " NONE "])("defaults to none for %j without warnings", (value) => {
    expect(parseEnquiryDestination({ ENQUIRY_DESTINATION: value })).toEqual({ config: { kind: "none" }, warnings: [] });
  });

  it("falls back to none with a warning for an unknown destination", () => {
    expect(parseEnquiryDestination({ ENQUIRY_DESTINATION: "email" })).toEqual({
      config: { kind: "none" },
      warnings: ["enquiry_destination_unknown"],
    });
  });

  it("selects the webhook when URL and secret are valid", () => {
    expect(
      parseEnquiryDestination({
        ENQUIRY_DESTINATION: "webhook",
        ENQUIRY_WEBHOOK_URL: "https://hooks.example.com/enquiries",
        ENQUIRY_WEBHOOK_SECRET: SECRET,
      }),
    ).toEqual({
      config: { kind: "webhook", url: "https://hooks.example.com/enquiries", secret: SECRET },
      warnings: [],
    });
  });

  it("falls back to none when the URL is missing", () => {
    const parsed = parseEnquiryDestination({ ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_SECRET: SECRET });
    expect(parsed.config).toEqual({ kind: "none" });
    expect(parsed.warnings).toEqual(["enquiry_webhook_url_missing"]);
  });

  it("falls back to none when the secret is missing or too short", () => {
    const url = "https://hooks.example.com/x";
    expect(parseEnquiryDestination({ ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_URL: url }).warnings).toEqual([
      "enquiry_webhook_secret_missing",
    ]);
    const short = parseEnquiryDestination({
      ENQUIRY_DESTINATION: "webhook",
      ENQUIRY_WEBHOOK_URL: url,
      ENQUIRY_WEBHOOK_SECRET: "short",
    });
    expect(short).toEqual({ config: { kind: "none" }, warnings: ["enquiry_webhook_secret_too_short"] });
  });

  it("rejects invalid, credentialed and insecure URLs", () => {
    const parse = (url: string, nodeEnv = "production") =>
      parseEnquiryDestination({
        NODE_ENV: nodeEnv,
        ENQUIRY_DESTINATION: "webhook",
        ENQUIRY_WEBHOOK_URL: url,
        ENQUIRY_WEBHOOK_SECRET: SECRET,
      });
    expect(parse("not a url").warnings).toEqual(["enquiry_webhook_url_invalid"]);
    expect(parse("ftp://hooks.example.com").warnings).toEqual(["enquiry_webhook_url_invalid"]);
    expect(parse("https://user:pass@hooks.example.com").warnings).toEqual(["enquiry_webhook_url_invalid"]);
    expect(parse("http://hooks.example.com").warnings).toEqual(["enquiry_webhook_url_insecure"]);
    expect(parse("http://localhost:4000/hook").warnings).toEqual(["enquiry_webhook_url_insecure"]);
    expect(parse("http://localhost:4000/hook", "development").config.kind).toBe("webhook");
  });

  it("never includes the URL or secret in warnings", () => {
    const parsed = parseEnquiryDestination({
      ENQUIRY_DESTINATION: "webhook",
      ENQUIRY_WEBHOOK_URL: "http://secret-host.example/token123",
      ENQUIRY_WEBHOOK_SECRET: "tiny",
      NODE_ENV: "production",
    });
    expect(JSON.stringify(parsed.warnings)).not.toMatch(/secret-host|token123|tiny/);
  });
});

describe("parseEnquiryStore (ENQUIRY_STORE, D-039)", () => {
  it.each([undefined, "", "crm", " CRM "])("defaults to crm for %j", (value) => {
    expect(parseEnquiryStore({ ENQUIRY_STORE: value })).toEqual({ mode: "crm", warnings: [] });
  });

  it.each(["off", "none", " OFF "])("is off for %j", (value) => {
    expect(parseEnquiryStore({ ENQUIRY_STORE: value })).toEqual({ mode: "off", warnings: [] });
  });

  it.each(["on", "true", "postgres", "of"])("fails closed (off + warning) for an unknown value %j", (value) => {
    expect(parseEnquiryStore({ ENQUIRY_STORE: value })).toEqual({ mode: "off", warnings: ["enquiry_store_unknown"] });
  });
});

describe("getEnquiryDeliveryStatus", () => {
  const URL_ = "https://hooks.example.com/enquiries";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is 'connected' when leads are stored (ENQUIRY_STORE unset = crm), even without a webhook", () => {
    expect(getEnquiryDeliveryStatus({})).toBe("connected");
    expect(getEnquiryDeliveryStatus({ ENQUIRY_STORE: "crm", ENQUIRY_DESTINATION: "none" })).toBe("connected");
  });

  it("with the store off, is 'connected' only for a valid webhook destination", () => {
    expect(
      getEnquiryDeliveryStatus({
        ENQUIRY_STORE: "off",
        ENQUIRY_DESTINATION: "webhook",
        ENQUIRY_WEBHOOK_URL: URL_,
        ENQUIRY_WEBHOOK_SECRET: SECRET,
      }),
    ).toBe("connected");
  });

  it.each([
    ["unset", {}],
    ["none", { ENQUIRY_DESTINATION: "none" }],
    ["unknown destination", { ENQUIRY_DESTINATION: "email" }],
    ["webhook without secret", { ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_URL: URL_ }],
    ["webhook with short secret", { ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_URL: URL_, ENQUIRY_WEBHOOK_SECRET: "short" }],
    ["webhook without URL", { ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_SECRET: SECRET }],
    [
      "insecure webhook URL in production",
      {
        NODE_ENV: "production",
        ENQUIRY_DESTINATION: "webhook",
        ENQUIRY_WEBHOOK_URL: "http://hooks.example.com",
        ENQUIRY_WEBHOOK_SECRET: SECRET,
      },
    ],
  ])("is 'not_configured' with the store off when %s", (_label, env) => {
    expect(getEnquiryDeliveryStatus({ ENQUIRY_STORE: "off", ...env })).toBe("not_configured");
    // An unknown ENQUIRY_STORE value is off, too.
    expect(getEnquiryDeliveryStatus({ ENQUIRY_STORE: "typo", ...env })).toBe("not_configured");
  });

  it("reads process.env by default", () => {
    vi.stubEnv("ENQUIRY_STORE", "off");
    vi.stubEnv("ENQUIRY_DESTINATION", "");
    expect(getEnquiryDeliveryStatus()).toBe("not_configured");
    vi.stubEnv("ENQUIRY_STORE", "");
    expect(getEnquiryDeliveryStatus()).toBe("connected");
    vi.stubEnv("ENQUIRY_STORE", "off");
    vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
    vi.stubEnv("ENQUIRY_WEBHOOK_URL", URL_);
    vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", SECRET);
    expect(getEnquiryDeliveryStatus()).toBe("connected");
  });

  it("returns only the status word, never the URL or secret", () => {
    const status = getEnquiryDeliveryStatus({
      ENQUIRY_DESTINATION: "webhook",
      ENQUIRY_WEBHOOK_URL: URL_,
      ENQUIRY_WEBHOOK_SECRET: SECRET,
    });
    expect(typeof status).toBe("string");
    expect(status).not.toContain("hooks.example.com");
    expect(status).not.toContain(SECRET);
  });
});

describe("getSiteOrigin", () => {
  it("returns the origin of NEXT_PUBLIC_SITE_URL", () => {
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "https://aspireiit.in/some/path" })).toBe("https://aspireiit.in");
  });

  it("returns null when unset or invalid", () => {
    expect(getSiteOrigin({})).toBeNull();
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "nope" })).toBeNull();
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBeNull();
  });
});
