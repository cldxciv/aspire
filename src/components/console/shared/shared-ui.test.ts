import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en/console-common";
import hi from "@/i18n/messages/hi/console-common";
import { LEAD_DETAIL_FIELDS } from "@/lib/crm/console/types";
import { CentreLabel } from "./CentreLabel";
import { ConsoleTable, type ConsoleColumn } from "./ConsoleTable";
import { DemoNote } from "./DemoNote";
import { consoleCommon, formatCount, percentOf, pick, xOfYText } from "./messages";
import { NotSet } from "./NotSet";
import { XofY } from "./XofY";

// Shared console UI (docs/admin-phase-1b-plan.md §5 common UI rules, §10, §12; 1B-CORE).

type Row = { slug: string | null; label: string; count: number };

const columns: ConsoleColumn<Row>[] = [
  { key: "centre", header: "Centre", cell: (row) => row.label },
  { key: "count", header: "Enquiries", cell: (row) => row.count, numeric: true },
];

describe("console-common messages", () => {
  it("has the same keys and placeholders in English and Hindi, with no empty Hindi strings", () => {
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string") {
        expect(typeof b, path).toBe("string");
        expect((b as string).trim().length, path).toBeGreaterThan(0);
        const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(holes(b as string), path).toEqual(holes(a));
        return;
      }
      const keys = Object.keys(a as object).sort();
      expect(Object.keys(b as object).sort(), path).toEqual(keys);
      for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(en, hi, "consoleCommon");
    expect(Object.keys(en.details.fields).sort()).toEqual([...LEAD_DETAIL_FIELDS].sort());
    expect(pick("hi", en, hi)).toBe(hi);
    expect(pick("en", en, hi)).toBe(en);
    expect(consoleCommon("hi").common.notSet).toBe("तय नहीं");
  });
});

describe("numbers", () => {
  it("writes rates as x of y with a rounded percentage, never a bare percentage", () => {
    expect(xOfYText(23, 60, "en")).toBe("23 of 60 (38 %)");
    expect(xOfYText(23, 60, "hi")).toBe("60 में से 23 (38 %)");
    expect(xOfYText(0, 0, "en")).toBe("0 of 0");
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 0)).toBeNull();
    expect(formatCount(123456, "en")).toBe("1,23,456");
    expect(formatCount(123456, "hi")).toBe("1,23,456");
    const html = renderToStaticMarkup(createElement(XofY, { x: 2, y: 4, locale: "en" }));
    expect(html).toBe('<span class="tabular-nums">2 of 4 (50 %)</span>');
  });

  it("shows honest empty values and the demo centre note", () => {
    expect(renderToStaticMarkup(createElement(NotSet, { locale: "en" }))).toContain("Not set");
    expect(renderToStaticMarkup(createElement(NotSet, { locale: "hi", kind: "noTarget" }))).toContain("लक्ष्य तय नहीं");
    expect(renderToStaticMarkup(createElement(DemoNote, { demo: false, locale: "en" }))).toBe("");
    const note = renderToStaticMarkup(createElement(DemoNote, { demo: true, locale: "en" }));
    expect(note).toContain('role="note"');
    expect(note).toContain(en.common.demoCentres);
    expect(note).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(createElement(CentreLabel, { centre: { slug: null, label: "x" }, locale: "en" }))).toContain(en.common.noCentre);
    expect(renderToStaticMarkup(createElement(CentreLabel, { centre: { slug: "shimla", label: "Shimla" }, locale: "hi" }))).toContain("Shimla");
  });
});

describe("ConsoleTable", () => {
  const rows: Row[] = [
    { slug: "shimla", label: "Shimla", count: 12 },
    { slug: null, label: "No centre yet", count: 3 },
  ];
  const render = (total: Row | null = { slug: "total", label: "Total", count: 15 }) =>
    renderToStaticMarkup(
      createElement(ConsoleTable<Row>, {
        id: "numbers",
        caption: "Numbers by centre",
        regionLabel: "Numbers by centre: scroll sideways for more columns",
        columns,
        rows,
        rowKey: (row) => row.slug ?? "none",
        total,
      }),
    );

  it("is a captioned table in a focusable scroll region on tablets, with scoped headers and a sticky first column", () => {
    const html = render();
    expect(html).toMatch(/<div id="numbers-region" role="region" aria-label="Numbers by centre: scroll sideways for more columns" tabindex="0"/);
    expect(html).toContain('<caption id="numbers-caption" class="sr-only">Numbers by centre</caption>');
    expect(html.match(/<th scope="col"/g)).toHaveLength(2);
    expect(html.match(/<th scope="row"/g)).toHaveLength(3);
    expect(html).toMatch(/<th scope="row" class="sticky left-0[^"]*">Shimla<\/th>/);
    expect(html).toMatch(/<td class="[^"]*text-right tabular-nums">12<\/td>/);
    expect(html).toContain("<tfoot>");
  });

  it("is one card per row (plus the total) on phones", () => {
    const html = render();
    expect(html).toContain('<ul aria-label="Numbers by centre" class="space-y-3 md:hidden">');
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html.match(/<dt /g)).toHaveLength(3);
    expect(render(null)).not.toContain("<tfoot>");
  });

  it("shows the empty state instead of an empty table", () => {
    const html = renderToStaticMarkup(
      createElement(ConsoleTable<Row>, { id: "e", caption: "c", regionLabel: "r", columns, rows: [], rowKey: (row) => row.label, empty: createElement("p", null, "Nothing yet") }),
    );
    expect(html).toBe("<div><p>Nothing yet</p></div>");
  });
});
