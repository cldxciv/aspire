import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/predictor/card/route";
import { PREDICTOR_CARD_RATE_LIMIT, predictorCardLimiter } from "@/lib/predictor/card-limit";

// `connection()` needs a Next.js request scope; outside Next it throws. It only marks the route as dynamic.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  predictorCardLimiter.reset();
});

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function card(query: string) {
  const response = await GET(new NextRequest(`http://localhost/api/predictor/card${query}`));
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { response, bytes };
}

describe("GET /api/predictor/card", () => {
  it("returns a PNG share card for an exam + score bucket (sample tables, private cache)", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const { response, bytes } = await card("?exam=jee-main&mode=score&from=180");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...bytes.slice(0, 8)]).toEqual(PNG);
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(response.headers.get("cache-control")).toBe("private, max-age=600");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("renders generic, invalid and percentile cards as images too", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const query of ["", "?exam=neet-ug&mode=percentile&from=98", "?exam=boh&from=85", "?exam=nope&from=1", "?exam=jee-main&from=999"]) {
      const { response, bytes } = await card(query);
      expect(response.status, query).toBe(200);
      expect([...bytes.slice(0, 8)], query).toEqual(PNG);
    }
  });

  it("production: a 'coming soon' card, publicly cacheable, never sample numbers", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const { response, bytes } = await card("?exam=jee-main&mode=score&from=180");
    expect(response.status).toBe(200);
    expect([...bytes.slice(0, 8)]).toEqual(PNG);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("caps renders per client IP: 429 with Retry-After, other IPs unaffected (QA-SEC-M6)", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const ip = "203.0.113.77";
    for (let i = 0; i < PREDICTOR_CARD_RATE_LIMIT.limit; i += 1) expect(predictorCardLimiter.check(ip).allowed).toBe(true);
    const request = (from: string) =>
      new NextRequest(`http://localhost/api/predictor/card?exam=jee-main&from=180&junk=${Math.random()}`, {
        headers: { "x-forwarded-for": from },
      });
    const blocked = await GET(request(ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect((await blocked.json()).error).toBe("rate_limited");
    const other = await GET(request("198.51.100.4"));
    expect(other.status).toBe(200);
    expect(other.headers.get("content-type")).toBe("image/png");
  });
});
