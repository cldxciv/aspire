import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, isPortalPreviewEnabled, SESSION_COOKIE_NAME } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPortalPreviewEnabled", () => {
  it('is on when PORTAL_PREVIEW="true", even in production', () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORTAL_PREVIEW", "true");
    expect(isPortalPreviewEnabled()).toBe(true);
  });

  it('is off when PORTAL_PREVIEW="false", even in development', () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORTAL_PREVIEW", "false");
    expect(isPortalPreviewEnabled()).toBe(false);
  });

  it.each(["", "1", "yes", "TRUE", "on"])("falls back to the environment default for %j", (value) => {
    vi.stubEnv("PORTAL_PREVIEW", value);
    vi.stubEnv("NODE_ENV", "development");
    expect(isPortalPreviewEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isPortalPreviewEnabled()).toBe(false);
  });

  it("defaults to off outside development (deny by default)", () => {
    vi.stubEnv("PORTAL_PREVIEW", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(isPortalPreviewEnabled()).toBe(false);
  });
});

describe("SESSION_COOKIE_NAME", () => {
  it("names the session cookie set by /api/auth/login (a proxy hint only, D-029)", () => {
    expect(SESSION_COOKIE_NAME).toBe("aspire_session");
    expect(SESSION_COOKIE_NAME).toBe(AUTH_COOKIE_NAME);
  });
});
