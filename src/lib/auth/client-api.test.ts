import { afterEach, describe, expect, it, vi } from "vitest";

import {
  callApi,
  clientPasswordIssue,
  identifyApiMessage,
  PASSWORD_CHANGE_REQUIRED_TEXT,
  PASSWORD_LENGTH,
  PASSWORD_POLICY_TEXT,
  retryAfterMinutes,
} from "./client-api";
import { PASSWORD_CHANGE_REQUIRED_MESSAGE } from "./guards";
import { AUTH_MESSAGES } from "./messages";
import { checkPasswordPolicy, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGES } from "./password";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("mirrored server strings stay in sync", () => {
  it("matches the server-only constants exactly", () => {
    expect(PASSWORD_CHANGE_REQUIRED_TEXT).toBe(PASSWORD_CHANGE_REQUIRED_MESSAGE);
    expect(PASSWORD_POLICY_TEXT).toEqual(PASSWORD_POLICY_MESSAGES);
    expect(PASSWORD_LENGTH).toEqual({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
  });

  it("recognises every fixed message the UI localises", () => {
    expect(identifyApiMessage(AUTH_MESSAGES.wrongCurrentPassword)).toBe("wrongCurrentPassword");
    expect(identifyApiMessage(AUTH_MESSAGES.samePassword)).toBe("samePassword");
    expect(identifyApiMessage(AUTH_MESSAGES.loginIdTaken)).toBe("loginIdTaken");
    expect(identifyApiMessage(AUTH_MESSAGES.invalidLoginId)).toBe("invalidLoginId");
    expect(identifyApiMessage(AUTH_MESSAGES.invalidDisplayName)).toBe("invalidDisplayName");
    expect(identifyApiMessage(AUTH_MESSAGES.selfDisable)).toBe("selfDisable");
    expect(identifyApiMessage(AUTH_MESSAGES.lastAdmin)).toBe("lastAdmin");
    expect(identifyApiMessage(AUTH_MESSAGES.selfReset)).toBe("selfReset");
    expect(identifyApiMessage(AUTH_MESSAGES.notAParent)).toBe("notAParent");
    expect(identifyApiMessage(AUTH_MESSAGES.notAStudent)).toBe("notAStudent");
    expect(identifyApiMessage(AUTH_MESSAGES.userNotFound)).toBe("userNotFound");
    expect(identifyApiMessage(PASSWORD_POLICY_MESSAGES.too_short)).toBe("passwordTooShort");
    expect(identifyApiMessage(PASSWORD_POLICY_MESSAGES.same_as_login_id)).toBe("passwordSameAsLoginId");
    expect(identifyApiMessage(PASSWORD_CHANGE_REQUIRED_MESSAGE)).toBe("passwordChangeRequired");
    expect(identifyApiMessage("Something else")).toBeNull();
    expect(identifyApiMessage(undefined)).toBeNull();
  });

  it("the client password check agrees with the server policy", () => {
    const cases: [string, string | undefined][] = [
      ["short", undefined],
      ["a".repeat(10), undefined],
      ["a".repeat(128), undefined],
      ["a".repeat(129), undefined],
      ["दस अक्षर वाला पासवर्ड", undefined],
      ["Dev.Student1", "dev.student1"],
      [" dev.student1 ", "dev.student1"],
      ["another-long-password", "dev.student1"],
    ];
    const serverToClient = {
      too_short: "passwordTooShort",
      too_long: "passwordTooLong",
      same_as_login_id: "passwordSameAsLoginId",
    } as const;
    for (const [password, loginId] of cases) {
      const server = checkPasswordPolicy(password, loginId);
      expect(clientPasswordIssue(password, loginId), password).toBe(server ? serverToClient[server] : null);
    }
  });
});

describe("callApi", () => {
  it("returns data for a success envelope and sends same-origin JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true, data: { role: "student" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callApi<{ role: string }>("/api/auth/login", { body: { loginId: "x", password: "y" } });
    expect(result).toEqual({ ok: true, status: 200, data: { role: "student" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("maps error envelopes, field errors and Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          422,
          {
            ok: false,
            error: "validation",
            message: "Please check the highlighted fields.",
            fieldErrors: { currentPassword: [AUTH_MESSAGES.wrongCurrentPassword], newPassword: ["unknown"] },
          },
        ),
      ),
    );
    const failure = await callApi("/api/auth/change-password", { body: {} });
    expect(failure).toMatchObject({
      ok: false,
      status: 422,
      error: "validation",
      fieldErrors: { currentPassword: "wrongCurrentPassword", newPassword: null },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(429, { ok: false, error: "rate_limited", message: "x" }, { "Retry-After": "125" })),
    );
    const limited = await callApi("/api/auth/login", { body: {} });
    expect(limited).toMatchObject({ ok: false, error: "rate_limited", retryAfterSeconds: 125 });
    expect(retryAfterMinutes(limited.ok ? undefined : limited.retryAfterSeconds)).toBe(3);
  });

  it("never throws: network errors and non-JSON bodies become failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await callApi("/api/auth/logout", { method: "POST" })).toEqual({
      ok: false,
      status: 0,
      error: "network",
      known: null,
      fieldErrors: {},
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await callApi("/api/admin/users")).toMatchObject({ ok: false, status: 502, error: "server_error" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    expect(await callApi("/api/admin/users")).toMatchObject({ ok: false, error: "unauthenticated" });
  });

  it("refuses anything but the site's own API paths", async () => {
    await expect(callApi("https://evil.example/api/x")).rejects.toThrow();
    await expect(callApi("//evil.example/api/x")).rejects.toThrow();
  });

  it("rounds Retry-After up to whole minutes", () => {
    expect(retryAfterMinutes(undefined)).toBe(1);
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(60)).toBe(1);
    expect(retryAfterMinutes(61)).toBe(2);
  });
});
