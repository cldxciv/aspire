import { describe, expect, it } from "vitest";

import {
  damageSummary,
  hasSpreadsheetArtifacts,
  idCellDamage,
  isGarbledText,
  isScientific,
  phoneCellDamage,
  stripSpreadsheetArtifacts,
  truncatedIdColumn,
  wentThroughExcel,
} from "./excel-damage";

describe("stripSpreadsheetArtifacts", () => {
  it("removes exactly one leading apostrophe and a trailing .0 from a number", () => {
    expect(stripSpreadsheetArtifacts("'+916000010042")).toBe("+916000010042");
    expect(stripSpreadsheetArtifacts("''x")).toBe("'x");
    expect(stripSpreadsheetArtifacts("6000010043.0")).toBe("6000010043");
    expect(stripSpreadsheetArtifacts("+916000010043.00")).toBe("+916000010043");
    expect(stripSpreadsheetArtifacts("'6000010044.0")).toBe("6000010044");
    expect(stripSpreadsheetArtifacts("  plain  ")).toBe("plain");
  });

  it("leaves other decimals and text alone", () => {
    expect(stripSpreadsheetArtifacts("9.5")).toBe("9.5");
    expect(stripSpreadsheetArtifacts("12.0a")).toBe("12.0a");
    expect(stripSpreadsheetArtifacts("v2.0")).toBe("v2.0");
    expect(stripSpreadsheetArtifacts(".0")).toBe(".0");
    expect(stripSpreadsheetArtifacts("1.")).toBe("1.");
  });
});

describe("isScientific", () => {
  it("recognises Excel's scientific notation (with export prefixes and signs)", () => {
    for (const value of ["9.19877E+11", "1.23457E+15", "9E+11", "1.2e15", "p:9.19877E+11", "l:1.23457E+15", "+9.1E+11", " 9.19877E+11 "]) {
      expect(isScientific(value), value).toBe(true);
    }
  });

  it("does not flag ordinary values", () => {
    for (const value of ["9876543210", "+916000010001", "Class 12", "E+11", "9.1E", "9.1E+1234", "1.2.3E+4", "Kangra", ""]) {
      expect(isScientific(value), value).toBe(false);
    }
  });
});

describe("id and phone damage", () => {
  it("blocks scientific ids and phones", () => {
    expect(idCellDamage("1.23457E+15")).toBe("id_sci");
    expect(phoneCellDamage("9.19877E+11")).toBe("phone_sci");
    expect(phoneCellDamage("+916000010001")).toBeNull();
  });

  it("never judges a cut id by one cell (one real id in 100 ends in 00)", () => {
    expect(idCellDamage("1234567890123400")).toBeNull();
    expect(idCellDamage("12345678901234500")).toBeNull();
    expect(idCellDamage("l:1234567890123451")).toBeNull();
  });

  it("treats a whole column of bare 16–17 digit ids that all end in 0 as cut", () => {
    const cut = ["1234567890123450", "1234567890123460", null, "'1234567890123470", "123456789012345", "12345678901234500"];
    expect([...truncatedIdColumn(cut)]).toEqual([0, 1, 3, 5]);
    // One real id that does not end in 0 proves the column was not cut, even with other Excel signs.
    expect(truncatedIdColumn(["1234567890123450", "1234567890123460", "1234567890123471"], { otherExcelSigns: true }).size).toBe(0);
  });

  it("does not block a real id ending in 00 in a clean column", () => {
    const real = ["1290430178445200", "1290430178445211", "1290430178445223", "1290430178445237"];
    expect(truncatedIdColumn(real).size).toBe(0);
    expect(truncatedIdColumn(real, { otherExcelSigns: true }).size).toBe(0);
  });

  it("judges a short column by 00 only when the file shows another Excel sign", () => {
    const short = ["1234567890123400", "1234567890123450", "123456789012300"];
    expect(truncatedIdColumn(short).size).toBe(0);
    // With another sign: only the 16–17 digit "…00" ids (a 15-digit id keeps all its digits).
    expect([...truncatedIdColumn(short, { otherExcelSigns: true })]).toEqual([0]);
  });

  it("never flags ids with Meta's l: prefix (Excel keeps them as text)", () => {
    const prefixed = ["l:1234567890123450", "l:1234567890123460", "l:12345678901234500"];
    expect(truncatedIdColumn(prefixed).size).toBe(0);
    expect(truncatedIdColumn(prefixed, { otherExcelSigns: true }).size).toBe(0);
  });

  it("recognises a spreadsheet's fingerprints on number cells", () => {
    for (const value of ["9.19877E+11", "'+916000010042", "6000010043.0", " 1.23457E+15 "]) expect(hasSpreadsheetArtifacts(value), value).toBe(true);
    for (const value of ["+916000010001", "p:+916000010001", "l:1234567890123451", "f:900000000000001", "9.5", ""]) expect(hasSpreadsheetArtifacts(value), value).toBe(false);
  });
});

describe("isGarbledText", () => {
  it("flags text Excel lost or decoded wrongly", () => {
    for (const value of ["?????", "????? ?????", "?", "a�b", "à¤¶à¤¿à¤®à¤²à¤¾", "CafÃ©", "donâ€™t"]) {
      expect(isGarbledText(value), value).toBe(true);
    }
  });

  it("does not flag ordinary text, Hindi or a question mark inside text", () => {
    for (const value of ["Shimla", "शिमला", "Is it JEE?", "Renée", "", "  "]) {
      expect(isGarbledText(value), value).toBe(false);
    }
  });
});

describe("damageSummary", () => {
  it("counts kinds and decides when the Excel banner shows", () => {
    const counts = damageSummary([{ damaged: ["phone_sci", "id_sci"] }, { damaged: ["text_mojibake"] }, {}]);
    expect(counts).toEqual({ phone_sci: 1, id_sci: 1, id_truncated: 0, text_mojibake: 1 });
    expect(wentThroughExcel(counts)).toBe(true);
    expect(wentThroughExcel({ phone_sci: 0, id_sci: 0, id_truncated: 0, text_mojibake: 3 })).toBe(false);
  });
});
