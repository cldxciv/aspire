import { describe, expect, it } from "vitest";

import { cleanPagePath, cleanReferrer, csvCell, csvLine, istDayBounds, normalizePhoneE164 } from "./pure";
import { crmPermissions, stageOrdinal } from "./types";

describe("normalizePhoneE164", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    [" (98765) 43210 ", "+919876543210"],
    ["98765.43210", "+919876543210"],
    ["6000000000", "+916000000000"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each(["", "12345", "5876543210", "+1 9876543210", "+9198765432100", "98765432a0", "++919876543210", "9".repeat(40), null, 9876543210])(
    "rejects %s",
    (input) => {
      expect(normalizePhoneE164(input as unknown as string)).toBeNull();
    },
  );
});

describe("csvCell (formula injection, OWASP)", () => {
  it.each([
    ["=HYPERLINK(\"http://evil\")", `"'=HYPERLINK(""http://evil"")"`],
    ["+919876543210", `"'+919876543210"`],
    ["-2+3", `"'-2+3"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["\tcmd", `"'\tcmd"`],
    ["\rcmd", `"'\rcmd"`],
    ["Asha \"Didi\" Verma", `"Asha ""Didi"" Verma"`],
    ["a,b\nc", `"a,b\nc"`],
    ["", `""`],
  ])("%j → %s", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("handles null and numbers", () => {
    expect(csvLine([null, 3, undefined, "x"])).toBe(`"","3","","x"`);
    expect(csvCell(-5)).toBe(`"'-5"`);
  });
});

describe("istDayBounds", () => {
  it("uses the Asia/Kolkata calendar day", () => {
    // 2026-10-20 23:00 IST = 17:30 UTC.
    const late = Date.UTC(2026, 9, 20, 17, 30);
    const { start, end } = istDayBounds(late);
    expect(new Date(start).toISOString()).toBe("2026-10-19T18:30:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-10-20T18:30:00.000Z");
    // 2026-10-21 00:30 IST = 2026-10-20 19:00 UTC → the next day.
    expect(new Date(istDayBounds(Date.UTC(2026, 9, 20, 19, 0)).start).toISOString()).toBe("2026-10-20T18:30:00.000Z");
  });
});

describe("attribution cleaners", () => {
  it("keeps only safe paths (decoding %-escapes) and referrer hosts", () => {
    expect(cleanPagePath("/admissions?utm_source=x#top")).toBe("/admissions");
    expect(cleanPagePath("/programs/%E0%A4%A8%E0%A5%80%E0%A4%9F")).toBe("/programs/नीट");
    expect(cleanPagePath("/a%2Fb")).toBe("/a/b");
    expect(cleanPagePath("/%2F%2Fevil.com")).toBeNull();
    expect(cleanPagePath("/%5Cevil")).toBeNull();
    expect(cleanPagePath("/%E0%A4")).toBeNull(); // malformed escape
    expect(cleanPagePath("/%0Aheader")).toBeNull();
    expect(cleanPagePath("/a%20b")).toBeNull();
    expect(cleanPagePath(`/${"a".repeat(200)}`)).toBeNull();
    expect(cleanPagePath(`/${"a".repeat(199)}`)).toHaveLength(200);
    expect(cleanPagePath("//evil.com")).toBeNull();
    expect(cleanPagePath("https://evil.com")).toBeNull();
    expect(cleanPagePath("/a b")).toBeNull();
    expect(cleanReferrer("https://www.google.com/search?q=asha+verma+9876543210")).toBe("www.google.com");
    expect(cleanReferrer("www.google.com")).toBe("www.google.com");
    expect(cleanReferrer("javascript:alert(1)")).toBeNull();
  });
});

describe("stages and permissions", () => {
  it("orders the funnel and puts lost outside it", () => {
    expect(stageOrdinal("new")).toBe(0);
    expect(stageOrdinal("enrolled")).toBe(7);
    expect(stageOrdinal("lost")).toBe(-1);
  });

  it("derives permissions from the CRM role", () => {
    expect(crmPermissions({ role: "counsellor" })).toMatchObject({ canAssign: false, canExport: false, canErase: false, canViewStaff: false });
    expect(crmPermissions({ role: "manager" })).toMatchObject({ canAssign: true, canExport: true, canErase: false, canManageStaff: false });
    // D-044: staff logins, rules and every CRM setting are super-admin only; ordinary admins read.
    expect(crmPermissions({ role: "admin" })).toMatchObject({
      canAssign: true,
      canExport: true,
      canErase: true,
      canManageStaff: false,
      canEditRules: false,
      isSuperAdmin: false,
      canEditSettings: false,
      canImport: false,
      canViewImportHistory: true,
      canManageIntegrations: false,
      canViewSettings: true,
    });
    expect(crmPermissions({ role: "admin", superAdmin: true })).toMatchObject({
      canManageStaff: true,
      canEditRules: true,
      isSuperAdmin: true,
      canEditSettings: true,
      canImport: true,
      canManageIntegrations: true,
      canReassignBulk: true,
    });
    // A "superAdmin" flag on a staff viewer means nothing: only admins can be super admins.
    expect(crmPermissions({ role: "manager", superAdmin: true })).toMatchObject({ isSuperAdmin: false, canEditSettings: false, canReassignBulk: true });
    expect(crmPermissions({ role: "counsellor" })).toMatchObject({ canViewDashboard: false, canViewSettings: false, canSetOwnAvailability: true });
  });
});
