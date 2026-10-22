import { afterEach, describe, expect, it, vi } from "vitest";

import { recordAudit, listAudit, sanitizeAuditDetails } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import {
  keyedHash,
  keyedHashCandidates,
  openSecret,
  resealSecret,
  sealedKeyState,
  sealSecret,
  secretAad,
  SecretBoxError,
  secretBoxStatus,
} from "./secret-box";

// Synthetic keys only (≥ 43 characters, opaque).
const KEY_A = "test-key-A-0123456789-abcdefghijklmnopqrstuvwxyz";
const KEY_B = "test-key-B-9876543210-zyxwvutsrqponmlkjihgfedcba";

function useKeys(current: string | undefined, previous?: string) {
  vi.stubEnv("INTEGRATIONS_SECRET", current ?? "");
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", previous ?? "");
}

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof SecretBoxError ? error.code : "other";
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("secret box (lead routing §19, M13)", () => {
  it("seals and opens a secret, bound to its AAD, as a v1 envelope", () => {
    useKeys(KEY_A);
    const aad = secretAad("meta", "access_token");
    expect(aad).toBe("meta:access_token:v1");
    const sealed = sealSecret("EAAB-synthetic-token", aad);
    expect(sealed).toMatch(/^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("synthetic");
    expect(openSecret(sealed, aad)).toBe("EAAB-synthetic-token");
    // A fresh IV every time.
    expect(sealSecret("EAAB-synthetic-token", aad)).not.toBe(sealed);
    expect(sealedKeyState(sealed)).toBe("current");
  });

  it("refuses a swapped AAD, a tampered envelope and garbage", () => {
    useKeys(KEY_A);
    const sealed = sealSecret("app-secret-value", secretAad("meta", "app_secret"));
    expect(code(() => openSecret(sealed, secretAad("meta", "access_token")))).toBe("corrupt");
    const parts = sealed.split(".");
    const ciphertext = parts[3];
    const tampered = [...parts.slice(0, 3), `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`, parts[4]].join(".");
    expect(code(() => openSecret(tampered, secretAad("meta", "app_secret")))).toBe("corrupt");
    expect(code(() => openSecret("not-an-envelope", "x"))).toBe("corrupt");
    expect(sealedKeyState("nope")).toBe(false);
  });

  it("opens envelopes of the previous key during a rotation, and reseal moves them to the current key", () => {
    useKeys(KEY_A);
    const aad = secretAad("meta", "verify_token");
    const old = sealSecret("verify-me", aad);
    const oldKeyId = secretBoxStatus().keyId;

    useKeys(KEY_B, KEY_A);
    expect(secretBoxStatus()).toMatchObject({ configured: true, previousKeyId: oldKeyId });
    expect(sealedKeyState(old)).toBe("previous");
    expect(openSecret(old, aad)).toBe("verify-me");
    const resealed = resealSecret(old, aad);
    expect(sealedKeyState(resealed)).toBe("current");
    expect(openSecret(resealed, aad)).toBe("verify-me");

    // Without the previous key the old envelope names a key we no longer have.
    useKeys(KEY_B);
    expect(code(() => openSecret(old, aad))).toBe("key_mismatch");
  });

  it("rejects a short key and reports a missing one", () => {
    useKeys("too-short-key");
    expect(secretBoxStatus()).toMatchObject({ configured: false, weak: true, keyId: null });
    expect(code(() => sealSecret("x", "a"))).toBe("weak_key");
    expect(code(() => keyedHash("phone", "+916000012345"))).toBe("weak_key");
    useKeys(undefined);
    expect(secretBoxStatus()).toMatchObject({ configured: false, weak: false });
    expect(code(() => sealSecret("x", "a"))).toBe("not_configured");
    expect(keyedHashCandidates("phone", "+916000012345")).toEqual([]);
  });

  it("keyed hashes are stable, purpose-separated and key-dependent; the previous key is available for lookups", () => {
    useKeys(KEY_A);
    const a = keyedHash("phone", "+916000012345");
    expect(a).toBe(keyedHash("phone", "+916000012345"));
    expect(a).not.toBe(keyedHash("csv-ref", "+916000012345"));
    expect(a).not.toContain("6000012345");
    expect(code(() => keyedHash("phone", "x", { previous: true }))).toBe("not_configured");
    useKeys(KEY_B, KEY_A);
    expect(keyedHash("phone", "+916000012345")).not.toBe(a);
    expect(keyedHash("phone", "+916000012345", { previous: true })).toBe(a);
    expect(keyedHashCandidates("phone", "+916000012345")).toEqual([keyedHash("phone", "+916000012345"), a]);
  });

  it("the audit row of a secret change keeps { slot } (it survives the key sanitiser) and never a secret", () => {
    vi.stubEnv("AUTH_DB_PATH", ":memory:");
    resetDatabaseForTests();
    expect(sanitizeAuditDetails({ slot: "access_token", token: "EAAB", secretValue: "x" })).toEqual({ slot: "access_token" });
    recordAudit(getDb(), { actorId: null, action: "crm.meta_secret_set", target: "meta", details: { slot: "access_token" }, now: 1 });
    expect(listAudit(getDb(), { limit: 1 })[0]).toMatchObject({ action: "crm.meta_secret_set", details: { slot: "access_token" } });
  });
});
