import { describe, expect, it } from "vitest";
import { buildLoginHref, isPortalApiPath, isPortalPagePath, portalRoleForPath, sanitizeNextPath } from "./paths";

describe("sanitizeNextPath", () => {
  it.each([
    ["/student", "/student"],
    ["/student/timetable", "/student/timetable"],
    ["/parent/progress", "/parent/progress"],
    ["/admin/enquiries", "/admin/enquiries"],
    ["/admin/", "/admin/"],
  ])("accepts portal path %s", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it("drops query strings and hashes", () => {
    expect(sanitizeNextPath("/parent/progress?role=admin#top")).toBe("/parent/progress");
  });

  it("returns the normalised path", () => {
    expect(sanitizeNextPath("/student/../admin")).toBe("/admin");
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "//evil.com/admin",
    "https://evil.com",
    "https://evil.com/admin",
    "http:/evil.com",
    "javascript:alert(1)",
    "/\\evil.com",
    "\\\\evil.com",
    "/admin\\..\\evil",
    "/admin//evil.com",
    "/.//evil.com",
    "/%2F%2Fevil.com",
    "/%5Cevil.com",
    "/admin\n",
    "/admin\t/x",
    "/admin\u0000",
    " /admin",
    "admin",
    "/",
    "/login",
    "/programs",
    "/students",
    "/administrator",
    "/student/../../evil",
    "/api/admin/enquiries",
    "",
    `/admin/${"a".repeat(600)}`,
  ])("rejects %j", (input) => {
    expect(sanitizeNextPath(input)).toBeNull();
  });

  it.each([undefined, null, 42, ["/admin"], { href: "/admin" }])("rejects non-string %j", (input) => {
    expect(sanitizeNextPath(input)).toBeNull();
  });
});

describe("buildLoginHref", () => {
  it("adds a sanitised next", () => {
    expect(buildLoginHref("/admin/enquiries")).toBe("/login?next=%2Fadmin%2Fenquiries");
  });

  it("omits an unsafe or missing next", () => {
    expect(buildLoginHref("//evil.com")).toBe("/login");
    expect(buildLoginHref("https://evil.com")).toBe("/login");
    expect(buildLoginHref()).toBe("/login");
  });
});

describe("portal path helpers", () => {
  it("recognises portal pages", () => {
    expect(isPortalPagePath("/student")).toBe(true);
    expect(isPortalPagePath("/admin/results")).toBe(true);
    expect(isPortalPagePath("/students")).toBe(false);
    expect(isPortalPagePath("/api/admin")).toBe(false);
    expect(isPortalPagePath("/")).toBe(false);
  });

  it("recognises portal APIs", () => {
    expect(isPortalApiPath("/api/admin/enquiries")).toBe(true);
    expect(isPortalApiPath("/api/parent/students/s-1")).toBe(true);
    expect(isPortalApiPath("/api/session")).toBe(false);
    expect(isPortalApiPath("/api/enquiries")).toBe(false);
    expect(isPortalApiPath("/api/administrator")).toBe(false);
  });

  it("maps paths to portal areas", () => {
    expect(portalRoleForPath("/parent/updates")).toBe("parent");
    expect(portalRoleForPath("/admin")).toBe("admin");
    expect(portalRoleForPath("/login")).toBeNull();
  });
});
