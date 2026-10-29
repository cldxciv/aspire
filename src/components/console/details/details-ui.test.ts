import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Client islands call useRouter().refresh(); outside the App Router a stub is enough for static markup.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/leads/lead-1",
}));

import { activitySummary } from "@/components/crm/LeadDetailView";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import consoleFamilyEn from "@/i18n/messages/en/console-family";
import consoleFamilyHi from "@/i18n/messages/hi/console-family";
import type { LeadMoreDetails } from "@/lib/crm/console/types";
import type { CrmViewer, LeadDetail } from "@/lib/crm/types";
import { familyRequests } from "./api";
import { detailFormValues, detailsRequest } from "./details-form";
import { LeadMoreDetailsPanel } from "./LeadMoreDetails";
import { familyMessages } from "./messages";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.E): the "More details" panel, its form logic, the
// timeline labels and the console-family words in English and Hindi. Synthetic data only.

const LOCALES: Locale[] = ["en", "hi"];
const NOW = Date.parse("2026-10-21T06:00:00.000Z"); // 11:30 IST

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

/** Text as renderToStaticMarkup escapes it. */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const EMPTY: LeadMoreDetails = {
  altPhone: null,
  school: null,
  board: null,
  hostel: null,
  targetExam: null,
  targetYear: null,
  heardVia: null,
  referredBy: null,
  intakeSession: null,
  preferredTime: null,
  decisionMaker: null,
  updatedAt: null,
};

const FILLED: LeadMoreDetails = {
  altPhone: "+919660000077",
  school: "Synthetic Public School",
  board: "hpbose",
  hostel: "maybe",
  targetExam: "neet",
  targetYear: 2028,
  heardVia: "ai_assistant",
  referredBy: "A Synthetic Neighbour",
  intakeSession: "S2027",
  preferredTime: "evening",
  decisionMaker: "both_parents",
  updatedAt: "2026-10-20T05:00:00.000Z",
};

const LEAD = {
  id: "lead-1",
  stage: "contacted",
  erased: false,
  phone: "+919660000001",
  area: { id: "kangra", en: "Kangra", hi: "कांगड़ा" },
  routing: { areaId: "kangra", areaName: { en: "Kangra", hi: "कांगड़ा" }, match: "district", outcome: "area", placeInput: "near the bus stand", gateOnly: false, routedAt: "2026-10-18T05:00:00.000Z", routedBy: null },
} as unknown as LeadDetail;

describe.each(LOCALES)("the More details panel (%s)", (locale) => {
  const f = familyMessages(locale).details;
  const t = messagesFor(locale, "crm");

  it("shows every field, 'Not recorded' when empty, and the routing district read-only", () => {
    const html = inLocale(locale, createElement(LeadMoreDetailsPanel, { lead: LEAD, details: EMPTY, locale, pagePath: "/crm/leads/lead-1", now: NOW }));
    expect(html).toContain(`<h2 id="crm-lead-more-details"`);
    expect(html).toContain(esc(f.title));
    for (const field of Object.values(f.fields)) expect(html).toContain(esc(field));
    expect(html.split(esc(f.notRecorded)).length - 1).toBe(11);
    expect(html).toContain(esc(f.district));
    expect(html).toContain(locale === "hi" ? "कांगड़ा" : "Kangra");
    expect(html).toContain(esc(f.districtTyped.replace("{place}", "near the bus stand")));
    expect(html).toContain(esc(f.edit)); // live lead: the edit button
    expect(html).not.toContain("tel:");
  });

  it("labels recorded answers and links the second number like the main one", () => {
    const html = inLocale(locale, createElement(LeadMoreDetailsPanel, { lead: LEAD, details: FILLED, locale, pagePath: "/crm/leads/lead-1", now: NOW }));
    expect(html).toContain("+91 96600 00077");
    expect(html).toContain('href="tel:+919660000077"');
    expect(html).toContain('href="https://wa.me/919660000077"');
    expect(html).toContain(`aria-label="${esc(f.callAlt)}"`);
    expect(html).toContain(`aria-label="${esc(f.whatsAppAlt)}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    for (const label of [f.boards.hpbose, f.hostel.maybe, f.heardVia.ai_assistant, f.preferredTime.evening, f.decisionMakers.both_parents, f.exams.neet]) {
      expect(html).toContain(esc(label));
    }
    expect(html).toContain(">2028</dd>");
    expect(html).toContain(esc(f.sessionLabel.replace("{label}", "2027–28")));
    expect(html).toContain("Synthetic Public School");
    expect(html).not.toContain(esc(f.notRecorded));
    // Visible labels sit inside the accessible names (WCAG 2.5.3).
    expect(f.callAlt).toContain(f.call);
    expect(f.whatsAppAlt).toContain(f.whatsApp);
    expect(t.common.optional).not.toBe("");
  });

  it("an erased enquiry: no edit button, a note that only non-personal answers are kept", () => {
    const html = inLocale(locale, createElement(LeadMoreDetailsPanel, { lead: { ...LEAD, erased: true, phone: null } as LeadDetail, details: { ...FILLED, altPhone: null, school: null, referredBy: null }, locale, pagePath: "/crm/leads/lead-1", now: NOW }));
    expect(html).not.toContain(esc(f.edit));
    expect(html).toContain(esc(f.erasedNote));
    expect(html).not.toContain("tel:");
  });

  it("names the more-details fields on the timeline", () => {
    const viewer: CrmViewer = { userId: "u1", displayName: "Exec", role: "counsellor", centreSlugs: [] };
    const lines = activitySummary(
      { id: 9, type: "field_update", body: null, meta: { fields: ["details.altPhone", "details.decisionMaker"] }, actorId: "u1", actorName: "Exec", at: "2026-10-20T05:00:00.000Z" },
      { t, locale, viewer, staffNames: {}, tasks: [] } as never,
    );
    const names = locale === "hi" ? ["दूसरा फ़ोन / WhatsApp नंबर", "फ़ैसला कौन करेगा"] : ["second phone / WhatsApp", "who decides"];
    expect(lines).toEqual([t.lead.timeline.fieldsEdited.replace("{fields}", names.join(", "))]);
  });
});

describe("the details form → PUT body", () => {
  it("sends only the changed fields, normalised; null clears one; nothing when unchanged", () => {
    const values = detailFormValues(FILLED);
    expect(values).toMatchObject({ altPhone: "9660000077", targetYear: "2028", intakeSession: "S2027", hostel: "maybe" });
    expect(detailsRequest("lead-1", FILLED, values, "+919660000001")).toEqual({ ok: false, nothing: true });
    const changed = detailsRequest("lead-1", FILLED, { ...values, altPhone: "096600 00088", school: "  New   School ", board: "", targetYear: "2029", hostel: "" }, "+919660000001");
    expect(changed).toEqual({
      ok: true,
      fields: ["altPhone", "school", "board", "hostel", "targetYear"],
      request: familyRequests.saveDetails("lead-1", { altPhone: "+919660000088", school: "New School", board: null, hostel: null, targetYear: 2029 }),
    });
    expect(changed.ok && changed.request).toEqual({ path: "/api/crm/leads/lead-1/details", method: "PUT", body: { altPhone: "+919660000088", school: "New School", board: null, hostel: null, targetYear: 2029 } });
    const fresh = detailsRequest("lead-1", EMPTY, { ...detailFormValues(EMPTY), heardVia: "seminar", preferredTime: "morning" }, null);
    expect(fresh.ok && fresh.request.body).toEqual({ heardVia: "seminar", preferredTime: "morning" });
    // The joining session's empty choice ("Not decided") clears it.
    const undecided = detailsRequest("lead-1", FILLED, { ...values, intakeSession: "" }, "+919660000001");
    expect(undecided.ok && undecided.request.body).toEqual({ intakeSession: null });
    expect(familyMessages("en").details.sessionNotDecided).toBe("Not decided");
  });

  it("refuses a bad or repeated second number and over-long text before sending", () => {
    const values = detailFormValues(EMPTY);
    expect(detailsRequest("lead-1", EMPTY, { ...values, altPhone: "12345" }, "+919660000001")).toEqual({ ok: false, issues: { altPhone: "altPhoneInvalid" } });
    expect(detailsRequest("lead-1", EMPTY, { ...values, altPhone: "+91 96600 00001" }, "+919660000001")).toEqual({ ok: false, issues: { altPhone: "altPhoneSame" } });
    expect(detailsRequest("lead-1", EMPTY, { ...values, school: "x".repeat(121), referredBy: "y".repeat(81) }, null)).toEqual({ ok: false, issues: { school: "tooLong", referredBy: "tooLong" } });
  });

  it("builds the other family-record requests exactly", () => {
    expect(familyRequests.details("a/b")).toEqual({ path: "/api/crm/leads/a%2Fb/details", method: "GET" });
    expect(familyRequests.dismissDuplicate("l1", "l2")).toEqual({ path: "/api/crm/leads/l1/duplicates", method: "POST", body: { otherLeadId: "l2", action: "dismiss" } });
    expect(familyRequests.lostReview({ days: 30, assignee: "u-1" })).toEqual({ path: "/api/crm/lost-review?days=30&assignee=u-1", method: "GET" });
    expect(familyRequests.keepLost("l1", "2026-10-20T05:00:00.000Z")).toEqual({ path: "/api/crm/lost-review/l1", method: "POST", body: { lostAt: "2026-10-20T05:00:00.000Z", decision: "kept" } });
    expect(familyRequests.reopenLost("l1", { lostAt: "2026-10-20T05:00:00.000Z", reopenTo: "contacted", assigneeId: null, followUp: { kind: "preset", preset: "tomorrow" } })).toEqual({
      path: "/api/crm/lost-review/l1",
      method: "POST",
      body: { lostAt: "2026-10-20T05:00:00.000Z", decision: "reopened", reopenTo: "contacted", followUp: { kind: "preset", preset: "tomorrow" } },
    });
  });
});

describe("console-family words", () => {
  it("has the same keys and placeholders in English and Hindi, with no empty strings", () => {
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string") {
        expect(typeof b, path).toBe("string");
        expect((b as string).trim().length, path).toBeGreaterThan(0);
        expect(a.trim().length, path).toBeGreaterThan(0);
        const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(holes(b as string), path).toEqual(holes(a));
        return;
      }
      const ak = Object.keys(a as object).sort();
      expect(Object.keys(b as object).sort(), path).toEqual(ak);
      for (const key of ak) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(consoleFamilyEn, consoleFamilyHi, "consoleFamily");
  });

  it("uses the plan's key terms (§12) and never says anything merges by itself", () => {
    expect(consoleFamilyHi.details.title).toBe("और जानकारी");
    expect(consoleFamilyHi.details.fields.altPhone).toBe("दूसरा फ़ोन / WhatsApp नंबर");
    expect(consoleFamilyHi.details.fields.heardVia).toBe("हमारे बारे में कैसे पता चला");
    expect(consoleFamilyHi.details.fields.intakeSession).toBe("किस सत्र में दाख़िला");
    expect(consoleFamilyHi.details.fields.decisionMaker).toBe("फ़ैसला कौन करेगा");
    expect(consoleFamilyHi.duplicates.title).toBe("शायद यही परिवार ({n})");
    expect(consoleFamilyHi.duplicates.notSame).toBe("यह अलग परिवार है");
    expect(consoleFamilyHi.lost.title).toBe("बंद पूछताछ की समीक्षा");
    expect(consoleFamilyHi.lost.keep).toBe("बंद ही रखें");
    expect(consoleFamilyHi.lost.reopen).toBe("फिर से खोलें…");
    expect(consoleFamilyEn.duplicates.intro).toMatch(/Nothing is merged automatically/);
    expect(JSON.stringify(consoleFamilyEn)).not.toMatch(/\bmerged? (them|these|both)\b/i);
  });
});
