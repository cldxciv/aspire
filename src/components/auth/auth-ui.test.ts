import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { ApiFailure } from "@/lib/auth/client-api";
import { changePasswordFailure, ChangePasswordForm, validatePasswordChange, type ChangePasswordMessages } from "./ChangePasswordForm";
import { LoginForm, loginFailureLines, type LoginFormMessages } from "./LoginForm";
import { SignedInPanel } from "./SignedInPanel";

function inLocale(locale: Locale, element: ReactElement): string {
  // `children` goes in as createElement's third argument (react/no-children-prop); the cast keeps tsc happy.
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function failure(partial: Partial<ApiFailure> & Pick<ApiFailure, "error">): ApiFailure {
  return { ok: false, status: 0, known: null, fieldErrors: {}, ...partial };
}

function loginMessages(locale: Locale): LoginFormMessages {
  const t = messagesFor(locale, "auth");
  return { roles: t.roles, roleHints: t.roleHints, passwordToggle: t.passwordToggle, login: t.login };
}

function changeMessages(locale: Locale): ChangePasswordMessages {
  const t = messagesFor(locale, "auth");
  return {
    form: t.changePassword,
    passwordToggle: t.passwordToggle,
    rateLimitedOne: t.login.errors.rateLimitedOne,
    rateLimitedMany: t.login.errors.rateLimitedMany,
    network: t.login.errors.network,
    blocked: t.login.errors.blocked,
    server: t.login.errors.server,
  };
}

describe("login form", () => {
  it("renders accessible role tabs, credential fields and a disabled submit until hydrated", () => {
    const html = inLocale(
      "en",
      createElement(LoginForm, { messages: loginMessages("en"), initialRole: "parent", next: null, forgotHref: "/forgot-password" }),
    );
    expect(html).toContain('role="tablist"');
    // Student, Parent, Admin and (M7) Staff.
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toMatch(/role="tab"[^>]*>Staff</);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*>Parent</);
    expect(html).toContain('role="tabpanel"');
    // React keeps the camel-cased attribute name in server HTML (HTML attributes are case-insensitive).
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="password"');
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain('method="post"');
  });

  it("is fully localised in Hindi", () => {
    const t = messagesFor("hi", "auth");
    const html = inLocale(
      "hi",
      createElement(LoginForm, { messages: loginMessages("hi"), initialRole: "student", next: "/student", forgotHref: "/hi/forgot-password" }),
    );
    for (const text of [t.roles.student, t.roles.parent, t.roles.admin, t.login.loginId, t.login.password, t.login.forgotPassword]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/hi/forgot-password"');
    expect(html).not.toMatch(/>Sign in</);
  });

  it("maps every API failure to generic, localised copy", () => {
    const t = messagesFor("en", "auth").login.errors;
    expect(loginFailureLines(failure({ error: "unauthenticated", status: 401 }), t)).toEqual([t.invalidCredentials, t.checkTab]);
    expect(loginFailureLines(failure({ error: "validation", status: 422 }), t)).toEqual([t.invalidCredentials, t.checkTab]);
    expect(loginFailureLines(failure({ error: "rate_limited", status: 429, retryAfterSeconds: 30 }), t)).toEqual([t.rateLimitedOne]);
    expect(loginFailureLines(failure({ error: "rate_limited", status: 429, retryAfterSeconds: 290 }), t)).toEqual([
      "Too many attempts. Please wait about 5 minutes and try again.",
    ]);
    expect(loginFailureLines(failure({ error: "network" }), t)).toEqual([t.network]);
    expect(loginFailureLines(failure({ error: "forbidden", status: 403 }), t)).toEqual([t.blocked]);
    expect(loginFailureLines(failure({ error: "server_error", status: 500 }), t)).toEqual([t.server]);
    const hi = messagesFor("hi", "auth").login.errors;
    expect(loginFailureLines(failure({ error: "rate_limited", retryAfterSeconds: 600 }), hi)[0]).toContain("10 मिनट");
  });
});

describe("change-password form", () => {
  const t = messagesFor("en", "auth").changePassword.errors;

  it("validates on the client the way the server does", () => {
    expect(validatePasswordChange({ currentPassword: "", newPassword: "", confirmPassword: "" }, "dev.x", t)).toEqual({
      currentPassword: t.currentRequired,
      newPassword: t.newRequired,
      confirmPassword: t.confirmRequired,
    });
    expect(validatePasswordChange({ currentPassword: "old", newPassword: "short", confirmPassword: "short" }, "x", t)).toEqual({
      newPassword: t.tooShort,
    });
    expect(
      validatePasswordChange({ currentPassword: "old", newPassword: "Dev.Student1", confirmPassword: "Dev.Student1" }, "dev.student1", t),
    ).toEqual({ newPassword: t.sameAsLoginId });
    expect(
      validatePasswordChange({ currentPassword: "same-old-pass", newPassword: "same-old-pass", confirmPassword: "same-old-pass" }, "x", t),
    ).toEqual({ newPassword: t.samePassword });
    expect(
      validatePasswordChange({ currentPassword: "old", newPassword: "a long new password", confirmPassword: "a long new passw0rd" }, "x", t),
    ).toEqual({ confirmPassword: t.mismatch });
    expect(
      validatePasswordChange({ currentPassword: "old", newPassword: "a long new password", confirmPassword: "a long new password" }, "x", t),
    ).toEqual({});
  });

  it("maps server field errors and statuses to localised copy", () => {
    const m = changeMessages("en");
    expect(
      changePasswordFailure(failure({ error: "validation", status: 422, fieldErrors: { currentPassword: "wrongCurrentPassword" } }), m),
    ).toEqual({ fields: { currentPassword: t.wrongCurrent }, lines: [] });
    expect(changePasswordFailure(failure({ error: "validation", fieldErrors: { newPassword: "samePassword" } }), m).fields).toEqual({
      newPassword: t.samePassword,
    });
    expect(changePasswordFailure(failure({ error: "validation", fieldErrors: { newPassword: null } }), m).fields).toEqual({
      newPassword: t.newInvalid,
    });
    expect(changePasswordFailure(failure({ error: "unauthenticated", status: 401 }), m).lines).toEqual([t.sessionExpired]);
    expect(changePasswordFailure(failure({ error: "rate_limited", retryAfterSeconds: 120 }), m).lines[0]).toContain("2 minutes");
    expect(changePasswordFailure(failure({ error: "network" }), m).lines).toEqual([m.network]);
  });

  it("renders three password fields with the right autocomplete hints", () => {
    const html = inLocale(
      "hi",
      createElement(ChangePasswordForm, { messages: changeMessages("hi"), role: "student", loginId: "dev.student1", next: null }),
    );
    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain(messagesFor("hi", "auth").changePassword.newHint);
  });
});

describe("signed-in panel", () => {
  const t = messagesFor("hi", "auth");

  it("shows who is signed in, a portal link and sign-out, never a password field", () => {
    const html = renderToStaticMarkup(
      createElement(SignedInPanel, {
        t,
        name: "Demo Student One (dev)",
        role: "student",
        mustChangePassword: false,
        portalHref: "/hi/student",
        changePasswordHref: "/hi/account/password",
        signOutRedirect: "/hi/login",
        otherRoleRequested: true,
      }),
    );
    expect(html).toContain("Demo Student One (dev) (विद्यार्थी)");
    expect(html).toContain('href="/hi/student"');
    expect(html).toContain(t.signOut.label);
    expect(html).toContain(t.signedIn.otherRole);
    expect(html).not.toContain('type="password"');
  });

  it("points a temporary-password account at the change-password page instead of the portal", () => {
    const html = renderToStaticMarkup(
      createElement(SignedInPanel, {
        t,
        name: "x",
        role: "parent",
        mustChangePassword: true,
        portalHref: "/hi/parent",
        changePasswordHref: "/hi/account/password",
        signOutRedirect: "/hi/login",
        otherRoleRequested: false,
      }),
    );
    expect(html).toContain('href="/hi/account/password"');
    expect(html).not.toContain('href="/hi/parent"');
    expect(html).toContain(t.signedIn.mustChange);
  });
});
