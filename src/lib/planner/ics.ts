/**
 * `.ics` calendar export of the plan's revision time (A4-PLANNER, D-033). Pure and client-safe:
 * the browser builds the file and downloads it — nothing is sent anywhere. Calendar apps
 * (Google Calendar, Apple Calendar, Outlook) then remind the student, which is the only reminder
 * that works when the planner is closed (there is no push / SMS / email provider).
 *
 * RFC 5545: CRLF line endings, lines folded at 75 octets (UTF-8 safe for Hindi), text escaped.
 * Times are written in UTC (`…Z`) from IST wall-clock times, so no VTIMEZONE block is needed.
 */
import { istInstant, type DateKey } from "./dates";
import type { PlanDay } from "./types";

export interface IcsEvent {
  uid: string;
  date: DateKey;
  /** Minutes after midnight IST. */
  startMinutes: number;
  durationMinutes: number;
  summary: string;
  description?: string;
  /** Minutes before the start for a calendar alarm; omit for none. */
  alarmMinutesBefore?: number;
}

export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with one space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utcStamp(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A complete VCALENDAR document. `now` is the DTSTAMP (pass Date.now() from the click handler). */
export function buildIcs(events: readonly IcsEvent[], options: { calendarName: string; now: number }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aspire IIT & Medical//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];
  const stamp = utcStamp(options.now);
  for (const event of events) {
    const start = istInstant(event.date, event.startMinutes);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(start + event.durationMinutes * 60_000)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.alarmMinutesBefore !== undefined) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcsText(event.summary)}`,
        `TRIGGER:-PT${Math.max(0, Math.round(event.alarmMinutesBefore))}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export interface RevisionEventText {
  /** Title of a daily spaced-revision event, e.g. "Aspire planner: spaced revision". */
  spaced: string;
  /** Title of a revision day / final-phase revision event. */
  revision: string;
  /** Title of a mock-test day event. */
  mock: string;
  /** Turns topic ids into a readable description line. */
  describe: (topicIds: readonly string[]) => string;
}

/**
 * One event per plan day from `from` (inclusive) that has revision work: the daily spaced-revision
 * block, revision days and mock days. At most `maxEvents` events (default 366).
 */
export function revisionEvents(
  days: readonly PlanDay[],
  options: { from: DateKey; startMinutes: number; text: RevisionEventText; maxEvents?: number },
): IcsEvent[] {
  const events: IcsEvent[] = [];
  const max = options.maxEvents ?? 366;
  for (const day of days) {
    if (day.date < options.from) continue;
    if (events.length >= max) break;
    const revise = day.blocks.filter((b) => b.kind === "revise" || b.kind === "spaced");
    const mock = day.blocks.find((b) => b.kind === "mock");
    if (mock) {
      events.push({
        uid: `${day.date}-mock@planner.aspire`,
        date: day.date,
        startMinutes: options.startMinutes,
        durationMinutes: Math.min(240, mock.minutes),
        summary: options.text.mock,
        alarmMinutesBefore: 10,
      });
      continue;
    }
    if (revise.length === 0) continue;
    const spacedOnly = revise.every((b) => b.kind === "spaced");
    const topicIds = revise.flatMap((b) => b.topicIds);
    events.push({
      uid: `${day.date}-revision@planner.aspire`,
      date: day.date,
      startMinutes: options.startMinutes,
      durationMinutes: Math.min(180, revise.reduce((sum, b) => sum + b.minutes, 0)),
      summary: spacedOnly ? options.text.spaced : options.text.revision,
      description: topicIds.length > 0 ? options.text.describe(topicIds) : undefined,
      alarmMinutesBefore: 10,
    });
  }
  return events;
}
