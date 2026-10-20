import { describe, expect, it } from "vitest";
import { authorizeRole, authorizeStudentRecord, canAccessStudentRecord, decidePortalPage } from "./policy";
import type { Session } from "./roles";

// Synthetic sessions only — never real people or ids.
const admin: Session = { userId: "staff-1", role: "admin" };
const student: Session = { userId: "learner-1", role: "student" };
const parent: Session = { userId: "parent-1", role: "parent", linkedStudentIds: ["learner-1", "learner-2"] };
const unlinkedParent: Session = { userId: "parent-2", role: "parent" };

describe("staff (M7, D-038)", () => {
  const staff: Session = { userId: "crm-1", role: "staff" };

  it("is a valid role that only explicitly listed guards allow", () => {
    expect(authorizeRole(staff, ["staff", "admin"])).toEqual({ ok: true, session: staff });
    expect(authorizeRole(staff, ["admin"])).toEqual({ ok: false, error: "forbidden" });
    expect(authorizeRole(staff, ["student", "parent"])).toEqual({ ok: false, error: "forbidden" });
    expect(authorizeRole({ ...staff, mustChangePassword: true }, ["staff"])).toEqual({ ok: false, error: "password_change_required" });
  });

  it("never reaches learner records", () => {
    expect(canAccessStudentRecord(staff, "learner-1")).toBe(false);
    expect(authorizeStudentRecord(staff, ["staff"], "learner-1")).toEqual({ ok: false, error: "forbidden" });
  });

  it("portal pages accept a list of roles", () => {
    expect(decidePortalPage(staff, ["staff", "admin"], false)).toEqual({ kind: "session", session: staff });
    expect(decidePortalPage(admin, ["staff", "admin"], false)).toEqual({ kind: "session", session: admin });
    expect(decidePortalPage(student, ["staff", "admin"], false)).toEqual({ kind: "deny", error: "forbidden" });
    expect(decidePortalPage(staff, "admin", false)).toEqual({ kind: "deny", error: "forbidden" });
  });
});

describe("authorizeRole (deny by default)", () => {
  it.each([null, undefined])("rejects a missing session (%s) as unauthenticated", (session) => {
    expect(authorizeRole(session, ["admin"])).toEqual({ ok: false, error: "unauthenticated" });
  });

  it.each([
    { userId: "", role: "admin" },
    { userId: "staff-1", role: "superuser" },
    { userId: "staff 1", role: "admin" },
    { userId: "parent-1", role: "parent", linkedStudentIds: "learner-1" },
    { userId: "parent-1", role: "parent", linkedStudentIds: [42] },
    { role: "admin" },
  ])("treats a malformed session as unauthenticated: %j", (session) => {
    expect(authorizeRole(session as unknown as Session, ["admin", "parent"])).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("denies everyone when no roles are allowed", () => {
    expect(authorizeRole(admin, [])).toEqual({ ok: false, error: "forbidden" });
  });

  it("forbids the wrong role", () => {
    expect(authorizeRole(student, ["admin"])).toEqual({ ok: false, error: "forbidden" });
    expect(authorizeRole(parent, ["student"])).toEqual({ ok: false, error: "forbidden" });
  });

  it("allows a listed role", () => {
    expect(authorizeRole(admin, ["admin"])).toEqual({ ok: true, session: admin });
    expect(authorizeRole(parent, ["student", "parent"])).toEqual({ ok: true, session: parent });
    expect(authorizeRole({ ...admin, mustChangePassword: false }, ["admin"]).ok).toBe(true);
  });

  it("holds back the right role while a temporary password is unchanged", () => {
    expect(authorizeRole({ ...admin, mustChangePassword: true }, ["admin"])).toEqual({
      ok: false,
      error: "password_change_required",
    });
    // The role check still comes first.
    expect(authorizeRole({ ...student, mustChangePassword: true }, ["admin"])).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects mistyped optional fields as malformed", () => {
    expect(authorizeRole({ ...admin, mustChangePassword: "no" } as unknown as Session, ["admin"])).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(authorizeRole({ ...admin, displayName: 7 } as unknown as Session, ["admin"])).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });
});

describe("canAccessStudentRecord (record level)", () => {
  it("lets a parent see only linked learners", () => {
    expect(canAccessStudentRecord(parent, "learner-1")).toBe(true);
    expect(canAccessStudentRecord(parent, "learner-2")).toBe(true);
    expect(canAccessStudentRecord(parent, "learner-3")).toBe(false);
    expect(canAccessStudentRecord(parent, "LEARNER-1")).toBe(false);
  });

  it("denies a parent with no linked learners", () => {
    expect(canAccessStudentRecord(unlinkedParent, "learner-1")).toBe(false);
    expect(canAccessStudentRecord({ ...unlinkedParent, linkedStudentIds: [] }, "learner-1")).toBe(false);
  });

  it("lets a student see only their own record", () => {
    expect(canAccessStudentRecord(student, "learner-1")).toBe(true);
    expect(canAccessStudentRecord(student, "learner-2")).toBe(false);
  });

  it("denies staff until a staff permission model exists", () => {
    expect(canAccessStudentRecord(admin, "learner-1")).toBe(false);
  });

  it("rejects malformed learner ids", () => {
    expect(canAccessStudentRecord(parent, "")).toBe(false);
    expect(canAccessStudentRecord(parent, "../learner-1")).toBe(false);
  });
});

describe("authorizeStudentRecord", () => {
  it("requires both the role and the record link", () => {
    expect(authorizeStudentRecord(null, ["parent"], "learner-1")).toEqual({ ok: false, error: "unauthenticated" });
    expect(authorizeStudentRecord(student, ["parent"], "learner-1")).toEqual({ ok: false, error: "forbidden" });
    expect(authorizeStudentRecord(parent, ["parent"], "learner-9")).toEqual({ ok: false, error: "forbidden" });
    expect(authorizeStudentRecord(parent, ["parent"], "learner-2")).toEqual({ ok: true, session: parent });
  });
});

describe("decidePortalPage", () => {
  it("denies when there is no session and previews are off", () => {
    expect(decidePortalPage(null, "admin", false)).toEqual({ kind: "deny", error: "unauthenticated" });
  });

  it("denies the wrong role when previews are off", () => {
    expect(decidePortalPage(student, "admin", false)).toEqual({ kind: "deny", error: "forbidden" });
  });

  it("serves the data-free preview when previews are on", () => {
    expect(decidePortalPage(null, "parent", true)).toEqual({ kind: "preview" });
    expect(decidePortalPage(student, "admin", true)).toEqual({ kind: "preview" });
  });

  it("serves the real page to a verified session with the right role", () => {
    expect(decidePortalPage(parent, "parent", false)).toEqual({ kind: "session", session: parent });
    expect(decidePortalPage(parent, "parent", true)).toEqual({ kind: "session", session: parent });
  });
});
