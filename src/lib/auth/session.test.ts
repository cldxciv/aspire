import { describe, expect, it, vi } from "vitest";

// connection() needs a live Next request; stub it so the real getSession runs.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { connection } = await import("next/server");
const { getSession } = await import("./session");

describe("getSession", () => {
  it("returns null while no identity provider is integrated", async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it("is request-time only (awaits connection())", async () => {
    vi.mocked(connection).mockClear();
    await getSession();
    expect(connection).toHaveBeenCalledTimes(1);
  });
});
