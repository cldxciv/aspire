import { JEE_MAIN_SAMPLE_QUESTIONS } from "./jee-main-sample";
import { NEET_SAMPLE_QUESTIONS } from "./neet-sample";
import type { MockQuestion, MockTestDefinition, TestWindow } from "./types";

/**
 * Mock-test registry (owner: A2-MOCKTEST). Read it through src/lib/mocktest/catalog.ts, which
 * applies the D-005 / D-032 visibility rules — never import this from UI code directly.
 *
 * Everything here is a SAMPLE (`status: "placeholder"`): in production (no placeholder content)
 * no test is visible and the pages show "Practice tests coming soon".
 */

export const MOCK_QUESTIONS: readonly MockQuestion[] = [...JEE_MAIN_SAMPLE_QUESTIONS, ...NEET_SAMPLE_QUESTIONS];

const ids = (prefix: string, numbers: number[]) => numbers.map((n) => `${prefix}-${String(n).padStart(2, "0")}`);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** ISO timestamp in Indian Standard Time (+05:30), e.g. "2026-10-19T00:00:00+05:30". */
function istIso(utcMs: number): string {
  return `${new Date(utcMs + IST_OFFSET_MS).toISOString().slice(0, 19)}+05:30`;
}

/**
 * SAMPLE schedule for the weekly "All-Himachal Mock": one window per week, Monday 00:00 to
 * Sunday 23:59:59 IST, from Monday 19 October 2026. Illustrates the data model only — no real
 * event is announced. Aspire replaces it with real windows (start/end timestamps).
 */
export function weeklyWindows(firstMondayIst: string, weeks: number): TestWindow[] {
  const start = Date.parse(`${firstMondayIst}T00:00:00+05:30`);
  return Array.from({ length: weeks }, (_, i) => {
    const startsAt = start + i * WEEK_MS;
    return { id: `week-${istIso(startsAt).slice(0, 10)}`, startsAt: istIso(startsAt), endsAt: istIso(startsAt + WEEK_MS - 1000) };
  });
}

export const MOCK_TESTS: readonly MockTestDefinition[] = [
  {
    id: "jee-main-sample",
    exam: "JEE_MAIN",
    kind: "practice",
    title: { en: "JEE Main sample test", hi: "JEE Main सैंपल टेस्ट" },
    summary: {
      en: "45 questions in Physics, Chemistry and Mathematics (12 MCQs + 3 numerical-value questions each), 60 minutes.",
      hi: "भौतिकी, रसायन विज्ञान और गणित के 45 प्रश्न (प्रत्येक में 12 बहुविकल्पीय + 3 संख्यात्मक प्रश्न), 60 मिनट।",
    },
    durationMinutes: 60,
    sections: [
      { subject: "physics", questionIds: ids("jee-p", range(1, 15)) },
      { subject: "chemistry", questionIds: ids("jee-c", range(1, 15)) },
      { subject: "maths", questionIds: ids("jee-m", range(1, 15)) },
    ],
    source: "Aspire sample",
    status: "placeholder",
  },
  {
    id: "neet-sample",
    exam: "NEET",
    kind: "practice",
    title: { en: "NEET sample test", hi: "NEET सैंपल टेस्ट" },
    summary: {
      en: "40 single-correct questions in Physics, Chemistry, Botany and Zoology (10 each), 45 minutes.",
      hi: "भौतिकी, रसायन विज्ञान, वनस्पति विज्ञान और प्राणि विज्ञान के 40 एकल-सही-उत्तर प्रश्न (प्रत्येक के 10), 45 मिनट।",
    },
    durationMinutes: 45,
    sections: [
      { subject: "physics", questionIds: ids("neet-p", range(1, 10)) },
      { subject: "chemistry", questionIds: ids("neet-c", range(1, 10)) },
      { subject: "botany", questionIds: ids("neet-b", range(1, 10)) },
      // neet-z-01 was withdrawn (chapter not in the current NEET-UG syllabus); neet-z-11 replaces it.
      { subject: "zoology", questionIds: ids("neet-z", range(2, 11)) },
    ],
    source: "Aspire sample",
    status: "placeholder",
  },
  {
    id: "all-himachal-mock-sample",
    exam: "JEE_MAIN",
    kind: "weekly",
    title: { en: "All-Himachal Mock (sample week)", hi: "ऑल-हिमाचल मॉक (सैंपल सप्ताह)" },
    summary: {
      en: "Example of the weekly format: 15 JEE Main-pattern questions, 30 minutes, with a leaderboard for each weekly window. Sample schedule only — no real event has been announced.",
      hi: "साप्ताहिक प्रारूप का उदाहरण: JEE Main पैटर्न के 15 प्रश्न, 30 मिनट, प्रत्येक साप्ताहिक विंडो के लिए अलग लीडरबोर्ड। केवल सैंपल समय-सारिणी — कोई वास्तविक आयोजन घोषित नहीं है।",
    },
    durationMinutes: 30,
    sections: [
      { subject: "physics", questionIds: ids("jee-p", [1, 3, 6, 10, 13]) },
      { subject: "chemistry", questionIds: ids("jee-c", [1, 4, 7, 9, 13]) },
      { subject: "maths", questionIds: ids("jee-m", [1, 4, 7, 11, 15]) },
    ],
    windows: weeklyWindows("2026-10-19", 26),
    source: "Aspire sample",
    status: "placeholder",
  },
];
