import { describe, expect, it } from "vitest";

import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { CONSENT_VERSION, CONSENT_VERSIONS } from "@/lib/contracts/enquiry";

import { CONSENT_TEXTS, consentLocale, consentRecord } from "./enquiry-consent";

describe("consent texts (D-039)", () => {
  it.each(["en", "hi"] as const)(
    "%s: the sentence the forms show now is exactly the stored text of CONSENT_VERSION (change the wording → new version)",
    (locale) => {
      const t = messagesFor(locale, "forms").shared;
      expect(format(t.consent, { link: t.consentLink })).toBe(CONSENT_TEXTS[CONSENT_VERSION][locale]);
    },
  );

  it("has a text in both languages for every accepted version", () => {
    for (const version of CONSENT_VERSIONS) {
      expect(CONSENT_TEXTS[version].en.trim()).not.toBe("");
      expect(CONSENT_TEXTS[version].hi).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("asks the submitter to confirm they are the parent/guardian or have permission, and to agree to contact", () => {
    const en = CONSENT_TEXTS[CONSENT_VERSION].en;
    expect(en).toMatch(/parent or guardian/);
    expect(en).toMatch(/permission/);
    expect(en).toMatch(/contact me about this enquiry/);
  });

  it("picks the language from the context locale, else the /hi page prefix, else English", () => {
    expect(consentLocale(undefined)).toBe("en");
    expect(consentLocale({ locale: "hi" })).toBe("hi");
    expect(consentLocale({ page: "/hi/admissions" })).toBe("hi");
    expect(consentLocale({ page: "/hi" })).toBe("hi");
    expect(consentLocale({ page: "/history" })).toBe("en");
    expect(consentLocale({ locale: "en", page: "/hi" })).toBe("en");
  });

  it("builds the stored record with version, language, text and time", () => {
    expect(consentRecord(CONSENT_VERSION, { locale: "hi" }, new Date("2026-10-20T10:00:00Z"))).toEqual({
      version: CONSENT_VERSION,
      locale: "hi",
      text: CONSENT_TEXTS[CONSENT_VERSION].hi,
      givenAt: "2026-10-20T10:00:00.000Z",
    });
  });
});
