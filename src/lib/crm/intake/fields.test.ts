import { describe, expect, it } from "vitest";

import { IMPORT_TARGETS as LEAD_OPS_TARGETS } from "../lead-ops-types";
import {
  cleanPhoneInput,
  guessTarget,
  guessTargets,
  IMPORT_TARGETS,
  isImportTarget,
  joinAnswers,
  matchCentre,
  normaliseClass,
  normaliseHeader,
  normaliseProgram,
  normaliseSubmittedBy,
  parseBooleanAnswer,
  parseMetaLeadId,
  parseMetaObjectId,
  parseMetaTime,
  platformCode,
  utmSourceForPlatform,
} from "./fields";
import { guessImportTarget, IMPORT_TARGETS as ROWS_TARGETS } from "./rows";

// Shared header synonyms and normalisers (LR-CORE, docs/lead-routing-plan.md §17 step 3–4, §18.3).
// Synthetic values only.

describe("field targets and header guesses", () => {
  it("is the same target list everywhere (CORE contract, IMPORT's rows.ts)", () => {
    expect(IMPORT_TARGETS).toEqual(LEAD_OPS_TARGETS);
    expect([...ROWS_TARGETS]).toEqual([...IMPORT_TARGETS]);
    expect(isImportTarget("phone")).toBe(true);
    expect(isImportTarget("password")).toBe(false);
  });

  it("normalises headers in any script", () => {
    expect(normaliseHeader("  Phone Number? ")).toBe("phone_number");
    expect(normaliseHeader("PHONE-NUMBER")).toBe("phone_number");
    expect(normaliseHeader("आपका जिला")).toBe("आपका_जिला");
  });

  it("guesses Meta Leads Center columns and form questions", () => {
    const cases: [string, string][] = [
      ["id", "metaLeadId"],
      ["created_time", "createdTime"],
      ["form_id", "formId"],
      ["form_name", "formName"],
      ["ad_name", "adName"],
      ["adset_name", "adsetName"],
      ["campaign_name", "campaignName"],
      ["platform", "platform"],
      ["is_organic", "isOrganic"],
      ["full_name", "contactName"],
      ["phone_number", "phone"],
      ["email", "email"],
      ["city", "district"],
      ["Which district do you live in?", "district"],
      ["state", "state"],
      ["I am the: parent/guardian · student", "submittedBy"],
      ["Student's name", "studentName"],
      ["Parent / guardian name", "guardianName"],
      ["Which class are you in?", "currentClass"],
      ["Which exam are you preparing for?", "programInterest"],
      ["Preferred centre", "centre"],
      ["I agree that Aspire may contact me", "consentChecked"],
      ["adset_id", "ignore"],
      ["", "ignore"],
      ["What time suits you for a call?", "answer"],
    ];
    for (const [header, target] of cases) expect(guessTarget(header), header).toBe(target);
  });

  it("agrees with the import's own guesses on every header above (one rule for CSV and Meta)", () => {
    for (const header of ["id", "full_name", "phone_number", "city", "Which district do you live in?", "Student's name", "consent", "What time suits you?"]) {
      expect(guessTarget(header), header).toBe(guessImportTarget(header));
    }
  });

  it("uses each field target once: a second column with it becomes an answer", () => {
    expect(guessTargets(["phone_number", "mobile", "full_name"])).toEqual(["phone", "answer", "contactName"]);
  });
});

describe("value normalisers", () => {
  it("reads a Meta lead id strictly and never repairs one (A3)", () => {
    expect(parseMetaLeadId("123456789012345")).toBe("123456789012345");
    expect(parseMetaLeadId(" l:12345678901234567 ")).toBe("12345678901234567");
    expect(parseMetaLeadId("1234567890123")).toBeNull();
    expect(parseMetaLeadId("123456789012345678")).toBeNull();
    expect(parseMetaLeadId("1.23457E+15")).toBeNull();
    expect(parseMetaLeadId("123-456-789012345")).toBeNull();
    expect(parseMetaLeadId(12345678901234567)).toBeNull();
    expect(parseMetaObjectId("f:987654321")).toBe("987654321");
    expect(parseMetaObjectId("ag:12x")).toBeNull();
  });

  it("takes the p: prefix off a phone and reads Meta's created_time", () => {
    expect(cleanPhoneInput("p:+916000012345")).toBe("+916000012345");
    expect(cleanPhoneInput("  ")).toBeNull();
    expect(parseMetaTime("2026-10-21T04:45:30+0000")).toBe("2026-10-21T04:45:30.000Z");
    expect(parseMetaTime("2026-10-21 10:15")).toBe("2026-10-21T04:45:00.000Z");
    expect(parseMetaTime("2062-01-01T00:00:00Z")).toBe("2062-01-01T00:00:00.000Z");
    expect(parseMetaTime("1999-01-01T00:00:00Z")).toBeNull();
    expect(parseMetaTime("yesterday")).toBeNull();
  });

  it("normalises class, programme and who filled the form", () => {
    expect(normaliseClass("Class 11th")).toBe("class-11");
    expect(normaliseClass("XII")).toBe("class-12");
    expect(normaliseClass("7")).toBe("class-6-8");
    expect(normaliseClass("12th pass")).toBe("dropper");
    expect(normaliseClass("college")).toBeNull();
    expect(normaliseProgram("IIT-JEE")).toBe("jee");
    expect(normaliseProgram("Medical (NEET)")).toBe("neet");
    expect(normaliseProgram("JEE or NEET")).toBeNull();
    expect(normaliseProgram("पता नहीं")).toBe("not-sure");
    expect(normaliseSubmittedBy("Parent / guardian")).toBe("parent");
    expect(normaliseSubmittedBy("Student")).toBe("student");
    expect(normaliseSubmittedBy("both")).toBeNull();
  });

  it("matches centres by slug, name or a common spelling; reads yes / no answers", () => {
    const centres = [
      { slug: "dharamshala", names: ["Dharamshala Centre", "धर्मशाला केंद्र"] },
      { slug: "kullu", names: ["Kullu Centre"] },
    ];
    expect(matchCentre("Dharamsala", centres)).toBe("dharamshala");
    expect(matchCentre("धर्मशाला केंद्र", centres)).toBe("dharamshala");
    expect(matchCentre("Kulu", centres)).toBe("kullu");
    expect(matchCentre("not sure", centres)).toBeNull();
    expect(parseBooleanAnswer("Yes")).toBe(true);
    expect(parseBooleanAnswer("हाँ")).toBe(true);
    expect(parseBooleanAnswer("no")).toBe(false);
    expect(parseBooleanAnswer("maybe")).toBeNull();
    expect(parseBooleanAnswer(true)).toBe(true);
  });

  it("maps Meta's platform to the utm source (§18.3)", () => {
    expect(platformCode("Facebook")).toBe("fb");
    expect(platformCode("ig")).toBe("ig");
    expect(utmSourceForPlatform("fb")).toBe("facebook");
    expect(utmSourceForPlatform("instagram")).toBe("instagram");
    expect(utmSourceForPlatform("messenger")).toBe("meta");
    expect(utmSourceForPlatform(null)).toBe("meta");
  });

  it("joins unmapped answers into one bounded text", () => {
    expect(joinAnswers([{ label: "Best time to call", value: " after  6 pm " }, { label: "Empty", value: "  " }])).toBe("Best time to call: after 6 pm");
    expect(joinAnswers([])).toBeNull();
    const long = joinAnswers([{ label: "Q", value: "x".repeat(2000) }], 1000);
    expect(long?.length).toBe(1000);
  });
});
