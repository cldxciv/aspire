import { describe, expect, it } from "vitest";

import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  needsRehash,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SCRYPT_PARAMS,
  verifyAgainstDummy,
  verifyPassword,
} from "./password";

// Synthetic passwords only.
const PASSWORD = "correct horse battery";

describe("hashPassword / verifyPassword", () => {
  it("stores scrypt$N$r$p$salt$hash with the current parameters", async () => {
    const stored = await hashPassword(PASSWORD);
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(["scrypt", String(SCRYPT_PARAMS.N), String(SCRYPT_PARAMS.r), String(SCRYPT_PARAMS.p)]);
    expect(Buffer.from(parts[4], "base64url")).toHaveLength(16);
    expect(Buffer.from(parts[5], "base64url")).toHaveLength(32);
    expect(stored).not.toContain(PASSWORD);
  });

  it("round-trips and rejects a wrong password", async () => {
    const stored = await hashPassword(PASSWORD);
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}!`, stored)).resolves.toBe(false);
    await expect(verifyPassword("Correct horse battery", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("uses a fresh random salt every time", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    await expect(verifyPassword(PASSWORD, a)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, b)).resolves.toBe(true);
  });

  it("normalises Unicode (composed and decomposed accents match)", async () => {
    const stored = await hashPassword("café-password-1");
    await expect(verifyPassword("café-password-1", stored)).resolves.toBe(true);
  });

  it("never matches a malformed or out-of-bounds hash", async () => {
    const stored = await hashPassword(PASSWORD);
    const [, , r, p, salt, hash] = stored.split("$");
    for (const bad of [
      "",
      "plain-text",
      stored.replace("scrypt", "bcrypt"),
      ["scrypt", 2 ** 22, r, p, salt, hash].join("$"), // memory bomb: refused before deriving
      ["scrypt", 1000, r, p, salt, hash].join("$"), // not a power of two
      ["scrypt", 2 ** 15, 64, p, salt, hash].join("$"),
      ["scrypt", 2 ** 15, r, p, "!!", hash].join("$"),
      `${stored}$extra`,
    ]) {
      await expect(verifyPassword(PASSWORD, bad)).resolves.toBe(false);
    }
  });

  it("flags hashes made with other parameters for re-hashing", async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false);
    expect(needsRehash(await hashPassword(PASSWORD, { N: 2 ** 14, r: 8, p: 1 }))).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });

  it("verifyAgainstDummy always fails", async () => {
    await expect(verifyAgainstDummy(PASSWORD)).resolves.toBe(false);
  });
});

describe("checkPasswordPolicy", () => {
  it(`requires ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`, () => {
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("too_short");
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("too_long");
  });

  it("counts characters, not UTF-16 units or bytes", () => {
    expect(checkPasswordPolicy("पासवर्ड-१२३")).toBeNull(); // 11 code points
    expect(checkPasswordPolicy("😀".repeat(9))).toBe("too_short");
  });

  it("rejects the login id as the password (case-insensitive)", () => {
    expect(checkPasswordPolicy("Student.Asha", "student.asha")).toBe("same_as_login_id");
    expect(checkPasswordPolicy("student.asha-2026", "student.asha")).toBeNull();
  });
});

describe("generateTemporaryPassword", () => {
  it("produces unambiguous, policy-compliant, unique passwords", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{4}(-[a-km-np-zA-HJ-NP-Z2-9]{4}){3}$/);
      expect(checkPasswordPolicy(password, "some.user")).toBeNull();
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });
});
