import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/templates",
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { SEED_TEMPLATES_1B } from "@/lib/crm/console/templates/seed";
import { consolePermissions, type WaTemplate } from "@/lib/crm/console/types";
import { crmPermissions } from "@/lib/crm/types";
import { callsMessages } from "../calls/messages";
import { bodyIssueMessages, prospectusLinkValid, sampleSlotValues, slotList, statusActions, templateStatusText } from "./template-forms";
import { TemplatesManager } from "./TemplatesManager";

// 1B-CALLS (docs/admin-phase-1b-plan.md §5.D, O4): the /crm/templates page in both languages.

const LOCALES: Locale[] = ["en", "hi"];
const NOW = "2026-10-23T05:00:00.000Z";

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

const fromSeed = (index: number, status: WaTemplate["status"]): WaTemplate => {
  const seed = SEED_TEMPLATES_1B[index];
  return {
    key: seed.key,
    context: "general",
    position: index,
    status,
    bodies: { en: seed.en, hi: seed.hi, hinglish: seed.hinglish },
    version: status === "draft" ? 1 : 2,
    seeded: true,
    approvedAt: status === "approved" ? NOW : null,
    approvedBy: status === "approved" ? "Owner Name" : null,
    updatedAt: NOW,
  };
};

const TEMPLATES = [fromSeed(0, "draft"), fromSeed(1, "approved"), fromSeed(2, "retired")];

describe("template page helpers", () => {
  it("previews with slot names, never invented names, dates or numbers", () => {
    for (const locale of LOCALES) {
      const values = sampleSlotValues(callsMessages(locale));
      for (const value of Object.values(values)) {
        expect(value).toMatch(/^‹.+›$/);
        expect(value).not.toMatch(/\d/);
      }
    }
  });

  it("status text, actions, edit issues and the prospectus link check", () => {
    const c = callsMessages("en");
    expect(templateStatusText(TEMPLATES[0], "en", c)).toBe("Awaiting approval");
    expect(templateStatusText(TEMPLATES[1], "en", c)).toMatch(/^Approved on 23 Oct 2026 by Owner Name$/);
    expect(templateStatusText({ ...TEMPLATES[1], approvedBy: null }, "en", c)).toMatch(/^Approved on 23 Oct 2026$/);
    expect(templateStatusText(TEMPLATES[2], "en", c)).toBe("Retired");
    expect(templateStatusText(TEMPLATES[0], "hi", callsMessages("hi"))).toBe("मंज़ूरी बाकी");
    expect(statusActions("draft")).toEqual(["approved", "retired"]);
    expect(statusActions("approved")).toEqual(["draft", "retired"]);
    expect(statusActions("retired")).toEqual(["draft", "approved"]);
    expect(bodyIssueMessages("Namaste {parent_name} ji.", c)).toEqual([]);
    expect(bodyIssueMessages("Namaste {guardian} ji.", c)).toEqual(["Unknown slot: {guardian}. Use only the slots listed."]);
    expect(bodyIssueMessages("Hello {centre}", c)).toEqual([c.templates.issues.edgeSlot]);
    expect(bodyIssueMessages("", c)).toEqual([c.templates.issues.empty]);
    expect(prospectusLinkValid("")).toBe(true);
    expect(prospectusLinkValid("https://example.org/p.pdf")).toBe(true);
    expect(prospectusLinkValid("http://example.org/p.pdf")).toBe(false);
    expect(prospectusLinkValid(`https://example.org/${"x".repeat(300)}`)).toBe(false);
    expect(slotList()).toContain("{parent_name}");
  });

  it("only area heads and admins open the page; only super admins manage (§7)", () => {
    const perms = (role: "admin" | "manager" | "counsellor", superAdmin = false) => consolePermissions({ role }, crmPermissions({ role, superAdmin }));
    expect(perms("counsellor").canViewTemplateAdmin).toBe(false);
    expect(perms("manager")).toMatchObject({ canViewTemplateAdmin: true, canManageTemplates: false });
    expect(perms("admin")).toMatchObject({ canViewTemplateAdmin: true, canManageTemplates: false });
    expect(perms("admin", true)).toMatchObject({ canViewTemplateAdmin: true, canManageTemplates: true });
  });
});

describe.each(LOCALES)("TemplatesManager (%s)", (locale) => {
  const c = callsMessages(locale);
  const t = { errors: messagesFor(locale, "crm").errors };

  it("super admin: a card per template with status (icon + text), three bodies with previews, edit and status buttons", () => {
    const html = inLocale(
      locale,
      createElement(TemplatesManager, { templates: TEMPLATES, canManage: true, prospectus: { url: null, version: 0 }, locale, pagePath: "/crm/templates", t, c }),
    );
    expect(count(html, /<article\b/g)).toBe(3);
    expect(html).toContain(esc(c.whatsapp.purposes.first_contact));
    expect(html).toContain(esc(c.templates.status.draft));
    expect(html).toContain(esc(c.templates.status.retired));
    expect(html).toContain("Owner Name");
    expect(count(html, /class="lucide[^"]*size-4" aria-hidden="true"/g)).toBeGreaterThan(0);
    expect(html).toContain(esc(SEED_TEMPLATES_1B[0].hi));
    expect(html).toContain(esc(c.templates.preview));
    expect(html).toContain(esc(`‹${c.whatsapp.slots.parent_name}›`));
    expect(count(html, new RegExp(`>${esc(c.templates.edit)}<`, "g"))).toBe(9);
    expect(html).toContain(`aria-label="${esc(c.templates.approveLabel.replace("{template}", c.whatsapp.purposes.first_contact))}"`);
    expect(html).toContain(esc(c.templates.backToDraft));
    expect(html).toContain(esc(c.templates.prospectus.notSet));
    expect(html).toMatch(/<label for="[^"]+-url"/);
    expect(html).toContain('role="status"');
  });

  it("read-only for area heads and admins: statuses and bodies, no buttons, no inputs", () => {
    const html = inLocale(
      locale,
      createElement(TemplatesManager, { templates: TEMPLATES, canManage: false, prospectus: { url: "https://example.org/p.pdf", version: 1 }, locale, pagePath: "/crm/templates", t, c }),
    );
    expect(count(html, /<article\b/g)).toBe(3);
    expect(html).not.toContain(`${esc(c.templates.approve)}</button>`);
    expect(html).not.toMatch(/<button\b/);
    expect(html).not.toContain(`>${esc(c.templates.edit)}<`);
    expect(html).not.toMatch(/<input\b/);
    expect(html).toContain("https://example.org/p.pdf");
    const empty = inLocale(locale, createElement(TemplatesManager, { templates: [], canManage: false, prospectus: { url: null, version: 0 }, locale, pagePath: "/crm/templates", t, c }));
    expect(empty).toContain(esc(c.templates.empty));
  });
});
