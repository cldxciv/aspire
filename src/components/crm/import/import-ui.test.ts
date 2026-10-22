import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/settings/import",
}));

import enCrm from "@/i18n/messages/en/crm";
import enImport from "@/i18n/messages/en/crm-import";
import hiCrm from "@/i18n/messages/hi/crm";
import hiImport from "@/i18n/messages/hi/crm-import";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { ApiFailure } from "@/lib/auth/client-api";
import type { ImportBatchSummary, ImportPreviewRow, ImportRowResult } from "@/lib/crm/intake/import";
import { buildImportRows } from "@/lib/crm/intake/rows";
import { importRequests } from "./api";
import { ConsentBasisPicker } from "./ConsentBasisPicker";
import { DamageBanner } from "./DamageBanner";
import { ImportHistory } from "./ImportHistory";
import { ImportProgress } from "./ImportProgress";
import { ImportResultView } from "./ImportResultView";
import { chunkFailureState, importAnnouncement, importFailureMessage, ImportWizard, isDroppedConnection, MAX_SERVER_FAILURES } from "./ImportWizard";
import { MappingTable } from "./MappingTable";
import {
  areaLabel,
  columnExample,
  damageNotice,
  looksLikeWorkbook,
  maskDigits,
  phonesByRow,
  previewTotals,
  problemRows,
  readImportFile,
  resultTotals,
  sha256Hex,
} from "./wizard-model";

const LOCALES: Locale[] = ["en", "hi"];
const MESSAGES = { en: enImport, hi: hiImport } as const;
const CRM = { en: enCrm, hi: hiCrm } as const;

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../lib/crm/intake/fixtures/${name}`, import.meta.url))));

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function failure(partial: Partial<ApiFailure>): ApiFailure {
  return { ok: false, status: 500, error: "server_error", fieldErrors: {}, known: null, ...partial };
}

/** Every leaf key path of a messages object. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

function leaf(value: unknown, path: string): string {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], value) as string;
}

describe("crm-import messages", () => {
  it("Hindi has exactly the English keys and the same placeholders", () => {
    const paths = keyPaths(enImport);
    expect(keyPaths(hiImport)).toEqual(paths);
    for (const path of paths) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(placeholders(leaf(hiImport, path)), path).toEqual(placeholders(leaf(enImport, path)));
      expect(leaf(hiImport, path).length, path).toBeGreaterThan(0);
    }
  });

  it("never points anyone to a third-party automation service", () => {
    for (const messages of [enImport, hiImport]) expect(JSON.stringify(messages)).not.toMatch(/zapier|make\.com|integromat|pabbly/i);
  });

  it("is the `importLeads` part of the crm namespace the page reads (CORE's nesting)", () => {
    expect(enCrm.importLeads).toBe(enImport);
    expect(hiCrm.importLeads).toBe(hiImport);
  });
});

describe("wizard model", () => {
  it("reads every fixture and guesses the mapping", () => {
    for (const name of ["meta-utf8-comma.csv", "meta-utf16le-tab.csv", "excel-semicolon.csv", "windows-1252.csv", "excel-damaged.csv", "daily-2.csv", "mixed-quality.csv"]) {
      const read = readImportFile(fixture(name));
      expect(read.ok, name).toBe(true);
      if (read.ok) expect(read.file.mapping, name).toContain("phone");
    }
    const utf16 = readImportFile(fixture("meta-utf16le-tab.csv"));
    expect(utf16.ok && utf16.file.encoding).toBe("utf-16le");
    const ansi = readImportFile(fixture("windows-1252.csv"));
    expect(ansi.ok && ansi.file.warnings).toEqual(["windows_1252"]);
  });

  it("refuses workbooks, oversized files and broken CSV with a reason", () => {
    expect(looksLikeWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
    expect(readImportFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toEqual({ ok: false, problem: { kind: "xlsx" } });
    expect(readImportFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toEqual({ ok: false, problem: { kind: "xlsx" } });
    expect(readImportFile(new Uint8Array(10 * 1024 * 1024 + 1))).toEqual({ ok: false, problem: { kind: "too_big" } });
    expect(readImportFile(new TextEncoder().encode('a,b\n1,"open\n'))).toEqual({ ok: false, problem: { kind: "parse", issue: "unterminated_quote", row: 2 } });
  });

  it("masks phones and long numbers in the mapping examples", () => {
    expect(maskDigits("+916000010001")).toBe("+91•••••••001");
    expect(maskDigits("p:+919812345210")).toBe("p:+91•••••••210");
    const read = readImportFile(fixture("meta-utf8-comma.csv"));
    if (!read.ok) throw new Error();
    const phoneColumn = read.file.mapping.indexOf("phone");
    expect(columnExample(read.file.rows, phoneColumn, "phone")).not.toContain("6000010001");
    expect(columnExample(read.file.rows, read.file.mapping.indexOf("district"), "district")).toBe("Shimla");
  });

  it("hashes the file for the same-file warning", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("totals a preview: counts, lost families, unknown places, areas", () => {
    const rows: ImportPreviewRow[] = [
      { row: 2, status: "created", phoneMasked: "+91 60•••••001", areaId: "kangra", place: "area" },
      { row: 3, status: "created", phoneMasked: "+91 60•••••002", areaId: null, place: "unknown" },
      { row: 4, status: "attached", phoneMasked: "+91 60•••••003", areaId: "shimla", place: "area", lost: true },
      { row: 5, status: "invalid_phone", phoneMasked: null, areaId: null, place: null },
      { row: 6, status: "missing_phone", phoneMasked: null, areaId: null, place: null },
      { row: 7, status: "damaged", phoneMasked: null, areaId: null, place: null },
      { row: 8, status: "already_imported", phoneMasked: "+91 60•••••008", areaId: null, place: null },
    ];
    const totals = previewTotals(rows, [{ row: 9, status: "duplicate_in_file" }]);
    expect(totals.counts).toEqual({
      created: 2,
      attached: 1,
      lost: 1,
      already_imported: 1,
      erased_family: 0,
      duplicate_in_file: 1,
      invalid: 2,
      consent_mismatch: 0,
      damaged: 1,
      unknownPlace: 1,
    });
    expect(totals.byArea).toEqual([
      { areaId: "", count: 1 },
      { areaId: "kangra", count: 1 },
    ]);
    expect(totals.importable).toBe(3);
    expect(problemRows(rows, [{ row: 9, status: "duplicate_in_file" }]).map((r) => [r.row, r.status])).toEqual([
      [5, "invalid_phone"],
      [6, "missing_phone"],
      [7, "damaged"],
      [8, "already_imported"],
      [9, "duplicate_in_file"],
    ]);
    // Without the routing check the areas are not shown.
    expect(previewTotals([{ row: 2, status: "created", phoneMasked: null, areaId: null, place: null }], []).placeChecked).toBe(false);
  });

  it("counts a family that is new in two chunks once (the second row joins it)", () => {
    // Each chunk is previewed on its own, so both rows come back "created".
    const rows: ImportPreviewRow[] = [
      { row: 2, status: "created", phoneMasked: "+91 60•••••081", areaId: "kangra", place: "area" },
      { row: 300, status: "created", phoneMasked: "+91 60•••••081", areaId: "kangra", place: "area" },
      { row: 301, status: "created", phoneMasked: "+91 60•••••082", areaId: null, place: "unknown" },
    ];
    const phones = phonesByRow([
      { row: 2, phone: "+916000010081" },
      { row: 300, phone: "6000010081" },
      { row: 301, phone: "+916000010082" },
    ]);
    const totals = previewTotals(rows, [], phones);
    expect(totals.counts).toMatchObject({ created: 2, attached: 1, unknownPlace: 1 });
    expect(totals.byArea).toEqual([
      { areaId: "", count: 1 },
      { areaId: "kangra", count: 1 },
    ]);
    expect(totals.importable).toBe(3);
  });

  it("totals a result from the server's batch counts, with one link per lost family", () => {
    const results: ImportRowResult[] = [
      { row: 2, status: "created", phoneMasked: null },
      { row: 3, status: "attached", phoneMasked: null, lostLeadId: "lead-3" },
      { row: 4, status: "invalid_phone", phoneMasked: null },
      // The chunk was sent again after its answer was lost: the lost family is still listed once.
      { row: 3, status: "already_imported", phoneMasked: null, resumed: true, lostLeadId: "lead-3" },
      // The same lost family on another row (a second enquiry), and one only seen in a re-sent chunk.
      { row: 7, status: "attached", phoneMasked: null, lostLeadId: "lead-3" },
      { row: 5, status: "already_imported", phoneMasked: null, resumed: true, lostLeadId: "lead-5" },
    ];
    const batch = { created: 4, attached: 3, skipped: 1, invalid: 1 };
    expect(resultTotals(batch, results, [{ row: 6, status: "duplicate_in_file" }])).toEqual({
      created: 4,
      attached: 3,
      skipped: 2,
      invalid: 1,
      lost: [
        { leadId: "lead-3", rows: [3, 7] },
        { leadId: "lead-5", rows: [5] },
      ],
    });
  });

  it("summarises damage for the banner", () => {
    const read = readImportFile(fixture("excel-damaged.csv"));
    if (!read.ok) throw new Error();
    const built = buildImportRows(read.file.header, read.file.rows, read.file.mapping);
    expect(damageNotice(built.rows)).toEqual({ excel: true, numberRows: 2, textRows: 0 });
  });

  it("labels areas (name, readable id, or no area)", () => {
    expect(areaLabel("kangra", { kangra: "कांगड़ा" }, "none")).toBe("कांगड़ा");
    expect(areaLabel("lahaul-spiti", {}, "none")).toBe("Lahaul Spiti");
    expect(areaLabel("", {}, "No area")).toBe("No area");
  });
});

describe("requests and failures", () => {
  it("builds the import requests", () => {
    const rows = [{ row: 2, phone: "+916000010001" }];
    expect(importRequests.preview(rows, "meta_lead_form")).toEqual({ path: "/api/crm/import/preview", method: "POST", body: { rows, consentBasis: "meta_lead_form" } });
    expect(importRequests.start({ consentBasis: "phone", startClock: false, rowsTotal: 1, fileName: "a.csv", fileSha256: null })).toEqual({
      path: "/api/crm/import/batches",
      method: "POST",
      body: { consentBasis: "phone", startClock: false, rowsTotal: 1, fileName: "a.csv", fileSha256: null },
    });
    expect(importRequests.rows("b/1", rows, 250)).toEqual({ path: "/api/crm/import/batches/b%2F1/rows", method: "POST", body: { rows, offset: 250 } });
    expect(importRequests.finish("b1")).toEqual({ path: "/api/crm/import/batches/b1/finish", method: "POST", body: {} });
    expect(importRequests.history()).toEqual({ path: "/api/crm/import/batches", method: "GET" });
  });

  it("localises failures and knows when to offer Resume", () => {
    for (const locale of LOCALES) {
      const t = MESSAGES[locale];
      const crm = CRM[locale];
      expect(importFailureMessage(failure({ status: 503, error: "not_configured" }), t, crm)).toBe(t.errors.notConfigured);
      expect(importFailureMessage(failure({ status: 403, error: "forbidden" }), t, crm)).toBe(t.errors.forbidden);
      expect(importFailureMessage(failure({ status: 409, error: "bad_request" }), t, crm)).toBe(t.errors.batchClosed);
      expect(importFailureMessage(failure({ status: 0, error: "network" }), t, crm)).toBe(crm.errors.network);
    }
    expect(isDroppedConnection(failure({ status: 0, error: "network" }))).toBe(true);
    expect(isDroppedConnection(failure({ status: 502, error: "server_error" }))).toBe(true);
    expect(isDroppedConnection(failure({ status: 422, error: "validation" }))).toBe(false);
    expect(isDroppedConnection(failure({ status: 409, error: "bad_request" }))).toBe(false);
  });

  it("never leaves an import stuck: 429 waits, the server gets limited retries, a refusal offers Stop", () => {
    // 429 (the 400-an-hour chunk limit or the CRM write limit): Resume after the wait, not "start over".
    expect(chunkFailureState(failure({ status: 429, error: "rate_limited", retryAfterSeconds: 300 }), 0)).toBe("waiting");
    // The viewer's connection: Resume as often as needed.
    expect(chunkFailureState(failure({ status: 0, error: "network" }), 0)).toBe("dropped");
    expect(chunkFailureState(failure({ status: 0, error: "network" }), 99)).toBe("dropped");
    // A chunk the server keeps failing: Resume a few times, then only Stop.
    expect(chunkFailureState(failure({ status: 500, error: "server_error" }), 1)).toBe("dropped");
    expect(chunkFailureState(failure({ status: 502, error: "server_error" }), MAX_SERVER_FAILURES - 1)).toBe("dropped");
    expect(chunkFailureState(failure({ status: 500, error: "server_error" }), MAX_SERVER_FAILURES)).toBe("failed");
    // Refused (409, 403, 422): Stop (finish) is the way out.
    expect(chunkFailureState(failure({ status: 409, error: "bad_request" }), 0)).toBe("failed");
    expect(chunkFailureState(failure({ status: 403, error: "forbidden" }), 0)).toBe("failed");
  });

  it("announces the end of the check and of the import (en and hi)", () => {
    for (const locale of LOCALES) {
      const t = MESSAGES[locale];
      expect(importAnnouncement(t, null, null)).toBe("");
      const checked = importAnnouncement(t, { created: 12, attached: 3, problems: 4 }, null);
      expect(checked).toContain("12");
      expect(checked).toContain("3");
      expect(checked).toContain("4");
      expect(checked).not.toMatch(/\{\w+\}/);
      const done = importAnnouncement(t, { created: 12, attached: 3, problems: 4 }, { created: 11, attached: 2, skipped: 5, invalid: 1 });
      expect(done).toBe(format(t.result.announce, { created: 11, attached: 2, skipped: 5, invalid: 1 }));
    }
  });
});

describe("components", () => {
  const batch = (over: Partial<ImportBatchSummary> = {}): ImportBatchSummary => ({
    id: "b1",
    kind: "meta_csv",
    fileName: "leads.csv",
    fileSha256: null,
    consentBasis: "meta_lead_form",
    startClock: true,
    status: "finished",
    rowsTotal: 5,
    created: 3,
    attached: 1,
    skipped: 1,
    invalid: 0,
    mine: true,
    createdAt: "2026-10-21T05:00:00.000Z",
    finishedAt: "2026-10-21T05:01:00.000Z",
    ...over,
  });

  it("renders the empty wizard with a labelled file input and the Excel tip", () => {
    for (const locale of LOCALES) {
      const t = MESSAGES[locale];
      const html = inLocale(locale, createElement(ImportWizard, { centres: [], areaNames: {}, previousFiles: {}, t, crm: CRM[locale] }));
      expect(html).toContain(t.steps.file);
      expect(html).toContain(t.file.excelTip.replace(/"/g, "&quot;"));
      expect(html).toMatch(/<label for="([^"]+)"[^>]*>[^<]*<\/label><input[^>]*id="\1"[^>]*type="file"/);
      expect(html).toContain('accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"');
    }
  });

  it("renders the mapping table with a labelled select per column and masked examples", () => {
    const read = readImportFile(fixture("meta-utf8-comma.csv"));
    if (!read.ok) throw new Error();
    const html = inLocale("en", createElement(MappingTable, { header: read.file.header, rows: read.file.rows, mapping: read.file.mapping, onChange: () => {}, t: enImport }));
    expect((html.match(/<select/g) ?? []).length).toBe(read.file.header.length);
    expect((html.match(/<label for="import-map-\d+"/g) ?? []).length).toBe(read.file.header.length);
    expect(html).not.toContain("6000010001");
    expect(html).toContain(enImport.mapping.targets.phone);
    const missing = inLocale("en", createElement(MappingTable, { header: ["a"], rows: [], mapping: ["answer"], onChange: () => {}, t: enImport }));
    expect(missing).toContain(enImport.mapping.phoneRequired);
  });

  it("renders the consent choices with the right hint and the clock switch on", () => {
    for (const locale of LOCALES) {
      const t = MESSAGES[locale];
      const html = inLocale(locale, createElement(ConsentBasisPicker, { basis: null, startClock: true, onBasis: () => {}, onStartClock: () => {}, showRequired: true, t }));
      expect((html.match(/type="radio"/g) ?? []).length).toBe(5);
      expect(html).toContain(t.consent.required);
      expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
      const staff = inLocale(locale, createElement(ConsentBasisPicker, { basis: "phone", startClock: false, onBasis: () => {}, onStartClock: () => {}, t }));
      expect(staff).toContain(t.consent.staffHint);
      expect(staff).not.toContain(t.consent.required);
    }
  });

  it("shows the Excel banner only when numbers are damaged", () => {
    const html = inLocale("en", createElement(DamageBanner, { notice: { excel: true, numberRows: 2, textRows: 1 }, garbledAnswers: 0, warnings: [], t: enImport }));
    expect(html).toContain(enImport.damage.title);
    expect(html).toContain("2 rows blocked");
    expect(html).toContain('role="alert"');
    expect(inLocale("en", createElement(DamageBanner, { notice: { excel: false, numberRows: 0, textRows: 0 }, garbledAnswers: 0, warnings: [], t: enImport }))).toBe("");
    expect(inLocale("en", createElement(DamageBanner, { notice: { excel: false, numberRows: 0, textRows: 0 }, garbledAnswers: 0, warnings: ["windows_1252"], t: enImport }))).toContain("ANSI");
  });

  it("renders progress and the Resume button after a dropped connection", () => {
    const running = inLocale("en", createElement(ImportProgress, { label: enImport.run.importing, done: 1, total: 4, t: enImport }));
    expect(running).toContain('role="progressbar"');
    expect(running).toContain("Importing part 2 of 4");
    const dropped = inLocale("hi", createElement(ImportProgress, { label: hiImport.run.importing, done: 1, total: 4, dropped: true, onResume: () => {}, t: hiImport }));
    expect(dropped).toContain(hiImport.run.resume);
    expect(dropped).toContain('role="alert"');
    // Waiting after a 429: the wait message instead of "the connection dropped", still with Resume.
    const waiting = inLocale("en", createElement(ImportProgress, { label: enImport.run.importing, done: 1, total: 4, dropped: true, droppedText: "Please wait about 5 minutes", onResume: () => {}, t: enImport }));
    expect(waiting).toContain("Please wait about 5 minutes");
    expect(waiting).not.toContain(enImport.run.dropped);
    expect(waiting).toContain(enImport.run.resume);
  });

  it("renders the result with localised links to the lost families", () => {
    const totals = { created: 3, attached: 1, skipped: 1, invalid: 0, lost: [{ leadId: "lead-4", rows: [4, 9] }] };
    const en = inLocale("en", createElement(ImportResultView, { totals, startClock: true, locale: "en", t: enImport }));
    expect(en).toContain('href="/crm/leads/lead-4"');
    expect(en.match(/href="\/crm\/leads\/lead-4"/g)).toHaveLength(1);
    expect(en).toContain("#4, #9");
    expect(en).toContain(enImport.result.clockOn);
    const hi = inLocale("hi", createElement(ImportResultView, { totals, startClock: false, locale: "hi", t: hiImport }));
    expect(hi).toContain('href="/hi/crm/leads/lead-4"');
    expect(hi).toContain(hiImport.result.clockOff);
  });

  it("renders the history (and its empty state) without family data", () => {
    const html = inLocale("en", createElement(ImportHistory, { batches: [batch(), batch({ id: "b2", status: "open", mine: false, fileName: null })], locale: "en", t: enImport }));
    expect(html).toContain("leads.csv");
    expect(html).toContain(enImport.history.open);
    expect(html).toContain(enImport.history.noFile);
    expect(html).toContain(enImport.consent.bases.meta_lead_form);
    expect(inLocale("hi", createElement(ImportHistory, { batches: [], locale: "hi", t: hiImport }))).toContain(hiImport.history.empty);
  });
});
