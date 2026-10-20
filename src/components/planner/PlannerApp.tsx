"use client";

import { CalendarCheck2, CalendarDays, Cloud, CloudOff, Layers, Settings, Trophy } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toolEnquiryHref } from "@/components/forms/enquiry-context";
import { Button, ButtonLink, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { applySettings, dueItems, openBlocksToday, recordReview, toggleBlock, type ReviewKind } from "@/lib/planner/actions";
import { diffDays, istDateKey, istMinutesOfDay, type DateKey } from "@/lib/planner/dates";
import { generatePlan } from "@/lib/planner/plan";
import type { Grade } from "@/lib/planner/srs";
import { planInputOf, type PlannerSettings } from "@/lib/planner/state";
import type { StudyPlan } from "@/lib/planner/types";
import { CalendarView } from "./CalendarView";
import { useBrowserValue, useOnline, usePlannerSnapshot, useToday } from "./hooks";
import { LeaderboardView } from "./LeaderboardView";
import {
  cardsForExam,
  formatDate,
  formatNumber,
  LONG_DATE,
  topicsForExam,
  type PlannerData,
  type PlannerLinks,
  type PlannerMessages,
} from "./model";
import { PlanForm } from "./PlanForm";
import { plannerStore } from "./planner-store";
import { ReviewView, type SessionMode } from "./ReviewView";
import { SettingsView, type InstallState } from "./SettingsView";
import { TodayView } from "./TodayView";

const TABS = [
  { key: "today", Icon: CalendarCheck2 },
  { key: "calendar", Icon: CalendarDays },
  { key: "flashcards", Icon: Layers },
  { key: "leaderboard", Icon: Trophy },
  { key: "settings", Icon: Settings },
] as const;
type Tab = (typeof TABS)[number]["key"];

const SW_URL = "/planner-sw.js";
const NOTIFIED_KEY = "aspire.planner.notified.v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Offline support: the planner's own service worker, scoped to this page only (production builds). */
function useServiceWorker(scope: string) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope }).catch(() => {
      // Offline support is optional; the planner works without it.
    });
  }, [scope]);
}

function useInstall(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const standalone = useBrowserValue(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    false,
  );
  const ios = useBrowserValue(
    () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
    false,
  );
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalledNow(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return {
    canPrompt: deferred !== null,
    installed: standalone || installedNow,
    ios,
    prompt: () => {
      if (!deferred) return;
      void deferred.prompt();
      void deferred.userChoice.finally(() => setDeferred(null));
    },
  };
}

/**
 * In-app reminder (D-033): only while the planner is open; once a day after the chosen IST time
 * when something is left to do. Nothing is sent from a server.
 */
function useReminder(settings: PlannerSettings | null, remaining: number, t: PlannerMessages, scope: string) {
  const remainingRef = useRef(remaining);
  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);
  const enabled = settings?.notifications ?? false;
  const minutes = settings?.reminderMinutes ?? 0;
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = Date.now();
      const day = istDateKey(now);
      if (istMinutesOfDay(now) < minutes || remainingRef.current <= 0) return;
      try {
        if (window.localStorage.getItem(NOTIFIED_KEY) === day) return;
        window.localStorage.setItem(NOTIFIED_KEY, day);
      } catch {
        return;
      }
      const title = t.settings.notificationTitle;
      const options: NotificationOptions = {
        body: format(t.settings.notificationBody, { count: remainingRef.current }),
        tag: "aspire-planner",
        icon: "/api/planner/icon?size=192",
      };
      const fallback = () => {
        try {
          new Notification(title, options);
        } catch {
          // Some mobile browsers only allow notifications from a service worker.
        }
      };
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistration(scope)
          .then((registration) => (registration ? registration.showNotification(title, options) : fallback()))
          .catch(fallback);
      } else {
        fallback();
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [enabled, minutes, scope, t]);
}

export function PlannerApp({
  t,
  locale,
  data,
  links,
  sample,
}: {
  t: PlannerMessages;
  locale: Locale;
  data: PlannerData;
  links: PlannerLinks;
  sample: boolean;
}) {
  const id = useId();
  const snapshot = usePlannerSnapshot();
  const today = useToday();
  const online = useOnline();
  const install = useInstall();
  const [tab, setTab] = useState<Tab>("today");
  const [reviewMode, setReviewMode] = useState<SessionMode | null>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  useServiceWorker(links.self);

  const state = snapshot?.state ?? null;
  const settings = state?.settings ?? null;
  const exam = settings?.exam ?? null;
  const examTopics = useMemo(() => (exam ? topicsForExam(data, exam) : []), [data, exam]);
  const examCards = useMemo(() => (exam ? cardsForExam(data, exam) : []), [data, exam]);
  const plan = useMemo(
    () => (settings ? generatePlan(planInputOf(settings), { topics: examTopics, mockMinutes: data.mockMinutes[settings.exam] }) : null),
    [settings, examTopics, data],
  );
  const cardIds = useMemo(() => new Set(examCards.map((card) => card.id)), [examCards]);
  const topicIds = useMemo(() => new Set(examTopics.map((topic) => topic.id)), [examTopics]);
  const due = state && today ? dueItems(state, today, cardIds, topicIds) : { topics: [], cards: [] };
  const remaining = state && today ? openBlocksToday(state, plan, today) + due.topics.length + due.cards.length : 0;
  useReminder(settings, remaining, t, links.self);

  if (!snapshot || !state || !today) {
    return (
      <p role="status" className="rounded-card border border-line bg-white p-6 text-muted shadow-soft">
        {t.loading}
      </p>
    );
  }

  const day = today;
  const onToggle = (index: number, done: boolean) => {
    if (plan) plannerStore.update((s) => toggleBlock(s, plan, day, index, done));
  };
  const onReview = (kind: ReviewKind, itemId: string, grade: Grade) => plannerStore.update((s) => recordReview(s, kind, itemId, grade, day));
  const onSettings = (next: PlannerSettings) => plannerStore.update((s) => applySettings(s, next, day));

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    setReviewMode(null);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys = TABS.map((item) => item.key);
    const index = keys.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? keys[(index + 1) % keys.length]
        : event.key === "ArrowLeft"
          ? keys[(index - 1 + keys.length) % keys.length]
          : event.key === "Home"
            ? keys[0]
            : event.key === "End"
              ? keys[keys.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  }

  const statusText = snapshot.mode === "guest" ? t.status.guest : snapshot.sync === "local" ? t.status.saved : t.status[snapshot.sync];
  const StatusIcon = snapshot.sync === "offline" || snapshot.sync === "error" ? CloudOff : Cloud;
  const dueCount = due.topics.length + due.cards.length;

  const notices = (
    <>
      {!online && (
        <Notice variant="warning" role="status">
          {t.offline}
        </Notice>
      )}
      {snapshot.importOffer && tab !== "settings" && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
          <p className="min-w-0 flex-1">{t.settings.importPrompt}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="dark" onClick={() => plannerStore.importGuest()}>
              {t.settings.importButton}
            </Button>
            <Button size="sm" variant="outline" onClick={() => plannerStore.declineImport()}>
              {t.settings.importSkip}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  const status = (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted" aria-live="polite">
      <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
      {statusText}
    </p>
  );

  if (!settings || !plan) {
    return (
      <div className="grid min-w-0 gap-4">
        {notices}
        <div className="rounded-card border border-line bg-white p-5 shadow-soft sm:p-7">
          <PlanForm t={t} data={data} today={today} settings={null} onSubmit={onSettings} />
        </div>
        {status}
        <CounsellorCta t={t} locale={locale} />
      </div>
    );
  }

  const panelId = `${id}-panel`;
  return (
    <div className="grid min-w-0 gap-5">
      {notices}
      {/* min-w-0: as a grid item this row must not grow to the tab bar's width (it scrolls instead) — QA-SEC-M6. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t.tabs.label}
          onKeyDown={onTabKey}
          className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1"
        >
          {TABS.map(({ key, Icon }) => {
            const selected = tab === key;
            return (
              <button
                key={key}
                ref={(node) => {
                  tabRefs.current[key] = node;
                }}
                id={`${id}-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(key)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border px-3 text-sm font-bold whitespace-nowrap ${
                  selected ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue"
                }`}
              >
                <Icon aria-hidden="true" className="size-4" />
                {t.tabs[key]}
                {key === "flashcards" && dueCount > 0 && (
                  <span className={`rounded-full px-1.5 text-xs ${selected ? "bg-gold text-ink" : "bg-gold-soft text-[#6b4d00]"}`}>{dueCount}</span>
                )}
              </button>
            );
          })}
        </div>
        {status}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="min-w-0">
        {tab === "today" && (
          <TodayView
            t={t}
            locale={locale}
            data={data}
            today={today}
            state={state}
            plan={plan}
            due={due}
            mockTestsHref={links.mockTests}
            onToggle={onToggle}
            onStartReview={() => {
              setTab("flashcards");
              setReviewMode("due");
            }}
          />
        )}
        {tab === "calendar" && (
          <>
            <PlanOverview t={t} locale={locale} plan={plan} today={today} examDate={settings.examDate} />
            <CalendarView t={t} locale={locale} data={data} today={today} state={state} plan={plan} onToggle={onToggle} />
          </>
        )}
        {tab === "flashcards" && (
          <ReviewView
            t={t}
            locale={locale}
            data={data}
            today={today}
            state={state}
            cards={examCards}
            topics={examTopics}
            due={due}
            initialMode={reviewMode}
            sample={sample}
            onReview={onReview}
          />
        )}
        {tab === "leaderboard" && (
          <LeaderboardView
            t={t}
            locale={locale}
            signedIn={snapshot.mode === "account"}
            account={snapshot.account}
            online={online}
            signInHref={links.signIn}
            onAccountChange={(info) => plannerStore.setAccountInfo(info)}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            t={t}
            data={data}
            today={today}
            state={state}
            plan={plan}
            snapshot={snapshot}
            install={install}
            onSettings={onSettings}
            onImport={() => plannerStore.importGuest()}
            onDeclineImport={() => plannerStore.declineImport()}
            onReset={() => plannerStore.reset()}
          />
        )}
      </div>
      <CounsellorCta t={t} locale={locale} />
    </div>
  );
}

/** D-039: "Talk to a counsellor" → the enquiry form with `from=planner`; nothing from the plan is passed. Exported for tests. */
export function CounsellorCta({ t, locale }: { t: PlannerMessages; locale: Locale }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control bg-gold-soft p-4">
      <p className="min-w-0 flex-1 text-sm font-semibold text-[#5c4a12]">{t.counsellor.text}</p>
      <ButtonLink href={toolEnquiryHref("planner", locale)} size="sm" className="shrink-0">
        {t.counsellor.cta}
      </ButtonLink>
    </div>
  );
}

function PlanOverview({ t, locale, plan, today, examDate }: { t: PlannerMessages; locale: Locale; plan: StudyPlan; today: DateKey; examDate: DateKey }) {
  const { summary } = plan;
  const n = (value: number) => formatNumber(value, locale);
  return (
    <section aria-labelledby="planner-overview" className="mb-6 rounded-card border border-line bg-white p-4 shadow-soft">
      <h2 id="planner-overview" className="font-extrabold text-navy">
        {t.overview.title}
        <span className="ml-2 text-sm font-semibold text-muted">· {format(t.overview.days, { days: n(Math.max(0, diffDays(today, examDate))) })}</span>
      </h2>
      <ul className="mt-2 grid gap-1 text-sm text-muted">
        <li>
          {format(t.overview.counts, {
            study: n(summary.studyDays),
            revision: n(summary.revisionDays),
            mock: n(summary.mockDays),
            buffer: n(summary.bufferDays),
          })}
        </li>
        {summary.finalPhaseStart && <li>{format(t.overview.finalPhase, { date: formatDate(summary.finalPhaseStart, locale, LONG_DATE) })}</li>}
        {summary.sessionsPerTopic > 0 && (
          <li>{format(t.overview.sessions, { normal: n(summary.sessionsPerTopic), weak: n(summary.sessionsPerWeakTopic) })}</li>
        )}
        {summary.unscheduledTopicIds.length > 0 && (
          <li className="font-semibold text-[#8b5b00]">{format(t.overview.unscheduled, { count: n(summary.unscheduledTopicIds.length) })}</li>
        )}
      </ul>
    </section>
  );
}
