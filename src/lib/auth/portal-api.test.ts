import { describe, expect, it, vi } from "vitest";
import type { Session } from "./roles";

// Route handlers for /api/{admin,student,parent}/** and /api/session.
// connection() needs a live Next request, so it is stubbed; getSession keeps its
// real implementation (always null) unless a test overrides it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock("./session", { spy: true });

const { getSession } = await import("./session");
const adminEnquiries = await import("@/app/api/admin/enquiries/route");
const studentMe = await import("@/app/api/student/me/route");
const parentStudents = await import("@/app/api/parent/students/route");
const parentStudent = await import("@/app/api/parent/students/[studentId]/route");
const sessionRoute = await import("@/app/api/session/route");

const ORIGIN = "https://aspire.test";

function studentRequest(studentId: string) {
  return parentStudent.GET(new Request(`${ORIGIN}/api/parent/students/${studentId}`), {
    params: Promise.resolve({ studentId }),
  });
}

async function expectEnvelope(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(await response.json()).toMatchObject({ ok: false, error });
}

/** Overrides getSession for the next `times` calls only. */
function signedInAs(session: Session, times = 1) {
  for (let i = 0; i < times; i++) vi.mocked(getSession).mockResolvedValueOnce(session);
}

describe("portal APIs with no identity provider (current state)", () => {
  it("GET /api/admin/enquiries → 401", async () => {
    await expectEnvelope(await adminEnquiries.GET(), 401, "unauthenticated");
  });

  it("GET /api/student/me → 401", async () => {
    await expectEnvelope(await studentMe.GET(), 401, "unauthenticated");
  });

  it("GET /api/parent/students → 401", async () => {
    await expectEnvelope(await parentStudents.GET(), 401, "unauthenticated");
  });

  it("GET /api/parent/students/:id → 401", async () => {
    await expectEnvelope(await studentRequest("learner-1"), 401, "unauthenticated");
  });

  it("GET /api/session → authenticated: false, no-store", async () => {
    const response = await sessionRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { authenticated: false } });
  });
});

describe("portal APIs with a (fake) verified session", () => {
  const parent: Session = { userId: "parent-1", role: "parent", linkedStudentIds: ["learner-1"] };
  const student: Session = { userId: "learner-1", role: "student" };

  it("never returns data: an authorised caller gets 503 not_configured", async () => {
    signedInAs({ userId: "staff-1", role: "admin" });
    await expectEnvelope(await adminEnquiries.GET(), 503, "not_configured");
  });

  it("forbids the wrong role", async () => {
    signedInAs(student, 2);
    await expectEnvelope(await adminEnquiries.GET(), 403, "forbidden");
    await expectEnvelope(await parentStudents.GET(), 403, "forbidden");
  });

  it("enforces the parent → learner link per record", async () => {
    signedInAs(parent, 2);
    await expectEnvelope(await studentRequest("learner-2"), 403, "forbidden");
    await expectEnvelope(await studentRequest("learner-1"), 503, "not_configured");
  });

  it("/api/session exposes the role only", async () => {
    signedInAs(parent);
    const body = await (await sessionRoute.GET()).json();
    expect(body).toEqual({ ok: true, data: { authenticated: true, role: "parent" } });
  });
});
