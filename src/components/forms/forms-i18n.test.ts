import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LocaleProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import {
  CLASS_OPTIONS,
  CONSENT_VERSION,
  CONTACT_TOPIC_OPTIONS,
  HERO_CLASS_EXAM_OPTIONS,
  PROGRAM_INTEREST_OPTIONS,
  enquirySchema,
} from "@/lib/contracts/enquiry";
import { EnquiryForm, type EnquiryFormVariant } from "./EnquiryForm";
import { localizeFieldError, localizeFieldErrors } from "./field-errors";
import { formatNodes } from "./format-nodes";
import { HeroEnquiryForm } from "./HeroEnquiryForm";
import { classExamGroups, classOptions, programOptions, topicOptions } from "./option-labels";

const en = messagesFor("en", "forms");
const hi = messagesFor("hi", "forms");
const DEVANAGARI = /[ऀ-ॿ]/;

/** Every field error the contract can produce for these invalid payloads, as `[field, message]`. */
function contractErrors(): [string, string][] {
  const long = "x".repeat(81);
  // Every rendered form sends its consent version (hidden input), so it is not a visible field error.
  const payloads = [
    { source: "admissions", name: "", phone: "1", email: "nope", currentClass: "", programInterest: "", preferredCentre: "Bad", message: "m".repeat(1001), consent: false, consentVersion: CONSENT_VERSION },
    { source: "admissions", name: long, phone: "9876543210", currentClass: "x", programInterest: "x", consent: true, consentVersion: CONSENT_VERSION },
    { source: "contact", name: "ab", phone: "9876543210", topic: "", consent: true, consentVersion: CONSENT_VERSION },
    { source: "hero", name: "ab", classOrExam: "", guardianName: "", phone: "9876543210", consent: true, consentVersion: CONSENT_VERSION },
    { source: "hero", name: "ab", classOrExam: "jee-class-11", guardianName: long, phone: "9876543210", consent: true, consentVersion: CONSENT_VERSION },
  ];
  const out: [string, string][] = [];
  for (const payload of payloads) {
    const result = enquirySchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) continue;
    const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
    for (const [field, messages] of Object.entries(fieldErrors)) out.push([field, messages?.[0] ?? ""]);
  }
  return out;
}

describe("field errors", () => {
  it("English pages show the contract's own wording, Hindi pages a Devanagari message for every field", () => {
    const errors = contractErrors();
    const fields = new Set(errors.map(([field]) => field));
    for (const field of ["name", "phone", "currentClass", "programInterest", "preferredCentre", "message", "consent", "topic", "classOrExam", "guardianName"]) {
      expect(fields.has(field), field).toBe(true);
    }
    for (const [field, message] of errors) {
      // zod's email union reports its own wording; the form shows the contract's email copy instead.
      if (field !== "email") expect(localizeFieldError(field, message, en.shared.errors), field).toBe(message);
      expect(localizeFieldError(field, message, hi.shared.errors), field).toMatch(DEVANAGARI);
    }
  });

  it("distinguishes the too-long messages and keeps keys and order", () => {
    expect(localizeFieldError("name", "Name is too long", hi.shared.errors)).toBe(hi.shared.errors.nameTooLong);
    expect(localizeFieldError("name", "Enter a name (at least 2 characters)", hi.shared.errors)).toBe(hi.shared.errors.name);
    expect(localizeFieldError("guardianName", "Parent or guardian name is too long", hi.shared.errors)).toBe(
      hi.shared.errors.guardianNameTooLong,
    );
    expect(localizeFieldError("website", "anything", hi.shared.errors)).toBe(hi.shared.errors.generic);
    const localized = localizeFieldErrors({ phone: "Bad phone", consent: "x" }, hi.shared.errors);
    expect(Object.keys(localized)).toEqual(["phone", "consent"]);
    expect(localized.phone).toBe(hi.shared.errors.phone);
  });
});

describe("option labels", () => {
  it("label every contract option in both languages, keeping the contract's values", () => {
    for (const t of [en, hi]) {
      expect(classOptions(t.shared.options).map((o) => o.value)).toEqual(CLASS_OPTIONS.map((o) => o.value));
      expect(programOptions(t.shared.options).map((o) => o.value)).toEqual(PROGRAM_INTEREST_OPTIONS.map((o) => o.value));
      expect(topicOptions(t.shared.options).map((o) => o.value)).toEqual(CONTACT_TOPIC_OPTIONS.map((o) => o.value));
      expect(classExamGroups(t.shared.options).flatMap((g) => g.options.map((o) => o.value))).toEqual(
        HERO_CLASS_EXAM_OPTIONS.map((o) => o.value),
      );
    }
    for (const value of [...CLASS_OPTIONS, ...PROGRAM_INTEREST_OPTIONS, ...CONTACT_TOPIC_OPTIONS, ...HERO_CLASS_EXAM_OPTIONS].map((o) => o.value)) {
      const tables = [hi.shared.options.class, hi.shared.options.program, hi.shared.options.topic, hi.shared.options.classExam];
      expect(tables.some((table) => Object.hasOwn(table, value)), value).toBe(true);
    }
  });

  it("matches the contract's English labels exactly", () => {
    expect(classOptions(en.shared.options)).toEqual(CLASS_OPTIONS.map(({ value, label }) => ({ value, label })));
    expect(programOptions(en.shared.options)).toEqual(PROGRAM_INTEREST_OPTIONS.map(({ value, label }) => ({ value, label })));
    expect(topicOptions(en.shared.options)).toEqual(CONTACT_TOPIC_OPTIONS.map(({ value, label }) => ({ value, label })));
    expect(classExamGroups(en.shared.options).map((g) => g.label)).toEqual(["IIT JEE", "NEET", "Foundation", "Not sure yet"]);
  });

  it("uses the scholarship label the Hindi FAQ refers to", () => {
    expect(hi.shared.options.topic.scholarship).toBe("छात्रवृत्ति");
  });
});

describe("formatNodes", () => {
  it("fills element placeholders anywhere in the sentence", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, formatNodes("मैंने {link} पढ़ ली है।", { link: createElement("a", { href: "/hi/privacy" }, "सूचना") })),
    );
    expect(html).toBe('<p>मैंने <a href="/hi/privacy">सूचना</a> पढ़ ली है।</p>');
    expect(renderToStaticMarkup(createElement("p", null, formatNodes("{a} {b}", { a: "x" })))).toBe("<p>x {b}</p>");
  });
});

function inLocale(locale: "en" | "hi", element: ReturnType<typeof createElement>): string {
  // children passed as the third argument (react/no-children-prop); the cast makes them optional for TS.
  const Provider = LocaleProvider as FunctionComponent<{ locale: "en" | "hi"; children?: ReactNode }>;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

describe("rendered forms", () => {
  it.each(["admissions", "contact", "quick"] as EnquiryFormVariant[])("EnquiryForm %s renders Hindi copy and Hindi links", (variant) => {
    const html = inLocale(
      "hi",
      createElement(EnquiryForm, {
        variant,
        messages: hi,
        centreOptions: [{ value: "shimla", label: "शिमला" }],
      }),
    );
    expect(html).toContain(hi.enquiry.submit);
    expect(html).toContain(hi.shared.consentLink);
    expect(html).toContain('href="/hi/privacy"');
    expect(html).not.toContain('href="/privacy"');
    for (const english of ["Send enquiry", "privacy notice", "Fields marked", "(optional)", "Select class"]) {
      expect(html).not.toContain(english);
    }
  });

  it("EnquiryForm defaults to English (backwards compatible)", () => {
    const html = inLocale("en", createElement(EnquiryForm, { variant: "contact" }));
    expect(html).toContain("Send enquiry");
    expect(html).toContain("What can we help with?");
    expect(html).toContain('href="/privacy"');
  });

  it("HeroEnquiryForm renders step 1 in Hindi with Hindi option labels", () => {
    const html = inLocale(
      "hi",
      createElement(HeroEnquiryForm, {
        centreOptions: [{ value: "shimla", label: "शिमला" }],
        deliveryStatus: "not_configured",
        messages: hi,
      }),
    );
    expect(html).toContain(hi.hero.title);
    expect(html).toContain("चरण 1 / 3");
    expect(html).toContain(hi.hero.steps.student.title);
    expect(html).toContain("IIT JEE – कक्षा 11");
    expect(html).toContain('href="/hi/privacy"');
    for (const english of ["Enquire Now", "Student Name", "Next Step", "Privacy notice", "Not sure yet", "Step 1 of 3"]) {
      expect(html).not.toContain(english);
    }
  });
});
