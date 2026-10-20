import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrivacyPage from "@/app/[lang]/(site)/privacy/page";
import { HINT_KEY, SKIP_KEY, SKIP_MS } from "@/components/lead-gate/lead-gate-store";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { GATE_PASS_TTL_MS, TOOL_USE_TTL_MS } from "@/lib/crm/gate";
import { LEAD_GATE_COOKIE } from "@/lib/lead-gate/server";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * Privacy notice, lead-gate additions (docs/lead-gate-plan.md §11, WP10; owner decision 21 Oct 2026
 * "on now, with an honest note"): the "Free student tools: contact details before results" section,
 * the student-tools column of the collect table, the aspire_tool_pass cookie paragraph, and the
 * facts they state (durations, cookie and storage names, button names) kept in step with the code.
 */

const LOCALES = ["en", "hi"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  setTestLang("en");
  vi.unstubAllEnvs();
});

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await PrivacyPage())),
  );
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Every string leaf of a messages object. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("privacy notice: contact details before tool results", () => {
  it.each(LOCALES)("%s: renders the new section, the tools column and the cookie paragraph", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang);
    const p = messagesFor(lang, "legal").privacy;

    expect(html).toContain('id="tool-contact-details"');
    expect(html).toContain(escapeHtml(p.toolContact.title));
    for (const key of ["p1", "sample", "p2", "p3", "p4", "p5", "p6"] as const) {
      expect(html, key).toContain(escapeHtml(p.toolContact[key]));
    }
    expect(html).toContain(escapeHtml(p.cookies.p3));
    // {tbc} becomes the "To be confirmed" badge, never literal text.
    expect(html).not.toContain("{tbc}");

    // The collect table has four columns and every row says what the tools ask.
    const table = /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
    expect((table.match(/<th scope="col"/g) ?? []).length).toBe(4);
    expect(table).toContain(escapeHtml(p.collect.columnTools));
    for (const row of p.collect.rows) {
      expect(row.tools.trim(), row.field).not.toBe("");
      expect(table).toContain(escapeHtml(row.tools));
    }
    // The table scrolls sideways on phones: its scroller is a labelled, focusable region.
    expect(html).toContain(`<div role="region" aria-label="${escapeHtml(p.collect.caption)}" tabindex="0"`);
  });

  it.each(LOCALES)("%s: shows the sample-data paragraph only while sample data is on (the form's own switch)", async (lang) => {
    const { sample } = messagesFor(lang, "legal").privacy.toolContact;
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(await render(lang)).not.toContain(escapeHtml(sample));
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    expect(await render(lang)).toContain(escapeHtml(sample));
  });

  it.each(LOCALES)("%s: every “see …” cross-reference names a section of this page exactly", (lang) => {
    const p = messagesFor(lang, "legal").privacy;
    const titles = new Set(
      [p.about, p.collect, p.why, p.access, p.protecting, p.portal, p.toolContact, p.tools, p.retention, p.rights, p.cookies, p.changes].map(
        (section) => section.title,
      ),
    );
    const referenced: string[] = [];
    for (const text of strings(p)) {
      for (const [, inside] of text.matchAll(/\((?:see|देखें) ([^)]*)\)/g)) {
        for (const [, quoted] of inside.matchAll(/“([^”]+)”/g)) referenced.push(quoted);
      }
    }
    expect(referenced).toContain(p.toolContact.title);
    expect(referenced.filter((title) => !titles.has(title))).toEqual([]);
  });

  it.each(LOCALES)("%s: quotes the contact step's own button names", (lang) => {
    const p = messagesFor(lang, "legal").privacy;
    const gate = messagesFor(lang, "leadGate");
    expect(p.toolContact.p6).toContain(`“${gate.identity.notYou}”`);
    expect(p.toolContact.p6).toContain(`“${gate.identity.stopContact}”`);
    expect(p.toolContact.p6).toContain(`“${gate.skip}”`);
    expect(p.cookies.p3).toContain(`“${gate.identity.notYou}”`);
  });

  it.each(LOCALES)("%s: states the durations, cookie and storage names the code uses", (lang) => {
    const p = messagesFor(lang, "legal").privacy;
    expect(GATE_PASS_TTL_MS).toBe(180 * DAY_MS); // "up to 6 months" / "6 महीने तक"
    expect(p.cookies.p3).toContain("6");
    expect(p.cookies.p3).toContain(`“${LEAD_GATE_COOKIE}”`);
    expect(p.cookies.p3).toContain(`“${HINT_KEY}”`);
    expect(p.cookies.p3).toContain(`“${SKIP_KEY}”`);
    expect(p.cookies.p3).toContain(String(SKIP_MS / DAY_MS));
    expect(p.toolContact.p6).toContain(String(SKIP_MS / DAY_MS));
    expect(p.toolContact.p4).toContain(String(TOOL_USE_TTL_MS / DAY_MS));
    // The notice no longer claims "no tracking cookies": the pass links tool use to the details shared.
    expect(p.cookies.p1).not.toMatch(/tracking|ट्रैकिंग/);
  });

  it.each(LOCALES)("%s: says honestly that results use sample data and that sharing does not unlock official data", (lang) => {
    const { sample } = messagesFor(lang, "legal").privacy.toolContact;
    expect(sample).toMatch(lang === "hi" ? /सैंपल/ : /samples/);
    expect(sample).toMatch(lang === "hi" ? /आधिकारिक डेटा नहीं खुलता/ : /does not unlock official data/);
  });

  it("Hindi names Rancho as रैंचो and every new Hindi string is Devanagari prose", () => {
    const hi = messagesFor("hi", "legal").privacy;
    for (const text of [...strings(hi.toolContact), hi.cookies.p3, ...hi.collect.rows.map((row) => row.tools)]) {
      expect(text).not.toMatch(/Rancho/);
      expect(text).toMatch(/[ऀ-ॿ]/);
    }
    expect(hi.toolContact.p1).toContain("रैंचो");
  });
});
