import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

const ORIGIN = "https://aspire.test";

function request(path: string, cookies?: Record<string, string>) {
  const headers = new Headers();
  if (cookies) {
    headers.set(
      "cookie",
      Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    );
  }
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

function previewOn() {
  vi.stubEnv("PORTAL_PREVIEW", "true");
}

function previewOff() {
  vi.stubEnv("PORTAL_PREVIEW", "false");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("matcher", () => {
  it.each([
    "/student",
    "/student/timetable",
    "/parent",
    "/parent/progress",
    "/admin",
    "/admin/enquiries",
    "/api/admin/enquiries",
    "/api/student/me",
    "/api/parent/students",
    "/api/parent/students/learner-1",
  ])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(["/", "/login", "/programs", "/students", "/administrator", "/api/session", "/api/enquiries", "/api/programs"])(
    "does not run on %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});

describe("portal pages", () => {
  it("continue with X-Robots-Tag when previews are on", () => {
    previewOn();
    const response = proxy(request("/admin/enquiries"));
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("redirect to /login?next=<path> when previews are off", () => {
    previewOff();
    const response = proxy(request("/admin/enquiries"));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?next=%2Fadmin%2Fenquiries`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("deny by default in production when PORTAL_PREVIEW is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORTAL_PREVIEW", "");
    expect(getRedirectUrl(proxy(request("/student")))).toBe(`${ORIGIN}/login?next=%2Fstudent`);
  });

  it("ignore role hints in cookies and query strings", () => {
    previewOff();
    const response = proxy(request("/admin?role=admin&next=https://evil.com", { role: "admin", session: "admin" }));
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?next=%2Fadmin`);
  });

  it.each(["/admin//evil.com", "/student/.//evil.com"])("drop an unsafe next for %s", (path) => {
    previewOff();
    const location = getRedirectUrl(proxy(request(path)));
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/login");
    const next = url.searchParams.get("next");
    if (next !== null) {
      expect(next.startsWith("/")).toBe(true);
      expect(next.startsWith("//")).toBe(false);
    }
  });

  it("always redirect on-site", () => {
    previewOff();
    const location = getRedirectUrl(proxy(request("/parent/%2F%2Fevil.com")));
    expect(new URL(location!).origin).toBe(ORIGIN);
  });
});

describe("portal APIs", () => {
  it.each(["/api/admin/enquiries", "/api/student/me", "/api/parent/students", "/api/parent/students/learner-1"])(
    "%s → optimistic 401 JSON",
    async (path) => {
      previewOn(); // previews never open the APIs
      const response = proxy(request(path));
      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      const body = await response.json();
      expect(body).toMatchObject({ ok: false, error: "unauthenticated" });
      expect(typeof body.message).toBe("string");
    },
  );

  it("still 401 with cookies that look like a session or role", () => {
    previewOff();
    const response = proxy(
      request("/api/admin/enquiries", { session: "abc", role: "admin", aspire_session: "x", "next-auth.session-token": "y" }),
    );
    expect(response.status).toBe(401);
  });
});
