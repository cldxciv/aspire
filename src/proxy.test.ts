import { NextRequest, type NextResponse } from "next/server";
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
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

function gateOff() {
  vi.stubEnv("PREVIEW_ACCESS_PASSWORD", "");
}

/** Passed through to the route as requested: no redirect, no rewrite. */
function expectPassThrough(response: NextResponse) {
  expect(response.status).toBe(200);
  expect(getRedirectUrl(response)).toBeNull();
  expect(isRewrite(response)).toBe(false);
  expect(response.headers.get("x-middleware-next")).toBe("1");
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
    "/hi",
    "/hi/about",
    "/hi/student",
    "/en/about",
    "/robots.txt",
    "/sitemap.xml",
  ])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  // The matcher covers public routes too (for the preview gate, D-027) but never Next's own assets.
  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fx.jpg&w=640&q=75",
    "/images/stock/himalaya-dhauladhar-ridge-hero.jpg",
    "/assets/aspire/hero-students.webp",
    "/favicon.ico",
  ])("does not run on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it.each(["/api/session", "/api/enquiries", "/api/programs", "/robots.txt", "/sitemap.xml", "/.well-known/security.txt"])(
    "passes non-localized route %s through untouched when the preview gate is off",
    (url) => {
      gateOff();
      previewOff();
      const response = proxy(request(url));
      expectPassThrough(response);
      expect(response.headers.get("x-robots-tag")).toBeNull();
    },
  );
});

describe("locale routing (D-028)", () => {
  it.each([
    ["/", "/en"],
    ["/about", "/en/about"],
    ["/programs/iit-jee-two-year", "/en/programs/iit-jee-two-year"],
    ["/login", "/en/login"],
    ["/students", "/en/students"],
    ["/administrator", "/en/administrator"],
    ["/hindi", "/en/hindi"],
    ["/xx/about", "/en/xx/about"],
  ])("rewrites unprefixed %s to %s (English, URL unchanged)", (path, internal) => {
    gateOff();
    const response = proxy(request(path));
    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}${internal}`);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("keeps the query string on the rewrite", () => {
    gateOff();
    expect(getRewrittenUrl(proxy(request("/login?role=student")))).toBe(`${ORIGIN}/en/login?role=student`);
  });

  it.each(["/hi", "/hi/about", "/hi/programs/iit-jee-two-year", "/hi/login?role=parent"])(
    "serves Hindi %s directly",
    (path) => {
      gateOff();
      const response = proxy(request(path));
      expectPassThrough(response);
      expect(response.headers.get("x-robots-tag")).toBeNull();
    },
  );

  it.each([
    ["/en", "/"],
    ["/en/about", "/about"],
    ["/en/programs/iit-jee-two-year", "/programs/iit-jee-two-year"],
    ["/en/login?role=student", "/login?role=student"],
    ["/en/student", "/student"],
  ])("redirects %s to the unprefixed English URL %s", (path, target) => {
    gateOff();
    previewOff();
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}${target}`);
  });
});

describe("preview gate (D-027)", () => {
  const auth = (password: string) => `Basic ${btoa(`anyone:${password}`)}`;
  const withAuth = (path: string, authorization?: string) =>
    new NextRequest(new URL(path, ORIGIN), authorization ? { headers: { authorization } } : undefined);

  it("challenges every route when PREVIEW_ACCESS_PASSWORD is set", () => {
    vi.stubEnv("PREVIEW_ACCESS_PASSWORD", "test-secret");
    for (const path of [
      "/",
      "/programs",
      "/api/enquiries",
      "/student",
      "/api/admin/enquiries",
      "/results",
      "/hi",
      "/hi/about",
      "/en/about",
      "/robots.txt",
    ]) {
      const response = proxy(withAuth(path));
      expect(response.status, path).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm="Aspire preview"/);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(proxy(withAuth("/", auth("wrong"))).status).toBe(401);
  });

  it("lets the right password through, then applies the normal locale and portal rules", () => {
    vi.stubEnv("PREVIEW_ACCESS_PASSWORD", "test-secret");
    previewOn();
    expect(getRewrittenUrl(proxy(withAuth("/", auth("test-secret"))))).toBe(`${ORIGIN}/en`);
    expect(proxy(withAuth("/hi", auth("test-secret"))).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(withAuth("/api/enquiries", auth("test-secret"))).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(withAuth("/api/admin/enquiries", auth("test-secret"))).status).toBe(401); // portal API still denies
    expect(proxy(withAuth("/admin", auth("test-secret"))).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("portal pages", () => {
  it("continue (English rewrite) with X-Robots-Tag when previews are on", () => {
    previewOn();
    const response = proxy(request("/admin/enquiries"));
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}/en/admin/enquiries`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("continue (Hindi) with X-Robots-Tag when previews are on", () => {
    previewOn();
    const response = proxy(request("/hi/student/timetable"));
    expectPassThrough(response);
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

  it("redirect Hindi portal pages to the Hindi login with a locale-free next", () => {
    previewOff();
    const response = proxy(request("/hi/admin/enquiries"));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/hi/login?next=%2Fadmin%2Fenquiries`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getRedirectUrl(proxy(request("/hi/student")))).toBe(`${ORIGIN}/hi/login?next=%2Fstudent`);
  });

  it("deny by default in production when PORTAL_PREVIEW is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORTAL_PREVIEW", "");
    expect(getRedirectUrl(proxy(request("/student")))).toBe(`${ORIGIN}/login?next=%2Fstudent`);
    expect(getRedirectUrl(proxy(request("/hi/parent")))).toBe(`${ORIGIN}/hi/login?next=%2Fparent`);
  });

  it("ignore role hints in cookies and query strings", () => {
    previewOff();
    const response = proxy(request("/admin?role=admin&next=https://evil.com", { role: "admin", session: "admin" }));
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?next=%2Fadmin`);
  });

  it.each([
    ["/admin//evil.com", "/login"],
    ["/student/.//evil.com", "/login"],
    ["/hi/admin//evil.com", "/hi/login"],
    ["/hi/student/.//evil.com", "/hi/login"],
  ])("drop an unsafe next for %s", (path, loginPath) => {
    previewOff();
    const location = getRedirectUrl(proxy(request(path)));
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe(loginPath);
    const next = url.searchParams.get("next");
    if (next !== null) {
      expect(next.startsWith("/")).toBe(true);
      expect(next.startsWith("//")).toBe(false);
    }
  });

  it("always redirect on-site", () => {
    previewOff();
    for (const path of ["/parent/%2F%2Fevil.com", "/hi/parent/%2F%2Fevil.com"]) {
      const location = getRedirectUrl(proxy(request(path)));
      expect(new URL(location!).origin).toBe(ORIGIN);
    }
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

  it("still 401 with cookies that only look like a session or role", () => {
    previewOff();
    const lookalikes = { session: "abc", role: "admin", "next-auth.session-token": "y", aspire_role: "admin" };
    for (const name of Object.keys(lookalikes)) expect(name).not.toBe(SESSION_COOKIE_NAME);
    const response = proxy(request("/api/admin/enquiries", lookalikes));
    expect(response.status).toBe(401);
  });
});

// D-029 (AUTH-1): the real session cookie is only an optimistic hint. The proxy lets the request
// through (no-store, noindex) and the page / route handler verifies the session itself.
describe.skipIf(SESSION_COOKIE_NAME === null)("session cookie hint", () => {
  const withSession = (path: string) => request(path, { [SESSION_COOKIE_NAME ?? "unset"]: "opaque-token" });

  it("lets portal APIs reach the handler", () => {
    previewOff();
    const response = proxy(withSession("/api/admin/enquiries"));
    expectPassThrough(response);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("lets portal pages through in both locales, still noindex", () => {
    previewOff();
    const english = proxy(withSession("/student"));
    expect(getRedirectUrl(english)).toBeNull();
    expect(getRewrittenUrl(english)).toBe(`${ORIGIN}/en/student`);
    expect(english.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const hindi = proxy(withSession("/hi/parent/progress"));
    expectPassThrough(hindi);
    expect(hindi.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

// AUTH-2: /account/** (change password) is private for every role and has no preview shell.
describe("account pages", () => {
  const withSession = (path: string) => request(path, { [SESSION_COOKIE_NAME ?? "unset"]: "opaque-token" });

  it.each([
    ["/account/password", "/login"],
    ["/hi/account/password", "/hi/login"],
    ["/account/password?next=%2Fadmin", "/login"],
    ["/account", "/login"],
  ])("redirect %s to %s without a session hint, even with previews on", (path, loginPath) => {
    previewOn();
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    const url = new URL(getRedirectUrl(response)!);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe(loginPath);
    expect(url.search).toBe("");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirect /en/account/password to the unprefixed URL first", () => {
    previewOff();
    expect(getRedirectUrl(proxy(request("/en/account/password")))).toBe(`${ORIGIN}/account/password`);
  });

  it.skipIf(SESSION_COOKIE_NAME === null)("let a session hint through in both locales, noindex", () => {
    previewOff();
    const english = proxy(withSession("/account/password"));
    expect(getRewrittenUrl(english)).toBe(`${ORIGIN}/en/account/password`);
    expect(english.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const hindi = proxy(withSession("/hi/account/password"));
    expectPassThrough(hindi);
    expect(hindi.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("leave look-alike public paths alone", () => {
    previewOff();
    const response = proxy(request("/accounts"));
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}/en/accounts`);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });
});
