import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GO_LIVE_ITEMS, GO_LIVE_NOTE } from "@/lib/console/go-live";
import { BACKUPS_TEXT, buildSiteStatus, FREE_DISK_WARNING, STATUS_ROWS, type StatusSources } from "@/lib/console/status";
import { STATUS_TEXT, StatusView } from "./StatusView";

// /admin/status markup (plan §5.M): every row, the go-live summary, "—" in the preview, English only.
const NOW = Date.UTC(2026, 9, 22, 6, 0);
const GB = 1024 * 1024 * 1024;

const SOURCES: StatusSources = {
  env: { RELEASE: "5a2d7cb9", ENQUIRY_STORE: "crm", LEAD_GATE: "optional" },
  demoMode: () => true,
  dbPath: () => "/tmp-synthetic/aspire.sqlite",
  fileSize: () => 1024 * 1024,
  freeBytes: () => 2 * GB,
  readText: () => {
    throw new Error("ENOENT");
  },
  superAdminCount: () => 1,
  metaHealth: () => null,
  ranchoConfigured: () => false,
};

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

describe("StatusView", () => {
  it("live (hi URL): every row and value, the 3 GB warning, backups not set up, English marked lang=en", () => {
    const status = buildSiteStatus(NOW, SOURCES);
    const html = renderToStaticMarkup(createElement(StatusView, { status, asOf: "22 Oct 2026, 11:30 am IST", locale: "hi" }));
    expect(html.startsWith('<div class="space-y-5" lang="en">')).toBe(true);
    for (const row of STATUS_ROWS) expect(html).toContain(escape(row.label));
    for (const row of status.rows) expect(html).toContain(escape(row.value));
    expect(html).toContain(escape(FREE_DISK_WARNING));
    expect(html).toContain(escape(BACKUPS_TEXT));
    expect(html).toContain("2.0 GB free");
    expect(html).toContain("As of 22 Oct 2026, 11:30 am IST");
    // Tone is told in words, not colour alone.
    expect(html).toContain(`${STATUS_TEXT.tone.warn}: `);
    // The Meta row links to the localised integrations page; nothing else is a button or a test action.
    expect(html).toContain('href="/hi/crm/settings/integrations"');
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/webhook test|test the webhook|send a test/i);
    // Go-live summary with its note; "Leave demo mode" follows the live (demo) mode.
    expect(html).toContain(escape(GO_LIVE_NOTE));
    for (const item of GO_LIVE_ITEMS) expect(html).toContain(escape(item.item));
    expect(html).toContain("Open (the site is in demo mode)");
    expect(html).not.toContain("tmp-synthetic");
    // Phones get this page's own stacked cards (values are sentences); the tables are for tablets and up.
    expect(html.match(/<div class="hidden md:block">/g)).toHaveLength(2);
    expect(html).toContain(`<ul aria-label="${STATUS_TEXT.statusCaption}" class="space-y-3 md:hidden">`);
    expect(html).toContain(`<ul aria-label="${STATUS_TEXT.goLiveCaption}" class="space-y-3 md:hidden">`);
  });

  it("preview: '—' for every value, the preview note, nothing read and no live link", () => {
    const html = renderToStaticMarkup(createElement(StatusView, { status: null, asOf: null, locale: "en" }));
    expect(html.startsWith('<div class="space-y-5">')).toBe(true);
    expect(html).toContain(STATUS_TEXT.previewNote);
    for (const row of STATUS_ROWS) expect(html).toContain(escape(row.label));
    // Two layouts (table and cards) × 12 rows of "—", plus "Leave demo mode" and the "—" refs.
    expect(html.split(`>${STATUS_TEXT.previewValue}<`).length - 1).toBeGreaterThanOrEqual(2 * STATUS_ROWS.length);
    expect(html).not.toContain("Blocked (demo)");
    expect(html).not.toContain(escape(BACKUPS_TEXT));
    expect(html).not.toContain("/crm/settings/integrations");
    expect(html).not.toContain("Open (the site is in demo mode)");
  });
});
