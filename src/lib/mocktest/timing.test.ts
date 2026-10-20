import { describe, expect, it } from "vitest";
import { MOCK_TESTS, weeklyWindows } from "@/content/mocktest";
import { nicknameIdentityIssue } from "./schemas";
import { clearToolStorage, TOOL_STORAGE_PREFIXES } from "./shared-device";
import {
  ATTEMPT_TIMING,
  evaluateAttempt,
  formatVerifyId,
  isLeaderboardTest,
  maxDurationMs,
  minDurationMs,
  normaliseVerifyId,
  scoreBand,
  solutionsLockedUntil,
} from "./timing";

const MINUTE = 60_000;
const WEEKLY = { kind: "weekly" as const, durationMinutes: 30, windows: weeklyWindows("2026-10-19", 1) };
const W1 = WEEKLY.windows[0];
const T0 = Date.parse("2026-10-21T10:00:00+05:30");

describe("leaderboard timing rules (QA-SEC-M6 M1)", () => {
  it("only weekly tests with windows have leaderboards", () => {
    expect(MOCK_TESTS.filter(isLeaderboardTest).map((t) => t.id)).toEqual(["all-himachal-mock-sample"]);
    expect(isLeaderboardTest({ kind: "weekly", windows: [] })).toBe(false);
    expect(isLeaderboardTest({ kind: "practice" })).toBe(false);
  });

  it("minimum = max(5 min, 25 % of the test's time) — never more than the test — and maximum = time + grace", () => {
    expect(minDurationMs(30)).toBe(7.5 * MINUTE);
    expect(minDurationMs(60)).toBe(15 * MINUTE);
    expect(minDurationMs(10)).toBe(5 * MINUTE);
    expect(minDurationMs(3)).toBe(3 * MINUTE);
    expect(maxDurationMs(30)).toBe(30 * MINUTE + ATTEMPT_TIMING.graceMs);
  });

  const ok = (startedAt: number, windowId: string | null = W1.id) => ({ status: "ok" as const, startedAt, windowId });

  it("eligible only with a valid start in a window and a server duration within the limits", () => {
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0), now: T0 + 10 * MINUTE })).toEqual({
      leaderboard: true,
      practiceReason: null,
      serverStartedAt: T0,
      serverSubmittedAt: T0 + 10 * MINUTE,
      durationSec: 600,
      windowId: W1.id,
    });
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0), now: T0 + 7.5 * MINUTE }).leaderboard).toBe(true);
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0), now: T0 + 7.5 * MINUTE - 1000 }).practiceReason).toBe("too_fast");
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0), now: T0 + 32 * MINUTE }).leaderboard).toBe(true);
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0), now: T0 + 32 * MINUTE + 1 }).practiceReason).toBe("too_slow");
    expect(evaluateAttempt({ test: WEEKLY, start: ok(T0, null), now: T0 + 10 * MINUTE }).practiceReason).toBe("outside_window");
  });

  it("without a valid start the attempt is practice, with the reason", () => {
    const reason = (status: "missing" | "unknown" | "used" | "other_user" | "other_test" | "guest") =>
      evaluateAttempt({ test: WEEKLY, start: { status }, now: T0 }).practiceReason;
    expect(reason("missing")).toBe("no_start");
    expect(reason("guest")).toBe("signed_out_start");
    for (const status of ["unknown", "used", "other_user", "other_test"] as const) expect(reason(status)).toBe("start_invalid");
    const practice = evaluateAttempt({ test: { kind: "practice", durationMinutes: 45 }, start: { status: "missing" }, now: T0 });
    expect(practice).toMatchObject({ leaderboard: false, practiceReason: "practice_test", durationSec: null, windowId: null });
  });

  it("the answer key is locked from a window's start until its last attempts must have finished", () => {
    const release = Date.parse(W1.endsAt) + maxDurationMs(30);
    expect(solutionsLockedUntil(WEEKLY, Date.parse(W1.startsAt) - 1)).toBeNull();
    expect(solutionsLockedUntil(WEEKLY, T0)).toBe(release);
    expect(solutionsLockedUntil(WEEKLY, release - 1)).toBe(release);
    expect(solutionsLockedUntil(WEEKLY, release)).toBeNull();
    expect(solutionsLockedUntil({ kind: "practice", durationMinutes: 45 }, T0)).toBeNull();
    // Back-to-back weeks of the same test chain into one lock.
    const three = { ...WEEKLY, windows: weeklyWindows("2026-10-19", 3) };
    expect(solutionsLockedUntil(three, T0)).toBe(Date.parse(three.windows[2].endsAt) + maxDurationMs(30));
    // A gap between windows releases the key in between.
    const gap = { ...WEEKLY, windows: [W1, ...weeklyWindows("2026-11-09", 1)] };
    expect(solutionsLockedUntil(gap, T0)).toBe(release);
    expect(solutionsLockedUntil(gap, release + MINUTE)).toBeNull();
  });
});

describe("certificate verification ids and score bands (L7)", () => {
  it("score bands are 10-point percentages of the maximum", () => {
    expect(scoreBand(-5, 60)).toBe("below-0");
    expect(scoreBand(0, 60)).toBe("0-9");
    expect(scoreBand(44, 60)).toBe("70-79");
    expect(scoreBand(54, 60)).toBe("90-100");
    expect(scoreBand(60, 60)).toBe("90-100");
  });

  it("ids are 16 hex characters, typed in any case with or without dashes", () => {
    expect(formatVerifyId("0123456789abcdef")).toBe("0123-4567-89AB-CDEF");
    expect(normaliseVerifyId("0123-4567-89AB-CDEF")).toBe("0123456789abcdef");
    expect(normaliseVerifyId(" 0123 4567 89ab cdef ")).toBe("0123456789abcdef");
    expect(normaliseVerifyId("0123-4567")).toBeNull();
    expect(normaliseVerifyId("zzzz-4567-89ab-cdef")).toBeNull();
  });
});

describe("nicknames that reveal the student (L6)", () => {
  const account = { displayName: "Riya Kumari Sharma", loginId: "riya.k" };

  it("refuses the login id and first name + another part of the real name, in any order or spacing", () => {
    expect(nicknameIdentityIssue("Riya.K", account)).toBe("login_id");
    expect(nicknameIdentityIssue("RIYAK fan", account)).toBe("login_id");
    for (const nickname of ["Riya Sharma", "sharma riya", "R i y a  S h a r m a", "Kumari-Riya", "riyasharma07"]) {
      expect(nicknameIdentityIssue(nickname, account), nickname).toBe("real_name");
    }
  });

  it("allows first name + initial, the first name alone and made-up nicknames", () => {
    for (const nickname of ["Riya S.", "Riya", "Mountain Fox", "Sharma Star"]) expect(nicknameIdentityIssue(nickname, account), nickname).toBeNull();
    expect(nicknameIdentityIssue("Riya", { displayName: "Riya", loginId: "x1" })).toBeNull();
    expect(nicknameIdentityIssue("Riya K", { displayName: "Riya K.", loginId: "x1" })).toBeNull();
    expect(nicknameIdentityIssue("अनु शर्मा", { displayName: "अनु शर्मा", loginId: "anu1" })).toBe("real_name");
    expect(nicknameIdentityIssue("Comet", { displayName: null, loginId: null })).toBeNull();
  });
});

describe("shared devices: sign-out clears the tools' storage (L9)", () => {
  function fakeStorage(keys: string[]) {
    const map = new Map(keys.map((key) => [key, "x"]));
    return {
      map,
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (key: string) => void map.delete(key),
    };
  }

  it("removes every mock-test and planner key and nothing else", () => {
    const store = fakeStorage([
      "aspire.mocktest.v1.attempts",
      "aspire.mocktest.v1.progress.neet-sample",
      "aspire.mocktest.v1.lang",
      "aspire.planner.guest.v1",
      "aspire.planner.account.v1",
      "aspire.planner.meta.v1",
      "aspire.planner.notified.v1",
      "aspire.ask.feedback.v1",
      "theme",
    ]);
    expect(clearToolStorage(store)).toBe(7);
    expect([...store.map.keys()]).toEqual(["aspire.ask.feedback.v1", "theme"]);
    expect(TOOL_STORAGE_PREFIXES).toEqual(["aspire.mocktest.", "aspire.planner.", "aspire.leadgate."]);
  });

  it("never throws: no storage, or storage that throws", () => {
    expect(clearToolStorage(null)).toBe(0);
    expect(clearToolStorage()).toBe(0); // no window in this test environment
    const broken = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(clearToolStorage(broken)).toBe(0);
  });
});
