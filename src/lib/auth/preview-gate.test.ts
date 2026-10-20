import { describe, expect, it } from "vitest";
import { isPreviewAuthorized, previewAccessPassword, previewChallenge } from "./preview-gate";

const basic = (user: string, password: string) =>
  `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`)))}`;

describe("previewAccessPassword", () => {
  it("is off unless PREVIEW_ACCESS_PASSWORD is set", () => {
    expect(previewAccessPassword({})).toBeNull();
    expect(previewAccessPassword({ PREVIEW_ACCESS_PASSWORD: "" })).toBeNull();
    expect(previewAccessPassword({ PREVIEW_ACCESS_PASSWORD: "test-secret" })).toBe("test-secret");
  });
});

describe("isPreviewAuthorized", () => {
  const password = "T3st@pass:with-colon";

  it("accepts the right password with any username", () => {
    expect(isPreviewAuthorized(basic("aspire", password), password)).toBe(true);
    expect(isPreviewAuthorized(basic("", password), password)).toBe(true);
    expect(isPreviewAuthorized(basic("someone", password), password)).toBe(true);
  });

  it("rejects missing, malformed or wrong credentials", () => {
    expect(isPreviewAuthorized(null, password)).toBe(false);
    expect(isPreviewAuthorized("", password)).toBe(false);
    expect(isPreviewAuthorized("Bearer abc", password)).toBe(false);
    expect(isPreviewAuthorized("Basic !!!", password)).toBe(false);
    expect(isPreviewAuthorized(`Basic ${btoa("no-colon")}`, password)).toBe(false);
    expect(isPreviewAuthorized(basic("aspire", "wrong"), password)).toBe(false);
    expect(isPreviewAuthorized(basic("aspire", `${password}x`), password)).toBe(false);
    expect(isPreviewAuthorized(basic("aspire", password.slice(0, -1)), password)).toBe(false);
  });

  it("handles non-ASCII passwords", () => {
    expect(isPreviewAuthorized(basic("a", "पासवर्ड-1"), "पासवर्ड-1")).toBe(true);
  });
});

describe("previewChallenge", () => {
  it("asks the browser for credentials and is never cached or indexed", () => {
    const response = previewChallenge();
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toMatch(/^Basic realm="Aspire preview"/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
