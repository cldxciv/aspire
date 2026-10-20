import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MCP token module (src/lib/mcp/tokens.ts) against a fresh in-memory database per test.
const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { insertUser, setUserDisabled, setUserPassword } = await import("@/lib/db/users");
const tokens = await import("./tokens");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 10, 0, 0);

function makeUser(role: "admin" | "student" | "parent", loginId: string, extra: { mustChangePassword?: boolean } = {}) {
  return insertUser(getDb(), {
    role,
    loginId,
    displayName: `Test ${loginId}`,
    passwordHash: "scrypt$test$not-a-real-hash",
    mustChangePassword: extra.mustChangePassword ?? false,
    now: NOW,
  });
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("createMcpToken", () => {
  it("returns the plaintext once and stores only its SHA-256", () => {
    const admin = makeUser("admin", "admin.one");
    const { token, record } = tokens.createMcpToken({ name: "  Claude   Code  ", scopes: "read", createdBy: admin.id }, NOW);

    expect(token).toMatch(/^asp_mcp_[A-Za-z0-9_-]{43}$/);
    expect(record).toMatchObject({
      name: "Claude Code",
      scopes: "read",
      createdBy: admin.id,
      createdByName: "Test admin.one",
      status: "active",
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(Date.parse(record.expiresAt) - Date.parse(record.createdAt)).toBe(90 * DAY);

    const row = getDb().prepare("SELECT * FROM mcp_tokens").get();
    expect(row?.token_hash).toBe(tokens.hashMcpToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(record)).not.toContain(token);
    expect(JSON.stringify(record)).not.toContain(tokens.hashMcpToken(token));
  });

  it("generates a different token every time", () => {
    const admin = makeUser("admin", "admin.one");
    const a = tokens.createMcpToken({ name: "a", createdBy: admin.id }, NOW);
    const b = tokens.createMcpToken({ name: "b", createdBy: admin.id }, NOW);
    expect(a.token).not.toBe(b.token);
    expect(a.record.id).not.toBe(b.record.id);
  });

  it("audits the creation without the token", () => {
    const admin = makeUser("admin", "admin.one");
    const { token, record } = tokens.createMcpToken(
      { name: "Agent", scopes: "read write", expiresInDays: 30, createdBy: admin.id },
      NOW,
    );
    const [entry] = listAudit(getDb(), { limit: 5 });
    expect(entry).toMatchObject({
      actorId: admin.id,
      action: "mcp.token_create",
      target: record.id,
      details: { name: "Agent", scopes: "read write", expiresInDays: 30 },
    });
    expect(JSON.stringify(entry)).not.toContain(token);
  });

  it("validates name, scopes and expiry (1–365 days)", () => {
    const admin = makeUser("admin", "admin.one");
    const create = (input: Partial<Parameters<typeof tokens.createMcpToken>[0]>) =>
      tokens.createMcpToken({ name: "ok", createdBy: admin.id, ...input } as Parameters<typeof tokens.createMcpToken>[0], NOW);
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (error) {
        return error instanceof tokens.McpTokenError ? error.code : "other";
      }
    };
    expect(codeOf(() => create({ name: "   " }))).toBe("invalid_name");
    expect(codeOf(() => create({ name: "x".repeat(81) }))).toBe("invalid_name");
    expect(codeOf(() => create({ name: "bad\u0007name" }))).toBe("invalid_name");
    expect(codeOf(() => create({ scopes: "admin" as never }))).toBe("invalid_scopes");
    expect(codeOf(() => create({ expiresInDays: 0 }))).toBe("invalid_expiry");
    expect(codeOf(() => create({ expiresInDays: 366 }))).toBe("invalid_expiry");
    expect(codeOf(() => create({ expiresInDays: 1.5 }))).toBe("invalid_expiry");
    expect(codeOf(() => create({ expiresInDays: 365 }))).toBeNull();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get()?.n).toBe(1);
  });

  it("only active admins (password changed) may create tokens", () => {
    const student = makeUser("student", "student.one");
    const pending = makeUser("admin", "admin.pending", { mustChangePassword: true });
    const disabled = makeUser("admin", "admin.off");
    setUserDisabled(getDb(), disabled.id, true, NOW);
    for (const createdBy of [student.id, pending.id, disabled.id, "no-such-user"]) {
      expect(() => tokens.createMcpToken({ name: "x", createdBy }, NOW)).toThrow(tokens.McpTokenError);
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get()?.n).toBe(0);
    expect(listAudit(getDb(), { limit: 5 })).toHaveLength(0);
  });

  it("exposes a body schema with defaults", () => {
    expect(tokens.createMcpTokenInputSchema.parse({ name: " My  agent " })).toEqual({
      name: "My agent",
      scopes: "read",
      expiresInDays: 90,
    });
    expect(tokens.createMcpTokenInputSchema.safeParse({ name: "x", expiresInDays: 400 }).success).toBe(false);
    expect(tokens.createMcpTokenInputSchema.safeParse({ name: "x", scopes: "write" }).success).toBe(false);
  });
});

describe("resolveMcpToken", () => {
  it("accepts an active token and records last use (at most once a minute)", () => {
    const admin = makeUser("admin", "admin.one");
    const { token, record } = tokens.createMcpToken({ name: "Agent", scopes: "read write", createdBy: admin.id }, NOW);
    const resolved = tokens.resolveMcpToken(token, NOW + 1000);
    expect(resolved).toEqual({
      ok: true,
      caller: {
        tokenId: record.id,
        tokenName: "Agent",
        scopes: "read write",
        createdBy: admin.id,
        expiresAt: Date.parse(record.expiresAt),
      },
    });
    expect(tokens.getMcpToken(record.id, NOW)?.lastUsedAt).toBe(new Date(NOW + 1000).toISOString());
    tokens.resolveMcpToken(token, NOW + 2000);
    expect(tokens.getMcpToken(record.id, NOW)?.lastUsedAt).toBe(new Date(NOW + 1000).toISOString());
    tokens.resolveMcpToken(token, NOW + 61_000);
    expect(tokens.getMcpToken(record.id, NOW)?.lastUsedAt).toBe(new Date(NOW + 61_000).toISOString());
  });

  it("rejects malformed and unknown tokens", () => {
    const admin = makeUser("admin", "admin.one");
    const { token } = tokens.createMcpToken({ name: "Agent", createdBy: admin.id }, NOW);
    expect(tokens.resolveMcpToken("", NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(tokens.resolveMcpToken("asp_mcp_short", NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(tokens.resolveMcpToken(token.toUpperCase(), NOW)).toMatchObject({ ok: false });
    const other = `asp_mcp_${"A".repeat(43)}`;
    expect(tokens.resolveMcpToken(other, NOW)).toEqual({ ok: false, reason: "unknown" });
    expect(tokens.resolveMcpToken(`${token}x`, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects expired tokens", () => {
    const admin = makeUser("admin", "admin.one");
    const { token, record } = tokens.createMcpToken({ name: "Agent", expiresInDays: 1, createdBy: admin.id }, NOW);
    expect(tokens.resolveMcpToken(token, NOW + DAY - 1).ok).toBe(true);
    expect(tokens.resolveMcpToken(token, NOW + DAY)).toEqual({ ok: false, reason: "expired" });
    expect(tokens.getMcpToken(record.id, NOW + DAY)?.status).toBe("expired");
  });

  it("rejects revoked tokens immediately; revocation is idempotent and audited once", () => {
    const admin = makeUser("admin", "admin.one");
    const other = makeUser("admin", "admin.two");
    const { token, record } = tokens.createMcpToken({ name: "Agent", createdBy: admin.id }, NOW);

    const first = tokens.revokeMcpToken(record.id, other.id, NOW + 5);
    expect(first?.changed).toBe(true);
    expect(first?.record).toMatchObject({ status: "revoked", revokedBy: other.id, revokedAt: new Date(NOW + 5).toISOString() });
    expect(tokens.resolveMcpToken(token, NOW + 6)).toEqual({ ok: false, reason: "revoked" });

    expect(tokens.revokeMcpToken(record.id, other.id, NOW + 7)?.changed).toBe(false);
    expect(tokens.revokeMcpToken("missing", other.id, NOW)).toBeNull();
    const revokes = listAudit(getDb(), { limit: 10 }).filter((e) => e.action === "mcp.token_revoke");
    expect(revokes).toHaveLength(1);
    expect(revokes[0]).toMatchObject({ actorId: other.id, target: record.id });
  });

  it("rejects tokens whose creator is disabled or must change a temporary password", () => {
    const admin = makeUser("admin", "admin.one");
    const { token, record } = tokens.createMcpToken({ name: "Agent", createdBy: admin.id }, NOW);
    setUserDisabled(getDb(), admin.id, true, NOW);
    expect(tokens.resolveMcpToken(token, NOW)).toEqual({ ok: false, reason: "creator_inactive" });
    expect(tokens.getMcpToken(record.id, NOW)?.status).toBe("creator_inactive");

    setUserDisabled(getDb(), admin.id, false, NOW);
    expect(tokens.resolveMcpToken(token, NOW).ok).toBe(true);

    setUserPassword(getDb(), admin.id, "scrypt$test$reset", true, NOW);
    expect(tokens.resolveMcpToken(token, NOW)).toEqual({ ok: false, reason: "creator_inactive" });
  });
});

describe("listMcpTokens", () => {
  it("lists newest first without tokens or hashes", () => {
    const admin = makeUser("admin", "admin.one");
    const a = tokens.createMcpToken({ name: "first", createdBy: admin.id }, NOW);
    const b = tokens.createMcpToken({ name: "second", scopes: "read write", createdBy: admin.id }, NOW + 1000);
    const list = tokens.listMcpTokens(NOW + 2000);
    expect(list.map((t) => t.name)).toEqual(["second", "first"]);
    const json = JSON.stringify(list);
    for (const created of [a, b]) {
      expect(json).not.toContain(created.token);
      expect(json).not.toContain(tokens.hashMcpToken(created.token));
    }
    expect(Object.keys(list[0]).sort()).toEqual(
      ["createdAt", "createdBy", "createdByName", "expiresAt", "id", "lastUsedAt", "name", "revokedAt", "revokedBy", "scopes", "status"].sort(),
    );
  });

  it("canWrite only for 'read write'", () => {
    expect(tokens.canWrite({ scopes: "read" })).toBe(false);
    expect(tokens.canWrite({ scopes: "read write" })).toBe(true);
  });
});
