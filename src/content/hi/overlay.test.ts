import { describe, expect, it } from "vitest";

import type { Program, Testimonial } from "@/lib/types";
import { mergeKeyedList, mergeOverlay, type OverlayMap, type TextOverlay } from "./overlay";

interface Sample {
  id: string;
  slug: string;
  status: "published" | "placeholder";
  title: string;
  subtitle?: string;
  count: number;
  open: boolean;
  tags: string[];
  items: { name: string; detail?: string; centreSlug: string }[];
}

const base = (): Sample => ({
  id: "s-1",
  slug: "sample",
  status: "placeholder",
  title: "Title",
  subtitle: "Subtitle",
  count: 35,
  open: true,
  tags: ["one", "two", "three"],
  items: [
    { name: "First", detail: "First detail", centreSlug: "shimla" },
    { name: "Second", centreSlug: "kullu" },
  ],
});

describe("mergeOverlay", () => {
  it("replaces text fields and falls back to English field by field", () => {
    const merged = mergeOverlay(base(), { title: "शीर्षक" } satisfies TextOverlay<Sample>);
    expect(merged.title).toBe("शीर्षक");
    expect(merged.subtitle).toBe("Subtitle");
    expect(merged.tags).toEqual(["one", "two", "three"]);
  });

  it("treats empty or blank strings as missing", () => {
    const merged = mergeOverlay(base(), { title: "", subtitle: "   " } satisfies TextOverlay<Sample>);
    expect(merged.title).toBe("Title");
    expect(merged.subtitle).toBe("Subtitle");
  });

  it("merges arrays index by index and keeps the English length", () => {
    const shorter = mergeOverlay(base(), { tags: ["एक", undefined] } satisfies TextOverlay<Sample>);
    expect(shorter.tags).toEqual(["एक", "two", "three"]);
    const longer = mergeOverlay(base(), { tags: ["एक", "दो", "तीन", "चार"] } satisfies TextOverlay<Sample>);
    expect(longer.tags).toEqual(["एक", "दो", "तीन"]);
    const nested = mergeOverlay(base(), { items: [{ detail: "विवरण" }, { name: "दूसरा" }] } satisfies TextOverlay<Sample>);
    expect(nested.items).toEqual([
      { name: "First", detail: "विवरण", centreSlug: "shimla" },
      { name: "दूसरा", centreSlug: "kullu" },
    ]);
  });

  it("never changes protected keys, numbers, booleans or adds fields at runtime", () => {
    const sneaky = {
      id: "x",
      slug: "x",
      status: "published",
      count: 99,
      open: false,
      extra: "added",
      items: [{ centreSlug: "x" }],
    };
    const merged = mergeOverlay(base(), sneaky);
    expect(merged).toEqual(base());
    expect(merged).not.toHaveProperty("extra");
  });

  it("does not fill optional fields the English record lacks", () => {
    const record: Sample = base();
    delete record.subtitle;
    expect(mergeOverlay(record, { subtitle: "उपशीर्षक" })).not.toHaveProperty("subtitle");
  });

  it("returns the base untouched without an overlay and never mutates it", () => {
    const record = base();
    const snapshot = structuredClone(record);
    expect(mergeOverlay(record, undefined)).toBe(record);
    mergeOverlay(record, { title: "शीर्षक", tags: ["एक"], items: [{ name: "पहला" }] });
    expect(record).toEqual(snapshot);
  });
});

describe("mergeKeyedList", () => {
  it("matches overlays by key, so filtering before localising is safe", () => {
    const items = base().items.filter((i) => i.centreSlug === "kullu");
    const merged = mergeKeyedList(items, { shimla: { name: "पहला" }, kullu: { name: "दूसरा" } }, (i) => i.centreSlug);
    expect(merged).toEqual([{ name: "दूसरा", centreSlug: "kullu" }]);
  });
});

describe("overlay types (checked by tsc --noEmit)", () => {
  it("reject protected, non-text and misspelt fields", () => {
    const programs: OverlayMap<Program> = {
      "prog-x": {
        title: "शीर्षक",
        // @ts-expect-error slugs are never overlaid
        slug: "x",
      },
      "prog-y": {
        // @ts-expect-error exam tracks (literal unions) are never overlaid
        exam: "JEE",
      },
      "prog-z": {
        // @ts-expect-error numbers are never overlaid
        batchSize: 10,
      },
      "prog-typo": {
        // @ts-expect-error misspelt field
        titel: "शीर्षक",
      },
    };
    const testimonial: TextOverlay<Testimonial> = {
      context: "पुत्र",
      // @ts-expect-error quotes are attributed words and never overlaid
      quote: "…",
    };
    expect(Object.keys(programs)).toHaveLength(4);
    expect(testimonial.context).toBe("पुत्र");
  });
});
