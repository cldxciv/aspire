import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/client";
import { htmlLang, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import consolePeopleEn from "@/i18n/messages/en/console-people";
import consolePeopleHi from "@/i18n/messages/hi/console-people";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { countByRole, CreateUserForm, joinableAreas, ROLE_CHIPS, UserManager, type AdminUserView, type UserManagerMessages } from "./UserManager";

// People list (admin console 1b §5.L): staff rows with CRM role, areas, away status, open enquiries;
// role chips with counts; staff creation asks for the CRM role with nothing preselected.

function messages(locale: Locale): UserManagerMessages {
  const portal = messagesFor(locale, "portal");
  return { users: portal.admin.users, errors: portal.errors, roles: messagesFor(locale, "auth").roles, people: locale === "hi" ? consolePeopleHi : consolePeopleEn };
}

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const base = { disabled: false, mustChangePassword: false, createdAt: "2026-10-01T05:00:00.000Z" };
// Synthetic accounts and area names only.
const USERS: AdminUserView[] = [
  { ...base, id: "a1", role: "admin", displayName: "Office Admin", loginId: "office.admin" },
  {
    ...base,
    id: "st1",
    role: "staff",
    displayName: "Head Person",
    loginId: "head.person",
    crm: {
      crmRole: "manager",
      centreSlugs: [],
      active: true,
      areaIds: ["area-north", "area-old"],
      areaNames: [
        { id: "area-north", en: "North Area", hi: "उत्तर क्षेत्र", active: true },
        { id: "area-old", en: "Old Area", hi: "पुराना क्षेत्र", active: false },
      ],
      awayUntil: "2026-10-25T06:00:00.000Z",
      openLeads: 7,
    },
  },
  {
    ...base,
    id: "st2",
    role: "staff",
    displayName: "Caller Person",
    loginId: "caller.person",
    crm: { crmRole: "counsellor", centreSlugs: ["centre-a", "centre-b"], active: false, areaIds: [], areaNames: [], awayUntil: null, openLeads: 0 },
  },
  { ...base, id: "st3", role: "staff", displayName: "New Staff", loginId: "new.staff", crm: null },
  { ...base, id: "s1", role: "student", displayName: "Learner One", loginId: "learner.one", linkedParentIds: [] },
  { ...base, id: "p1", role: "parent", displayName: "Parent One", loginId: "parent.one", linkedStudentIds: [] },
];

function card(html: string, name: string): string {
  const start = html.indexOf(`>${name}`);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
}

describe("People list", () => {
  it("chips count every role", () => {
    expect(ROLE_CHIPS).toEqual(["all", "staff", "admin", "student", "parent"]);
    expect(countByRole(USERS)).toEqual({ all: 6, staff: 3, admin: 1, student: 1, parent: 1 });
  });

  it.each(["en", "hi"] as const)("staff rows show CRM role, access, areas, older centre scope, away and open enquiries (%s)", (locale) => {
    const m = messages(locale);
    const s = m.people.staff;
    // Synthetic centre names; "centre-b" is left out to show the fallback to the slug.
    const centreNames = { "centre-a": locale === "hi" ? "सेंटर ए" : "Centre A" };
    const html = inLocale(locale, createElement(UserManager, { initialUsers: USERS, currentUserId: "a1", messages: m, centreNames }));
    // Chips with counts, "All" pressed.
    expect(html).toContain(`aria-label="${escape(m.people.chips.label)}"`);
    for (const chip of ROLE_CHIPS) {
      const count = countByRole(USERS)[chip];
      expect(html).toContain(`>${escape(m.people.chips.withCount.replace("{label}", m.people.chips[chip]).replace("{count}", String(count)))}<`);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*\(6\)</);

    const head = card(html, "Head Person");
    expect(head).toContain(`aria-label="${escape(s.detailsLabel.replace("{name}", "Head Person"))}"`);
    expect(head).toContain(escape(s.crmRole.manager));
    expect(head).toContain(escape(s.access.active));
    expect(head).toContain(locale === "hi" ? "उत्तर क्षेत्र" : "North Area");
    expect(head).toContain(escape(s.areaInactive.replace("{name}", locale === "hi" ? "पुराना क्षेत्र" : "Old Area")));
    expect(head).toContain(escape(s.everyCentre));
    const date = new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date("2026-10-25T06:00:00.000Z"));
    expect(head).toContain(escape(s.away.replace("{date}", date)));
    if (locale === "en") expect(head).toContain("Away until 25 Oct 2026");
    expect(head).toContain(`>7<`);
    expect(head).toContain(`href="${locale === "hi" ? "/hi" : ""}/crm/settings/areas"`);
    expect(head).toContain(`href="${locale === "hi" ? "/hi" : ""}/crm/staff"`);
    expect(head).toContain(escape(s.areasLink));
    expect(head).toContain(escape(s.rulesLink));

    const caller = card(html, "Caller Person");
    expect(caller).toContain(escape(s.crmRole.counsellor));
    expect(caller).toContain(escape(s.access.inactive));
    expect(caller).toContain(escape(s.noAreas));
    // The older centre scope reads as centre names in the page language; an unknown slug as written.
    expect(caller).toContain(`${locale === "hi" ? "सेंटर ए" : "Centre A"}, <span lang="en" translate="no">centre-b</span>`);
    expect(caller).not.toContain("centre-a");
    expect(caller).not.toMatch(/Away until|तक छुट्टी पर/);
    expect(caller).toContain(`>0<`);

    expect(card(html, "New Staff")).toContain(escape(s.noMembership));
    // Only staff rows carry CRM facts.
    expect(card(html, "Learner One")).not.toContain(escape(s.areasLink));
    expect(html).not.toMatch(/temporaryPassword|password_hash|scrypt\$/);
  });

  it.each(["en", "hi"] as const)("creating a staff login: CRM role required with nothing preselected, optional areas with the no-areas warning (%s)", (locale) => {
    const m = messages(locale);
    const c = m.people.create;
    const html = inLocale(
      locale,
      createElement(CreateUserForm, { m, allowStaff: true, initialRole: "staff", onCreated: async () => undefined, onFailure: () => "" }),
    );
    expect(html).toContain(`<legend class="px-1 text-sm font-bold text-navy">${escape(c.crmRole)}</legend>`);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio).not.toContain("checked");
      expect(radio).toContain('required=""');
    }
    expect(html).toContain(escape(m.people.staff.crmRole.counsellor));
    expect(html).toContain(escape(m.people.staff.crmRole.manager));
    expect(html).toContain(escape(c.crmRoleHint));
    expect(html).toContain(escape(c.areas));
    expect(html).toContain(escape(c.areasLoading));
    expect(html).toContain(escape(c.noAreasWarning));
    // Other roles see none of it, and without super admin rights "Staff" is not offered.
    const student = inLocale(locale, createElement(CreateUserForm, { m, allowStaff: false, onCreated: async () => undefined, onFailure: () => "" }));
    expect(student).not.toContain('type="radio"');
    expect(student).not.toContain('value="staff"');
  });

  it("only active, unmerged areas can be joined", () => {
    const area = (id: string, active: boolean, mergedInto: string | null) => ({ id, nameEn: id, nameHi: id, active, mergedInto }) as unknown as CrmArea;
    expect(joinableAreas([area("a", true, null), area("b", false, null), area("c", true, "a")]).map((a) => a.id)).toEqual(["a"]);
  });

  it("console-people messages: Hindi has the same shape as English and no empty strings", () => {
    const shape = (value: unknown): unknown =>
      typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)])) : typeof value;
    expect(shape(consolePeopleHi)).toEqual(shape(consolePeopleEn));
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : typeof value === "object" && value !== null ? Object.values(value).flatMap(strings) : [];
    for (const text of [...strings(consolePeopleEn), ...strings(consolePeopleHi)]) expect(text.trim()).not.toBe("");
    // Placeholders survive translation.
    expect(consolePeopleHi.staff.away).toContain("{date}");
    expect(consolePeopleHi.chips.withCount).toContain("{count}");
  });
});
