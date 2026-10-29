import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/leads/lead-1",
}));

import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { Session } from "@/lib/auth/roles";
import { captureLead, getLead, resolveCrmViewer } from "@/lib/crm";
import { updateLeadMoreDetails } from "@/lib/crm/console/details/details";
import type { DuplicateMatch } from "@/lib/crm/console/duplicates/types";
import { crmPermissions, type LeadDetail } from "@/lib/crm/types";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";
import { familyMessages } from "../details/messages";
import { LeadMoreDetails } from "../details/LeadMoreDetails";
import { DuplicateSuggestions, DuplicateSuggestionsPanel } from "./DuplicateSuggestions";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.F): the "Possible duplicates" box on the lead page.
// Synthetic data only.

const LOCALES: Locale[] = ["en", "hi"];

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const MATCHES: DuplicateMatch[] = [
  {
    leadId: "lead-2",
    name: "Synthetic Twin",
    stage: "contacted",
    centreSlug: "shimla",
    assignee: { userId: "u2", displayName: "Counsellor Two" },
    createdAt: "2026-10-19T05:00:00.000Z",
    reasons: ["main_is_alt", "same_name_class_centre"],
    canDismiss: true,
  },
  { leadId: "lead-3", name: null, stage: "new", centreSlug: null, assignee: null, createdAt: "2026-10-18T05:00:00.000Z", reasons: ["same_alt_phone"], canDismiss: false },
];

describe.each(LOCALES)("possible duplicates (%s)", (locale) => {
  const f = familyMessages(locale).duplicates;
  const t = messagesFor(locale, "crm");
  const prefix = locale === "hi" ? "/hi" : "";

  it("names each match with stage, centre, assignee, date and why; Open carries the way back", () => {
    const html = inLocale(locale, createElement(DuplicateSuggestionsPanel, { lead: { id: "lead-1", stage: "new", erased: false }, matches: MATCHES, locale, pagePath: "/crm/leads/lead-1", centres: { shimla: "Shimla" } }));
    expect(html).toContain(esc(f.title.replace("{n}", "2")));
    expect(html).toContain(esc(f.intro));
    expect(html).toContain("Synthetic Twin");
    expect(html).toContain(esc(t.common.unnamed));
    expect(html).toContain(esc(t.stages.contacted));
    expect(html).toContain("Shimla");
    expect(html).toContain("Counsellor Two");
    expect(html).toContain(esc(t.common.unassigned));
    expect(html).toContain('dateTime="2026-10-19T05:00:00.000Z"');
    for (const reason of ["main_is_alt", "same_name_class_centre", "same_alt_phone"] as const) expect(html).toContain(esc(f.reasons[reason]));
    expect(html).toContain(`href="${prefix}/crm/leads/lead-2?back=%2Fcrm%2Fleads%2Flead-1"`);
    expect(html).toContain(`aria-label="${esc(f.openLabel.replace("{name}", "Synthetic Twin"))}"`);
    // "Not the same family" only where the viewer may dismiss the pair.
    expect(html.split(`>${esc(f.notSame)}</button>`).length - 1).toBe(1);
    expect(html).toContain(`aria-label="${esc(f.notSameLabel.replace("{name}", "Synthetic Twin"))}"`);
    expect(f.notSameLabel.replace("{name}", "X")).toContain(f.notSame); // visible label inside the name (WCAG 2.5.3)
    expect(html).toContain(esc(f.markLost));
    expect(html).toMatch(/<h2 id="crm-lead-duplicates"[^>]*><svg[^>]*aria-hidden="true"/); // icon + text, never colour alone
  });

  it("renders nothing without matches; no 'mark lost' on a lead that is already lost", () => {
    expect(inLocale(locale, createElement(DuplicateSuggestionsPanel, { lead: { id: "lead-1", stage: "new", erased: false }, matches: [], locale, pagePath: "/crm/leads/lead-1" }))).toBe("");
    const lost = inLocale(locale, createElement(DuplicateSuggestionsPanel, { lead: { id: "lead-1", stage: "lost", erased: false }, matches: MATCHES, locale, pagePath: "/crm/leads/lead-1" }));
    expect(lost).not.toContain(esc(f.markLost));
  });
});

describe("the lead-page slots with real data", () => {
  const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);

  beforeEach(() => {
    vi.stubEnv("AUTH_DB_PATH", ":memory:");
    resetDatabaseForTests();
    for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetDatabaseForTests();
  });

  it("shows the box only when this viewer has a match, and the panel with the saved details", async () => {
    const user = insertUser(getDb(), { role: "admin", loginId: "admin.one", displayName: "Admin One", passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
    const viewer = resolveCrmViewer({ userId: user.id, role: "admin", displayName: "Admin One" } as Session);
    if (!viewer) throw new Error("expected a viewer");
    const capture = (phone: string) => {
      const result = captureLead({ source: "admissions", studentName: "Synthetic Student", phone, consent: { textVersion: "test-v1" } }, NOW);
      if (!result.ok) throw new Error("capture failed");
      return result.leadId;
    };
    const a = capture("9670000001");
    const b = capture("9670000002");
    const lead = (id: string) => {
      const result = getLead(viewer, id, NOW, { audit: false });
      if (!result.ok) throw new Error("expected the lead");
      return result.data as LeadDetail;
    };
    const props = (id: string) => ({ lead: lead(id), viewer, permissions: crmPermissions(viewer), locale: "en" as const, pagePath: `/crm/leads/${id}`, now: NOW });
    expect(await DuplicateSuggestions(props(a))).toBeNull();
    expect(updateLeadMoreDetails(viewer, b, { altPhone: "9670000001", heardVia: "seminar" }, NOW).ok).toBe(true);
    const element = await DuplicateSuggestions(props(a));
    expect(element).not.toBeNull();
    const html = inLocale("en", element as ReactElement);
    expect(html).toContain("Possible duplicates (1)");
    expect(html).toContain(`/crm/leads/${b}`);
    const panel = inLocale("en", (await LeadMoreDetails(props(b))) as ReactElement);
    expect(panel).toContain("+91 96700 00001");
    expect(panel).toContain("School seminar");
  });
});
