import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { countEffectiveSuperAdmins, isEffectiveSuperAdminRow, upsertGrant } from "@/lib/db/super-admins";
import { findUserById, findUserByLoginId, setUserDisabled } from "@/lib/db/users";
import { insertSession } from "@/lib/db/sessions";

import { adminCreateUser, adminResetPassword, adminUpdateUser } from "./accounts";
import { verifyPassword } from "./password";
import type { Session } from "./roles";
import { ensureSuperAdminBootstrap, isLastSuperAdmin, isSuperAdmin, listSuperAdmins, setSuperAdmin } from "./super-admin";
import { createTestUser } from "./testing/harness";

// Super admin (D-044; docs/lead-routing-plan.md §11) against a fresh in-memory database per test.
// Synthetic accounts only.

const PASSWORD = "synthetic-pass-2026";
const session = (user: { id: string; role: Session["role"] }): Session => ({ userId: user.id, role: user.role });

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

const admin = (loginId: string, extra: { disabled?: boolean } = {}) => createTestUser({ role: "admin", loginId, password: PASSWORD, ...extra });

describe("bootstrap (H5)", () => {
  it("fires only with zero grant rows and exactly one enabled admin; audited, actor null", async () => {
    // No admin at all: nothing.
    ensureSuperAdminBootstrap(getDb());
    expect(countEffectiveSuperAdmins(getDb())).toBe(0);

    const only = await admin("admin.only");
    await admin("admin.off", { disabled: true }); // disabled admins do not count
    expect(isSuperAdmin(only.id)).toBe(true);
    const audit = listAudit(getDb(), { limit: 10 }).find((entry) => entry.action === "auth.super_admin_bootstrap");
    expect(audit).toMatchObject({ actorId: null, target: only.id, details: { via: "bootstrap" } });
    expect(listSuperAdmins(only.id)).toMatchObject({ youAreSuperAdmin: true, bootstrapPending: false, items: [{ userId: only.id, via: "bootstrap", grantedBy: null, effective: true }] });
  });

  it("does nothing with two admins: every admin is told to run the server command", async () => {
    const one = await admin("admin.one");
    await admin("admin.two");
    expect(isSuperAdmin(one.id)).toBe(false);
    expect(listSuperAdmins(one.id)).toMatchObject({ items: [], youAreSuperAdmin: false, bootstrapPending: true });
  });

  it("never fires again once a grant row exists, even a revoked one", async () => {
    const one = await admin("admin.one");
    const db = getDb();
    upsertGrant(db, { userId: one.id, via: "cli", by: null, now: 1 });
    db.prepare("UPDATE superadmin_grants SET revoked_at = 2 WHERE user_id = ?").run(one.id);
    expect(isSuperAdmin(one.id)).toBe(false);
    expect(listSuperAdmins(one.id).bootstrapPending).toBe(true);
    expect(listAudit(db, { limit: 10 }).some((entry) => entry.action === "auth.super_admin_bootstrap")).toBe(false);
  });

  it("opens no write transaction on the read path once grants exist", async () => {
    const one = await admin("admin.one");
    expect(isSuperAdmin(one.id)).toBe(true); // bootstrap (one BEGIN)
    const db = getDb();
    const exec = vi.spyOn(db, "exec");
    for (let i = 0; i < 5; i += 1) isSuperAdmin(one.id);
    listSuperAdmins(one.id);
    expect(exec.mock.calls.filter(([sql]) => /BEGIN/i.test(String(sql)))).toEqual([]);
  });

  it("a grant counts only for an enabled admin account", async () => {
    const one = await admin("admin.one");
    expect(isSuperAdmin(one.id)).toBe(true);
    setUserDisabled(getDb(), one.id, true, Date.now());
    expect(isEffectiveSuperAdminRow(getDb(), one.id)).toBe(false);
    expect(listSuperAdmins(one.id).bootstrapPending).toBe(true);
  });
});

describe("grant and revoke (SA only, password, at least one SA)", () => {
  it("needs a super admin and the actor's current password; audits { via: 'admin' }", async () => {
    const one = await admin("admin.one");
    const two = await admin("admin.two");
    upsertGrant(getDb(), { userId: one.id, via: "cli", by: null, now: 1 });

    expect(await setSuperAdmin(session(two), one.id, { superAdmin: false, currentPassword: PASSWORD })).toEqual({ ok: false, error: "super_admin_only" });
    expect(await setSuperAdmin(session(one), two.id, { superAdmin: true, currentPassword: "wrong-password-1" })).toEqual({ ok: false, error: "wrong_password" });
    const granted = await setSuperAdmin(session(one), two.id, { superAdmin: true, currentPassword: PASSWORD });
    expect(granted).toMatchObject({ ok: true, changed: true });
    expect(isEffectiveSuperAdminRow(getDb(), two.id)).toBe(true);
    const audit = listAudit(getDb(), { limit: 20 }).find((entry) => entry.action === "auth.super_admin_grant");
    expect(audit).toMatchObject({ actorId: one.id, target: two.id, details: { via: "admin" } });
    expect(JSON.stringify(listAudit(getDb(), { limit: 50 }))).not.toContain(PASSWORD);

    // An SA may revoke themselves while another SA remains.
    expect(await setSuperAdmin(session(one), one.id, { superAdmin: false, currentPassword: PASSWORD })).toMatchObject({ ok: true, changed: true });
    expect(listAudit(getDb(), { limit: 20 }).find((entry) => entry.action === "auth.super_admin_revoke")).toMatchObject({ actorId: one.id, target: one.id });
  });

  it("refuses the last super admin (409 in the API) and non-admin or disabled targets", async () => {
    const one = await admin("admin.one");
    expect(isSuperAdmin(one.id)).toBe(true);
    expect(isLastSuperAdmin(getDb(), one.id)).toBe(true);
    expect(await setSuperAdmin(session(one), one.id, { superAdmin: false, currentPassword: PASSWORD })).toEqual({ ok: false, error: "last_super_admin" });
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: PASSWORD });
    expect(await setSuperAdmin(session(one), staff.id, { superAdmin: true, currentPassword: PASSWORD })).toEqual({ ok: false, error: "not_admin" });
    const off = await admin("admin.off", { disabled: true });
    expect(await setSuperAdmin(session(one), off.id, { superAdmin: true, currentPassword: PASSWORD })).toEqual({ ok: false, error: "not_admin" });
    expect(await setSuperAdmin(session(one), "no-such-user", { superAdmin: true, currentPassword: PASSWORD })).toEqual({ ok: false, error: "not_found" });
  });

  it("two super admins revoking each other at once cannot leave zero (L4)", async () => {
    const one = await admin("admin.one");
    const two = await admin("admin.two");
    upsertGrant(getDb(), { userId: one.id, via: "cli", by: null, now: 1 });
    upsertGrant(getDb(), { userId: two.id, via: "cli", by: null, now: 1 });
    const results = await Promise.all([
      setSuperAdmin(session(one), two.id, { superAdmin: false, currentPassword: PASSWORD }),
      setSuperAdmin(session(two), one.id, { superAdmin: false, currentPassword: PASSWORD }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(countEffectiveSuperAdmins(getDb())).toBe(1);
  });

  it("throttles wrong passwords: 5 tries per 15 minutes", async () => {
    const one = await admin("admin.one");
    const two = await admin("admin.two");
    upsertGrant(getDb(), { userId: one.id, via: "cli", by: null, now: 1 });
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect(await setSuperAdmin(session(one), two.id, { superAdmin: true, currentPassword: `wrong-${i}-password` }, now)).toEqual({ ok: false, error: "wrong_password" });
    }
    expect(await setSuperAdmin(session(one), two.id, { superAdmin: true, currentPassword: PASSWORD }, now)).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("account protection (H1, Q7)", () => {
  it("a non-SA admin cannot reset, disable or rename a super admin; staff accounts are SA-only", async () => {
    const sa = await admin("admin.sa");
    expect(isSuperAdmin(sa.id)).toBe(true);
    const plain = await admin("admin.plain");
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: PASSWORD });
    const actor = session(plain);

    expect(await adminResetPassword(actor, sa.id)).toEqual({ ok: false, error: "super_admin_target" });
    expect(adminUpdateUser(actor, sa.id, { disabled: true })).toEqual({ ok: false, error: "super_admin_target" });
    expect(adminUpdateUser(actor, sa.id, { displayName: "Someone Else" })).toEqual({ ok: false, error: "super_admin_target" });
    expect(await adminResetPassword(actor, staff.id)).toEqual({ ok: false, error: "super_admin_only" });
    expect(adminUpdateUser(actor, staff.id, { disabled: true })).toEqual({ ok: false, error: "super_admin_only" });
    expect(await adminCreateUser(actor, { role: "staff", displayName: "New Staff", loginId: "staff.two" })).toEqual({ ok: false, error: "super_admin_only" });
    expect(findUserById(getDb(), sa.id)?.displayName).not.toBe("Someone Else");

    // The SA does all of it; the last SA can never be disabled.
    expect(adminUpdateUser(session(sa), staff.id, { disabled: true })).toMatchObject({ ok: true });
    expect(await adminCreateUser(session(sa), { role: "staff", displayName: "New Staff", loginId: "staff.two" })).toMatchObject({ ok: true });
    expect(adminUpdateUser(session(sa), sa.id, { disabled: true })).toEqual({ ok: false, error: "last_super_admin" });
    // Ordinary admins keep their work for students and parents.
    const learner = await createTestUser({ role: "student", loginId: "learner.one", password: PASSWORD });
    expect(await adminResetPassword(actor, learner.id)).toMatchObject({ ok: true });
  });

  it("a disabled super admin whose grant is still live stays protected: no reset, enable or rename by a non-SA", async () => {
    const one = await admin("admin.one");
    const two = await admin("admin.two");
    const plain = await admin("admin.plain");
    upsertGrant(getDb(), { userId: one.id, via: "cli", by: null, now: 1 });
    upsertGrant(getDb(), { userId: two.id, via: "cli", by: null, now: 1 });
    // SA one off-boards SA two (allowed: another SA remains); the grant row stays active.
    expect(adminUpdateUser(session(one), two.id, { disabled: true })).toMatchObject({ ok: true });
    expect(isEffectiveSuperAdminRow(getDb(), two.id)).toBe(false);

    const actor = session(plain);
    expect(await adminResetPassword(actor, two.id)).toEqual({ ok: false, error: "super_admin_target" });
    expect(adminUpdateUser(actor, two.id, { disabled: false })).toEqual({ ok: false, error: "super_admin_target" });
    expect(adminUpdateUser(actor, two.id, { displayName: "Someone Else" })).toEqual({ ok: false, error: "super_admin_target" });
    expect(findUserById(getDb(), two.id)?.disabled).toBe(true);

    // A super admin can still revoke the dormant grant; the account is then an ordinary admin's to manage.
    expect(listSuperAdmins(one.id).items.find((item) => item.userId === two.id)).toMatchObject({ effective: false });
    expect(await setSuperAdmin(session(one), two.id, { superAdmin: false, currentPassword: PASSWORD })).toMatchObject({ ok: true, changed: true });
    expect(adminUpdateUser(actor, two.id, { disabled: false })).toMatchObject({ ok: true });
  });
});

describe("server command (scripts/super-admin.mjs)", () => {
  async function cli(args: string[]) {
    const { runSuperAdminCli } = (await import("../../../scripts/super-admin.mjs")) as {
      runSuperAdminCli: (db: unknown, args: string[], now?: number) => Promise<{ code: number; lines: string[]; temporaryPassword?: string }>;
    };
    return runSuperAdminCli(getDb(), args);
  }

  it("list runs the bootstrap rule; grant and revoke by login id; the last SA is kept", async () => {
    const one = await admin("admin.one");
    const listed = await cli(["list"]);
    expect(listed.code).toBe(0);
    expect(listed.lines.join("\n")).toContain("admin.one");
    expect(isEffectiveSuperAdminRow(getDb(), one.id)).toBe(true);

    await admin("admin.two");
    expect((await cli(["grant", "ADMIN.TWO"])).code).toBe(0);
    expect(countEffectiveSuperAdmins(getDb())).toBe(2);
    expect(listAudit(getDb(), { limit: 10 }).find((entry) => entry.action === "auth.super_admin_grant")).toMatchObject({ actorId: null, details: { via: "cli" } });
    expect((await cli(["revoke", "admin.two"])).code).toBe(0);
    expect((await cli(["revoke", "admin.one"])).code).toBe(1);
    expect(countEffectiveSuperAdmins(getDb())).toBe(1);
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: PASSWORD });
    expect((await cli(["grant", staff.loginId])).code).toBe(1);
    expect((await cli(["grant", "nobody.here"])).code).toBe(1);
    expect((await cli(["wat"])).code).toBe(1);
  });

  it("reset-password: admin accounts only, a temporary password once, must change, signed out everywhere", async () => {
    const one = await admin("admin.one");
    insertSession(getDb(), { tokenHash: "h1", userId: one.id, now: Date.now(), expiresAt: Date.now() + 60_000, userAgent: null });
    const result = await cli(["reset-password", "admin.one"]);
    expect(result.code).toBe(0);
    expect(result.temporaryPassword).toMatch(/^[\w]{4}(-[\w]{4}){3}$/);
    const user = findUserByLoginId(getDb(), "admin.one");
    expect(user?.mustChangePassword).toBe(true);
    expect(await verifyPassword(result.temporaryPassword ?? "", user?.passwordHash ?? "")).toBe(true);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(one.id)?.n).toBe(0);
    const entry = listAudit(getDb(), { limit: 10 }).find((row) => row.action === "auth.password_reset");
    expect(entry).toMatchObject({ actorId: null, target: one.id, details: { via: "cli" } });
    expect(JSON.stringify(listAudit(getDb(), { limit: 50 }))).not.toContain(result.temporaryPassword);
    await createTestUser({ role: "student", loginId: "learner.one", password: PASSWORD });
    expect((await cli(["reset-password", "learner.one"])).code).toBe(1);
  });
});
