import { describe, expect, it } from "vitest";

import { DEFAULT_CALLING_HOURS, WEEKDAYS, type CallingHours } from "../lead-ops-types";
import { addWorkingMinutes, IST_OFFSET_MS, isOpenAt, nextOpening, nextWindowStart, workingMsBetween } from "./calling-hours";

// Default hours (Q1): Mon–Sat 09:00–19:00, Sun 10:00–13:00 IST. 21 Oct 2026 is a Wednesday.
const HOURS = DEFAULT_CALLING_HOURS;
const MIN = 60_000;

/** An instant given as an India (IST) wall-clock time. */
function ist(day: string, time: string): number {
  return Date.parse(`${day}T${time}:00.000Z`) - IST_OFFSET_MS;
}

describe("addWorkingMinutes (§15 required cases)", () => {
  it("10:00 → 11:00 the same day", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "10:00"), 60)).toBe(ist("2026-10-21", "11:00"));
  });

  it("18:30 → 09:30 the next open day (the remainder carries over, Q3)", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "18:30"), 60)).toBe(ist("2026-10-22", "09:30"));
  });

  it("19:30 (after closing) → 10:00 the next day", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "19:30"), 60)).toBe(ist("2026-10-22", "10:00"));
  });

  it("Saturday 18:45 → Sunday 10:45", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-24", "18:45"), 60)).toBe(ist("2026-10-25", "10:45"));
  });

  it("Sunday 12:30 → Monday 09:30", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-25", "12:30"), 60)).toBe(ist("2026-10-26", "09:30"));
  });

  it("skips a closed date", () => {
    const holiday: CallingHours = { ...HOURS, closedDates: ["2026-10-22"] };
    expect(addWorkingMinutes(holiday, ist("2026-10-21", "18:30"), 60)).toBe(ist("2026-10-23", "09:30"));
    expect(addWorkingMinutes(holiday, ist("2026-10-22", "11:00"), 60)).toBe(ist("2026-10-23", "10:00"));
  });

  it("before opening starts at the opening; exactly at closing ends at closing; 0 minutes = next opening", () => {
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "06:00"), 60)).toBe(ist("2026-10-21", "10:00"));
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "18:00"), 60)).toBe(ist("2026-10-21", "19:00"));
    expect(addWorkingMinutes(HOURS, ist("2026-10-21", "20:00"), 0)).toBe(ist("2026-10-22", "09:00"));
  });

  it("spans several days for the 4-hour super-admin step", () => {
    // Saturday 17:00: 2 h on Saturday (17–19), the other 2 h on Sunday (10–12).
    expect(addWorkingMinutes(HOURS, ist("2026-10-24", "17:00"), 240)).toBe(ist("2026-10-25", "12:00"));
  });

  it("falls back to wall-clock minutes when no day is ever open", () => {
    const shut: CallingHours = { ...HOURS, week: Object.fromEntries(WEEKDAYS.map((day) => [day, { open: false, start: "09:00", end: "19:00" }])) as CallingHours["week"] };
    const start = ist("2026-10-21", "10:00");
    expect(addWorkingMinutes(shut, start, 60)).toBe(start + 60 * MIN);
    expect(nextOpening(shut, start)).toBeNull();
  });
});

describe("open / next opening / working time", () => {
  it("knows when executives are at their phones", () => {
    expect(isOpenAt(HOURS, ist("2026-10-21", "09:00"))).toBe(true);
    expect(isOpenAt(HOURS, ist("2026-10-21", "18:59"))).toBe(true);
    expect(isOpenAt(HOURS, ist("2026-10-21", "19:00"))).toBe(false);
    expect(isOpenAt(HOURS, ist("2026-10-25", "14:00"))).toBe(false);
    expect(isOpenAt({ ...HOURS, closedDates: ["2026-10-21"] }, ist("2026-10-21", "11:00"))).toBe(false);
  });

  it("next opening: now when open, else the next window; next window start is strictly later", () => {
    expect(nextOpening(HOURS, ist("2026-10-21", "11:00"))).toBe(ist("2026-10-21", "11:00"));
    expect(nextOpening(HOURS, ist("2026-10-21", "21:00"))).toBe(ist("2026-10-22", "09:00"));
    expect(nextWindowStart(HOURS, ist("2026-10-21", "11:00"))).toBe(ist("2026-10-22", "09:00"));
    expect(nextWindowStart(HOURS, ist("2026-10-21", "07:00"))).toBe(ist("2026-10-21", "09:00"));
    expect(nextWindowStart(HOURS, ist("2026-10-24", "12:00"))).toBe(ist("2026-10-25", "10:00"));
  });

  it("counts only calling-hours time between two instants", () => {
    expect(workingMsBetween(HOURS, ist("2026-10-21", "18:00"), ist("2026-10-22", "10:00"))).toBe(120 * MIN);
    expect(workingMsBetween(HOURS, ist("2026-10-21", "10:00"), ist("2026-10-21", "10:45"))).toBe(45 * MIN);
    expect(workingMsBetween(HOURS, ist("2026-10-21", "20:00"), ist("2026-10-22", "08:00"))).toBe(0);
    expect(workingMsBetween(HOURS, ist("2026-10-22", "10:00"), ist("2026-10-21", "10:00"))).toBe(0);
  });
});
