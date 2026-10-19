import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canShowStudentName,
  getCentres,
  getContactDetails,
  getFaculty,
  getFacultySlugs,
  getFeaturedResults,
  getHostelInfo,
  getInstituteProfile,
  getPrograms,
  getRankers,
  getResults,
  getStats,
  getTestimonials,
} from "@/lib/data";

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

describe("demo-import content visibility (D-005)", () => {
  it("shows imported placeholder collections in preview", async () => {
    preview();
    expect((await getResults()).length).toBeGreaterThan(0);
    expect((await getFeaturedResults()).every((r) => r.featured && r.quote)).toBe(true);
    expect((await getRankers()).length).toBeGreaterThan(0);
    expect((await getFaculty()).length).toBeGreaterThan(0);
    expect((await getTestimonials()).length).toBeGreaterThan(0);
    expect((await getStats()).length).toBeGreaterThan(0);
    expect(await getHostelInfo()).not.toBeNull();
    expect(await getInstituteProfile()).not.toBeNull();
    expect(await getContactDetails()).not.toBeNull();
  });

  it("hides every placeholder record in production", async () => {
    production();
    expect(await getResults()).toEqual([]);
    expect(await getFeaturedResults()).toEqual([]);
    expect(await getRankers()).toEqual([]);
    expect(await getFaculty()).toEqual([]);
    expect(await getTestimonials()).toEqual([]);
    expect(await getStats()).toEqual([]);
    expect(await getHostelInfo()).toBeNull();
    expect(await getInstituteProfile()).toBeNull();
    expect(await getContactDetails()).toBeNull();
  });

  it("keeps generateStaticParams helpers non-empty", () => {
    production();
    expect(getFacultySlugs().length).toBeGreaterThan(0);
  });
});

describe("canShowStudentName", () => {
  it("allows granted consent in any mode", () => {
    production();
    expect(canShowStudentName({ consentStatus: "granted", status: "published" })).toBe(true);
  });

  it("allows pending-consent placeholders only while placeholder content is on", () => {
    const record = { consentStatus: "pending", status: "placeholder" } as const;
    preview();
    expect(canShowStudentName(record)).toBe(true);
    production();
    expect(canShowStudentName(record)).toBe(false);
  });

  it("never allows a published record without granted consent", () => {
    preview();
    expect(canShowStudentName({ consentStatus: "pending", status: "published" })).toBe(false);
    expect(canShowStudentName({ consentStatus: "not_required", status: "published" })).toBe(false);
  });
});

describe("filters", () => {
  it("matches dual-track programs by `track` while `exam` stays primary-only", async () => {
    preview();
    const byTrack = await getPrograms({ track: "NEET" });
    const byExam = await getPrograms({ exam: "NEET" });
    expect(byTrack.length).toBeGreaterThan(byExam.length);
    expect(byExam.every((p) => p.exam === "NEET")).toBe(true);
  });

  it("finds a centre by a district it serves", async () => {
    preview();
    expect((await getCentres({ query: "mandi" })).map((c) => c.slug)).toEqual(["kullu"]);
  });
});
