import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTEXT_LIMITS, enquiryContextSchema } from "@/lib/contracts/enquiry";

import {
  VISIT_STORAGE_KEY,
  buildEnquiryContext,
  captureVisitAttribution,
  collectEnquiryContext,
  landingAttribution,
  mergeAttribution,
  parseStoredAttribution,
  predictorBand,
  toolArrivalFrom,
  toolEnquiryHref,
  withEnquiryTool,
} from "./enquiry-context";

/** Attribution captured with an enquiry (D-039): page, utm_* of the landing, referrer host, tool CTA. */

describe("landingAttribution", () => {
  it("reads the five utm_* tags (trimmed, clipped to 100), ignoring blanks and other parameters", () => {
    const search = `?utm_source=%20facebook%20&utm_medium=paid&utm_campaign=${"c".repeat(150)}&utm_term=&gclid=abc&phone=9876543210`;
    expect(landingAttribution(search, "", "aspireiit.in")).toEqual({
      utm: { utm_source: "facebook", utm_medium: "paid", utm_campaign: "c".repeat(CONTEXT_LIMITS.utm) },
    });
  });

  it("keeps only an external referrer's host — never its path or query", () => {
    expect(landingAttribution("", "https://www.Google.com/search?q=aspire+shimla", "aspireiit.in")).toEqual({
      referrer: "www.google.com",
    });
    expect(landingAttribution("", "https://aspireiit.in/programs", "aspireiit.in")).toEqual({});
    expect(landingAttribution("", "not a url", "aspireiit.in")).toEqual({});
  });

  it("reads a valid tool CTA and ignores unknown ones", () => {
    expect(landingAttribution("?from=mock-test", "", "x")).toEqual({ tool: "mock-test" });
    expect(landingAttribution("?from=admin", "", "x")).toEqual({});
  });
});

describe("mergeAttribution (one visit)", () => {
  it("a new utm set replaces the old one, the first referrer is kept, the latest tool wins", () => {
    const first = { utm: { utm_source: "facebook" }, referrer: "m.facebook.com", tool: "ask" as const };
    expect(mergeAttribution(first, {})).toEqual(first);
    expect(mergeAttribution(first, { utm: { utm_source: "google" }, referrer: "www.google.com", tool: "planner" })).toEqual({
      utm: { utm_source: "google" },
      referrer: "m.facebook.com",
      tool: "planner",
    });
    expect(mergeAttribution(null, { referrer: "www.google.com" })).toEqual({ referrer: "www.google.com" });
  });
});

describe("parseStoredAttribution", () => {
  it.each([null, "", "not json", "[]", "42", '{"utm":"x","tool":"admin","referrer":5}'])("ignores junk %j", (raw) => {
    expect(parseStoredAttribution(raw) ?? {}).toEqual({});
  });

  it("round-trips a stored visit", () => {
    const visit = { utm: { utm_source: "facebook" }, referrer: "www.google.com", tool: "predictor" as const };
    expect(parseStoredAttribution(JSON.stringify(visit))).toEqual(visit);
  });
});

describe("toolArrivalFrom", () => {
  it("passes the predictor's exam + band only when they have the expected shape", () => {
    expect(toolArrivalFrom("?from=predictor&exam=jee-main&band=score-180-189")).toEqual({
      tool: "predictor",
      exam: "jee-main",
      band: "score-180-189",
    });
    expect(toolArrivalFrom("?from=predictor&exam=JEE%20Main&band=187")).toEqual({ tool: "predictor" });
    expect(toolArrivalFrom("?from=ask&exam=jee-main&band=score-180-189")).toEqual({ tool: "ask" });
    expect(toolArrivalFrom("?exam=jee-main")).toBeNull();
  });
});

describe("buildEnquiryContext", () => {
  const visit = { utm: { utm_source: "facebook", utm_campaign: "neet-2027" }, referrer: "www.google.com", tool: "ask" as const };

  it("combines the page, locale, the visit's tags and referrer, and the URL's tool (which wins over the visit's)", () => {
    expect(
      buildEnquiryContext({ pathname: "/hi/admissions", search: "?from=predictor&exam=neet-ug&band=score-600-609", locale: "hi", visit }),
    ).toEqual({
      page: "/hi/admissions",
      locale: "hi",
      utm_source: "facebook",
      utm_campaign: "neet-2027",
      referrer: "www.google.com",
      tool: "predictor",
      toolExam: "neet-ug",
      toolBand: "score-600-609",
    });
  });

  it("falls back to the visit's tool, without any predictor detail", () => {
    expect(buildEnquiryContext({ pathname: "/", search: "", locale: "en", visit })).toEqual({
      page: "/",
      locale: "en",
      utm_source: "facebook",
      utm_campaign: "neet-2027",
      referrer: "www.google.com",
      tool: "ask",
    });
  });

  it("always produces something the contract accepts unchanged", () => {
    const context = buildEnquiryContext({ pathname: `/${"p".repeat(300)}`, search: "?from=planner", locale: "en", visit: {} });
    expect(context?.page).toHaveLength(CONTEXT_LIMITS.page);
    expect(enquiryContextSchema.parse(context)).toEqual(context);
  });
});

describe("captureVisitAttribution / collectEnquiryContext (browser)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBrowser(url: string, referrer: string, storage: Storage | null) {
    const parsed = new URL(url);
    vi.stubGlobal("window", {
      location: { pathname: parsed.pathname, search: parsed.search, host: parsed.host },
      get sessionStorage() {
        if (!storage) throw new DOMException("blocked", "SecurityError");
        return storage;
      },
    });
    vi.stubGlobal("document", { referrer });
  }

  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key) => map.get(key) ?? null,
      key: (index) => [...map.keys()][index] ?? null,
      removeItem: (key) => void map.delete(key),
      setItem: (key, value) => void map.set(key, String(value)),
    };
  }

  it("keeps the landing's tags for the visit, so a later enquiry on another page carries them", () => {
    const storage = memoryStorage();
    stubBrowser("https://aspireiit.in/programs/jee?utm_source=facebook&utm_medium=paid", "https://m.facebook.com/", storage);
    expect(captureVisitAttribution()).toEqual({ utm: { utm_source: "facebook", utm_medium: "paid" }, referrer: "m.facebook.com" });
    expect(JSON.parse(storage.getItem(VISIT_STORAGE_KEY) ?? "{}")).toMatchObject({ referrer: "m.facebook.com" });

    stubBrowser("https://aspireiit.in/admissions?from=planner#enquiry", "https://m.facebook.com/", storage);
    expect(collectEnquiryContext("en")).toEqual({
      page: "/admissions",
      locale: "en",
      utm_source: "facebook",
      utm_medium: "paid",
      referrer: "m.facebook.com",
      tool: "planner",
    });
  });

  it("works without storage (blocked) and never throws", () => {
    stubBrowser("https://aspireiit.in/?utm_source=google", "", null);
    expect(collectEnquiryContext("en")).toEqual({ page: "/", locale: "en", utm_source: "google" });
  });

  it("returns nothing on the server", () => {
    expect(collectEnquiryContext("en")).toBeUndefined();
    expect(captureVisitAttribution()).toEqual({});
  });
});

describe("tool CTA links", () => {
  it.each([
    ["predictor", "en", "/admissions?from=predictor#enquiry"],
    ["mock-test", "en", "/admissions?from=mock-test#enquiry"],
    ["ask", "hi", "/hi/admissions?from=ask#enquiry"],
    ["planner", "hi", "/hi/admissions?from=planner#enquiry"],
  ] as const)("%s (%s) → %s", (tool, locale, href) => {
    expect(toolEnquiryHref(tool, locale)).toBe(href);
  });

  it("the predictor link carries the exam + band only, and only in the expected shape", () => {
    expect(toolEnquiryHref("predictor", "hi", { exam: "jee-main", band: "score-180-189" })).toBe(
      "/hi/admissions?from=predictor&exam=jee-main&band=score-180-189#enquiry",
    );
    expect(toolEnquiryHref("predictor", "en", { exam: "Jee Main", band: "187" })).toBe("/admissions?from=predictor#enquiry");
    expect(toolEnquiryHref("planner", "en", { exam: "jee-main", band: "score-180-189" })).toBe("/admissions?from=planner#enquiry");
  });

  it("withEnquiryTool adds from= to a page-built link, keeping its path, query and hash", () => {
    expect(withEnquiryTool("/hi/admissions#enquiry", "ask")).toBe("/hi/admissions?from=ask#enquiry");
    expect(withEnquiryTool("/admissions?x=1#enquiry", "ask")).toBe("/admissions?x=1&from=ask#enquiry");
    expect(withEnquiryTool("/admissions?from=planner", "ask")).toBe("/admissions?from=ask");
  });

  it("predictorBand expresses whole, non-negative ranges only", () => {
    expect(predictorBand("score", 180, 189)).toBe("score-180-189");
    expect(predictorBand("percentile", 98, 99)).toBe("percentile-98-99");
    expect(predictorBand("score", -10, -1)).toBeUndefined();
    expect(predictorBand("percentile", 98.5, 99)).toBeUndefined();
    expect(predictorBand("score", 190, 180)).toBeUndefined();
  });
});
