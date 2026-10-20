import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  HERO_CLASS_EXAM_OPTIONS,
  HERO_STEP_FIELDS,
  enquirySchema,
  heroStepOfField,
  validateHeroStep,
} from "@/lib/contracts/enquiry";
import { buildHeroPayload } from "./enquiry-payload";
import {
  HERO_CLASS_EXAM_GROUPS,
  HERO_FIELD_ORDER,
  HERO_STEPS,
  HERO_STEP_COUNT,
  LAST_HERO_STEP,
  firstHeroError,
  heroStepLabel,
  nextHeroStep,
  pickHeroErrors,
  previousHeroStep,
  withStepErrors,
} from "./hero-steps";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** Every field of all three steps, as the mounted form would submit them. */
const complete = {
  name: "  Test Student ",
  classOrExam: "neet-class-12",
  guardianName: "Parent Name",
  phone: "98765 43210",
  preferredCentre: "not-sure",
  message: "  Hostel question ",
  consent: "on",
  website: "",
};

describe("hero steps", () => {
  it("has three steps with the design-details titles (D-021a)", () => {
    expect(HERO_STEP_COUNT).toBe(3);
    expect(LAST_HERO_STEP).toBe(2);
    expect(HERO_STEPS.map((s) => s.title)).toEqual(["Student Information", "Contact Details", "Preferences"]);
    expect(HERO_STEPS[0].description).toBe("Tell us a bit about the student.");
    expect(heroStepLabel(0)).toBe("Step 1 of 3");
    expect(heroStepLabel(2)).toBe("Step 3 of 3");
  });

  it("moves forward and back without leaving the 0–2 range", () => {
    expect(nextHeroStep(0)).toBe(1);
    expect(nextHeroStep(1)).toBe(2);
    expect(nextHeroStep(2)).toBe(2);
    expect(previousHeroStep(2)).toBe(1);
    expect(previousHeroStep(1)).toBe(0);
    expect(previousHeroStep(0)).toBe(0);
  });

  it("orders fields exactly as the contract's steps and maps each back to its step", () => {
    expect(HERO_FIELD_ORDER).toEqual([
      "name",
      "classOrExam",
      "guardianName",
      "phone",
      "email",
      "preferredCentre",
      "message",
      "consent",
    ]);
    HERO_STEP_FIELDS.forEach((fields, step) => {
      for (const field of fields) expect(heroStepOfField(field)).toBe(step);
    });
    expect(heroStepOfField("website")).toBeNull();
    expect(heroStepOfField("source")).toBeNull();
  });
});

describe("class / target exam options", () => {
  it("groups all contract options for <optgroup>s, in contract order", () => {
    expect(HERO_CLASS_EXAM_GROUPS.map((g) => g.label)).toEqual(["IIT JEE", "NEET", "Foundation", "Not sure yet"]);
    const flattened = HERO_CLASS_EXAM_GROUPS.flatMap((g) => g.options);
    expect(flattened).toEqual(HERO_CLASS_EXAM_OPTIONS.map(({ value, label }) => ({ value, label })));
    expect(flattened).toHaveLength(12);
  });

  it("uses option labels that stand alone (exam and class in every label)", () => {
    for (const group of HERO_CLASS_EXAM_GROUPS) {
      for (const option of group.options) {
        expect(option.label.startsWith(group.label)).toBe(true);
        expect(option.label).toMatch(/Class|Dropper/);
      }
    }
  });
});

describe("buildHeroPayload", () => {
  it("sends required fields as empty strings and omits blank optional ones", () => {
    const payload = buildHeroPayload(formData({ guardianName: "  ", message: " " }), true);
    expect(payload).toEqual({
      source: "hero",
      name: "",
      classOrExam: "",
      guardianName: "",
      phone: "",
      preferredCentre: undefined,
      message: undefined,
      consent: false,
      website: "",
    });
    // What is actually POSTed: undefined keys disappear, required keys stay as "".
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      source: "hero",
      name: "",
      classOrExam: "",
      guardianName: "",
      phone: "",
      consent: false,
      website: "",
    });
  });

  it("never sends an email (the hero form has no email field, D-021a)", () => {
    const payload = buildHeroPayload(formData({ ...complete, email: "parent@example.com" }), true);
    expect("email" in payload).toBe(false);
  });

  it("keeps the raw classOrExam value (the server maps it) and trims text", () => {
    const payload = buildHeroPayload(formData(complete), true);
    expect(payload).toMatchObject({
      source: "hero",
      name: "Test Student",
      classOrExam: "neet-class-12",
      guardianName: "Parent Name",
      phone: "98765 43210",
      preferredCentre: "not-sure",
      message: "Hostel question",
      consent: true,
    });
    expect("currentClass" in payload).toBe(false);
    expect("programInterest" in payload).toBe(false);
    expect("intent" in payload).toBe(false);
  });

  it("is a valid hero enquiry that the contract maps to class + program", () => {
    const parsed = enquirySchema.safeParse(buildHeroPayload(formData(complete), true));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({ source: "hero", currentClass: "class-12", programInterest: "neet" });
  });

  it("ignores the centre when the centre select is not rendered", () => {
    const payload = buildHeroPayload(formData({ ...complete, preferredCentre: "shimla" }), false);
    expect(payload.preferredCentre).toBeUndefined();
    expect(enquirySchema.safeParse(payload).success).toBe(true);
  });

  it("forwards a filled honeypot untouched", () => {
    expect(buildHeroPayload(formData({ ...complete, website: "spam" }), true).website).toBe("spam");
  });
});

describe("step validation and error routing", () => {
  it("validates only the current step", () => {
    const blank = buildHeroPayload(formData({}), true);
    expect(Object.keys(pickHeroErrors(validateHeroStep(0, blank)))).toEqual(["name", "classOrExam"]);
    expect(Object.keys(pickHeroErrors(validateHeroStep(1, blank)))).toEqual(["guardianName", "phone"]);
    expect(Object.keys(pickHeroErrors(validateHeroStep(2, blank)))).toEqual(["consent"]);

    const stepOneOnly = buildHeroPayload(formData({ name: "Asha", classOrExam: "foundation-class-9" }), true);
    expect(validateHeroStep(0, stepOneOnly)).toBeNull();
  });

  it("requires the parent / guardian name on step 2 (D-021a)", () => {
    const tooShort = buildHeroPayload(formData({ guardianName: "A", phone: "9876543210" }), true);
    expect(pickHeroErrors(validateHeroStep(1, tooShort))).toEqual({
      guardianName: "Enter the parent or guardian's name",
    });
    const ok = buildHeroPayload(formData({ guardianName: "Parent Name", phone: "9876543210" }), true);
    expect(validateHeroStep(1, ok)).toBeNull();
  });

  it("keeps the first message per field and drops keys no step renders", () => {
    expect(
      pickHeroErrors({ source: ["bad"], website: ["bad"], other: ["x"], phone: ["First", "Second"] }),
    ).toEqual({ phone: "First" });
    expect(pickHeroErrors(null)).toEqual({});
    expect(pickHeroErrors(undefined)).toEqual({});
  });

  it("routes the first error (display order) to its step", () => {
    expect(firstHeroError({ consent: "x", phone: "y" })).toEqual({ field: "phone", step: 1 });
    expect(firstHeroError({ message: "x" })).toEqual({ field: "message", step: 2 });
    expect(firstHeroError({ classOrExam: "x", consent: "y" })).toEqual({ field: "classOrExam", step: 0 });
    expect(firstHeroError({})).toBeNull();
  });

  it("routes full-schema errors on submit back to the earliest broken step", () => {
    const payload = buildHeroPayload(formData({ ...complete, phone: "123" }), true);
    const result = enquirySchema.safeParse({ ...payload, consent: false });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = pickHeroErrors(z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>);
    expect(Object.keys(errors)).toEqual(["phone", "consent"]);
    expect(firstHeroError(errors)).toEqual({ field: "phone", step: 1 });
  });

  it("routes a server 422 the same way", () => {
    const errors = pickHeroErrors({ preferredCentre: ["Select a centre from the list"], website: ["x"] });
    expect(firstHeroError(errors)).toEqual({ field: "preferredCentre", step: 2 });
  });

  it("replaces one step's errors and keeps the others", () => {
    const current = { name: "a", phone: "b", consent: "c" };
    expect(withStepErrors(current, 1, {})).toEqual({ name: "a", consent: "c" });
    expect(withStepErrors(current, 0, { classOrExam: "d" })).toEqual({ classOrExam: "d", phone: "b", consent: "c" });
    // A step can only set its own fields.
    expect(withStepErrors({}, 0, { phone: "x" })).toEqual({});
  });
});
