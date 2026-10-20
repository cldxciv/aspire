"use client";

import { CalendarCheck2, CalendarDays, Cloud, CloudOff, Layers, Settings, Trophy } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toolEnquiryHref } from "@/components/forms/enquiry-context";
import { leadGateStore } from "@/components/lead-gate/lead-gate-store";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { Button, ButtonLink, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { applySettings, dueItems, openBlocksToday, recordReview, toggleBlock, type ReviewKind } from "@/lib/planner/actions";
import { diffDays, istDateKey, istMinutesOfDay, type DateKey } from "@/lib/planner/dates";
import { generatePlan } from "@/lib/planner/plan";
import type { Grade } from "@/lib/planner/srs";
import { planInputOf, type PlannerSettings } from "@/lib/planner/state";
import type { StudyPlan } from "@/lib/planner/types";
import { CalendarView } from "./CalendarView";
import { useOnline, usePlannerSnapshot, useToday } from "./hooks";
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
import { createPlannerGate, planAccess } from "./planner-gate";
import { plannerStore } from "./planner-store";
import { ReviewView, type SessionMode } from "./ReviewView";
import { SettingsView } from "./SettingsView";
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

/**
 * Offline support: the planner's own service worker, scoped to this page only (production builds).
 * The planner no longer offers its own install prompt: the installable app is Rancho (/rancho), and
 * Settings links there.
 */
function useServiceWorker(scope: string) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope }).catch(() => {
      // Offline support is optional; the planner works without it.
    });
  }, [scope]);
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

export interface PlannerClientProps {
  t: PlannerMessages;
  locale: Locale;
  data: PlannerData;
  links: PlannerLinks;
  sample: boolean;
  /** The `leadGate` namespace in the page's locale (added by the PlannerApp server wrapper). */
  gateMessages: Messages<"leadGate">;
}

/**
 * The study planner in the browser (rendered through the PlannerApp server wrapper).
 *
 * Lead gate (docs/lead-gate-plan.md §8.5, planner-gate.ts): only a guest's NEW plan waits for the
 * one-time contact step, shown under the plan form in the same card; plans already in this
 * browser, edits, signed-in students and offline use are never gated. The "Not you?" line sits
 * in the status row while this browser's shared details unlock the tools.
 */
export function PlannerClient({ t, locale, data, links, sample, gateMessages }: PlannerClientProps) {
  const id = useId();
  const snapshot = usePlannerSnapshot();
  const today = useToday();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>("today");
  const [reviewMode, setReviewMode] = useState<SessionMode | null>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  useServiceWorker(links.self);

  // Lead gate: hold a guest's first plan until the contact step is done (or the store opens).
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const focusHandled = useRef(0);
  const createCardId = `${id}-create`;
  const [planGate] = useState(() =>
    createPlannerGate({
      apply: (next, explicit) => {
        // Focus moves to the tabs after the planner's own submit, or when it sat in the empty-state
        // card the plan replaces; never out of another host (e.g. the floating Rancho panel).
        if (explicit || document.getElementById(createCardId)?.contains(document.activeElement)) setFocusRequest((count) => count + 1);
        plannerStore.update((s) => applySettings(s, next, istDateKey(Date.now())));
      },
      recordUse: (exam) => leadGateStore.recordUse({ tool: "planner", exam, page: window.location.pathname }),
      // A plan made in another tab while this one waited is kept, not overwritten by the held one.
      hasPlan: () => plannerStore.getSnapshot()?.state.settings != null,
      onBusyChange: setCheckingAccess,
    }),
  );
  const gate = useLeadGate({ tool: "planner", onUnlocked: ({ byThisHost }) => void planGate.unlocked({ byThisHost }) });
  const guest = snapshot?.mode === "guest";
  useEffect(() => {
    // Only reads the status (a stored pass shows the "Not you?" line); it never hides a stored plan.
    if (guest) void leadGateStore.ensure();
  }, [guest]);

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

  // A plan built from the empty-state form replaces the focused form: move focus to the tabs
  // (only when `apply` asked for it, see above).
  useEffect(() => {
    if (!plan || focusRequest === focusHandled.current) return;
    focusHandled.current = focusRequest;
    tabRefs.current[tab]?.focus();
  }, [plan, tab, focusRequest]);

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
  /** Edits of an existing plan (Settings): never gated. */
  const onSettings = (next: PlannerSettings) => plannerStore.update((s) => applySettings(s, next, day));
  /** The empty-state form: a guest's new plan may wait for the contact step (planner-gate.ts). */
  const onCreate = (next: PlannerSettings) => {
    void planGate
      .submit(next, { mode: snapshot.mode, hasPlan: settings !== null, online }, () => planAccess(leadGateStore, gate.requestAccess))
      .then((outcome) => {
        if (outcome === "applied") gate.closeGate();
      });
  };

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
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted" aria-live="polite">
        <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
        {statusText}
      </p>
      {/* Guests only: renders nothing unless this browser's shared contact details unlock the tools. */}
      {guest && <LeadGateIdentity messages={gateMessages} />}
    </div>
  );

  if (!settings || !plan) {
    return (
      <div className="grid min-w-0 gap-4">
        {notices}
        <div id={createCardId} className="rounded-card border border-line bg-white p-5 shadow-soft sm:p-7">
          <PlanForm t={t} data={data} today={today} settings={null} busy={checkingAccess} onSubmit={onCreate} />
          {gate.gateOpen ? (
            <LeadGateForm {...gate.formProps} messages={gateMessages} headingLevel={3} className="mt-6" />
          ) : (
            guest && <LeadGateNote messages={gateMessages} className="mt-5" />
          )}
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
            ranchoAppHref={localePath("/rancho", locale)}
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
