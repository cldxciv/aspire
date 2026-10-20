import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { ApiFailure } from "@/lib/auth/client-api";
import { AdminOverview, countAccounts } from "./AdminViews";
import { AUDIT_LIMITS, AuditLog, auditActionLabel, auditDetails, parseAuditLimit } from "./AuditLog";
import { DemoEnquiriesTable } from "./DemoEnquiriesTable";
import { ParentOverview, ParentProgress } from "./ParentViews";
import { PortalNavLinks } from "./PortalNav";
import { navMessages } from "./PortalShell";
import { PortalUserMenu } from "./PortalUserMenu";
import { StudentOverview, StudentSection } from "./StudentViews";
import { adminFailureMessage, filterUsers, UserManager, type AdminUserView } from "./UserManager";

function views(locale: Locale) {
  const portal = messagesFor(locale, "portal");
  const auth = messagesFor(locale, "auth");
  const common = messagesFor(locale, "common");
  return { portal, roles: auth.roles, photoLabel: common.labels.illustrativeStockPhoto };
}

function inLocale(locale: Locale, element: ReactElement): string {
  // `children` goes in as createElement's third argument (react/no-children-prop); the cast keeps tsc happy.
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

/** Every internal href in the markup (ignores #anchors). */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]);
}

function expectLocalisedLinks(html: string, locale: Locale) {
  const links = hrefs(html).filter((href) => href.startsWith("/") && !href.startsWith("/api/"));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    if (locale === "hi") expect(href, href).toMatch(/^\/hi(\/|\?|$)/);
    else expect(href, href).not.toMatch(/^\/hi(\/|$)/);
  }
}

const userBase = { disabled: false, mustChangePassword: false, createdAt: "2026-10-20T00:48:27.000Z" };
const USERS: AdminUserView[] = [
  { ...userBase, id: "a1", role: "admin", displayName: "Office Admin", loginId: "office.admin" },
  { ...userBase, id: "p1", role: "parent", displayName: "Parent One", loginId: "parent.one", linkedStudentIds: ["s1"] },
  { ...userBase, id: "s1", role: "student", displayName: "Learner One", loginId: "learner.one", linkedParentIds: ["p1"] },
  { ...userBase, id: "s2", role: "student", displayName: "Learner Two", loginId: "learner.two", disabled: true, linkedParentIds: [] },
  { ...userBase, id: "s3", role: "student", displayName: "New Learner", loginId: "new.learner", mustChangePassword: true, linkedParentIds: [] },
];

describe("student views", () => {
  it.each(["en", "hi"] as const)("signed-in dashboard (%s): own account only, honest not-connected areas, localised links", (locale) => {
    const m = views(locale);
    const html = inLocale(
      locale,
      createElement(StudentOverview, {
        locale,
        m,
        account: { displayName: "Learner One", loginId: "learner.one", linkedParents: 2 },
      }),
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Learner One");
    expect(html).toContain("learner.one");
    expect(html).toContain(m.portal.blocks.accountOnlyBadge);
    expect(html).not.toContain(m.portal.blocks.previewBadge);
    expect(html.split(m.portal.blocks.notConnected).length - 1).toBe(4);
    expect(html).toContain(m.photoLabel);
    expectLocalisedLinks(html, locale);
    // No invented academic data: no percentages, grades or scores in the visible text.
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d+\s*%|\bGrade\b|\bScore:/);
  });

  it("preview (signed out) shows no account data and a sign-in link to the localised login", () => {
    const m = views("hi");
    const html = inLocale("hi", createElement(StudentOverview, { locale: "hi", m, account: null }));
    expect(html).toContain(m.portal.blocks.previewBadge);
    expect(html).toContain(m.portal.account.previewBody);
    expect(html).toContain('href="/hi/login?next=%2Fstudent"');
    expect(html).not.toContain(m.portal.account.loginId);
  });

  it("section pages are honest empty states", () => {
    const t = messagesFor("en", "portal");
    const html = renderToStaticMarkup(createElement(StudentSection, { section: "resources", preview: false, locale: "en", t }));
    expect(html).toContain(t.student.resources.emptyTitle);
    expect(html).toContain(`${t.blocks.requires} <strong`);
    expect(html).toContain('href="/resources"');
  });
});

describe("parent views", () => {
  it("lists only the linked learners passed in, each 'not connected'", () => {
    const m = views("en");
    const html = inLocale(
      "en",
      createElement(ParentOverview, {
        locale: "en",
        m,
        account: { displayName: "Parent One", loginId: "parent.one", learners: [{ id: "s1", displayName: "Learner One" }] },
      }),
    );
    expect(html).toContain("Learner One");
    expect(html).not.toContain("Learner Two");
    expect(html.split(m.portal.blocks.notConnected).length - 1).toBe(3);
    expectLocalisedLinks(html, "en");
  });

  it("shows an empty state when no learner is linked (Hindi)", () => {
    const m = views("hi");
    const html = inLocale(
      "hi",
      createElement(ParentOverview, { locale: "hi", m, account: { displayName: "अभिभावक", loginId: "parent.one", learners: [] } }),
    );
    expect(html).toContain(m.portal.parent.noLearnersTitle);
    expect(html).toContain('href="/hi/contact"');
    expectLocalisedLinks(html, "hi");
  });

  it("progress page: one panel per linked learner, preview without names", () => {
    const t = messagesFor("en", "portal");
    const signedIn = renderToStaticMarkup(
      createElement(ParentProgress, {
        locale: "en",
        t,
        learners: [
          { id: "s1", displayName: "Learner One" },
          { id: "s9", displayName: "Learner Nine" },
        ],
      }),
    );
    expect(signedIn.split(t.parent.progressPage.emptyTitle).length - 1).toBe(2);
    const preview = renderToStaticMarkup(createElement(ParentProgress, { locale: "en", t, learners: null }));
    expect(preview).toContain(t.blocks.previewBadge);
    expect(preview).not.toContain("Learner One");
  });
});

describe("admin views", () => {
  it("counts accounts from the database rows", () => {
    expect(countAccounts(USERS)).toEqual({ students: 3, parents: 1, admins: 1, disabled: 1, pending: 1 });
  });

  it("overview shows real counts when signed in and '—' in preview", () => {
    const m = views("en");
    const html = inLocale(
      "en",
      createElement(AdminOverview, {
        locale: "en",
        m,
        account: { displayName: "Office Admin", loginId: "office.admin", counts: countAccounts(USERS) },
      }),
    );
    expect(html).toContain(m.portal.admin.overview.statNote);
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/admin/audit"');
    const preview = inLocale("hi", createElement(AdminOverview, { locale: "hi", m: views("hi"), account: null }));
    expect(preview.split(messagesFor("hi", "portal").blocks.noValue).length - 1).toBe(5);
    expectLocalisedLinks(preview, "hi");
  });

  it("filters users by role, status and search", () => {
    expect(filterUsers(USERS, { role: "student", status: "all", query: "" }).map((u) => u.id)).toEqual(["s1", "s2", "s3"]);
    expect(filterUsers(USERS, { role: "all", status: "disabled", query: "" }).map((u) => u.id)).toEqual(["s2"]);
    expect(filterUsers(USERS, { role: "all", status: "active", query: "LEARNER" }).map((u) => u.id)).toEqual(["s1", "s3"]);
    expect(filterUsers(USERS, { role: "all", status: "all", query: "parent.one" }).map((u) => u.id)).toEqual(["p1"]);
  });

  it("localises admin API failures by code / known message", () => {
    const m = { users: messagesFor("hi", "portal").admin.users, errors: messagesFor("hi", "portal").errors, roles: messagesFor("hi", "auth").roles };
    const f = (partial: Partial<ApiFailure> & Pick<ApiFailure, "error">): ApiFailure => ({ ok: false, status: 0, known: null, fieldErrors: {}, ...partial });
    expect(adminFailureMessage(f({ error: "forbidden", known: "lastAdmin" }), m)).toBe(m.users.errors.lastAdmin);
    expect(adminFailureMessage(f({ error: "forbidden", known: "selfReset" }), m)).toBe(m.users.errors.selfReset);
    expect(adminFailureMessage(f({ error: "forbidden", known: "passwordChangeRequired" }), m)).toBe(m.errors.passwordChangeRequired);
    expect(adminFailureMessage(f({ error: "forbidden" }), m)).toBe(m.errors.forbidden);
    expect(adminFailureMessage(f({ error: "unauthenticated" }), m)).toBe(m.errors.sessionExpired);
    expect(adminFailureMessage(f({ error: "not_configured" }), m)).toBe(m.errors.notConfigured);
    expect(adminFailureMessage(f({ error: "network" }), m)).toBe(m.errors.network);
    expect(adminFailureMessage(f({ error: "rate_limited", retryAfterSeconds: 180 }), m)).toContain("3");
    expect(adminFailureMessage(f({ error: "server_error" }), m)).toBe(m.errors.server);
  });

  it("user manager renders accounts, links and per-account actions without any password", () => {
    const portal = messagesFor("en", "portal");
    const html = inLocale(
      "en",
      createElement(UserManager, {
        initialUsers: USERS,
        currentUserId: "a1",
        messages: { users: portal.admin.users, errors: portal.errors, roles: messagesFor("en", "auth").roles },
      }),
    );
    expect(html).toContain("Showing 5 of 5 accounts");
    // Self: no reset / disable controls (the server refuses them too).
    const adminCard = html.slice(html.indexOf("Office Admin"), html.indexOf("Parent One"));
    expect(adminCard).not.toContain("Reset password");
    expect(adminCard).not.toContain(">Disable<");
    expect(html).toContain('aria-label="Unlink Learner One from Parent One"');
    expect(html).toContain("Must change password");
    expect(html).toContain(">Enable<");
    expect(html).not.toMatch(/temporaryPassword|password_hash|scrypt\$/);
    expect(html).not.toContain("<dialog open");
  });

  it("audit log: localised actions, names instead of ids, secret-free details, localised limit links", () => {
    const t = messagesFor("hi", "portal").admin.audit;
    const roles = messagesFor("hi", "auth").roles;
    const users = new Map([
      ["a1", { displayName: "Office Admin", loginId: "office.admin" }],
      ["s1", { displayName: "Learner One", loginId: "learner.one" }],
    ]);
    expect(auditActionLabel("admin.user_create", t)).toBe(t.actions.adminUserCreate);
    expect(auditActionLabel("custom.thing", t)).toBe("custom.thing");
    expect(auditDetails({ role: "student", loginId: "learner.one", revokedSessions: 2, studentId: "s1", field: "displayName" }, users, t, roles)).toEqual([
      "खाते का प्रकार: विद्यार्थी",
      "लॉगिन ID: learner.one",
      "साइन आउट किए गए सत्र: 2",
      "विद्यार्थी: Learner One (learner.one)",
      t.details.displayNameChanged,
    ]);
    const html = renderToStaticMarkup(
      createElement(AuditLog, {
        entries: [
          { id: 2, actorId: "a1", action: "admin.password_reset", target: "s1", createdAt: Date.UTC(2026, 9, 20, 6, 0), details: { revokedSessions: 1 } },
          { id: 1, actorId: null, action: "seed.user_create", target: "zz", createdAt: Date.UTC(2026, 9, 20, 5, 0), details: {} },
        ],
        users,
        limit: 100,
        locale: "hi",
        t,
        roles,
      }),
    );
    expect(html).toContain(t.actions.adminPasswordReset);
    expect(html).toContain("Office Admin (office.admin)");
    expect(html).toContain(t.system);
    expect(html).toContain(t.unknownUser);
    expect(html).toContain('href="/hi/admin/audit?limit=200"');
    expect(html).toMatch(/aria-current="true"[^>]*>100</);
    expect(html).toContain('dateTime="2026-10-20T06:00:00.000Z"');
  });

  it("audit limit is one of the allowed sizes", () => {
    expect(AUDIT_LIMITS).toEqual([50, 100, 200]);
    expect(parseAuditLimit("200")).toBe(200);
    expect(parseAuditLimit(["100", "50"])).toBe(100);
    for (const raw of [undefined, "", "7", "1000", "abc", "-50"]) expect(parseAuditLimit(raw)).toBe(50);
  });

  it("demo enquiries table is localised and labelled as fictional", () => {
    const t = messagesFor("hi", "portal").demoTable;
    const html = renderToStaticMarkup(createElement(DemoEnquiriesTable, { t }));
    expect(html).toContain(t.badge);
    expect(html).toContain("नमूना आवेदक A");
    expect(html).not.toContain("Sample applicant");
  });
});

describe("portal chrome", () => {
  it("nav links are localised and the active item ignores the locale prefix", () => {
    const t = messagesFor("hi", "portal");
    const html = renderToStaticMarkup(
      createElement(PortalNavLinks, { area: "admin", locale: "hi", messages: navMessages(t, "admin"), pathname: "/hi/admin/users" }),
    );
    expect(html).toContain(`aria-label="${t.areas.admin.label} के भाग"`);
    expect(html).toContain('href="/hi/admin/audit"');
    const active = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/hi/admin/users"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('data-surface="dark"');
  });

  it("user menu: signed in → name, role, change password and sign out; signed out → localised sign-in", () => {
    const portal = messagesFor("hi", "portal");
    const auth = messagesFor("hi", "auth");
    const t = { shell: portal.shell, roles: auth.roles, signOut: auth.signOut };
    const signedIn = renderToStaticMarkup(
      createElement(PortalUserMenu, {
        session: { userId: "s1", role: "student", displayName: "Learner One", loginId: "learner.one" },
        area: "student",
        locale: "hi",
        t,
      }),
    );
    expect(signedIn).toContain("Learner One");
    expect(signedIn).toContain(auth.roles.student);
    expect(signedIn).toContain('href="/hi/account/password"');
    expect(signedIn).toContain(auth.signOut.label);
    const signedOut = renderToStaticMarkup(createElement(PortalUserMenu, { session: null, area: "parent", locale: "hi", t }));
    expect(signedOut).toContain(portal.shell.notSignedIn);
    expect(signedOut).toContain('href="/hi/login?next=%2Fparent"');
    expect(signedOut).not.toContain(auth.signOut.label);
  });
});
