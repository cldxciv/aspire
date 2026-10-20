import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Route handlers for /api/{admin,student,parent}/** and /api/session, with real
// sessions from an in-memory database. connection() needs a live Next request, so it is
// stubbed; cookies() reads the test browser's jar.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("./testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { resetDatabaseForTests } = await import("@/lib/db/connection");
const { createSession } = await import("./sessions");
const { createTestUser, linkTestParent, params, TestBrowser } = await import("./testing/harness");
const adminEnquiries = await import("@/app/api/admin/enquiries/route");
const studentMe = await import("@/app/api/student/me/route");
const parentStudents = await import("@/app/api/parent/students/route");
const parentStudent = await import("@/app/api/parent/students/[studentId]/route");
const sessionRoute = await import("@/app/api/session/route");

type Browser = InstanceType<typeof TestBrowser>;

async function expectEnvelope(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(await response.json()).toMatchObject({ ok: false, error });
}

/** A browser holding a real session for a freshly created synthetic account. */
async function signedIn(role: "student" | "parent" | "admin", loginId: string, extra: { mustChangePassword?: boolean } = {}) {
  const user = await createTestUser({ role, loginId, password: `${loginId}-pass-2026`, displayName: `Name of ${loginId}`, ...extra });
  const b = new TestBrowser(cookieState);
  b.jar.set("aspire_session", createSession(user.id).token);
  return { b, user };
}

const call = {
  adminEnquiries: (b: Browser) => b.send(adminEnquiries.GET, "/api/admin/enquiries"),
  studentMe: (b: Browser) => b.send(studentMe.GET, "/api/student/me"),
  parentStudents: (b: Browser) => b.send(parentStudents.GET, "/api/parent/students"),
  parentStudent: (b: Browser, studentId: string) =>
    b.send(parentStudent.GET, `/api/parent/students/${studentId}`, {}, params({ studentId })),
  session: (b: Browser) => b.send(sessionRoute.GET, "/api/session"),
};

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("portal APIs when signed out (deny by default)", () => {
  const anonymous = () => new TestBrowser(cookieState);

  it("GET /api/admin/enquiries → 401", async () => {
    await expectEnvelope(await call.adminEnquiries(anonymous()), 401, "unauthenticated");
  });

  it("GET /api/student/me → 401", async () => {
    await expectEnvelope(await call.studentMe(anonymous()), 401, "unauthenticated");
  });

  it("GET /api/parent/students → 401", async () => {
    await expectEnvelope(await call.parentStudents(anonymous()), 401, "unauthenticated");
  });

  it("GET /api/parent/students/:id → 401 (checked before the id)", async () => {
    await expectEnvelope(await call.parentStudent(anonymous(), "learner-1"), 401, "unauthenticated");
    await expectEnvelope(await call.parentStudent(anonymous(), "../etc"), 401, "unauthenticated");
  });

  it("a forged or unknown session cookie counts as signed out", async () => {
    const b = anonymous();
    for (const value of ["admin", "role=admin", "A".repeat(43)]) {
      b.jar.set("aspire_session", value);
      await expectEnvelope(await call.adminEnquiries(b), 401, "unauthenticated");
    }
  });

  it("GET /api/session → authenticated: false, no-store", async () => {
    const response = await call.session(anonymous());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { authenticated: false } });
  });
});

describe("portal APIs with a real session", () => {
  it("admin enquiries: an admin gets 503 not_configured (nothing is stored), others 403", async () => {
    const { b: admin } = await signedIn("admin", "admin.one");
    await expectEnvelope(await call.adminEnquiries(admin), 503, "not_configured");
    const { b: student } = await signedIn("student", "learner.one");
    await expectEnvelope(await call.adminEnquiries(student), 403, "forbidden");
  });

  it("student me: the student's own account and an explicit not-connected list", async () => {
    const { b, user } = await signedIn("student", "learner.one");
    const response = await call.studentMe(b);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        id: user.id,
        displayName: "Name of learner.one",
        loginId: "learner.one",
        notConnected: ["timetable", "results", "attendance"],
      },
    });
    const { b: parent } = await signedIn("parent", "parent.one");
    await expectEnvelope(await call.studentMe(parent), 403, "forbidden");
  });

  it("forbids the wrong role", async () => {
    const { b } = await signedIn("student", "learner.one");
    await expectEnvelope(await call.parentStudents(b), 403, "forbidden");
    const { user: kid } = await signedIn("student", "learner.two");
    await expectEnvelope(await call.parentStudent(b, kid.id), 403, "forbidden");
  });

  it("enforces the parent → learner link per record, from the server-side links", async () => {
    const { b, user: parent } = await signedIn("parent", "parent.one");
    const { user: mine } = await signedIn("student", "learner.mine");
    const { user: other } = await signedIn("student", "learner.other");
    linkTestParent(parent.id, mine.id);

    expect(await (await call.parentStudents(b)).json()).toEqual({
      ok: true,
      data: [{ id: mine.id, displayName: "Name of learner.mine" }],
    });
    expect((await call.parentStudent(b, mine.id)).status).toBe(200);
    await expectEnvelope(await call.parentStudent(b, other.id), 403, "forbidden");
    await expectEnvelope(await call.parentStudent(b, "../etc"), 400, "bad_request");
  });

  it("holds back portal data while a temporary password is unchanged", async () => {
    const { b } = await signedIn("student", "learner.one", { mustChangePassword: true });
    const response = await call.studentMe(b);
    expect(response.status).toBe(403);
    expect((await response.json()).message).toMatch(/temporary password/);
  });

  it("/api/session exposes the role and display name only", async () => {
    const { b } = await signedIn("parent", "parent.one");
    const body = await (await call.session(b)).json();
    expect(body).toEqual({ ok: true, data: { authenticated: true, role: "parent", displayName: "Name of parent.one" } });
  });
});
