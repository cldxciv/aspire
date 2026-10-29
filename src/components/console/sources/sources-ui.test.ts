import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/config";

// "Where enquiries come from" and the search overview (1B-SOURCES; docs/admin-phase-1b-plan.md
// §5.J, §10): component markup in both languages, the chart's accessible table, the empty state,
// and the pages' gates (prerendered for real sessions). Synthetic data only.
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
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/crm/sources",
  useSearchParams: () => new URLSearchParams(),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { createSession } = await import("@/lib/auth/sessions");
const { createTestUser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { LocaleProvider } = await import("@/i18n/client");
const { withTestLang } = await import("@/test/root-params-stub");
const { default: en } = await import("@/i18n/messages/en/console-sources");
const { default: hi } = await import("@/i18n/messages/hi/console-sources");
const { default: enCrm } = await import("@/i18n/messages/en/crm");
const { consoleCommon } = await import("@/components/console/shared/messages");
const { presetRange } = await import("@/lib/crm/console/sources/range");
const { default: AdminSearchPage } = await import("@/app/[lang]/(portal)/admin/search/page");
const { default: CrmSourcesPage } = await import("@/app/[lang]/(portal)/crm/sources/page");
const { MiniBars, barGeometry } = await import("./MiniBars");
const { SourcesView, SOURCE_SECTIONS } = await import("./SourcesView");
const { SearchOverviewView, SEARCH_TEXT } = await import("./SearchOverviewView");
const { CentreLinksCard } = await import("./CentreLinksCard");
const { sourcesRequests } = await import("./api");

type Report = import("@/lib/crm/console/sources/types").SourcesReport;

const PASSWORD = "synthetic-pass-2026";
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const DAY = 86_400_000;
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function provider(locale: Locale, child: ReactNode): ReactElement {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

const html = (locale: Locale, element: ReactElement) => renderToStaticMarkup(provider(locale, element));

const counts = (enquiries: number, reachedCounselling = 0, admitted = 0) => ({ enquiries, reachedCounselling, admitted, smallSample: enquiries < 10 });

function report(overrides: Partial<Report> = {}): Report {
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(NOW - (13 - index) * DAY + 19_800_000).toISOString().slice(0, 10);
    return {
      day,
      contactNew: index,
      contactKnown: 1,
      mockTests: 2,
      plannerStudents: 3,
      ranchoQuestions: index >= 12 ? 7 : null,
      toolUses: index === 13 ? 5 : 0,
      toolUsesByTool: (index === 13 ? { predictor: 3, ask: 2 } : {}) as Record<string, number>,
    };
  });
  return {
    generatedAt: new Date(NOW).toISOString(),
    range: presetRange("90d", NOW),
    centre: null,
    total: 40,
    erased: 2,
    channels: [
      { channel: "search_engines", ...counts(20, 9, 3) },
      { channel: "google_maps", ...counts(4, 2, 1) },
      { channel: "ai_assistants", ...counts(0) },
    ],
    maps: { ...counts(6, 3, 1), fromVisit: 4, fromStaff: 3, both: 1, bySignal: [{ key: "tagged", count: 3 }, { key: "maps.app.goo.gl", count: 1 }] },
    ai: { ...counts(3, 1, 0), fromVisit: 3, fromStaff: 0, both: 0, bySignal: [{ key: "chatgpt.com", count: 3 }] },
    campaigns: { rows: [{ campaign: "diwali-jee", topSource: "google", topMedium: "cpc", ...counts(12, 5, 2) }], other: { ...counts(4, 1, 0), distinct: 3 }, untagged: 24 },
    referrers: { rows: [{ host: "chatgpt.com", enquiries: 3, ai: true }, { host: "www.google.com", enquiries: 20, ai: false }], other: null, none: 17 },
    pages: { rows: [{ page: "/admissions", enquiries: 15 }], other: { enquiries: 5, distinct: 4 }, none: 20 },
    heard: [
      { key: "newspaper", enquiries: 2 },
      { key: null, enquiries: 38 },
    ],
    weekly: {
      series: ["search_engines", "others"],
      weeks: [
        { weekStart: "2026-10-12", partial: false, counts: { search_engines: 5, others: 2 }, total: 7 },
        { weekStart: "2026-10-19", partial: true, counts: { search_engines: 3, others: 0 }, total: 3 },
      ],
      shownFromDay: null,
    },
    tools: { gate: { mode: "off", offReason: "unset" }, enquiriesByTool: [{ tool: "ask", enquiries: 4 }], usage: { days } },
    ...overrides,
  };
}

function view(locale: Locale, data: Report, extra: { managerScope?: boolean; canEdit?: boolean; freeToolUsersHref?: string | null } = {}) {
  const s = locale === "hi" ? hi : en;
  return html(
    locale,
    createElement(SourcesView, {
      report: data,
      managerScope: extra.managerScope ?? false,
      links: {
        rows: [
          { slug: "shimla", label: "Shimla", mapsUrl: "https://maps.app.goo.gl/Synthetic1", taggedUrl: "https://aspireiit.in/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-shimla" },
          { slug: "kangra", label: "Kangra", mapsUrl: null, taggedUrl: "https://aspireiit.in/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-kangra" },
        ],
        version: 3,
        canEdit: extra.canEdit ?? false,
      },
      freeToolUsersHref: extra.freeToolUsersHref === undefined ? "/crm?stage=open&area=tool_signups" : extra.freeToolUsersHref,
      pagePath: "/crm/sources",
      locale,
      s,
      common: consoleCommon(locale),
      crm: { errors: enCrm.errors },
      filters: createElement("div", { id: "filters-slot" }),
    }),
  );
}

describe("console-sources messages", () => {
  it("has the same keys and placeholders in English and Hindi, with no empty Hindi strings", () => {
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string") {
        expect(typeof b, path).toBe("string");
        expect((b as string).trim().length, path).toBeGreaterThan(0);
        const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(holes(b as string), path).toEqual(holes(a));
        return;
      }
      const keys = Object.keys(a as object).sort();
      expect(Object.keys(b as object).sort(), path).toEqual(keys);
      for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(en, hi, "consoleSources");
  });

  it("names every channel, and promises nothing it cannot measure", () => {
    const all = JSON.stringify(en);
    expect(all).not.toMatch(/\brank(ing|ings)?\b(?! predictor)/i);
    expect(en.channels.aiInfo).toContain("Many visits from AI apps arrive without it and appear as Direct.");
    expect(en.page.countingNote).toBe(
      "Counts include enquiries that were later erased (only their non-personal origin is kept), so they can be higher than the Enquiries list.",
    );
    expect(en.links.domainWarning).toBe("Add this link to the centre's Google Business Profile only after the website's final domain is live (decision 17).");
  });
});

describe("SourcesView", () => {
  it("renders every section with its heading, the counting note, the in-page links and x-of-y rates (en)", () => {
    const markup = view("en", report());
    for (const id of SOURCE_SECTIONS) {
      expect(markup, id).toContain(`id="${id}"`);
      expect(markup, id).toContain(`href="#${id}"`);
    }
    expect(markup).toContain(esc(en.page.countingNote));
    expect(markup).toContain("2 of the 40 enquiries in this range were erased later.");
    expect(markup).toContain(esc(en.channels.aiInfo));
    expect(markup).toContain("<caption");
    expect(markup).toContain("9 of 20 (45 %)");
    expect(markup).toContain("0 of 0");
    expect(markup).toContain("(Small sample)");
    expect(markup).toContain("AI assistant"); // referrer flag
    expect(markup).toContain(esc(en.links.domainWarning));
    expect(markup).toContain("Other (3 campaigns)");
    expect(markup).toContain("Other (4 pages)");
    expect(markup).toContain("24 enquiries had no campaign tag.");
    expect(markup).toContain(en.heard.notRecorded);
    expect(markup).toContain(en.maps.tagged);
    expect(markup).toContain("Off: not switched on");
    expect(markup).toContain(en.tools.notKept);
    expect(markup).toContain("Rank predictor 3 · Rancho (AI doubt solver) 2");
    expect(markup).toContain(esc(en.tools.footnotes.rancho));
    expect(markup).toContain(esc(en.tools.footnotes.predictor));
    expect(markup).toContain(`(${en.weekly.partial})`);
    expect(markup).toContain('href="/crm?stage=open&amp;area=tool_signups"');
    // Tables become cards on phones and scroll inside a focusable region on tablets.
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toContain(en.page.scopeNote);
    // Area heads: the scope note, no usage rows, no queue link.
    const head = view("en", report({ tools: { ...report().tools, usage: null } }), { managerScope: true, freeToolUsersHref: null });
    expect(head).toContain(en.page.scopeNote);
    expect(head).not.toContain(esc(en.tools.usageTitle));
    expect(head).not.toContain("area=tool_signups");
    expect(head).toContain(en.tools.byToolTitle);
  });

  it("renders in Hindi with Hindi rates and labels", () => {
    const markup = view("hi", report());
    expect(markup).toContain(hi.sections.channels);
    expect(markup).toContain("20 में से 9 (45 %)");
    expect(markup).toContain(hi.channelNames.search_engines);
    expect(markup).toContain(hi.links.title);
    expect(markup).not.toContain(en.sections.referrers);
  });

  it("draws the charts as hidden SVG with an accessible data table for every value", () => {
    const markup = view("en", report());
    expect(markup).toContain('aria-hidden="true" focusable="false"');
    expect(markup).toContain('<div class="sr-only"><table>');
    const chart = renderToStaticMarkup(
      createElement(MiniBars, {
        id: "test",
        title: "Mock tests submitted",
        data: [
          { key: "a", label: "20 Oct 2026", short: "20 Oct", value: 0, valueText: "0" },
          { key: "b", label: "21 Oct 2026", short: "21 Oct", value: 4, valueText: "4" },
        ],
        columnLabel: "Day",
        valueLabel: "Mock tests submitted",
      }),
    );
    expect(chart).toContain("<figcaption");
    // Drawn 1:1 in px (never stretched): 2 columns → 60 px slots, 24 px columns (the cap), 4 px corners.
    expect(chart).toContain('<div class="mt-2 max-w-full" style="width:120px"><svg viewBox="0 0 120 64" width="120" height="64" aria-hidden="true"');
    expect(chart).not.toContain("preserveAspectRatio");
    expect(chart).toContain('d="M78,64V6Q78,2 82,2H98Q102,2 102,6V64Z"');
    expect(chart).toContain("<title>21 Oct 2026: 4</title>");
    expect(chart.match(/<path /g)).toHaveLength(1); // no column for 0
    // Hidden inside a div (an sr-only <table> would still widen the page at 375 / 768 px).
    expect(chart).toContain('<div class="sr-only"><table><caption>Mock tests submitted</caption>');
    expect(chart).not.toContain('<table class="sr-only"');
    expect(chart).toContain('<th scope="row">20 Oct 2026</th><td>0</td>');
    expect(chart).toContain('<th scope="row">21 Oct 2026</th><td>4</td>');
    expect(chart).toContain("fill-blue");
    expect(chart).toContain("forced-colors:fill-[CanvasText]");
  });

  it("caps chart columns at 24 px for any number of columns", () => {
    for (const columns of [1, 2, 5, 6, 12, 14]) {
      const { slot, bar, width } = barGeometry(columns);
      expect(bar).toBeLessThanOrEqual(24);
      expect(bar).toBeLessThan(slot);
      expect(width).toBe(columns * slot);
    }
    expect(barGeometry(14)).toEqual({ slot: 20, bar: 12, width: 280 });
  });

  it("says where the weekly trend starts when the range is longer than 12 weeks", () => {
    const base = report();
    const clipped = report({ weekly: { ...base.weekly, shownFromDay: "2026-08-03" } });
    expect(view("en", clipped)).toContain("This range is longer than 12 weeks, so the trend shows its last 12 weeks, from 3 Aug 2026.");
    expect(view("hi", clipped)).toContain("यह अवधि 12 हफ़्तों से लंबी है");
    expect(view("en", base)).not.toContain("This range is longer than");
  });

  it("shows the empty state but keeps the centre links and the free tools card", () => {
    const empty = report({
      total: 0,
      erased: 0,
      channels: [],
      heard: [],
      weekly: { series: [], weeks: [], shownFromDay: null },
      campaigns: { rows: [], other: null, untagged: 0 },
      referrers: { rows: [], other: null, none: 0 },
      pages: { rows: [], other: null, none: 0 },
    });
    const markup = view("en", empty);
    expect(markup).toContain(en.page.empty);
    expect(markup).toContain('id="maps"');
    expect(markup).toContain('id="tools"');
    expect(markup).not.toContain('id="channels"');
    expect(markup).not.toContain('id="weekly"');
    expect(markup).not.toContain('href="#channels"');
  });
});

describe("CentreLinksCard", () => {
  const props = (canEdit: boolean) => ({
    rows: [
      { slug: "shimla", label: "Shimla", mapsUrl: "https://maps.app.goo.gl/Synthetic1", taggedUrl: "https://aspireiit.in/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-shimla" },
      { slug: "kangra", label: "Kangra", mapsUrl: null, taggedUrl: "https://aspireiit.in/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-kangra" },
    ],
    version: 1,
    canEdit,
    pagePath: "/crm/sources",
    notSet: "Not set",
    t: en.links,
    errors: { errors: enCrm.errors },
  });

  it("shows each centre's Maps link (new tab), Not set, the tagged link with a copy button, and the domain warning", () => {
    const markup = html("en", createElement(CentreLinksCard, props(false)));
    expect(markup).toContain('href="https://maps.app.goo.gl/Synthetic1"');
    expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain("Not set");
    expect(markup).toContain("utm_campaign=gbp-kangra");
    // Label in name (WCAG 2.5.3): the accessible name starts with the visible "Copy link".
    expect(markup).toContain('Copy link<span class="sr-only">: Kangra</span></button>');
    expect(markup).not.toMatch(/<button[^>]*aria-label=/);
    expect(markup).toContain(esc(en.links.domainWarning));
    expect(markup).toContain(en.links.readOnly);
    expect(markup).not.toContain(en.links.edit);
    const editable = html("en", createElement(CentreLinksCard, props(true)));
    expect(editable).toContain(en.links.edit);
    expect(editable).not.toContain(en.links.readOnly);
    expect(markup).toContain("min-h-11");
  });

  it("saves through the super-admin PUT with the loaded version", () => {
    expect(sourcesRequests.saveCentreLinks({ shimla: { mapsUrl: null } }, 4)).toEqual({
      path: "/api/crm/settings/centre-links",
      method: "PUT",
      body: { centres: { shimla: { mapsUrl: null } }, expectedVersion: 4 },
    });
    expect(sourcesRequests.report({ range: "30d", centre: "", from: undefined })).toEqual({ path: "/api/crm/sources?range=30d", method: "GET" });
  });
});

describe("SearchOverviewView", () => {
  it("is English, honest about AI answers, links to the sources page, and shows — in preview", () => {
    const overview = {
      generatedAt: new Date(NOW).toISOString(),
      hiddenFromSearch: true,
      periods: [
        { days: 30, searchEngines: counts(12, 6, 1), maps: counts(3, 1, 0), ai: counts(2, 0, 0) },
        { days: 90, searchEngines: counts(30, 15, 4), maps: counts(8, 4, 1), ai: counts(5, 1, 0) },
      ],
    };
    const markup = html("hi", createElement(SearchOverviewView, { overview, asOf: "11:30", locale: "hi" }));
    expect(markup).toMatch(/^<div class="space-y-5" lang="en">/); // English part of a Hindi page (WCAG 3.1.2)
    expect(markup).toContain(SEARCH_TEXT.hidden);
    expect(markup).toContain(esc(SEARCH_TEXT.honestNote));
    expect(markup).toContain("6 of 12 (50 %)"); // English even on a Hindi URL (decision 5)
    expect(markup).toContain('href="/hi/crm/sources"');
    expect(markup).not.toMatch(/rank/i);
    const preview = html("en", createElement(SearchOverviewView, { overview: null, asOf: null, locale: "en" }));
    expect(preview).toMatch(/^<div class="space-y-5">/); // already English: no lang override
    expect(preview).toContain("—");
    expect(preview).toContain(SEARCH_TEXT.searchEngines);
    expect(preview).toContain(esc(SEARCH_TEXT.maps));
    expect(preview).not.toContain(SEARCH_TEXT.hidden);
    expect(preview).not.toContain(SEARCH_TEXT.open);
    expect(preview).not.toMatch(/\d+ of \d+/);
  });
});

// ---------------------------------------------------------------------------------------------
// Pages, prerendered for real sessions.

async function renderPage(lang: Locale, page: () => Promise<unknown>): Promise<{ html: string; errors: unknown[] }> {
  return withTestLang(lang, async () => {
    const errors: unknown[] = [];
    const element = (await page()) as ReactNode;
    const { prelude } = await prerender(provider(lang, element), { onError: (error) => void errors.push(error) });
    return { html: await new Response(prelude).text(), errors };
  });
}

async function signInAs(role: "admin" | "staff" | "student", loginId: string, crmRole?: "manager" | "counsellor", centreSlugs: string[] = []) {
  const user = await createTestUser({ role, loginId, password: PASSWORD, displayName: `Name of ${loginId}` });
  if (crmRole) writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs, active: true }, Date.now());
  cookieState.jar = new Map([["aspire_session", createSession(user.id).token]]);
  return user;
}

const searchParams = (params: Record<string, string> = {}) => Promise.resolve(params);

describe("pages", () => {
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

  it("/admin/search is for admins only: it renders for an admin and sends staff to sign in", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    await signInAs("admin", "owner.one");
    const admin = await renderPage("en", () => AdminSearchPage());
    expect(admin.errors).toEqual([]);
    expect(admin.html).toContain(SEARCH_TEXT.title);
    expect(admin.html).toContain(SEARCH_TEXT.hidden);
    expect(admin.html).toContain(SEARCH_TEXT.searchEngines);

    await signInAs("staff", "head.one", "manager");
    const head = await renderPage("en", () => AdminSearchPage());
    expect(String((head.errors[0] as { digest?: string }).digest)).toMatch(/^NEXT_REDIRECT;.*\/login\?next=%2Fadmin%2Fsearch/);
    expect(head.html).not.toContain(SEARCH_TEXT.searchEngines);
  });

  it("/hi/admin/search marks its English header and body lang=\"en\"", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    await signInAs("admin", "owner.two");
    const page = await renderPage("hi", () => AdminSearchPage());
    expect(page.errors).toEqual([]);
    expect(page.html).toMatch(new RegExp(`<div lang="en"><div[^>]*>(?:(?!</h1>).)*${SEARCH_TEXT.title}</h1>`, "s"));
    expect(page.html).toContain('<div class="space-y-5" lang="en">');
    expect(page.html).not.toContain("स्टाफ़ एडमिन"); // the area label inside the English header is English
  });

  it("/admin/search preview shows — and reads no data", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "true");
    const preview = await renderPage("en", () => AdminSearchPage());
    expect(preview.errors).toEqual([]);
    expect(preview.html).toContain(SEARCH_TEXT.previewNote);
    expect(preview.html).toContain("—");
    expect(preview.html).not.toContain(SEARCH_TEXT.hidden);
  });

  it("/crm/sources: counsellors get the not-available panel; area heads see their scope", async () => {
    await signInAs("staff", "exec.one", "counsellor");
    const counsellor = await renderPage("en", () => CrmSourcesPage({ searchParams: searchParams() }));
    expect(counsellor.errors).toEqual([]);
    expect(counsellor.html).toContain(esc(en.page.notAllowedBody));
    expect(counsellor.html).not.toContain(`id="channels"`);

    const result = captureLead({ source: "admissions", studentName: "Synthetic Student", phone: "9700000001", centreSlug: "shimla", consent: { textVersion: "2026-10-20.v2" }, context: { referrer: "chatgpt.com" } }, Date.now() - 3_600_000);
    expect(result.ok).toBe(true);
    await signInAs("staff", "head.shimla", "manager", ["shimla"]);
    const head = await renderPage("hi", () => CrmSourcesPage({ searchParams: searchParams({ range: "30d" }) }));
    expect(head.errors).toEqual([]);
    expect(head.html).toContain(hi.page.title);
    expect(head.html).toContain('id="channels"');
    expect(head.html).toContain(hi.page.scopeNote);
    expect(head.html).toContain(hi.channelNames.ai_assistants);
    expect(head.html).not.toContain(esc(hi.tools.usageTitle));
  });
});
