import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeCsvBytes, decodeUtf16, decodeWindows1252, sniffUtf16 } from "./decode";

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

function utf16(text: string, littleEndian: boolean, bom: boolean): Uint8Array {
  const bytes: number[] = bom ? (littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (littleEndian) bytes.push(code & 0xff, code >> 8);
    else bytes.push(code >> 8, code & 0xff);
  }
  return new Uint8Array(bytes);
}

describe("decodeCsvBytes", () => {
  it("reads UTF-8 with a BOM and drops the BOM", () => {
    const decoded = decodeCsvBytes(fixture("meta-utf8-comma.csv"));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.bom).toBe(true);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.text.startsWith("id,created_time")).toBe(true);
  });

  it("reads Meta's UTF-16LE download (BOM, tabs, Hindi)", () => {
    const decoded = decodeCsvBytes(fixture("meta-utf16le-tab.csv"));
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.bom).toBe(true);
    expect(decoded.text.startsWith("id\tcreated_time")).toBe(true);
    expect(decoded.text).toContain("धर्मशाला");
    expect(decoded.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("recognises UTF-16BE by its BOM", () => {
    const decoded = decodeCsvBytes(utf16("name,phone\nअ,1\n", false, true));
    expect(decoded.encoding).toBe("utf-16be");
    expect(decoded.text).toBe("name,phone\nअ,1\n");
  });

  it("sniffs UTF-16 without a BOM from the NUL pattern", () => {
    const le = utf16("full_name\tphone_number\nAsha\t+916000010001\n", true, false);
    const be = utf16("full_name\tphone_number\nAsha\t+916000010001\n", false, false);
    expect(sniffUtf16(le)).toBe("utf-16le");
    expect(sniffUtf16(be)).toBe("utf-16be");
    expect(decodeCsvBytes(le)).toMatchObject({ encoding: "utf-16le", bom: false, text: "full_name\tphone_number\nAsha\t+916000010001\n" });
    expect(decodeCsvBytes(be).encoding).toBe("utf-16be");
    expect(sniffUtf16(new TextEncoder().encode("plain,ascii\n1,2\n"))).toBeNull();
  });

  it("uses strict UTF-8 when it is valid, without a warning", () => {
    const decoded = decodeCsvBytes(new TextEncoder().encode("name\nसीमा\n"));
    expect(decoded).toEqual({ text: "name\nसीमा\n", encoding: "utf-8", bom: false, warnings: [] });
  });

  it("falls back to windows-1252 with a warning when the bytes are not UTF-8", () => {
    const decoded = decodeCsvBytes(fixture("windows-1252.csv"));
    expect(decoded.encoding).toBe("windows-1252");
    expect(decoded.warnings).toEqual(["windows_1252"]);
    expect(decoded.text).toContain("Renée Sample");
    expect(decoded.text).toContain("Café visit");
    expect(decoded.text).toContain("????? ?????");
  });

  it("maps the 0x80–0x9F range like windows-1252, not Latin-1", () => {
    expect(decodeWindows1252(new Uint8Array([0x80, 0x93, 0x94, 0x99, 0xe9]))).toBe("€“”™é");
  });

  it("flags U+FFFD in the decoded text", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xff, 0x62]);
    const decoded = decodeCsvBytes(bytes);
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.warnings).toContain("replacement_chars");
  });

  it("drops an odd trailing byte of a cut UTF-16 file", () => {
    expect(decodeUtf16(new Uint8Array([0x61, 0x00, 0x62]), true)).toBe("a");
  });

  it("decodes large files in chunks (no call-stack overflow)", () => {
    const text = "a,b\n".repeat(50_000);
    expect(decodeCsvBytes(utf16(text, true, true)).text.length).toBe(text.length);
    expect(decodeWindows1252(new Uint8Array(200_000).fill(0x41)).length).toBe(200_000);
  });

  it("accepts an ArrayBuffer and an empty file", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("x").buffer as ArrayBuffer).text).toBe("x");
    expect(decodeCsvBytes(new Uint8Array(0))).toEqual({ text: "", encoding: "utf-8", bom: false, warnings: [] });
  });
});
