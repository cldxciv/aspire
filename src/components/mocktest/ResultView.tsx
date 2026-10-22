"use client";

import { Award, FileText, Lock, MessageCircle, RotateCcw, Trophy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toolEnquiryHref } from "@/components/forms/enquiry-context";
import { AskRanchoLink } from "@/components/home/HomeToolsAskRancho";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { leadGateStore } from "@/components/lead-gate/lead-gate-store";
import { Badge, Button, ButtonLink, EmptyState, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { buildLoginHref } from "@/lib/auth/paths";
import { localePath } from "@/i18n/paths";
import { updateLocalAttempt } from "@/lib/mocktest/local-store";
import { buildStudyPlan } from "@/lib/mocktest/study-plan";
import { isLeaderboardTest } from "@/lib/mocktest/timing";
import type { RunnerTest, SavedAttemptSummary, ScoredAttempt } from "@/lib/mocktest/types";
import { formatDateTime, formatDuration, percent, type MocktestMessages } from "./format";
import { apiJson, useScoredAttempt, useSessionStatus, type AttemptSource } from "./hooks";
import { LockedResult, OptionalContactStep, useMocktestLeadGateMessages, type MocktestUnlock } from "./lead-gate";
import { mockTestRancho } from "./rancho";
import { ProjectionPanel, SolutionReview, StudyPlanView, TimeChart, TopicHeatmap } from "./ResultParts";
import { fixedSaveBody } from "./save-request";

/** Query string that identifies an attempt (`attempt=` local id or `saved=` server id). */
export function attemptQuery(params: { attempt: string | null; saved: string | null }): string {
  if (params.attempt) return `?attempt=${encodeURIComponent(params.attempt)}`;
  if (params.saved) return `?saved=${encodeURIComponent(params.saved)}`;
  return "";
}

export function useAttemptParams(): { attempt: string | null; saved: string | null } {
  const search = useSearchParams();
  return { attempt: search.get("attempt"), saved: search.get("saved") };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-navy tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-white p-5 shadow-soft">
      <h3 id={id} className="text-lg font-extrabold text-navy">
        {title}
      </h3>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Result of one attempt (client). The server scores it — the browser never computes its own score.
 * Signed-in students' attempts from this device are saved to their account automatically (POST
 * /api/mocktest/attempts, re-scored there too); a saved attempt shows its solutions at once, an
 * unsaved one of a weekly test only after the window closes (QA-SEC-M6 M1).
 *
 * Lead gate (docs/lead-gate-plan.md §8.4): when the server asks for contact details first, the
 * page says the test is submitted and kept on this device and shows the contact form; once this
 * browser is unlocked the result loads. In optional mode the first result of an attempt offers the
 * form with "Continue without sharing" (`ask`). After an explicit submit / skip / continue here,
 * focus moves to the result's heading. Under an unlocked result: "Not you?" (LeadGateIdentity).
 */
export function ResultView({ test, t }: { test: RunnerTest; t: MocktestMessages }) {
  const locale = useLocale();
  const params = useAttemptParams();
  const [reloadKey, setReloadKey] = useState(0);
  // The result replaces the form the visitor just used: move focus to its heading (plan §6).
  const [focusResult, setFocusResult] = useState(false);
  const state = useScoredAttempt(test.id, params, reloadKey, true);
  const tr = t.result;
  const reload = useCallback((info: MocktestUnlock) => {
    setFocusResult(info.byThisHost);
    setReloadKey((k) => k + 1);
  }, []);

  if (state.state === "loading") {
    return (
      <p role="status" className="py-10 text-center text-muted">
        {tr.loading}
      </p>
    );
  }
  if (state.state === "missing") {
    return (
      <EmptyState
        title={tr.notFoundTitle}
        description={tr.notFoundBody}
        action={<ButtonLink href={localePath("/tools/mock-tests", locale)}>{t.common.backToTests}</ButtonLink>}
      />
    );
  }
  if (state.state === "error") {
    return (
      <Notice variant="error" title={tr.errorTitle} role="alert">
        <p>{t.common.networkError}</p>
        <Button className="mt-3" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          {t.common.retry}
        </Button>
      </Notice>
    );
  }
  if (state.state === "locked") return <LockedResult t={t} onUnlocked={reload} />;
  if (state.state === "ask") return <OptionalContactStep t={t} onUnlocked={reload} />;
  return (
    <ResultBody
      key={reloadKey}
      test={test}
      t={t}
      source={state.source}
      initial={{ scored: state.scored, saved: state.saved }}
      params={params}
      focusOnMount={focusResult}
    />
  );
}

type ResultData = { scored: ScoredAttempt; saved: SavedAttemptSummary | null };

function ResultBody({
  test,
  t,
  source,
  initial,
  params,
  focusOnMount = false,
}: {
  test: RunnerTest;
  t: MocktestMessages;
  source: AttemptSource;
  initial: ResultData;
  params: { attempt: string | null; saved: string | null };
  /** Just unlocked by the visitor's own submit / skip on this page: focus the score heading. */
  focusOnMount?: boolean;
}) {
  const locale = useLocale();
  const tr = t.result;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  // Saving the attempt returns the student's own scored result, solutions included.
  const [{ scored, saved }, setData] = useState<ResultData>(initial);
  const { result } = scored;
  const plan = useMemo(() => buildStudyPlan(result.topics), [result.topics]);
  const query = attemptQuery(params);
  const base = `/tools/mock-tests/${test.id}`;
  const submittedAt = source.attempt.submittedAt;
  const autoSubmitted = source.kind === "local" && source.attempt.submitReason === "timeout";
  // Rancho gets the test title, a score band and topic names only — no questions or answers.
  const rancho = result.topics.length > 0 ? mockTestRancho(test, result, locale, tr) : null;

  return (
    <div className="space-y-6">
      {scored.sample && <Notice variant="warning">{t.common.sampleNote}</Notice>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>{format(tr.submittedAt, { date: formatDateTime(submittedAt, locale) })}</span>
        {autoSubmitted && <Badge variant="neutral">{tr.autoSubmitted}</Badge>}
      </div>

      {/* The panels below are h3 under the page's h1; this names the score summary and takes focus after an unlock. */}
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {tr.score}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tr.score} value={format(t.common.scoreOf, { score: result.score, max: result.maxScore })} />
        <Stat label={tr.accuracy} value={result.accuracy === null ? tr.accuracyNone : `${percent(result.accuracy)} %`} />
        <Stat
          label={tr.attempted}
          value={`${result.attempted} / ${result.total}`}
          sub={`${tr.correct} ${result.correct} · ${tr.wrong} ${result.wrong} · ${tr.unattempted} ${result.unattempted}`}
        />
        <Stat label={tr.timeTaken} value={formatDuration(result.timeSec, t.common)} />
      </div>
      <ResultGateIdentity />

      <SavePanel test={test} t={t} source={source} saved={saved} onSaved={setData} />

      <Panel id="mt-subjects" title={tr.subjectsTitle}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">{tr.subjectsCaption}</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-3">{tr.subject}</th>
                <th scope="col" className="py-2 pr-3">{tr.marks}</th>
                <th scope="col" className="py-2 pr-3">{tr.attempted}</th>
                <th scope="col" className="py-2 pr-3">{tr.correct}</th>
                <th scope="col" className="py-2 pr-3">{tr.wrong}</th>
                <th scope="col" className="py-2 pr-3">{tr.unattempted}</th>
                <th scope="col" className="py-2">{tr.time}</th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((s) => (
                <tr key={s.subject} className="border-b border-line/60">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {test.sections.find((section) => section.subject === s.subject)?.label[locale]}
                  </th>
                  <td className="py-2 pr-3 tabular-nums">{format(t.common.scoreOf, { score: s.score, max: s.maxScore })}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.attempted}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.correct}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.wrong}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.unattempted}</td>
                  <td className="py-2 tabular-nums">{formatDuration(s.timeSec, t.common)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <th scope="row" className="py-2 pr-3">{tr.total}</th>
                <td className="py-2 pr-3 tabular-nums">{format(t.common.scoreOf, { score: result.score, max: result.maxScore })}</td>
                <td className="py-2 pr-3 tabular-nums">{result.attempted}</td>
                <td className="py-2 pr-3 tabular-nums">{result.correct}</td>
                <td className="py-2 pr-3 tabular-nums">{result.wrong}</td>
                <td className="py-2 pr-3 tabular-nums">{result.unattempted}</td>
                <td className="py-2 tabular-nums">{formatDuration(result.timeSec, t.common)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel id="mt-heatmap" title={tr.heatmapTitle} description={tr.heatmapDescription}>
        <TopicHeatmap result={result} test={test} t={tr} lang={locale} />
        {rancho && (
          <div className="mt-4">
            <AskRanchoLink href={localePath("/tools/ask", locale)} detail={rancho.detail} size="sm">
              {rancho.label}
            </AskRanchoLink>
          </div>
        )}
      </Panel>

      <Panel id="mt-time" title={tr.timeTitle} description={tr.timeDescription}>
        <TimeChart result={result} test={test} t={tr} common={t.common} lang={locale} />
      </Panel>

      <ProjectionPanel
        projection={scored.projection}
        score={result.score}
        maxScore={result.maxScore}
        t={tr}
        exams={t.common.exams}
        locale={locale}
      />

      <Panel id="mt-plan" title={tr.planTitle} description={tr.planDescription}>
        <StudyPlanView plan={plan} t={tr} lang={locale} />
      </Panel>

      <section aria-labelledby="mt-actions" className="rounded-card border border-line bg-surface p-5">
        <h3 id="mt-actions" className="text-lg font-extrabold text-navy">
          {tr.actionsTitle}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={localePath(`${base}/certificate${query}`, locale)} variant="dark" size="sm">
            <Award aria-hidden="true" className="size-4" />
            {tr.certificate}
          </ButtonLink>
          <ButtonLink href={localePath(`${base}/report${query}`, locale)} variant="outline" size="sm">
            <FileText aria-hidden="true" className="size-4" />
            {tr.report}
          </ButtonLink>
          <ButtonLink href={localePath(`/tools/mock-tests/leaderboard?test=${test.id}`, locale)} variant="outline" size="sm">
            <Trophy aria-hidden="true" className="size-4" />
            {tr.leaderboard}
          </ButtonLink>
          <ButtonLink href={localePath(base, locale)} variant="outline" size="sm">
            <RotateCcw aria-hidden="true" className="size-4" />
            {tr.retake}
          </ButtonLink>
          {/* D-039: the enquiry form with `from=mock-test` only — no score, answers or attempt id. */}
          <ButtonLink href={toolEnquiryHref("mock-test", locale)} variant="outline" size="sm">
            <MessageCircle aria-hidden="true" className="size-4" />
            {tr.counsellor}
          </ButtonLink>
        </div>
        <p className="mt-3 text-sm text-muted">{t.parents.notConnected}</p>
      </section>

      <Panel id="mt-review" title={tr.reviewTitle}>
        {!scored.solutionsReleased && (
          <Notice variant="info" title={tr.solutionsLockedTitle} className="mb-4">
            <p className="flex items-start gap-2">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {format(tr.solutionsLocked, {
                  date: scored.solutionsReleaseAt === null ? "—" : formatDateTime(scored.solutionsReleaseAt, locale),
                })}
              </span>
            </p>
          </Notice>
        )}
        <SolutionReview result={result} review={scored.review} test={test} t={tr} common={t.common} locale={locale} />
      </Panel>
    </div>
  );
}

/**
 * "Your contact details are shared on this browser · Not you? · Stop Aspire contacting me" under a
 * result this browser's pass unlocked (nothing when signed in, the gate is off or nothing was
 * shared). Asks the page-wide gate store once so the line knows.
 */
function ResultGateIdentity() {
  const tGate = useMocktestLeadGateMessages();
  useEffect(() => {
    void leadGateStore.ensure();
  }, []);
  return <LeadGateIdentity messages={tGate} />;
}

type SaveState = { state: "idle" } | { state: "saving" } | { state: "saved" } | { state: "failed" };

/** Leaderboard status of a saved attempt, in words (server facts only). */
function SavedStatus({ test, t, saved }: { test: RunnerTest; t: MocktestMessages; saved: SavedAttemptSummary | null }) {
  const tr = t.result;
  if (!saved || !isLeaderboardTest(test)) return null;
  if (saved.leaderboard) {
    return <p className="mt-1 text-sm">{format(tr.savedLeaderboard, { time: formatDuration(saved.serverDurationSec ?? 0, t.common) })}</p>;
  }
  const reason = saved.practiceReason ?? "no_start";
  return (
    <p className="mt-1 text-sm">
      <strong>{tr.savedPractice}</strong> {tr.practiceReasons[reason]}
    </p>
  );
}

/** Signed-in students: this device's attempt is saved to the account automatically (once). */
function SavePanel({
  test,
  t,
  source,
  saved,
  onSaved,
}: {
  test: RunnerTest;
  t: MocktestMessages;
  source: AttemptSource;
  saved: SavedAttemptSummary | null;
  onSaved: (data: ResultData) => void;
}) {
  const locale = useLocale();
  const session = useSessionStatus();
  const tr = t.result;
  const alreadySaved = saved !== null || source.kind === "saved";
  const [save, setSave] = useState<SaveState>({ state: alreadySaved ? "saved" : "idle" });
  const [justSaved, setJustSaved] = useState(false);
  const started = useRef(false);
  const isStudent = session.state === "signedIn" && session.role === "student";

  async function saveNow() {
    if (source.kind !== "local") return;
    setSave({ state: "saving" });
    const a = source.attempt;
    // This panel is part of a result already shown on this device: the lead gate never asks again (`seen`).
    const response = await apiJson<{ attempt: SavedAttemptSummary; scored: ScoredAttempt }>("/api/mocktest/attempts", {
      body: fixedSaveBody(test.id, a),
    });
    if (response.ok && response.data) {
      updateLocalAttempt(a.id, { savedId: response.data.attempt.id });
      setJustSaved(true);
      setSave({ state: "saved" });
      onSaved({ scored: response.data.scored, saved: response.data.attempt });
    } else {
      setSave({ state: "failed" });
    }
  }

  useEffect(() => {
    if (!isStudent || alreadySaved || started.current || source.kind !== "local") return;
    started.current = true;
    void saveNow();
    // saveNow only reads props that identify this attempt; run once per attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, alreadySaved, source.kind]);

  if (session.state === "loading") return null;

  let body: React.ReactNode;
  if (save.state === "saved") {
    body = (
      <>
        <p className="text-sm font-semibold text-[#0f5a3c]">{justSaved ? tr.saved : tr.alreadySaved}</p>
        <SavedStatus test={test} t={t} saved={saved} />
      </>
    );
  } else if (session.state === "guest") {
    const loginHref = buildLoginHref("/student", locale);
    body = (
      <>
        <p className="text-sm">{tr.saveSignedOut}</p>
        <ButtonLink href={loginHref} size="sm" variant="outline" className="mt-2">
          {t.common.signIn}
        </ButtonLink>
      </>
    );
  } else if (!isStudent) body = <p className="text-sm">{tr.saveNotStudent}</p>;
  else if (save.state === "saving") body = <p className="text-sm" role="status">{tr.saving}</p>;
  else if (save.state === "failed") {
    body = (
      <>
        <p className="text-sm font-semibold text-danger" role="alert">
          {tr.saveFailed}
        </p>
        <Button size="sm" className="mt-2" onClick={() => void saveNow()}>
          {tr.saveCta}
        </Button>
      </>
    );
  } else body = <Button size="sm" onClick={() => void saveNow()}>{tr.saveCta}</Button>;

  return (
    <section aria-labelledby="mt-save" className="rounded-card border border-[#d7e7fb] bg-[#eef5ff] p-4">
      <h3 id="mt-save" className="font-extrabold text-navy">
        {tr.saveTitle}
      </h3>
      <div className="mt-1.5">{body}</div>
    </section>
  );
}
