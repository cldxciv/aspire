"use client";

import { CheckCircle2, CircleDashed, Flag, Lock, MessageCircle, RotateCcw, Trophy, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toolEnquiryHref } from "@/components/forms/enquiry-context";
import { LeadGateIdentity } from "@/components/lead-gate/LeadGateIdentity";
import { leadGateStore } from "@/components/lead-gate/lead-gate-store";
import { RichText } from "@/components/qb/RichText";
import { Badge, Button, ButtonLink, EmptyState, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { buildLoginHref } from "@/lib/auth/paths";
import { asksBeforeFirstResult } from "@/lib/mocktest/lead-gate";
import type { QuestionResult, ScoreResult } from "@/lib/mocktest/scoring";
import type { SavedAttemptSummary, SavedPaperAttemptDetail, ScoredAttempt } from "@/lib/mocktest/types";
import { qbSubjectLabel } from "@/lib/qb/patterns";
import { QB_REPORT_KINDS, type Bilingual, type QbPaperView, type QbReportKind, type QbSlot, type QbSubject } from "@/lib/qb/types";
import { formatDate, formatDateTime, formatDuration, OPTION_LETTERS, percent, signed, type MocktestMessages } from "./format";
import { useSessionStatus } from "./hooks";
import { LockedResult, OptionalContactStep, useMocktestLeadGateMessages, type MocktestUnlock } from "./lead-gate";
import { paperApi, paperReportBody, paperSaveBody, paperScoreBody, paperUrl } from "./paper-client";
import {
  accuracyByDifficulty,
  chapterLabelOf,
  chapterStrengths,
  keyHasOption,
  keyText,
  negativeMarksBySubject,
  paperAnswerText,
  paperBanners,
  reviewLanguage,
  sectionRows,
  STRENGTH_MIN_QUESTIONS,
} from "./paper-model";
import { getPaperAttempt, listPaperAttempts, setSiblings, updatePaperAttempt, type PaperLocalAttempt } from "./paper-store";
import { ProjectionPanel } from "./ResultParts";
import { rankedSaveRefusal } from "./save-request";

type Lang = "en" | "hi";
type Scored = ScoredAttempt<QbSubject>;
type ReadyData = { scored: Scored; saved: SavedAttemptSummary | null; paper: QbPaperView | null };

export type PaperResultState =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error"; status: number }
  | { state: "locked"; attempt: PaperLocalAttempt }
  | { state: "ask"; attempt: PaperLocalAttempt }
  | { state: "signIn"; attempt: PaperLocalAttempt }
  | { state: "expired"; attempt: PaperLocalAttempt }
  | { state: "conflict"; attempt: PaperLocalAttempt; reason: "scored" | "saved" }
  | ({ state: "ready"; attempt: PaperLocalAttempt | null } & ReadyData);

const NOT_THEIRS = new Set([400, 401, 403, 404]);

function textIn(text: Bilingual, lang: Lang): string {
  return lang === "hi" && text.hi.trim() !== "" ? text.hi : text.en;
}

/** The page-wide gate store's answer for a first result (fails open: never blocks scoring). */
async function gateBeforeFirstResult() {
  try {
    const open = await leadGateStore.ensure();
    return { open, mode: leadGateStore.getSnapshot().mode };
  } catch {
    return { open: true, mode: null };
  }
}

async function fetchPaper(paperId: string, token: string | null): Promise<QbPaperView | null> {
  const response = await paperApi<QbPaperView>(paperUrl(paperId), { token });
  return response.ok && response.data ? response.data : null;
}

/**
 * Loads the result of `?attempt=<this device's attempt id>` or `?saved=<the student's saved attempt
 * id>` (pure flow over the APIs; repeatable, so the page can be reloaded or opened later):
 * - a saved attempt: GET /api/mocktest/attempts?id= (re-scored; key corrections apply);
 * - a RANKED paper on this device: saved (and so scored) by POST /api/mocktest/attempts — /score
 *   refuses ranked papers, so it never acts as an answer-key oracle for a live board; the save
 *   applies the same lead gate (its 401 → `locked`: the contact form, then the save again);
 * - a practice paper: POST /api/mocktest/score with its token (the lead gate may answer first).
 * The paper itself (question text) is fetched for the review; when it has expired the result still
 * shows what this device kept.
 */
function usePaperResult(slot: QbSlot, params: { attempt: string | null; saved: string | null }, reloadKey: number): PaperResultState {
  const [state, setState] = useState<PaperResultState>({ state: "loading" });
  const { attempt: localId, saved: savedParam } = params;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ state: "loading" });
      const found = localId ? getPaperAttempt(localId) : null;
      const local = found && found.slot === slot ? found : null;
      const savedId = local ? (local.savedId ?? null) : savedParam;
      if (savedId) {
        const detail = await paperApi<SavedPaperAttemptDetail>(`/api/mocktest/attempts?id=${encodeURIComponent(savedId)}`);
        if (cancelled) return;
        if (detail.ok && detail.data && detail.data.scored.paper?.slot === slot) {
          const paper = await fetchPaper(detail.data.paperId, local?.token ?? null);
          if (cancelled) return;
          if (local) updatePaperAttempt(local.id, { score: detail.data.score });
          setState({ state: "ready", attempt: local, scored: detail.data.scored, saved: detail.data, paper });
          return;
        }
        if (!local) {
          setState(NOT_THEIRS.has(detail.status) ? { state: "missing" } : { state: "error", status: detail.status });
          return;
        }
        // Signed out (or another account): use this device's copy below.
      }
      if (!local) {
        setState({ state: "missing" });
        return;
      }
      if (local.mode === "ranked") {
        const saved = await paperApi<{ attempt: SavedAttemptSummary; scored: Scored }>("/api/mocktest/attempts", { body: paperSaveBody(local) });
        if (cancelled) return;
        if (saved.ok && saved.data) {
          updatePaperAttempt(local.id, { savedId: saved.data.attempt.id, score: saved.data.attempt.score });
          const paper = await fetchPaper(local.paperId, null);
          if (cancelled) return;
          setState({ state: "ready", attempt: local, scored: saved.data.scored, saved: saved.data.attempt, paper });
          return;
        }
        // The lead gate's 401 (the save is a ranked paper's first scoring): the contact form, then a re-save.
        const refusal = rankedSaveRefusal(saved);
        if (refusal.state === "error") setState(refusal);
        else setState({ ...refusal, attempt: local });
        return;
      }
      if (local.score === undefined) {
        const gate = await gateBeforeFirstResult();
        if (cancelled) return;
        if (asksBeforeFirstResult(local, true, gate)) {
          setState({ state: "ask", attempt: local });
          return;
        }
      }
      const scored = await paperApi<Scored>("/api/mocktest/score", { body: paperScoreBody(local, true) });
      if (cancelled) return;
      if (scored.leadGate) {
        setState({ state: "locked", attempt: local });
        return;
      }
      if (!scored.ok || !scored.data) {
        if (scored.status === 404) setState({ state: "expired", attempt: local });
        else if (scored.status === 409) setState({ state: "conflict", attempt: local, reason: "scored" });
        else setState({ state: "error", status: scored.status });
        return;
      }
      updatePaperAttempt(local.id, { score: scored.data.result.score });
      const paper = await fetchPaper(local.paperId, local.token);
      if (cancelled) return;
      setState({ state: "ready", attempt: { ...local, score: scored.data.result.score }, scored: scored.data, saved: null, paper });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slot, localId, savedParam, reloadKey]);

  return state;
}

/**
 * The result page of a generated paper (client; QB-MOCKTEST-UI, docs/question-bank-plan.md §B10.2,
 * §B14 package 5). Score and per-question outcomes straight away; the answer key and solutions when
 * the paper's release time has come (practice: a quarter of its time after it was made; ranked: when
 * the month closes). Only here — after submission — does each question show where it came from and
 * its difficulty label, with "Report a problem". Honest banners: sample, shorter set, compensatory
 * time, adapted questions, answer-key corrections, and a mostly past-year paper's projection note.
 */
export function PaperResultView({ slot, t, chapterLabels }: { slot: QbSlot; t: MocktestMessages; chapterLabels: Record<string, Bilingual> }) {
  const locale = useLocale();
  const search = useSearchParams();
  const params = { attempt: search?.get("attempt") ?? null, saved: search?.get("saved") ?? null };
  const [reloadKey, setReloadKey] = useState(0);
  const [focusResult, setFocusResult] = useState(false);
  const state = usePaperResult(slot, params, reloadKey);
  const tr = t.paper.result;
  const examHref = localePath(`/tools/mock-tests/exam/${slot}`, locale);
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
      <EmptyState title={tr.notFoundTitle} description={tr.notFoundBody} action={<ButtonLink href={localePath("/tools/mock-tests", locale)}>{t.common.backToTests}</ButtonLink>} />
    );
  }
  if (state.state === "error") {
    return (
      <Notice variant="error" title={t.result.errorTitle} role="alert">
        <p>{t.common.networkError}</p>
        <Button className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
          {t.common.retry}
        </Button>
      </Notice>
    );
  }
  if (state.state === "locked") {
    // A ranked paper is saved (and so put on the board) only after the details are shared; its solutions wait for the month to close.
    return <LockedResult t={t} onUnlocked={reload} body={state.attempt.mode === "ranked" ? t.gate.lockedBodyRanked : undefined} />;
  }
  if (state.state === "ask") return <OptionalContactStep t={t} onUnlocked={reload} />;
  if (state.state === "signIn") {
    return (
      <Notice variant="info" title={tr.signInTitle}>
        <p>{tr.signInBody}</p>
        <ButtonLink href={buildLoginHref("/student", locale)} className="mt-3">
          {t.common.signIn}
        </ButtonLink>
      </Notice>
    );
  }
  if (state.state === "expired") {
    const { attempt } = state;
    return (
      <Notice variant="warning" title={tr.expiredTitle}>
        <p>{attempt.score !== undefined ? format(tr.expiredScore, { score: attempt.score, max: attempt.maxScore }) : tr.expiredNoScore}</p>
        <ButtonLink href={examHref} className="mt-3">
          {tr.retake}
        </ButtonLink>
      </Notice>
    );
  }
  if (state.state === "conflict") {
    return (
      <Notice variant="warning" role="alert">
        <p>{state.reason === "scored" ? tr.alreadyScored : tr.alreadySaved}</p>
        <ButtonLink href={examHref} className="mt-3">
          {tr.retake}
        </ButtonLink>
      </Notice>
    );
  }
  return (
    <PaperResultBody
      key={reloadKey}
      slot={slot}
      t={t}
      attempt={state.attempt}
      initial={{ scored: state.scored, saved: state.saved, paper: state.paper }}
      chapterLabels={chapterLabels}
      focusOnMount={focusResult}
    />
  );
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

function Panel({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
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

/** The scored result (exported for its server-rendered test; the page uses `PaperResultView`). */
export function PaperResultBody({
  slot,
  t,
  attempt,
  initial,
  chapterLabels,
  focusOnMount,
}: {
  slot: QbSlot;
  t: MocktestMessages;
  attempt: PaperLocalAttempt | null;
  initial: ReadyData;
  chapterLabels: Record<string, Bilingual>;
  focusOnMount: boolean;
}) {
  const locale = useLocale();
  const tr = t.paper.result;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  const [{ scored, saved, paper }, setData] = useState<ReadyData>(initial);
  const { result } = scored;
  const meta = scored.paper ?? null;
  const [siblings] = useState(() => (attempt ? setSiblings(attempt, listPaperAttempts()) : []));
  const examHref = localePath(`/tools/mock-tests/exam/${slot}`, locale);
  const ranked = meta?.kind === "ranked";
  const banners = meta
    ? paperBanners({ meta, compensatoryMinutes: paper?.compensatoryMinutes ?? attempt?.compensatoryMinutes ?? 0, officialShare: scored.projection?.officialShare ?? null })
    : [];
  const submittedAt = attempt?.submittedAt ?? saved?.submittedAt ?? null;
  const sectionLabel = (sectionId: string) => paper?.sections.find((s) => s.id === sectionId)?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {submittedAt !== null && <span>{format(t.result.submittedAt, { date: formatDateTime(submittedAt, locale) })}</span>}
        {attempt?.submitReason === "timeout" && <Badge variant="neutral">{t.result.autoSubmitted}</Badge>}
        {ranked && <Badge variant="success">{t.paper.runner.rankedBadge}</Badge>}
        {meta?.setPart && <Badge variant="info">{format(t.paper.partLabel, { n: meta.setPart })}</Badge>}
      </div>

      {siblings.length > 1 && (
        <nav aria-label={tr.parts} className="flex flex-wrap gap-2">
          {siblings.map((s) => (
            <ButtonLink
              key={s.id}
              href={localePath(`/tools/mock-tests/exam/${slot}/result?attempt=${encodeURIComponent(s.id)}`, locale)}
              variant={s.id === attempt?.id ? "dark" : "outline"}
              aria-current={s.id === attempt?.id ? "page" : undefined}
            >
              {format(t.paper.partLabel, { n: s.part ?? 1 })}
            </ButtonLink>
          ))}
        </nav>
      )}

      {banners.length > 0 && meta && (
        <div className="space-y-2">
          {banners.map((banner) => (
            <Notice key={banner} variant={banner === "sample" || banner === "officialShare" ? "warning" : "info"}>
              {bannerText(banner, { meta, paper, attempt, scored, t, locale })}
            </Notice>
          ))}
        </div>
      )}

      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {t.result.score}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.result.score} value={format(t.common.scoreOf, { score: result.score, max: result.maxScore })} />
        <Stat label={t.result.accuracy} value={result.accuracy === null ? t.result.accuracyNone : `${percent(result.accuracy)} %`} />
        <Stat
          label={t.result.attempted}
          value={`${result.attempted} / ${result.total}`}
          sub={`${t.result.correct} ${result.correct} · ${t.result.wrong} ${result.wrong} · ${t.result.unattempted} ${result.unattempted}`}
        />
        <Stat label={t.result.timeTaken} value={formatDuration(result.timeSec, t.common)} />
      </div>
      <ResultGateIdentity />

      <PaperSavePanel t={t} attempt={attempt} saved={saved} ranked={ranked} onSaved={(data) => setData((prev) => ({ ...prev, ...data }))} />

      <Panel id="mt-paper-sections" title={tr.sectionsTitle}>
        <SectionTable t={t} result={result} paper={paper} locale={locale} />
      </Panel>

      {meta && (
        <Panel id="mt-paper-difficulty" title={tr.difficultyTitle} description={tr.difficultyNote}>
          <DifficultyTable t={t} rows={accuracyByDifficulty(result, meta)} />
        </Panel>
      )}

      <Panel id="mt-paper-negative" title={tr.negativeTitle}>
        <NegativeMarks t={t} result={result} locale={locale} />
      </Panel>

      <Panel id="mt-paper-chapters" title={tr.chaptersTitle} description={format(tr.chaptersNote, { n: STRENGTH_MIN_QUESTIONS })}>
        <ChapterStrengths t={t} result={result} labels={chapterLabels} locale={locale} />
      </Panel>

      <ProjectionPanel projection={scored.projection} score={result.score} maxScore={result.maxScore} t={t.result} exams={t.common.exams} locale={locale} />

      <section aria-labelledby="mt-paper-actions" className="rounded-card border border-line bg-surface p-5">
        <h3 id="mt-paper-actions" className="text-lg font-extrabold text-navy">
          {t.result.actionsTitle}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={examHref} variant="dark">
            <RotateCcw aria-hidden="true" className="size-4" />
            {tr.retake}
          </ButtonLink>
          {ranked && (
            <ButtonLink href={localePath(`/tools/mock-tests/leaderboard?test=bp-${slot}-ranked`, locale)} variant="outline">
              <Trophy aria-hidden="true" className="size-4" />
              {tr.board}
            </ButtonLink>
          )}
          {/* D-039: the enquiry form with `from=mock-test` only — no score, answers or paper id. */}
          <ButtonLink href={toolEnquiryHref("mock-test", locale)} variant="outline">
            <MessageCircle aria-hidden="true" className="size-4" />
            {t.result.counsellor}
          </ButtonLink>
        </div>
      </section>

      <Panel id="mt-paper-review" title={t.result.reviewTitle}>
        {!scored.solutionsReleased && (
          <Notice variant="info" title={tr.solutionsLockedTitle} className="mb-4">
            <p className="flex items-start gap-2">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {format(ranked ? tr.solutionsLockedRanked : tr.solutionsLockedPractice, {
                  date: scored.solutionsReleaseAt === null ? "—" : formatDateTime(scored.solutionsReleaseAt, locale),
                })}
              </span>
            </p>
          </Notice>
        )}
        <PaperReview
          t={t}
          scored={scored}
          paper={paper}
          token={attempt?.token ?? null}
          sectionLabel={sectionLabel}
          chapterLabels={chapterLabels}
        />
      </Panel>
    </div>
  );
}

function bannerText(
  banner: ReturnType<typeof paperBanners>[number],
  input: { meta: NonNullable<Scored["paper"]>; paper: QbPaperView | null; attempt: PaperLocalAttempt | null; scored: Scored; t: MocktestMessages; locale: Lang },
): string {
  const tb = input.t.paper.result.banners;
  switch (banner) {
    case "sample":
      return tb.sample;
    case "short":
      return format(tb.short, { questions: input.meta.questions.length, full: input.meta.fullQuestionCount, minutes: input.meta.durationMinutes });
    case "compensatory":
      return format(tb.compensatory, { minutes: input.paper?.compensatoryMinutes ?? input.attempt?.compensatoryMinutes ?? 0 });
    case "adapted":
      return format(tb.adapted, { n: input.meta.questions.filter((q) => q.adapted).length });
    case "corrected":
      return format(tb.corrected, { date: input.meta.correctedAt === null ? "—" : formatDate(input.meta.correctedAt, input.locale) });
    case "officialShare":
      return format(tb.officialShare, { percent: Math.round((input.scored.projection?.officialShare ?? 0) * 100) });
  }
}

/**
 * "Your contact details are shared on this browser · Not you?" under a result this browser's pass
 * unlocked (nothing when signed in, the gate is off or nothing was shared).
 */
function ResultGateIdentity() {
  const tGate = useMocktestLeadGateMessages();
  useEffect(() => {
    void leadGateStore.ensure();
  }, []);
  return <LeadGateIdentity messages={tGate} />;
}

/** Signed-in students: a practice paper from this device is saved to the account (once); a ranked one already is. */
function PaperSavePanel({
  t,
  attempt,
  saved,
  ranked,
  onSaved,
}: {
  t: MocktestMessages;
  attempt: PaperLocalAttempt | null;
  saved: SavedAttemptSummary | null;
  ranked: boolean;
  onSaved: (data: { scored: Scored; saved: SavedAttemptSummary }) => void;
}) {
  const locale = useLocale();
  const session = useSessionStatus();
  const tr = t.result;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">(saved ? "saved" : "idle");
  const started = useRef(false);
  const isStudent = session.state === "signedIn" && session.role === "student";
  const canSave = attempt !== null && saved === null && attempt.mode === "practice";

  const saveNow = useCallback(async () => {
    if (!attempt) return;
    setStatus("saving");
    const response = await paperApi<{ attempt: SavedAttemptSummary; scored: Scored }>("/api/mocktest/attempts", { body: paperSaveBody(attempt) });
    if (response.ok && response.data) {
      updatePaperAttempt(attempt.id, { savedId: response.data.attempt.id });
      setStatus("saved");
      onSaved({ scored: response.data.scored, saved: response.data.attempt });
    } else {
      setStatus("failed");
    }
  }, [attempt, onSaved]);

  useEffect(() => {
    if (!isStudent || !canSave || started.current) return;
    started.current = true;
    void saveNow();
  }, [isStudent, canSave, saveNow]);

  if (session.state === "loading") return null;
  let body: ReactNode;
  if (status === "saved" || saved) {
    body = (
      <>
        <p className="text-sm font-semibold text-[#0f5a3c]">{tr.alreadySaved}</p>
        {ranked && saved && (
          <p className="mt-1 text-sm">
            {saved.leaderboard ? t.paper.result.savedRanked : `${tr.savedPractice} ${tr.practiceReasons[saved.practiceReason ?? "no_start"]}`}
          </p>
        )}
      </>
    );
  } else if (session.state === "guest") {
    body = (
      <>
        <p className="text-sm">{t.paper.result.saveSignedOut}</p>
        <ButtonLink href={buildLoginHref("/student", locale)} variant="outline" className="mt-2">
          {t.common.signIn}
        </ButtonLink>
      </>
    );
  } else if (!isStudent) body = <p className="text-sm">{tr.saveNotStudent}</p>;
  else if (status === "saving") body = <p className="text-sm" role="status">{tr.saving}</p>;
  else if (status === "failed") {
    body = (
      <>
        <p className="text-sm font-semibold text-danger" role="alert">
          {tr.saveFailed}
        </p>
        <Button className="mt-2" onClick={() => void saveNow()}>
          {tr.saveCta}
        </Button>
      </>
    );
  } else if (canSave) body = <Button onClick={() => void saveNow()}>{tr.saveCta}</Button>;
  else return null;

  return (
    <section aria-labelledby="mt-paper-save" className="rounded-card border border-[#d7e7fb] bg-[#eef5ff] p-4">
      <h3 id="mt-paper-save" className="font-extrabold text-navy">
        {tr.saveTitle}
      </h3>
      <div className="mt-1.5">{body}</div>
    </section>
  );
}

function SectionTable({ t, result, paper, locale }: { t: MocktestMessages; result: ScoreResult<QbSubject>; paper: QbPaperView | null; locale: Lang }) {
  const tr = t.result;
  // Section-wise when the paper is still available; subject-wise otherwise (the result alone knows subjects).
  const rows: { key: string; label: string; score: number; maxScore: number; correct: number; wrong: number; unattempted: number; timeSec: number }[] = paper
    ? sectionRows(paper.sections, result).map((r) => ({ ...r, key: r.sectionId, label: textIn(r.label, locale) }))
    : result.subjects.map((s) => ({ ...s, key: s.subject, label: textIn(qbSubjectLabel(s.subject), locale) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{t.paper.result.sectionsCaption}</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3">{paper ? t.paper.result.section : tr.subject}</th>
            <th scope="col" className="py-2 pr-3">{tr.marks}</th>
            <th scope="col" className="py-2 pr-3">{tr.correct}</th>
            <th scope="col" className="py-2 pr-3">{tr.wrong}</th>
            <th scope="col" className="py-2 pr-3">{tr.unattempted}</th>
            <th scope="col" className="py-2">{tr.time}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/60">
              <th scope="row" className="py-2 pr-3 font-semibold">{r.label}</th>
              <td className="py-2 pr-3 tabular-nums">{format(t.common.scoreOf, { score: r.score, max: r.maxScore })}</td>
              <td className="py-2 pr-3 tabular-nums">{r.correct}</td>
              <td className="py-2 pr-3 tabular-nums">{r.wrong}</td>
              <td className="py-2 pr-3 tabular-nums">{r.unattempted}</td>
              <td className="py-2 tabular-nums">{formatDuration(r.timeSec, t.common)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <th scope="row" className="py-2 pr-3">{tr.total}</th>
            <td className="py-2 pr-3 tabular-nums">{format(t.common.scoreOf, { score: result.score, max: result.maxScore })}</td>
            <td className="py-2 pr-3 tabular-nums">{result.correct}</td>
            <td className="py-2 pr-3 tabular-nums">{result.wrong}</td>
            <td className="py-2 pr-3 tabular-nums">{result.unattempted}</td>
            <td className="py-2 tabular-nums">{formatDuration(result.timeSec, t.common)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DifficultyTable({ t, rows }: { t: MocktestMessages; rows: ReturnType<typeof accuracyByDifficulty> }) {
  const tp = t.paper.result;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="sr-only">{tp.difficultyCaption}</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3">{tp.difficultyColumn}</th>
            <th scope="col" className="py-2 pr-3">{tp.questions}</th>
            <th scope="col" className="py-2 pr-3">{t.result.attempted}</th>
            <th scope="col" className="py-2 pr-3">{t.result.correct}</th>
            <th scope="col" className="py-2">{t.result.accuracy}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.difficulty} className="border-b border-line/60">
              <th scope="row" className="py-2 pr-3 font-semibold">{tp.difficulty[row.difficulty]}</th>
              <td className="py-2 pr-3 tabular-nums">{row.total}</td>
              <td className="py-2 pr-3 tabular-nums">{row.attempted}</td>
              <td className="py-2 pr-3 tabular-nums">{row.correct}</td>
              <td className="py-2 tabular-nums">{row.accuracy === null ? t.result.accuracyNone : `${percent(row.accuracy)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NegativeMarks({ t, result, locale }: { t: MocktestMessages; result: ScoreResult<QbSubject>; locale: Lang }) {
  const rows = negativeMarksBySubject(result);
  const tp = t.paper.result;
  if (rows.length === 0) return <p className="text-sm text-muted">{tp.negativeNone}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((row) => (
        <li key={row.subject}>{format(tp.negativeRow, { subject: textIn(qbSubjectLabel(row.subject), locale), marks: row.lost, n: row.wrong })}</li>
      ))}
    </ul>
  );
}

const LEVEL_ICON = { strong: CheckCircle2, developing: CircleDashed, weak: XCircle, skipped: CircleDashed } as const;

function ChapterStrengths({ t, result, labels, locale }: { t: MocktestMessages; result: ScoreResult<QbSubject>; labels: Record<string, Bilingual>; locale: Lang }) {
  const tp = t.paper.result;
  const { shown, tooFew } = chapterStrengths(result);
  return (
    <div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{format(tp.chaptersNone, { n: STRENGTH_MIN_QUESTIONS })}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((topic) => {
            const Icon = LEVEL_ICON[topic.level];
            return (
              <li key={topic.topic} className="rounded-control border border-line bg-white p-3">
                <p className="text-sm font-semibold leading-snug text-ink">{chapterLabelOf(topic.topic, labels, locale)}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-bold">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t.result.level[topic.level]} · {format(t.result.topicCorrect, { correct: topic.correct, total: topic.total })}
                </p>
                <p className="text-xs text-muted">{format(tp.chapterBasedOn, { n: topic.total })}</p>
              </li>
            );
          })}
        </ul>
      )}
      {tooFew > 0 && <p className="mt-3 text-xs text-muted">{format(tp.chaptersHidden, { n: tooFew })}</p>}
    </div>
  );
}

type ReviewFilter = "all" | "wrong" | "unattempted";

function PaperReview({
  t,
  scored,
  paper,
  token,
  sectionLabel,
  chapterLabels,
}: {
  t: MocktestMessages;
  scored: Scored;
  paper: QbPaperView | null;
  token: string | null;
  sectionLabel: (sectionId: string) => Bilingual | undefined;
  chapterLabels: Record<string, Bilingual>;
}) {
  const locale = useLocale();
  const tp = t.paper.result;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  // The paper's language until the student picks one here; only a picked Hindi shows machine-drafted Hindi (labelled).
  const [chosen, setChosen] = useState<Lang | undefined>(undefined);
  const paperLanguage: Lang = paper?.language ?? locale;
  const lang = chosen ?? paperLanguage;
  const ids = { filter: useId(), lang: useId() };
  const review = useMemo(() => new Map(scored.review.map((item) => [item.id, item])), [scored.review]);
  const metaById = useMemo(() => new Map((scored.paper?.questions ?? []).map((q) => [q.id, q])), [scored.paper]);
  const shown = scored.result.questions.filter((q) => filter === "all" || q.outcome === filter);
  return (
    <div>
      {!paper && <Notice variant="info" className="mb-3">{tp.noPaperText}</Notice>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor={ids.filter} className="font-semibold">
          {t.result.reviewFilter}
        </label>
        <select id={ids.filter} value={filter} onChange={(e) => setFilter(e.target.value as ReviewFilter)} className="min-h-11 rounded-md border border-line bg-white px-2">
          <option value="all">{t.result.reviewAll}</option>
          <option value="wrong">{t.result.reviewWrong}</option>
          <option value="unattempted">{t.result.reviewUnattempted}</option>
        </select>
        <label htmlFor={ids.lang} className="font-semibold">
          {t.paper.runner.language}
        </label>
        <select id={ids.lang} value={lang} onChange={(e) => setChosen(e.target.value === "hi" ? "hi" : "en")} className="min-h-11 rounded-md border border-line bg-white px-2">
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </div>
      <ol className="mt-4 space-y-4">
        {shown.map((q) => (
          <ReviewItemCard
            key={q.id}
            t={t}
            q={q}
            question={paper?.questions[q.index] ?? null}
            paperId={scored.paper?.paperId ?? null}
            token={token}
            meta={metaById.get(q.id) ?? null}
            item={review.get(q.id) ?? null}
            lang={lang}
            paperLanguage={paperLanguage}
            chosen={chosen}
            sectionLabel={(() => {
              const label = sectionLabel(metaById.get(q.id)?.sectionId ?? "");
              return label ? textIn(label, lang) : null;
            })()}
            chapter={chapterLabelOf(q.topic, chapterLabels, lang)}
          />
        ))}
      </ol>
    </div>
  );
}

function ReviewItemCard({
  t,
  q,
  question,
  paperId,
  token,
  meta,
  item,
  lang,
  paperLanguage,
  chosen,
  sectionLabel,
  chapter,
}: {
  t: MocktestMessages;
  q: QuestionResult<QbSubject>;
  question: QbPaperView["questions"][number] | null;
  paperId: string | null;
  token: string | null;
  meta: NonNullable<Scored["paper"]>["questions"][number] | null;
  item: Scored["review"][number] | null;
  lang: Lang;
  paperLanguage: Lang;
  chosen: Lang | undefined;
  sectionLabel: string | null;
  chapter: string;
}) {
  const tp = t.paper.result;
  const OutcomeIcon = q.outcome === "correct" ? CheckCircle2 : q.outcome === "wrong" ? XCircle : CircleDashed;
  const key = item?.answer ?? null;
  const uiLang = useLocale();
  const shown = question ? reviewLanguage(question, paperLanguage, chosen) : { lang, machine: false };
  const textLang: Lang = shown.lang;
  return (
    <li className="rounded-card border border-line bg-white p-4" lang={textLang === "hi" ? "hi" : "en"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold text-navy">{format(t.result.questionShort, { n: q.index + 1 })}</span>
        <Badge variant={q.outcome === "correct" ? "success" : q.outcome === "wrong" ? "warning" : "neutral"}>
          <OutcomeIcon aria-hidden="true" className="size-3.5" />
          {q.partial ? tp.partialTag : t.result.outcome[q.outcome]}
        </Badge>
        {q.bonus && <Badge variant="info">{tp.droppedTag}</Badge>}
        <span className="text-xs text-muted">
          {format(t.result.marksAwarded, { marks: signed(q.marks) })} · {format(t.result.timeOnQuestion, { time: formatDuration(q.timeSec, t.common) })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {[sectionLabel, chapter].filter(Boolean).join(" · ")}
      </p>
      {meta && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>
            <strong>{tp.source}:</strong> {meta.sourceWithheld ? tp.sourceWithheld : textIn(meta.sourceLabel, lang)}
          </span>
          {meta.difficulty && <Badge variant="neutral">{tp.difficulty[meta.difficulty]}</Badge>}
          {meta.adapted && <Badge variant="neutral">{tp.adaptedTag}</Badge>}
          {meta.correctedAt !== null && !meta.dropped && <Badge variant="info">{tp.correctedTag}</Badge>}
        </p>
      )}
      {question && (
        <div className="mt-3">
          {shown.machine && (
            <p className="mb-2 text-xs font-semibold text-muted" lang={uiLang} data-machine-hindi="">
              {tp.machineHindi}
            </p>
          )}
          {question.passage && (
            <RichText text={textIn(question.passage.stem, textLang)} figures={question.passage.figures} locale={textLang} className="mb-2 rounded-control bg-[#f5f9ff] p-3 text-sm" />
          )}
          <RichText text={textIn(question.stem, textLang)} figures={question.figures} slot="stem" locale={textLang} />
          {question.type !== "numerical" && (
            <ul className="mt-2 space-y-1 text-sm">
              {question.options.map((option, i) => {
                const isKey = keyHasOption(key, i);
                const chosen = Array.isArray(q.answer) ? q.answer.includes(i) : q.answer === i;
                return (
                  <li key={i} className={`flex gap-2 rounded-md px-2 py-1 ${isKey ? "bg-success-soft font-semibold" : chosen && key ? "bg-danger-soft" : ""}`}>
                    <span lang="en">({OPTION_LETTERS[i] ?? i + 1})</span>
                    <RichText as="span" text={textIn(option, textLang)} figures={question.figures} slot={`option:${i}`} locale={textLang} className="min-w-0 flex-1" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">{t.result.yourAnswer}: </dt>
          <dd className="inline">{q.answer === null ? t.result.notAnswered : question ? paperAnswerText(question, q.answer, lang, OPTION_LETTERS) : String(q.answer)}</dd>
        </div>
        {key && (
          <div>
            <dt className="inline font-semibold">{tp.correctAnswer}: </dt>
            <dd className="inline">{keyText(key, lang, tp.range, OPTION_LETTERS, question?.unit)}</dd>
          </div>
        )}
      </dl>
      {item && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-blue">{t.result.solution}</summary>
          {textIn(item.solution, lang).trim() ? (
            <div className="mt-1 rounded-control bg-surface p-3 text-sm leading-relaxed">
              <RichText text={textIn(item.solution, lang)} figures={[]} slot="solution" locale={lang} />
              {item.solutionSource && item.solutionSource !== "none" && <p className="mt-2 text-xs text-muted">{tp.solutionSource[item.solutionSource]}</p>}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">{tp.noSolution}</p>
          )}
        </details>
      )}
      {paperId && <ReportProblem t={t} paperId={paperId} token={token} questionId={q.id} n={q.index + 1} />}
    </li>
  );
}

/** "Report a problem" with one question (no account or IP is stored; nothing changes until a reviewer checks it). */
function ReportProblem({ t, paperId, token, questionId, n }: { t: MocktestMessages; paperId: string; token: string | null; questionId: string; n: number }) {
  const tp = t.paper.result;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<QbReportKind>("wrong_answer");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const ids = { form: useId(), kind: useId(), note: useId(), title: useId() };
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  if (status === "sent") {
    return (
      <p role="status" className="mt-3 text-sm font-semibold text-[#0f5a3c]">
        {tp.reportThanks}
      </p>
    );
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const response = await paperApi<{ reported: boolean }>(`${paperUrl(paperId)}/report`, { body: paperReportBody({ token, questionId, kind, note }) });
    setStatus(response.ok ? "sent" : "failed");
  }
  return (
    <div className="mt-3">
      {!open ? (
        <Button variant="outline" aria-expanded={false} aria-controls={ids.form} onClick={() => setOpen(true)}>
          <Flag aria-hidden="true" className="size-4" />
          {tp.report}
        </Button>
      ) : (
        <form id={ids.form} onSubmit={send} className="space-y-3 rounded-control border border-line bg-surface p-3" aria-labelledby={ids.title}>
          <p id={ids.title} ref={titleRef} tabIndex={-1} className="text-sm font-bold text-navy outline-none">
            {format(tp.reportTitle, { n })}
          </p>
          <div>
            <label htmlFor={ids.kind} className="text-sm font-semibold">
              {tp.reportKind}
            </label>
            <select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as QbReportKind)} className="mt-1 min-h-11 w-full rounded-md border border-line bg-white px-2 text-sm">
              {QB_REPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tp.reportKinds[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.note} className="text-sm font-semibold">
              {tp.reportNote}
            </label>
            <textarea
              id={ids.note}
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
            />
          </div>
          {status === "failed" && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {tp.reportFailed}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={status === "sending"} aria-busy={status === "sending" || undefined}>
              {status === "sending" ? tp.reportSending : tp.reportSend}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tp.reportCancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
