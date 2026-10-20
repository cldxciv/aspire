import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CLASS_OPTIONS,
  HERO_CLASS_EXAM_OPTIONS,
  HERO_STEP_FIELDS,
  HERO_STEP_SCHEMAS,
  PROGRAM_INTEREST_OPTIONS,
  enquirySchema,
  heroClassExamOption,
  heroContactStepSchema,
  heroDetailsStepSchema,
  heroEnquirySchema,
  heroStepOfField,
  heroStudentStepSchema,
  phoneSchema,
  validateHeroStep,
  type HeroStepIndex,
} from "./enquiry";

const base = { name: "Test Student", phone: "9876543210", consent: true };
const quick = { ...base, source: "quick", currentClass: "class-11", programInterest: "jee" };
const admissions = {
  ...base,
  source: "admissions",
  currentClass: "class-12",
  programInterest: "neet",
  email: "parent@example.com",
  preferredCentre: "shimla",
  message: "Interested in weekend batches.",
};
const contact = { ...base, source: "contact", topic: "admissions", message: "Please call back." };

function fieldErrors(input: unknown): Record<string, string[] | undefined> {
  const result = enquirySchema.safeParse(input);
  if (result.success) return {};
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
}

describe("enquirySchema — valid payloads per source", () => {
  it("accepts a quick enquiry and defaults intent to 'enquiry'", () => {
    const result = enquirySchema.safeParse(quick);
    expect(result.success).toBe(true);
    if (result.success && result.data.source === "quick") expect(result.data.intent).toBe("enquiry");
  });

  it("accepts a quick scholarship enquiry", () => {
    const result = enquirySchema.safeParse({ ...quick, intent: "scholarship" });
    expect(result.success).toBe(true);
  });

  it("accepts an admissions enquiry with optional fields", () => {
    expect(enquirySchema.safeParse(admissions).success).toBe(true);
  });

  it("accepts an admissions enquiry without optional fields", () => {
    const { email: _email, preferredCentre: _centre, message: _message, ...minimal } = admissions;
    void _email;
    void _centre;
    void _message;
    expect(enquirySchema.safeParse(minimal).success).toBe(true);
  });

  it("accepts a contact enquiry", () => {
    expect(enquirySchema.safeParse(contact).success).toBe(true);
  });

  it("accepts an empty email string", () => {
    expect(enquirySchema.safeParse({ ...contact, email: "" }).success).toBe(true);
  });

  it("strips unknown keys", () => {
    const result = enquirySchema.safeParse({ ...contact, role: "admin" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("role");
  });
});

describe("enquirySchema — phone formats", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["919876543210", "919876543210"],
    ["09876543210", "09876543210"],
    ["  6123456789  ", "6123456789"],
  ])("accepts %j", (input, normalised) => {
    const result = phoneSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(normalised);
  });

  it.each(["12345", "5876543210", "98765432101", "+1 202 555 0123", "98765abcde", ""])("rejects %j", (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });

  it("reports phone errors on the phone field for every source", () => {
    for (const payload of [quick, admissions, contact]) {
      expect(fieldErrors({ ...payload, phone: "12345" }).phone).toEqual(["Enter a valid 10-digit mobile number"]);
    }
  });
});

describe("enquirySchema — consent", () => {
  it.each([quick, admissions, contact])("requires consent ($source)", (payload) => {
    const { consent: _consent, ...withoutConsent } = payload;
    void _consent;
    expect(fieldErrors(withoutConsent).consent?.length).toBeGreaterThan(0);
  });

  it("rejects consent: false", () => {
    expect(fieldErrors({ ...quick, consent: false }).consent).toEqual([
      "Please confirm you agree to be contacted about this enquiry",
    ]);
  });

  it("rejects consent: 'true' (string)", () => {
    expect(fieldErrors({ ...quick, consent: "true" }).consent?.length).toBeGreaterThan(0);
  });
});

describe("enquirySchema — other field errors", () => {
  it("rejects a malformed email", () => {
    expect(fieldErrors({ ...admissions, email: "not-an-email" }).email).toEqual(["Enter a valid email address"]);
  });

  it("rejects a too-short name", () => {
    expect(fieldErrors({ ...contact, name: " A " }).name).toEqual(["Enter a name (at least 2 characters)"]);
  });

  it("rejects a message over 1000 characters", () => {
    expect(fieldErrors({ ...contact, message: "x".repeat(1001) }).message).toEqual([
      "Message must be 1000 characters or fewer",
    ]);
  });

  it("rejects an unknown class and program for quick", () => {
    const errors = fieldErrors({ ...quick, currentClass: "class-5", programInterest: "mba" });
    expect(errors.currentClass).toEqual(["Select the current class"]);
    expect(errors.programInterest).toEqual(["Select a program"]);
  });

  it("rejects a contact enquiry without a topic", () => {
    const { topic: _topic, ...withoutTopic } = contact;
    void _topic;
    expect(fieldErrors(withoutTopic).topic).toEqual(["Select a topic"]);
  });

  it("rejects an unknown source on the source field", () => {
    expect(fieldErrors({ ...contact, source: "portal" }).source?.length).toBeGreaterThan(0);
  });
});

// ── hero: 3-step home page form (D-021) ──────────────────────────────────────

const hero = {
  ...base,
  source: "hero",
  classOrExam: "neet-dropper",
  guardianName: "Test Parent",
  email: "parent@example.com",
  preferredCentre: "shimla",
  message: "Evening batches?",
};
const minimalHero = { ...base, source: "hero", classOrExam: "foundation-class-9", guardianName: "Test Parent" };

const GUARDIAN_ERROR = "Enter the parent or guardian's name";
const CLASS_OR_EXAM_ERROR = "Select a class / target exam";

function parse(input: unknown) {
  const result = enquirySchema.safeParse(input);
  if (!result.success) throw new Error(`expected a valid enquiry: ${JSON.stringify(z.flattenError(result.error))}`);
  return result.data as Record<string, unknown>;
}

describe("enquirySchema — hero", () => {
  it("accepts a full hero enquiry and maps classOrExam to currentClass + programInterest", () => {
    expect(parse(hero)).toEqual({
      source: "hero",
      name: "Test Student",
      guardianName: "Test Parent",
      phone: "9876543210",
      email: "parent@example.com",
      preferredCentre: "shimla",
      message: "Evening batches?",
      consent: true,
      currentClass: "dropper",
      programInterest: "neet",
    });
  });

  it("accepts a hero enquiry without the optional fields (email, preferredCentre, message)", () => {
    const data = parse(minimalHero);
    expect(data).toMatchObject({
      source: "hero",
      guardianName: "Test Parent",
      currentClass: "class-9",
      programInterest: "foundation",
    });
    for (const key of ["email", "preferredCentre", "message", "classOrExam"]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it.each(HERO_CLASS_EXAM_OPTIONS)("maps $value to $currentClass + $programInterest", (option) => {
    const data = parse({ ...minimalHero, classOrExam: option.value });
    expect(data.currentClass).toBe(option.currentClass);
    expect(data.programInterest).toBe(option.programInterest);
    expect(data).not.toHaveProperty("classOrExam");
  });

  it("ignores currentClass / programInterest sent by the client (the pair always comes from classOrExam)", () => {
    const data = parse({ ...hero, currentClass: "class-6-8", programInterest: "jee" });
    expect(data).toMatchObject({ currentClass: "dropper", programInterest: "neet" });
  });

  it.each(["neet-class-6-8", "", "jee", "class-11", undefined])("rejects classOrExam %j", (classOrExam) => {
    expect(fieldErrors({ ...hero, classOrExam }).classOrExam).toEqual([CLASS_OR_EXAM_ERROR]);
  });

  it("drops intent: the hero form has no Enquiry/Scholarship choice", () => {
    expect(parse({ ...hero, intent: "scholarship" })).not.toHaveProperty("intent");
  });

  it.each([undefined, "", "   ", "A", "  A ", null, 42])("requires the guardian name: rejects %j", (guardianName) => {
    expect(fieldErrors({ ...hero, guardianName }).guardianName).toEqual([GUARDIAN_ERROR]);
  });

  it("trims the guardian name", () => {
    expect(parse({ ...hero, guardianName: "  Asha Devi " }).guardianName).toBe("Asha Devi");
  });

  it("accepts an 80-character guardian name", () => {
    expect(parse({ ...hero, guardianName: "x".repeat(80) }).guardianName).toHaveLength(80);
  });

  it("rejects a guardian name over 80 characters", () => {
    expect(fieldErrors({ ...hero, guardianName: "x".repeat(81) }).guardianName).toEqual([
      "Parent or guardian name is too long",
    ]);
  });

  it.each(["", "not-sure", "shimla", "new-centre-2"])("accepts preferredCentre %j (membership is checked by the server)", (preferredCentre) => {
    expect(enquirySchema.safeParse({ ...hero, preferredCentre }).success).toBe(true);
  });

  it("rejects a free-text preferredCentre", () => {
    expect(fieldErrors({ ...hero, preferredCentre: "Near the bus stand" }).preferredCentre).toEqual([
      "Select a centre from the list",
    ]);
  });

  it("reports phone, email and consent errors on their own fields with the shared messages", () => {
    const errors = fieldErrors({ ...hero, phone: "12345", email: "nope", consent: false });
    expect(errors.phone).toEqual(["Enter a valid 10-digit mobile number"]);
    expect(errors.email).toEqual(["Enter a valid email address"]);
    expect(errors.consent).toEqual(["Please confirm you agree to be contacted about this enquiry"]);
  });

  it("strips unknown keys", () => {
    const data = parse({ ...hero, guardianPhone: "9876543210", role: "admin" });
    expect(data).not.toHaveProperty("guardianPhone");
    expect(data).not.toHaveProperty("role");
  });

  it("leaves quick unchanged: hero-only fields sent with source 'quick' are stripped", () => {
    const data = parse({ ...quick, guardianName: "Test Parent", classOrExam: "jee-class-11", preferredCentre: "shimla" });
    expect(data).toEqual({
      source: "quick",
      name: "Test Student",
      phone: "9876543210",
      consent: true,
      currentClass: "class-11",
      programInterest: "jee",
      intent: "enquiry",
    });
  });
});

describe("HERO_CLASS_EXAM_OPTIONS", () => {
  it("has 12 unique values and 12 unique (class, program) pairs", () => {
    expect(HERO_CLASS_EXAM_OPTIONS).toHaveLength(12);
    expect(new Set(HERO_CLASS_EXAM_OPTIONS.map((o) => o.value)).size).toBe(12);
    expect(new Set(HERO_CLASS_EXAM_OPTIONS.map((o) => `${o.currentClass}|${o.programInterest}`)).size).toBe(12);
  });

  it("only uses existing class and program values, and each value is `${programInterest}-${currentClass}`", () => {
    const classes = new Set<string>(CLASS_OPTIONS.map((o) => o.value));
    const programs = new Set<string>(PROGRAM_INTEREST_OPTIONS.map((o) => o.value));
    for (const option of HERO_CLASS_EXAM_OPTIONS) {
      expect(classes.has(option.currentClass)).toBe(true);
      expect(programs.has(option.programInterest)).toBe(true);
      expect(option.value).toBe(`${option.programInterest}-${option.currentClass}`);
      expect(option.label.trim()).not.toBe("");
    }
  });

  it("lists groups contiguously in display order (one <optgroup> each)", () => {
    const groups = HERO_CLASS_EXAM_OPTIONS.map((o) => o.group).filter((g, i, all) => g !== all[i - 1]);
    expect(groups).toEqual(["IIT JEE", "NEET", "Foundation", "Not sure yet"]);
  });

  it("heroClassExamOption returns the option for a value", () => {
    expect(heroClassExamOption("jee-class-12")).toMatchObject({ currentClass: "class-12", programInterest: "jee" });
  });
});

describe("hero step schemas", () => {
  it("exposes the steps and their fields in display order", () => {
    expect(HERO_STEP_SCHEMAS).toHaveLength(3);
    expect(HERO_STEP_SCHEMAS[0]).toBe(heroStudentStepSchema);
    expect(HERO_STEP_SCHEMAS[1]).toBe(heroContactStepSchema);
    expect(HERO_STEP_SCHEMAS[2]).toBe(heroDetailsStepSchema);
    expect(HERO_STEP_FIELDS).toEqual([
      ["name", "classOrExam"],
      ["guardianName", "phone", "email"],
      ["preferredCentre", "message", "consent"],
    ]);
  });

  it("partitions the hero variant's fields: every field is in exactly one step, plus source and the honeypot", () => {
    const stepFields: string[] = HERO_STEP_FIELDS.flat();
    expect(new Set(stepFields).size).toBe(stepFields.length);
    expect([...stepFields, "source", "website"].sort()).toEqual(Object.keys(heroEnquirySchema.in.shape).sort());
  });

  it("validates each step against the whole payload, ignoring the other steps' fields", () => {
    for (const step of [0, 1, 2] as const) expect(validateHeroStep(step, hero)).toBeNull();
    expect(heroStudentStepSchema.parse(hero)).toEqual({ name: "Test Student", classOrExam: "neet-dropper" });
  });

  it("step 1: name and class / target exam", () => {
    expect(validateHeroStep(0, { name: "", classOrExam: "" })).toEqual({
      name: ["Enter a name (at least 2 characters)"],
      classOrExam: [CLASS_OR_EXAM_ERROR],
    });
  });

  it("step 2: guardian name and phone required, email optional (not rendered by the hero UI)", () => {
    expect(validateHeroStep(1, { guardianName: "Test Parent", phone: "9876543210" })).toBeNull();
    expect(validateHeroStep(1, { phone: "9876543210" })).toEqual({ guardianName: [GUARDIAN_ERROR] });
    expect(validateHeroStep(1, { guardianName: "  ", phone: "" })).toEqual({
      guardianName: [GUARDIAN_ERROR],
      phone: ["Enter a valid 10-digit mobile number"],
    });
    expect(validateHeroStep(1, { guardianName: "A", phone: "123", email: "nope" })).toEqual({
      guardianName: [GUARDIAN_ERROR],
      phone: ["Enter a valid 10-digit mobile number"],
      email: ["Enter a valid email address"],
    });
  });

  it("step 3: preferred centre, message and consent", () => {
    expect(validateHeroStep(2, { consent: true })).toBeNull();
    expect(validateHeroStep(2, { preferredCentre: "Mall Road", message: "x".repeat(1001), consent: false })).toEqual({
      preferredCentre: ["Select a centre from the list"],
      message: ["Message must be 1000 characters or fewer"],
      consent: ["Please confirm you agree to be contacted about this enquiry"],
    });
  });

  it.each([
    { source: "hero" },
    { ...hero, name: "", phone: "1" },
    { ...hero, guardianName: "" },
    { ...hero, classOrExam: "neet-class-6-8", guardianName: "A", consent: false },
    { ...hero, email: "nope", preferredCentre: "Mall Road", message: "x".repeat(1001) },
  ])("full-schema errors equal the merged step errors (no drift) — case %#", (payload) => {
    const merged = Object.assign({}, ...([0, 1, 2] as HeroStepIndex[]).map((step) => validateHeroStep(step, payload) ?? {}));
    expect(fieldErrors(payload)).toEqual(merged);
  });

  it("heroStepOfField maps fields to their step", () => {
    expect(heroStepOfField("name")).toBe(0);
    expect(heroStepOfField("classOrExam")).toBe(0);
    expect(heroStepOfField("guardianName")).toBe(1);
    expect(heroStepOfField("phone")).toBe(1);
    expect(heroStepOfField("email")).toBe(1);
    expect(heroStepOfField("preferredCentre")).toBe(2);
    expect(heroStepOfField("message")).toBe(2);
    expect(heroStepOfField("consent")).toBe(2);
    for (const field of ["source", "website", "topic", "currentClass", "intent"]) expect(heroStepOfField(field)).toBeNull();
  });
});
