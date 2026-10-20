import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { clickAskRancho } from "@/components/home/home-tools-rancho.testkit";
import { getSyllabusTopics, MOCK_MINUTES } from "@/content/planner/syllabus";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { clampToolSummary, TOOL_CONTEXT_MAX_CHARS } from "@/lib/ask/cards";
import { generatePlan } from "@/lib/planner/plan";
import { emptyState, planInputOf, type PlannerSettings, type PlannerState } from "@/lib/planner/state";
import { EXAM_IDS, type ClientTopic, type ExamId, type PlanDay } from "@/lib/planner/types";
import { topicsForExam, type PlannerData, type PlannerMessages } from "./model";
import type { PlannerSnapshot } from "./planner-store";
import { plannerRanchoDetail, RANCHO_TOPIC_LIMIT, todaysTopicText } from "./rancho";
import { SettingsView } from "./SettingsView";
import { TodayView } from "./TodayView";

/**
 * Planner ↔ Rancho (tools track): "Ask Rancho to explain today's topics" hands over the exam, days
 * left and today's topic names only; the planner no longer offers its own install prompt — the
 * installable app is Rancho, linked from Settings.
 */

function plannerData(locale: Locale): PlannerData {
  const topics: Record<string, ClientTopic> = {};
  const examTopics = {} as Record<ExamId, string[]>;
  for (const exam of EXAM_IDS) {
    const list = getSyllabusTopics(exam);
    examTopics[exam] = list.map((topic) => topic.id);
    for (const topic of list) topics[topic.id] = { id: topic.id, subject: topic.subject, level: topic.level, name: topic.name[locale] };
  }
  return { topics, examTopics, cards: [], mockMinutes: { ...MOCK_MINUTES } };
}

const TODAY = "2026-10-21";
const settings = (weakTopics: string[] = []): PlannerSettings => ({
  exam: "jee-main",
  batch: "12",
  startDate: TODAY,
  examDate: "2027-04-03",
  dailyHours: 6,
  weakTopics,
  reminderMinutes: 20 * 60,
  notifications: false,
});

function setup(locale: Locale) {
  const data = plannerData(locale);
  const weak = topicsForExam(data, "jee-main").slice(-2).map((topic) => topic.id);
  const s = settings(weak);
  const plan = generatePlan(planInputOf(s), { topics: topicsForExam(data, "jee-main"), mockMinutes: data.mockMinutes["jee-main"] });
  const state: PlannerState = { ...emptyState(), settings: s };
  return { data, plan, state, weak };
}

const withLocale = (locale: Locale, child: ReactNode) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ranchoMessages = (t: PlannerMessages) => ({
  exams: t.exams,
  subjects: t.subjects,
  askRanchoPrompt: t.today.askRanchoPrompt,
  askRanchoContext: t.today.askRanchoContext,
  askRanchoContextTomorrow: t.today.askRanchoContextTomorrow,
});

describe("planner → Rancho: explain today's topics", () => {
  it.each(["en", "hi"] as const)("%s: dispatches the prompt with exam, days left and today's topic names only", (locale) => {
    const { data, plan, weak } = setup(locale);
    const t = messagesFor(locale, "planner");
    const day = plan.days[0];
    expect(day.date).toBe(TODAY);
    const detail = plannerRanchoDetail(
      { exam: "jee-main", daysLeft: 164, day, data, locale },
      ranchoMessages(t),
    );
    expect(detail).not.toBeNull();
    const { received } = clickAskRancho(detail!);
    expect(received).toHaveLength(1);
    expect(received[0].prompt).toBe(t.today.askRanchoPrompt);
    expect(received[0].toolContext?.tool).toBe("planner");
    const summary = received[0].toolContext!.summary;
    expect(summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
    expect(clampToolSummary(summary)).toBe(summary);
    expect(summary).toBe(format(t.today.askRanchoContext, { exam: t.exams["jee-main"], days: "164", topics: todaysTopicText(day, data, t.subjects) }));
    const todays = new Set(day.blocks.flatMap((block) => block.topicIds));
    for (const id of todays) expect(summary).toContain(data.topics[id].name);
    // The student's weak-topic choices are not sent unless they are today's topics.
    for (const id of weak.filter((w) => !todays.has(w))) expect(summary).not.toContain(data.topics[id].name);
    expect(Object.keys(received[0]).sort()).toEqual(["prompt", "toolContext"]);
    expect(summary).not.toMatch(/XP|streak|स्ट्रीक/i);
  });

  it("no button on days without topics; many topics are capped", () => {
    const data = plannerData("en");
    const t = messagesFor("en", "planner");
    const tm = ranchoMessages(t);
    const mockDay: PlanDay = { date: TODAY, kind: "mock", finalPhase: false, blocks: [{ id: `${TODAY}#0`, index: 0, kind: "mock", topicIds: [], minutes: 180 }] };
    expect(plannerRanchoDetail({ exam: "jee-main", daysLeft: 10, day: mockDay, data, locale: "en" }, tm)).toBeNull();
    const ids = data.examTopics["jee-main"].slice(0, 30);
    const busy: PlanDay = { date: TODAY, kind: "revision", finalPhase: true, blocks: [{ id: `${TODAY}#0`, index: 0, kind: "revise", topicIds: ids, minutes: 60 }] };
    const detail = plannerRanchoDetail({ exam: "jee-main", daysLeft: 10, day: busy, data, locale: "en" }, tm)!;
    const named = ids.filter((id) => detail.toolContext!.summary.includes(data.topics[id].name));
    expect(named.length).toBeLessThanOrEqual(RANCHO_TOPIC_LIMIT);
    expect(detail.toolContext!.summary.length).toBeLessThanOrEqual(TOOL_CONTEXT_MAX_CHARS);
  });

  it.each(["en", "hi"] as const)("%s: the last plan day says the exam is tomorrow (no \"1 days\")", (locale) => {
    const { data, plan } = setup(locale);
    const t = messagesFor(locale, "planner");
    // The plan ends the day before the exam: its last day has daysLeft = 1.
    const last = plan.days.at(-1)!;
    expect(last.date < "2027-04-03").toBe(true);
    const lastWithTopics = [...plan.days].reverse().find((day) => todaysTopicText(day, data, t.subjects))!;
    const detail = plannerRanchoDetail({ exam: "jee-main", daysLeft: 1, day: lastWithTopics, data, locale }, ranchoMessages(t))!;
    expect(detail.toolContext!.summary).toBe(
      format(t.today.askRanchoContextTomorrow, { exam: t.exams["jee-main"], topics: todaysTopicText(lastWithTopics, data, t.subjects) }),
    );
    expect(detail.toolContext!.summary).not.toMatch(/(^|\D)1 days|(^|\D)1 दिन/);
    expect(t.today.askRanchoContextTomorrow).not.toContain("{days}");
    expect(plannerRanchoDetail({ exam: "jee-main", daysLeft: 0, day: lastWithTopics, data, locale }, ranchoMessages(t))).toBeNull();
    expect(plannerRanchoDetail({ exam: "jee-main", daysLeft: 2, day: lastWithTopics, data, locale }, ranchoMessages(t))!.toolContext!.summary).toContain(
      format(t.today.askRanchoContext, { exam: t.exams["jee-main"], days: "2", topics: "" }).trim(),
    );
  });

  it.each(["en", "hi"] as const)("%s: Today shows the button as a link to the Ask page", (locale) => {
    const { data, plan, state } = setup(locale);
    const t = messagesFor(locale, "planner");
    const html = withLocale(
      locale,
      createElement(TodayView, {
        t,
        locale,
        data,
        today: TODAY,
        state,
        plan,
        due: { topics: [], cards: [] },
        mockTestsHref: localePath("/tools/mock-tests", locale),
        onToggle: () => {},
        onStartReview: () => {},
      }),
    );
    const anchor = html.match(/<a\b[^>]*data-ask-rancho[^>]*>/)?.[0] ?? "";
    expect(anchor).toContain(`href="${localePath("/tools/ask", locale)}"`);
    expect(html).toContain(esc(t.today.askRancho));
    expect(html).not.toContain(esc(t.today.askRanchoPrompt));
  });
});

describe("the planner is no longer the installed app", () => {
  const plannerSources = () =>
    readdirSync(path.join(process.cwd(), "src/components/planner"))
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
      .map((file) => [file, readFileSync(path.join(process.cwd(), "src/components/planner", file), "utf8")] as const);

  it("does not handle beforeinstallprompt / appinstalled, but keeps its offline service worker", () => {
    for (const [file, source] of plannerSources()) {
      expect(source, file).not.toMatch(/beforeinstallprompt|appinstalled|BeforeInstallPromptEvent|display-mode: standalone/);
    }
    const app = readFileSync(path.join(process.cwd(), "src/components/planner/PlannerApp.tsx"), "utf8");
    expect(app).toContain('const SW_URL = "/planner-sw.js"');
    expect(app).toMatch(/navigator\.serviceWorker\.register\(SW_URL, \{ scope \}\)/);
  });

  it.each(["en", "hi"] as const)("%s: Settings links to the Rancho app (/rancho) instead of an install prompt", (locale) => {
    const t = messagesFor(locale, "planner");
    const state = emptyState();
    const snapshot: PlannerSnapshot = { mode: "guest", state, sync: "local", importOffer: false, account: null };
    const html = withLocale(
      locale,
      createElement(SettingsView, {
        t,
        data: plannerData(locale),
        today: TODAY,
        state,
        plan: null,
        snapshot,
        ranchoAppHref: localePath("/rancho", locale),
        onSettings: () => {},
        onImport: () => {},
        onDeclineImport: () => {},
        onReset: () => {},
      }),
    );
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/rancho"`);
    expect(html).toContain(esc(t.settings.appTitle));
    expect(html).toContain(esc(t.settings.appLink));
    expect(Object.keys(t.settings).filter((key) => key.startsWith("install"))).toEqual([]);
  });

  it("the Rancho app card is hidden inside the installed app (standalone display)", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/planner/SettingsView.tsx"), "utf8");
    expect(source).toContain('import { useStandalone } from "@/components/pwa/install-store";');
    expect(source).toMatch(/\{!standalone && \(\s*<Card id="planner-app"/);
  });

  it("the planner copy no longer says it installs as its own app", () => {
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "planner");
      expect(`${t.meta.description} ${t.hero.lead}`).not.toMatch(/installs (on your phone )?like an app|ऐप की तरह इंस्टॉल/);
      expect(`${t.meta.description} ${t.hero.lead}`).toMatch(/Rancho|रैंचो/);
    }
  });
});
