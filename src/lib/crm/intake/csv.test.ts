import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CSV_LIMITS, parseCsv, sniffDelimiter } from "./csv";
import { decodeCsvBytes } from "./decode";

const fixtureText = (name: string) =>
  decodeCsvBytes(new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))))).text;

function parsed(text: string, options?: Parameters<typeof parseCsv>[1]) {
  const result = parseCsv(text, options);
  if (!result.ok) throw new Error(`parse failed: ${result.issue}`);
  return result;
}

describe("sniffDelimiter", () => {
  it("counts delimiters outside quotes on the header line only", () => {
    expect(sniffDelimiter("a,b,c\n1;2;3;4;5\n")).toBe(",");
    expect(sniffDelimiter("a;b;c\n")).toBe(";");
    expect(sniffDelimiter("a\tb\tc\n")).toBe("\t");
    expect(sniffDelimiter('"x,y,z";b\n')).toBe(";");
    expect(sniffDelimiter("single\n")).toBe(",");
    expect(sniffDelimiter("a\tb,c\n")).toBe("\t"); // tie → tab (Meta's own download)
  });

  it("honours Excel's sep= line", () => {
    expect(sniffDelimiter("sep=;\r\na,b;c\n")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("handles RFC 4180 quoting: delimiters, escaped quotes and line breaks inside quotes", () => {
    const result = parsed('name,note\n"Meera ""Mini"" Demo","line 1\nline 2, still"\nplain,x\n');
    expect(result.header).toEqual(["name", "note"]);
    expect(result.rows).toEqual([
      { row: 2, cells: ['Meera "Mini" Demo', "line 1\nline 2, still"] },
      { row: 3, cells: ["plain", "x"] },
    ]);
  });

  it("accepts CRLF, LF and lone CR line ends, and a last line without one", () => {
    expect(parsed("a,b\r\n1,2\r\n3,4").rows.map((r) => r.cells)).toEqual([["1", "2"], ["3", "4"]]);
    expect(parsed("a,b\r1,2\r3,4\r").rows.map((r) => r.cells)).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("trims cells, drops empty rows but keeps spreadsheet row numbers", () => {
    const result = parsed("\n\n a , b \n 1 ,2\n,\n\n3, 4 \n");
    expect(result.header).toEqual(["a", "b"]);
    expect(result.rows).toEqual([
      { row: 2, cells: ["1", "2"] },
      { row: 5, cells: ["3", "4"] },
    ]);
  });

  it("keeps a stray quote inside an unquoted cell as text", () => {
    expect(parsed('a,b\n5" tall,x\n').rows[0].cells).toEqual(['5" tall', "x"]);
    expect(parsed('a,b\n"ab"c,x\n').rows[0].cells).toEqual(["abc", "x"]);
  });

  it("reports an unterminated quote with its row", () => {
    expect(parseCsv('a,b\n1,"open\n2,3\n')).toEqual({ ok: false, issue: "unterminated_quote", row: 2 });
  });

  it("reports an empty file", () => {
    expect(parseCsv("")).toEqual({ ok: false, issue: "empty" });
    expect(parseCsv("\n\n,,\n")).toEqual({ ok: false, issue: "empty" });
  });

  it("enforces the row, column and cell limits", () => {
    expect(CSV_LIMITS).toEqual({ maxRows: 5000, maxColumns: 60, maxCellLength: 2000 });
    expect(parseCsv("a\n1\n2\n3\n", { maxRows: 2 })).toEqual({ ok: false, issue: "too_many_rows" });
    expect(parsed("a\n1\n2\n", { maxRows: 2 }).rows).toHaveLength(2);
    expect(parseCsv("a,b,c\n1,2,3\n", { maxColumns: 2 })).toMatchObject({ ok: false, issue: "too_many_columns", row: 1 });
    expect(parseCsv(`a\n${"x".repeat(2001)}\n`)).toMatchObject({ ok: false, issue: "cell_too_long", row: 2 });
    expect(parseCsv(`a\n"${"x".repeat(2001)}"\n`)).toMatchObject({ ok: false, issue: "cell_too_long", row: 2 });
    expect(parsed(`a\n${"x".repeat(2000)}\n`).rows[0].cells[0]).toHaveLength(2000);
  });

  it("parses 5,000 rows quickly and an adversarial quote run without backtracking", () => {
    const big = ["a,b,c", ...Array.from({ length: 5000 }, (_, i) => `${i},"x,${i}",z`)].join("\n");
    const started = Date.now();
    expect(parsed(big).rows).toHaveLength(5000);
    expect(parseCsv(`a\n${'"'.repeat(3999)}\n`, { maxCellLength: 2000 }).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("strips a BOM left in the text", () => {
    expect(parsed("﻿id,name\n1,x\n").header).toEqual(["id", "name"]);
  });

  it("parses every fixture with the right delimiter", () => {
    const utf8 = parsed(fixtureText("meta-utf8-comma.csv"));
    expect(utf8.delimiter).toBe(",");
    expect(utf8.header).toHaveLength(20);
    expect(utf8.rows).toHaveLength(4);
    expect(utf8.rows[2].cells[7]).toBe("Foundation, Kullu");
    expect(utf8.rows[2].cells[16]).toBe('Meera "Mini" Demo');

    const utf16 = parsed(fixtureText("meta-utf16le-tab.csv"));
    expect(utf16.delimiter).toBe("\t");
    expect(utf16.rows).toHaveLength(3);
    expect(utf16.rows[0].cells[0]).toBe("l:1234567890123461");
    expect(utf16.rows[0].cells[17]).toBe("p:+916000010011");
    expect(utf16.rows[0].cells[12]).toBe("धर्मशाला");

    const semi = parsed(fixtureText("excel-semicolon.csv"));
    expect(semi.delimiter).toBe(";");
    expect(semi.header).toEqual(["Name", "Mobile", "City", "Class", "Course", "Date"]);

    const mixed = parsed(fixtureText("mixed-quality.csv"));
    expect(mixed.rows.map((row) => row.row)).toEqual([2, 3, 4, 5, 6, 7, 9]);
  });
});
