import { describe, expect, it } from "vitest";
import {
  buildChangePasswordHref,
  buildLoginHref,
  isAccountPagePath,
  isCrmPagePath,
  isPortalApiPath,
  isPortalPagePath,
  isQuestionBankPagePath,
  localizedPostLoginPath,
  portalPathAllowsRole,
  portalRoleForPath,
  postLoginRedirect,
  QUESTION_BANK_HOME,
  sanitizeNextPath,
} from "./paths";

describe("postLoginRedirect", () => {
  it("uses a safe next inside the user's own portal, else the portal home", () => {
    expect(postLoginRedirect("parent", "/parent/progress")).toBe("/parent/progress");
    expect(postLoginRedirect("parent", "/admin/enquiries")).toBe("/parent");
    expect(postLoginRedirect("student", "//evil.com")).toBe("/student");
    expect(postLoginRedirect("admin", "https://evil.com/admin")).toBe("/admin");
    expect(postLoginRedirect("admin", undefined)).toBe("/admin");
  });
});

describe("staff and the CRM (M7)", () => {
  it("sends staff to Today's calls and only ever to /crm pages (lead routing §20, A6)", () => {
    expect(postLoginRedirect("staff", undefined)).toBe("/crm/today");
    expect(postLoginRedirect("staff", "/crm/leads/abc")).toBe("/crm/leads/abc");
    expect(postLoginRedirect("staff", "/crm")).toBe("/crm");
    expect(postLoginRedirect("staff", "/admin")).toBe("/crm/today");
    expect(postLoginRedirect("staff", "/student")).toBe("/crm/today");
    expect(postLoginRedirect("staff", "//evil.com/crm")).toBe("/crm/today");
  });

  it("lets admins follow a /crm next, but not students or parents", () => {
    expect(postLoginRedirect("admin", "/crm/today")).toBe("/crm/today");
    expect(postLoginRedirect("parent", "/crm")).toBe("/parent");
    expect(postLoginRedirect("student", "/crm")).toBe("/student");
  });

  it("treats /crm as a portal page owned by staff, and /api/crm as a portal API", () => {
    expect(isPortalPagePath("/crm")).toBe(true);
    expect(isPortalPagePath("/crm/leads")).toBe(true);
    expect(isPortalPagePath("/crmx")).toBe(false);
    expect(portalRoleForPath("/crm/leads")).toBe("staff");
    expect(portalPathAllowsRole("/crm", "admin")).toBe(true);
    expect(portalPathAllowsRole("/admin", "staff")).toBe(false);
    expect(isCrmPagePath("/crm/x")).toBe(true);
    expect(isCrmPagePath("/admin")).toBe(false);
    expect(isPortalApiPath("/api/crm/leads")).toBe(true);
    expect(sanitizeNextPath("/hi/crm/leads")).toBe("/crm/leads");
    expect(buildLoginHref("/crm/leads", "hi")).toBe("/hi/login?next=%2Fcrm%2Fleads");
  });
});

describe("staff and the question bank (docs/question-bank-plan.md §B6)", () => {
  it("lets staff follow a /admin/questions next, but no other admin page", () => {
    expect(portalPathAllowsRole("/admin/questions", "staff")).toBe(true);
    expect(portalPathAllowsRole("/admin/questions/review", "staff")).toBe(true);
    expect(portalPathAllowsRole("/admin/questions/q_abc123", "staff")).toBe(true);
    expect(portalPathAllowsRole("/admin/questions/blueprints/bp_1", "staff")).toBe(true);
    expect(portalPathAllowsRole("/admin/questionsx", "staff")).toBe(false);
    expect(portalPathAllowsRole("/admin", "staff")).toBe(false);
    expect(portalPathAllowsRole("/admin/users", "staff")).toBe(false);
    expect(postLoginRedirect("staff", "/admin/questions/review")).toBe("/admin/questions/review");
    expect(postLoginRedirect("staff", "/hi/admin/questions")).toBe("/admin/questions");
    expect(postLoginRedirect("staff", "/admin/users")).toBe("/crm/today");
  });

  it("admins keep the whole admin area; students and parents never get the question bank", () => {
    expect(portalPathAllowsRole("/admin/questions", "admin")).toBe(true);
    expect(portalPathAllowsRole("/admin/questions", "student")).toBe(false);
    expect(portalPathAllowsRole("/admin/questions", "parent")).toBe(false);
    expect(postLoginRedirect("student", "/admin/questions")).toBe("/student");
    expect(isQuestionBankPagePath("/admin/questions/team")).toBe(true);
    expect(isQuestionBankPagePath("/admin/question")).toBe(false);
    expect(QUESTION_BANK_HOME).toBe("/admin/questions");
  });
});

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

  // D-028: `next` may carry the visitor's locale; the result is always locale-free.
  it.each([
    ["/hi/student", "/student"],
    ["/hi/student/timetable", "/student/timetable"],
    ["/hi/parent/progress?x=1#y", "/parent/progress"],
    ["/en/admin/enquiries", "/admin/enquiries"],
    ["/hi/admin/", "/admin/"],
    ["/hi/../admin", "/admin"],
  ])("accepts locale-prefixed portal path %s", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it.each([
    "/hi",
    "/hi/",
    "/en",
    "/hi/login",
    "/hi/about",
    "/hi//evil.com",
    "/hi///evil.com",
    "/hi//evil.com/admin",
    "/en//evil.com",
    "/hi/\\evil.com",
    "/hi\\evil.com",
    "/hi/\\\\evil.com",
    "/hi/admin//evil.com",
    "/hi/.//evil.com",
    "/hi/%2F%2Fevil.com",
    "/hi/%2fevil.com",
    "/hi/%5Cevil.com",
    "/hi%2F%2Fevil.com",
    "/%68%69/student",
    "/%2Fhi/student",
    "/hi/student%2F..%2F..%2Fevil",
    "/hi/students",
    "/hindi/student",
    "/xx/student",
    "/hi/hi/student",
    "/hi/en/admin",
    "/hi/api/admin/enquiries",
    "/hi/admin\n",
    "/hi/admin\t/x",
    "/hi/admin\u0000",
    "https://evil.com/hi/student",
    "//evil.com/hi/student",
    "http:/evil.com/hi/admin",
    `/hi/admin/${"a".repeat(600)}`,
  ])("rejects locale-prefixed attempt %j", (input) => {
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

  it("localises the login page but keeps next locale-free", () => {
    expect(buildLoginHref("/student", "hi")).toBe("/hi/login?next=%2Fstudent");
    expect(buildLoginHref("/hi/student/timetable", "hi")).toBe("/hi/login?next=%2Fstudent%2Ftimetable");
    expect(buildLoginHref("/hi/student", "en")).toBe("/login?next=%2Fstudent");
    expect(buildLoginHref("/hi//evil.com", "hi")).toBe("/hi/login");
    expect(buildLoginHref(undefined, "hi")).toBe("/hi/login");
  });
});

describe("localised redirects after sign-in", () => {
  it("keeps the page's locale and the role allowlist", () => {
    expect(localizedPostLoginPath("student", "/student/timetable", "hi")).toBe("/hi/student/timetable");
    expect(localizedPostLoginPath("student", "/hi/student/timetable", "hi")).toBe("/hi/student/timetable");
    expect(localizedPostLoginPath("student", "/hi/student/timetable", "en")).toBe("/student/timetable");
    expect(localizedPostLoginPath("parent", "/admin", "hi")).toBe("/hi/parent");
    expect(localizedPostLoginPath("admin", "/hi//evil.com", "hi")).toBe("/hi/admin");
    expect(localizedPostLoginPath("admin", "https://evil.com/admin", "en")).toBe("/admin");
    expect(localizedPostLoginPath("student", undefined, "hi")).toBe("/hi/student");
  });

  it("postLoginRedirect accepts a locale-prefixed next but returns it locale-free", () => {
    expect(postLoginRedirect("parent", "/hi/parent/updates")).toBe("/parent/updates");
    expect(postLoginRedirect("parent", "/hi/admin")).toBe("/parent");
  });

  it("builds the change-password link with a safe next", () => {
    expect(buildChangePasswordHref("en")).toBe("/account/password");
    expect(buildChangePasswordHref("hi", "/student/progress")).toBe("/hi/account/password?next=%2Fstudent%2Fprogress");
    expect(buildChangePasswordHref("hi", "//evil.com")).toBe("/hi/account/password");
    expect(buildChangePasswordHref("en", "/account/password")).toBe("/account/password");
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

  it("recognises account pages", () => {
    expect(isAccountPagePath("/account")).toBe(true);
    expect(isAccountPagePath("/account/password")).toBe(true);
    expect(isAccountPagePath("/accounts")).toBe(false);
    expect(isAccountPagePath("/hi/account/password")).toBe(false); // callers pass locale-free paths
  });

  it("maps paths to portal areas", () => {
    expect(portalRoleForPath("/parent/updates")).toBe("parent");
    expect(portalRoleForPath("/admin")).toBe("admin");
    expect(portalRoleForPath("/login")).toBeNull();
  });
});
