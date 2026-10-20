import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";
import type { ApiFailure } from "@/lib/auth/client-api";

// MCP admin page + components (MCP-ADMIN). The page is rendered with React's static prerenderer
// (it awaits the async gate under <Suspense>) for a real admin session read through getSession().
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return {
    cookies: async () => cookieStore(cookieState),
    headers: async () => new Headers({ host: "localhost:3000" }),
  };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { resetDatabaseForTests } = await import("@/lib/db/connection");
const { createSession } = await import("@/lib/auth/sessions");
const { createTestUser } = await import("@/lib/auth/testing/harness");
const { createMcpToken, revokeMcpToken } = await import("@/lib/mcp/tokens");
const { LocaleProvider } = await import("@/i18n/client");
const { messagesFor } = await import("@/i18n/messages");
const { withTestLang } = await import("@/test/root-params-stub");
const { format } = await import("@/i18n/format");
const { default: AdminMcpPage } = await import("@/app/[lang]/(portal)/admin/mcp/page");
const { McpTokenManager, expiryLabel, mcpFailureMessage } = await import("./McpTokenManager");
const {
  claudeCodeCommand,
  normaliseTokenName,
  publicOrigin,
  tokenNameIssue,
  toMcpTokenView,
} = await import("./token-view");

type View = import("./token-view").McpTokenView;

const PASSWORD = "mcp-admin-pass-2026";
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function provider(locale: Locale, child: ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

async function renderPage(lang: Locale): Promise<{ html: string; errors: unknown[] }> {
  return withTestLang(lang, async () => {
    const errors: unknown[] = [];
    const page = (await AdminMcpPage()) as ReactNode;
    const { prelude } = await prerender(provider(lang, page), { onError: (error) => void errors.push(error) });
    return { html: await new Response(prelude).text(), errors };
  });
}

async function signInAs(role: "admin" | "student", loginId: string, mustChangePassword = false) {
  const user = await createTestUser({ role, loginId, password: PASSWORD, displayName: `Name of ${loginId}`, mustChangePassword });
  cookieState.jar = new Map([["aspire_session", createSession(user.id).token]]);
  return user;
}

function managerMessages(locale: Locale) {
  const t = messagesFor(locale, "mcp");
  const { create, secret, list, status, access, services, revoke, announce, errors } = t;
  return { mcp: { create, secret, list, status, access, services, revoke, announce, errors }, errors: messagesFor(locale, "portal").errors };
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("PORTAL_PREVIEW", "false");
  resetDatabaseForTests();
  cookieState.jar = new Map();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("/admin/mcp page", () => {
  it.each(["en", "hi"] as const)("signed-in admin (%s): one h1, explainer, form, token list; never a token", async (lang) => {
    const admin = await signInAs("admin", "admin.one");
    const kept = createMcpToken({
      name: "Office laptop",
      scopes: ["accounts:write", "content:read"],
      expiresInDays: 30,
      createdBy: admin.id,
    });
    const gone = createMcpToken({ name: "Old agent", scopes: "read write", expiresInDays: 7, createdBy: admin.id });
    revokeMcpToken(gone.record.id, admin.id);

    const { html, errors } = await renderPage(lang);
    expect(errors).toEqual([]);
    const t = messagesFor(lang, "mcp");
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(escape(t.page.title));
    expect(html).toContain(escape(t.page.lead));
    expect(html).toContain(escape(t.explainer.title));
    expect(html).toContain(escape(t.explainer.audit));
    expect(html).toContain("http://localhost:3000/api/mcp");
    expect(html).toContain(escape(t.create.title));
    // Per-service explainer (every service is available now, so nothing is "coming soon") and the write warning.
    for (const service of Object.values(t.services)) expect(html).toContain(escape(service.name));
    expect(html).toContain(escape(t.serviceWrite.accounts));
    expect(html).toContain(escape(t.serviceWrite.crm));
    expect(html).toContain(escape(t.explainer.writeWarning));
    expect(html).not.toContain(escape(t.explainer.comingSoon));
    // Permission matrix: a real table, 6 services × Read / Write, starting at "Read only".
    expect(html).toContain(escape(t.create.matrixCaption));
    const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(12);
    const box = (label: string) => boxes.find((input) => input.includes(`aria-label="${escape(label)}"`)) ?? "";
    for (const id of ["site", "accounts", "progress", "audit", "content"] as const) {
      const name = t.services[id].name;
      expect(box(format(t.create.readLabel, { service: name }))).toContain('checked=""');
      expect(box(format(t.create.writeLabel, { service: name }))).not.toContain('checked=""');
    }
    expect(box(format(t.create.writeLabel, { service: t.services.site.name }))).toContain('disabled=""');
    expect(box(format(t.create.writeLabel, { service: t.services.accounts.name }))).not.toContain('disabled=""');
    // CRM lead data can be granted, but "Read only" leaves it unticked and the row says why.
    for (const label of [t.create.readLabel, t.create.writeLabel]) {
      const crmBox = box(format(label, { service: t.services.crm.name }));
      expect(crmBox).not.toBe("");
      expect(crmBox).not.toContain('disabled=""');
      expect(crmBox).not.toContain('checked=""');
    }
    expect(html).toContain(escape(t.create.explicitOnly));
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${escape(t.create.presetReadOnly)}<`));
    expect(html).toContain(escape(format(t.create.summaryWrite, { services: t.create.summaryNothing })));
    expect(html).toContain("list_accounts");
    expect(html).toContain("create_account");
    // Tokens table: per-service permission badges.
    expect(html).toContain(escape(format(t.list.permissionBadge, { service: t.services.accounts.name, access: t.access.write })));
    expect(html).toContain(escape(format(t.list.permissionBadge, { service: t.services.content.name, access: t.access.read })));
    expect(html).toContain(escape(t.list.title));
    expect(html).toContain("Office laptop");
    expect(html).toContain("Old agent");
    expect(html).toContain(escape(t.status.active));
    expect(html).toContain(escape(t.status.revoked));
    // Exactly one revoke button: the revoked token has none.
    expect(count(html, /aria-label="[^"]*Office laptop[^"]*"/g)).toBe(1);
    expect(count(html, /aria-label="[^"]*Old agent[^"]*"/g)).toBe(0);
    for (const secret of [kept.token, gone.token]) expect(html).not.toContain(secret);
    expect(html).not.toMatch(/asp_mcp_/);
    expect(html).not.toContain(escape(messagesFor(lang, "portal").blocks.previewBadge));
    if (lang === "hi") expect(html).not.toContain(escape(messagesFor("en", "mcp").explainer.title));
  });

  it("shows the empty state when there are no tokens", async () => {
    await signInAs("admin", "admin.one");
    const { html } = await renderPage("en");
    expect(html).toContain(escape(messagesFor("en", "mcp").list.emptyTitle));
  });

  it("guests get the data-free preview when previews are on (no form, no list)", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "true");
    const { html, errors } = await renderPage("hi");
    expect(errors).toEqual([]);
    const t = messagesFor("hi", "mcp");
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(escape(t.page.previewLead));
    expect(html).toContain('href="/hi/login?next=%2Fadmin%2Fmcp"');
    expect(html).not.toContain(escape(t.create.title));
    expect(html).not.toContain("/api/mcp");
  });

  it("students never get the page: the gate redirects to sign-in", async () => {
    await signInAs("student", "learner.one");
    const { html, errors } = await renderPage("en");
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as { digest?: string }).digest)).toMatch(/^NEXT_REDIRECT;.*\/login\?next=%2Fadmin%2Fmcp/);
    expect(html).not.toContain(escape(messagesFor("en", "mcp").create.title));
  });

  it("an admin with a temporary password is sent to change it first", async () => {
    await signInAs("admin", "admin.temp", true);
    const { html, errors } = await renderPage("en");
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as { digest?: string }).digest)).toMatch(/^NEXT_REDIRECT;.*\/account\/password/);
    expect(html).not.toContain(escape(messagesFor("en", "mcp").create.title));
  });
});

describe("token manager component", () => {
  const readAll = { site: "read", accounts: "read", progress: "read", audit: "read", content: "read", crm: "none" } as const;
  const base: View = {
    id: "t-1",
    name: "Office laptop",
    scopes: ["site:read", "accounts:read", "progress:read", "audit:read", "content:read"],
    scopeSummary: { ...readAll },
    createdByName: "Office Admin",
    createdAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2026-12-30T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    status: "active",
  };
  const tokens: View[] = [
    base,
    {
      ...base,
      id: "t-2",
      name: "Writer agent",
      scopes: ["accounts:read", "accounts:write"],
      scopeSummary: { site: "none", accounts: "write", progress: "none", audit: "none", content: "none", crm: "none" },
      lastUsedAt: "2026-10-10T08:30:00.000Z",
    },
    { ...base, id: "t-3", name: "Expired one", status: "expired" },
    { ...base, id: "t-4", name: "Revoked one", status: "revoked", revokedAt: "2026-10-05T10:00:00.000Z" },
    { ...base, id: "t-5", name: "Paused one", status: "creator_inactive", createdByName: null },
  ];

  it.each(["en", "hi"] as const)("renders every status, permissions and the revoke actions (%s)", (locale) => {
    const m = managerMessages(locale);
    const html = renderToStaticMarkup(provider(locale, createElement(McpTokenManager, { initialTokens: tokens, messages: m })));
    for (const label of [m.mcp.status.active, m.mcp.status.expired, m.mcp.status.revoked, m.mcp.status.creator_inactive]) {
      expect(html).toContain(escape(label));
    }
    const badge = (id: "accounts" | "site", access: "read" | "write") =>
      escape(format(m.mcp.list.permissionBadge, { service: m.mcp.services[id].name, access: m.mcp.access[access] }));
    expect(html).toContain(badge("accounts", "write"));
    expect(html).toContain(badge("site", "read"));
    // Compact: 3 badges then "+2 more", with a native disclosure for the full list.
    expect(html).toContain(escape(format(m.mcp.list.morePermissions, { count: 2 })));
    expect(count(html, /<details/g)).toBe(5);
    expect(html).toContain(escape(m.mcp.list.permissionDetails));
    expect(html).toContain(escape(m.mcp.list.never));
    expect(html).toContain(escape(m.mcp.list.unknownUser));
    expect(html).toContain(escape(m.mcp.list.creatorInactiveNote));
    expect(count(html, new RegExp(`>${escape(m.mcp.list.revoke)}<`, "g"))).toBe(4);
    expect(html).toContain('role="table"');
    // Two tables: the permission matrix (3 columns, 6 services) and the tokens (7 columns, 5 tokens).
    expect(count(html, /role="table"/g)).toBe(2);
    expect(count(html, /role="columnheader"/g)).toBe(3 + 7);
    expect(count(html, /role="rowheader"/g)).toBe(6 + 5);
    expect(count(html, /<caption/g)).toBe(2);
    // Newest first is kept; the dialogs are closed (no token, no command).
    expect(html).not.toContain("claude mcp add");
  });

  it("maps API failures to localised copy", () => {
    const m = managerMessages("hi");
    const f = (partial: Partial<ApiFailure> & Pick<ApiFailure, "error">): ApiFailure => ({
      ok: false,
      status: 0,
      known: null,
      fieldErrors: {},
      ...partial,
    });
    expect(mcpFailureMessage(f({ error: "unauthenticated" }), m)).toBe(m.errors.sessionExpired);
    expect(mcpFailureMessage(f({ error: "forbidden", known: "passwordChangeRequired" }), m)).toBe(m.errors.passwordChangeRequired);
    expect(mcpFailureMessage(f({ error: "forbidden" }), m)).toBe(m.errors.forbidden);
    expect(mcpFailureMessage(f({ error: "not_found" }), m)).toBe(m.mcp.errors.tokenNotFound);
    expect(mcpFailureMessage(f({ error: "network" }), m)).toBe(m.errors.network);
    expect(mcpFailureMessage(f({ error: "rate_limited", retryAfterSeconds: 250 }), m)).toContain("5");
    expect(mcpFailureMessage(f({ error: "server_error" }), m)).toBe(m.errors.server);
  });

  it("labels expiry choices, marking 90 days as recommended", () => {
    const en = messagesFor("en", "mcp").create;
    expect([1, 7, 90, 365].map((days) => expiryLabel(days, en))).toEqual(["1 day", "7 days", "90 days (recommended)", "1 year"]);
    const hi = messagesFor("hi", "mcp").create;
    expect(expiryLabel(30, hi)).toBe("30 दिन");
  });
});

describe("token-view helpers", () => {
  it("validates names like the API (3–60 code points, no control or bidi characters)", () => {
    expect(tokenNameIssue(normaliseTokenName("   "))).toBe("nameRequired");
    expect(tokenNameIssue("ab")).toBe("nameLength");
    expect(tokenNameIssue("x".repeat(61))).toBe("nameLength");
    expect(tokenNameIssue("x".repeat(60))).toBeNull();
    expect(tokenNameIssue("ऑफ़िस लैपटॉप")).toBeNull();
    expect(tokenNameIssue(`a${String.fromCharCode(7)}bc`)).toBe("nameInvalid");
    expect(tokenNameIssue(`abc${String.fromCharCode(0x202e)}def`)).toBe("nameInvalid");
    expect(normaliseTokenName("  Office \n  laptop ")).toBe("Office laptop");
  });

  it("builds the Claude Code command only from a safe URL and token", () => {
    const token = `asp_mcp_${"A".repeat(43)}`;
    expect(claudeCodeCommand("https://aspire.example.com/api/mcp", token)).toBe(
      `claude mcp add --transport http aspire https://aspire.example.com/api/mcp --header "Authorization: Bearer ${token}"`,
    );
    expect(claudeCodeCommand("http://localhost:3000/api/mcp", token)).toContain("http://localhost:3000/api/mcp");
    expect(claudeCodeCommand("https://aspire.example.com/api/mcp", `${token}"; rm -rf ~`)).toBeNull();
    expect(claudeCodeCommand("https://aspire.example.com/api/mcp", "$(whoami)xxxxxxxxxxxxxxxx")).toBeNull();
    expect(claudeCodeCommand("https://aspire.example.com/other", token)).toBeNull();
    expect(claudeCodeCommand("javascript:alert(1)", token)).toBeNull();
  });

  it("derives the public origin safely (a forged Host header never reaches the command)", () => {
    const h = (values: Record<string, string>) => new Headers(values);
    expect(publicOrigin("https://aspire.example.com", h({ host: "evil.example" }))).toBe("https://aspire.example.com");
    expect(publicOrigin(null, h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(publicOrigin(null, h({ "x-forwarded-host": "aspire.example.com", "x-forwarded-proto": "https", host: "app:3000" }))).toBe(
      "https://aspire.example.com",
    );
    expect(publicOrigin(null, h({ host: 'evil.example"; rm -rf ~; echo "' }), "http://localhost:3000/x")).toBe("http://localhost:3000");
    expect(publicOrigin(null, h({}))).toBeNull();
  });

  it("copies only the public fields of a token record", () => {
    const record = {
      id: "t-1",
      name: "Laptop",
      scopes: "read" as const,
      createdBy: "user-1",
      createdByName: "Office Admin",
      createdAt: "2026-10-01T10:00:00.000Z",
      expiresAt: "2026-12-30T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      status: "active" as const,
      tokenHash: "deadbeef",
    };
    const view = toMcpTokenView(record);
    expect(view).not.toHaveProperty("tokenHash");
    expect(view).not.toHaveProperty("createdBy");
    expect(view).toMatchObject({ id: "t-1", createdByName: "Office Admin", status: "active" });
    // A legacy whole-token "read" shows as every available service at read.
    expect(view.scopes).toEqual(["site:read", "accounts:read", "progress:read", "audit:read", "content:read"]);
    expect(view.scopeSummary).toEqual({ site: "read", accounts: "read", progress: "read", audit: "read", content: "read", crm: "none" });
    // Per-service scopes and the module's own summary pass through.
    const perService = toMcpTokenView({
      ...record,
      scopes: ["accounts:read", "accounts:write"],
      scopeSummary: { site: "none", accounts: "write", progress: "none", audit: "none", content: "none", crm: "none" },
    });
    expect(perService.scopes).toEqual(["accounts:read", "accounts:write"]);
    expect(perService.scopeSummary.accounts).toBe("write");
  });
});
