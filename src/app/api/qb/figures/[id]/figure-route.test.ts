import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/qb/figures/:id — public figures of APPROVED question versions only (docs/question-bank-plan.md
// §B12). The bank sits behind QbPaperPort (FakeQbPort here); the bytes are a synthetic 1×1 PNG.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { setQbPaperPortForTests } = await import("@/lib/mocktest/generated");
const { resetMocktestLimitersForTests } = await import("@/lib/mocktest/service");
const { FakeQbPort } = await import("@/lib/mocktest/testing/fake-qb-port");
const route = await import("./route");

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
);
const APPROVED = "a".repeat(32);
const DRAFT_ONLY = "b".repeat(32);

function get(id: string, ip = "198.51.100.10") {
  return route.GET(new Request(`http://localhost:3000/api/qb/figures/${id}`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ id }),
  });
}

let fake: InstanceType<typeof FakeQbPort>;

beforeEach(() => {
  resetMocktestLimitersForTests();
  fake = new FakeQbPort();
  fake.figures.set(APPROVED, { bytes: PNG, mime: "image/png", refVersion: 2 });
  fake.figures.set(DRAFT_ONLY, { bytes: PNG, mime: "image/png", refVersion: 0 });
  setQbPaperPortForTests(fake);
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  setQbPaperPortForTests(null);
  vi.restoreAllMocks();
});

describe("GET /api/qb/figures/:id", () => {
  it("serves an approved version's figure: raster bytes, cached a year, nosniff, CSP none", async () => {
    const response = await get(APPROVED);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/png",
      "content-length": String(PNG.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "cross-origin-resource-policy": "same-origin",
    });
  });

  it("refuses figures without an approved ref, unknown ids and malformed ids alike (404, private)", async () => {
    for (const id of [DRAFT_ONLY, "c".repeat(32), "not-a-figure", "A".repeat(32), "a".repeat(33)]) {
      const response = await get(id);
      expect(response.status, id).toBe(404);
      expect(response.headers.get("cache-control"), id).toBe("no-store");
    }
  });

  it("rate limit: 1,200 per IP per 10 minutes", async () => {
    for (let i = 0; i < 1200; i += 1) await get(APPROVED, "198.51.100.99");
    expect((await get(APPROVED, "198.51.100.99")).status).toBe(429);
    expect((await get(APPROVED, "198.51.100.98")).status).toBe(200);
  });
});
