import { describe, expect, it } from "vitest";

import { getSiteOrigin, parseEnquiryDestination } from "./env";

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
