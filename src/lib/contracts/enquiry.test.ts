import { describe, expect, it } from "vitest";
import { z } from "zod";

import { enquirySchema, phoneSchema } from "./enquiry";

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
