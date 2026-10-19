import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Centre, Program, ResultRecord } from "@/lib/types";
import { toPublicResult } from "@/lib/server/public-content";

import { GET as getCentreBySlug, generateStaticParams as centreStaticParams } from "./centres/[slug]/route";
import { GET as getCentres } from "./centres/route";
import { GET as getHealth } from "./health/route";
import { GET as getProgramBySlug, generateStaticParams as programStaticParams } from "./programs/[slug]/route";
import { GET as getPrograms } from "./programs/route";
import { GET as getResults } from "./results/route";

// `connection()` needs a Next.js request scope; outside Next it throws. It only marks the route as dynamic.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

const get = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function json<T>(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return (await response.json()) as T;
}

beforeEach(() => {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/programs", () => {
  it("lists programs in the ApiList envelope", async () => {
    const response = await getPrograms(get("/api/programs"));
    expect(response.status).toBe(200);
    const body = await json<{ ok: true; data: Program[] }>(response);
    expect(body.ok).toBe(true);
    expect(body.data.map((p) => p.exam).sort()).toEqual(["Foundation", "Integrated", "JEE", "NEET"]);
  });

  it("filters by exam, case-insensitively", async () => {
    for (const exam of ["NEET", "neet"]) {
      const body = await json<{ data: Program[] }>(await getPrograms(get(`/api/programs?exam=${exam}`)));
      expect(body.data.map((p) => p.exam)).toEqual(["NEET"]);
    }
  });

  it("treats an empty exam as absent and ignores unknown params", async () => {
    const body = await json<{ data: Program[] }>(await getPrograms(get("/api/programs?exam=&utm_source=x")));
    expect(body.data).toHaveLength(4);
  });

  it("returns 400 for an invalid exam", async () => {
    const response = await getPrograms(get("/api/programs?exam=MBA"));
    expect(response.status).toBe(400);
    const body = await json<{ ok: false; error: string; fieldErrors: Record<string, string[]> }>(response);
    expect(body).toMatchObject({ ok: false, error: "bad_request" });
    expect(body.fieldErrors.exam?.[0]).toMatch(/exam must be one of/);
  });

  it("returns 400 for a repeated exam parameter", async () => {
    expect((await getPrograms(get("/api/programs?exam=JEE&exam=NEET"))).status).toBe(400);
  });

  it("hides placeholder programs when placeholder content is off", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const body = await json<{ data: Program[] }>(await getPrograms(get("/api/programs")));
    expect(body.data.every((p) => p.status === "published")).toBe(true);
  });
});

describe("GET /api/programs/[slug]", () => {
  it("returns a program as ApiItem", async () => {
    const response = await getProgramBySlug(get("/api/programs/dropper-special"), params("dropper-special"));
    expect(response.status).toBe(200);
    expect(await json<{ ok: true; data: Program }>(response)).toMatchObject({
      ok: true,
      data: { slug: "dropper-special" },
    });
  });

  it.each(["does-not-exist", "__none__", "NEET", "../etc"])("returns 404 for %j", async (slug) => {
    const response = await getProgramBySlug(get(`/api/programs/x`), params(slug));
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("generateStaticParams returns at least one entry", () => {
    expect(programStaticParams().length).toBeGreaterThan(0);
  });
});

describe("GET /api/centres", () => {
  it("lists centres", async () => {
    const body = await json<{ ok: true; data: Centre[] }>(await getCentres(get("/api/centres")));
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("searches by name or district (q)", async () => {
    const body = await json<{ data: Centre[] }>(await getCentres(get("/api/centres?q=%20shim%20")));
    expect(body.data.map((c) => c.slug)).toEqual(["shimla"]);
  });

  it("filters by exam", async () => {
    // Placeholder centres list no programs, so an exam filter returns nothing (never invented).
    const body = await json<{ data: Centre[] }>(await getCentres(get("/api/centres?exam=JEE")));
    expect(body.data).toEqual([]);
  });

  it("returns 400 for an over-long q or invalid exam", async () => {
    expect((await getCentres(get(`/api/centres?q=${"a".repeat(101)}`))).status).toBe(400);
    expect((await getCentres(get("/api/centres?exam=x"))).status).toBe(400);
  });
});

describe("GET /api/centres/[slug]", () => {
  it("returns a centre or 404", async () => {
    expect((await getCentreBySlug(get("/api/centres/shimla"), params("shimla"))).status).toBe(200);
    expect((await getCentreBySlug(get("/api/centres/nowhere"), params("nowhere"))).status).toBe(404);
  });

  it("generateStaticParams falls back to the sentinel when no centre is visible", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const entries = await centreStaticParams();
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("GET /api/results", () => {
  it("returns an empty list (no verified records yet)", async () => {
    // Placeholder (demo-import) results are visible in preview by design; this
    // case checks the production view, where only verified records may appear.
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const response = await getResults(get("/api/results"));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ ok: true, data: [] });
  });

  it("accepts valid year/exam filters", async () => {
    expect((await getResults(get("/api/results?year=2025&exam=jee"))).status).toBe(200);
  });

  it.each(["year=25", "year=1999", "year=2101", "year=20x5", "exam=MBBS"])("returns 400 for %s", async (query) => {
    expect((await getResults(get(`/api/results?${query}`))).status).toBe(400);
  });
});

describe("toPublicResult", () => {
  const record: ResultRecord = {
    id: "r1",
    year: 2025,
    exam: "JEE",
    programSlug: "class-12-intensive",
    studentDisplayName: "Named Student",
    rankOrOutcome: "Outcome",
    sourceReference: "Source",
    consentStatus: "granted",
    verifiedBy: "Staff Member",
    status: "published",
  };

  it("keeps the name only with granted consent and never exposes verifiedBy", () => {
    expect(toPublicResult(record)).toMatchObject({ studentDisplayName: "Named Student" });
    expect(toPublicResult(record)).not.toHaveProperty("verifiedBy");
    expect(toPublicResult({ ...record, consentStatus: "not_required" })).not.toHaveProperty("studentDisplayName");
    expect(toPublicResult({ ...record, consentStatus: "pending" })).not.toHaveProperty("studentDisplayName");
  });
});

describe("GET /api/health", () => {
  it("reports status without secrets", async () => {
    vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
    vi.stubEnv("ENQUIRY_WEBHOOK_URL", "https://hooks.example.com/secret-path");
    vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", "x".repeat(32));
    const response = await getHealth();
    expect(response.status).toBe(200);
    const body = await json<{ ok: true; data: Record<string, unknown> }>(response);
    expect(body).toMatchObject({
      ok: true,
      data: { status: "ok", enquiries: "connected", placeholderContent: true },
    });
    expect(typeof body.data.time).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/secret-path|xxxxxxxx/);
  });

  it("reports not_configured by default", async () => {
    vi.stubEnv("ENQUIRY_DESTINATION", "");
    const body = await json<{ data: { enquiries: string } }>(await getHealth());
    expect(body.data.enquiries).toBe("not_configured");
  });
});
