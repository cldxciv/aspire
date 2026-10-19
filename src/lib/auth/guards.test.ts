import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./roles";

// Fake session source and redirect: the guards are tested in isolation.
vi.mock("./session", () => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const { getSession } = await import("./session");
const { requireRole, requireStudentRecord } = await import("./guards");
const { requirePortalAccess } = await import("./portal-access");

const mockedGetSession = vi.mocked(getSession);

const admin: Session = { userId: "staff-1", role: "admin" };
const student: Session = { userId: "learner-1", role: "student" };
const parent: Session = { userId: "parent-1", role: "parent", linkedStudentIds: ["learner-1"] };

function signedInAs(session: Session | null) {
  mockedGetSession.mockResolvedValue(session);
}

async function expectError(result: Awaited<ReturnType<typeof requireRole>>, status: number, error: string) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.status).toBe(status);
  expect(result.response.headers.get("cache-control")).toBe("no-store");
  expect(result.response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  const body = await result.response.json();
  expect(body).toMatchObject({ ok: false, error });
  expect(typeof body.message).toBe("string");
}

beforeEach(() => {
  mockedGetSession.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireRole", () => {
  it("returns 401 unauthenticated without a session", async () => {
    signedInAs(null);
    await expectError(await requireRole("admin"), 401, "unauthenticated");
  });

  it("returns 403 forbidden for the wrong role", async () => {
    signedInAs(parent);
    await expectError(await requireRole("admin"), 403, "forbidden");
  });

  it("denies everyone when called with no roles", async () => {
    signedInAs(admin);
    await expectError(await requireRole(), 403, "forbidden");
  });

  it("allows a matching role", async () => {
    signedInAs(admin);
    expect(await requireRole("admin")).toEqual({ ok: true, session: admin });
  });
});

describe("requireStudentRecord (parent record-level check)", () => {
  it("allows a parent to read a linked learner", async () => {
    signedInAs(parent);
    expect(await requireStudentRecord("learner-1", "parent")).toEqual({ ok: true, session: parent });
  });

  it("forbids a parent from reading an unlinked learner", async () => {
    signedInAs(parent);
    await expectError(await requireStudentRecord("learner-2", "parent"), 403, "forbidden");
  });

  it("forbids a student on a parent-only route, even for their own id", async () => {
    signedInAs(student);
    await expectError(await requireStudentRecord("learner-1", "parent"), 403, "forbidden");
  });

  it("checks authentication before validating the id", async () => {
    signedInAs(null);
    await expectError(await requireStudentRecord("../etc", "parent"), 401, "unauthenticated");
  });

  it("rejects a malformed id from a signed-in parent with 400", async () => {
    signedInAs(parent);
    await expectError(await requireStudentRecord("../etc", "parent"), 400, "bad_request");
  });
});

describe("requirePortalAccess (portal pages)", () => {
  it("redirects to /login with a safe next when previews are off", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "false");
    signedInAs(null);
    await expect(requirePortalAccess("parent", "/parent/progress")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2Fparent%2Fprogress",
    );
  });

  it("redirects the wrong role when previews are off", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "false");
    signedInAs(student);
    await expect(requirePortalAccess("admin", "/admin")).rejects.toThrow("NEXT_REDIRECT /login?next=%2Fadmin");
  });

  it("serves the data-free preview when previews are on", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "true");
    signedInAs(null);
    await expect(requirePortalAccess("admin", "/admin/enquiries")).resolves.toEqual({ kind: "preview" });
  });

  it("serves the page to a verified session with the right role", async () => {
    vi.stubEnv("PORTAL_PREVIEW", "false");
    signedInAs(parent);
    await expect(requirePortalAccess("parent", "/parent")).resolves.toEqual({ kind: "session", session: parent });
  });
});
