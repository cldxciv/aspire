"use client";

import { Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LeadGateForm } from "@/components/lead-gate/LeadGateForm";
import { LeadGateNote } from "@/components/lead-gate/LeadGateNote";
import { useLeadGate } from "@/components/lead-gate/use-lead-gate";
import { Button, ButtonLink, DemoBadge, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { buildLoginHref } from "@/lib/auth/paths";
import { startsAfterUnlock } from "@/lib/mocktest/lead-gate";
import { clearProgress, readPreferredLanguage, storageAvailable, writePreferredLanguage } from "@/lib/mocktest/local-store";
import type { PaperReadinessView, PaperStart, ScoredAttempt } from "@/lib/mocktest/types";
import { QB_SLOT_META } from "@/lib/qb/patterns";
import type { QbPaperView, QbSlot, QbSubject } from "@/lib/qb/types";
import { formatDateTime, type MocktestMessages } from "./format";
import { GeneratedMockRunner } from "./GeneratedMockRunner";
import { useMounted } from "./hooks";
import { useMocktestLeadGateMessages } from "./lead-gate";
import { paperApi, paperScoreBody, paperUrl, readinessUrl, type PaperApiResult } from "./paper-client";
import {
  asksContactBeforePaper,
  compositionSummary,
  examStatus,
  examStatusText,
  expectedMinutes,
  runnerPaper,
  serverClockOffset,
  startableLanguages,
  startControls,
  type ExamStatus,
} from "./paper-model";
import {
  activeAfterSubmit,
  activePaperFromStart,
  clearActivePaper,
  listPaperAttempts,
  paperProgressId,
  readActivePaper,
  readRecentPapers,
  rememberRecentPaper,
  updatePaperAttempt,
  writeActivePaper,
  type ActivePaper,
  type PaperLocalAttempt,
} from "./paper-store";

type Lang = "en" | "hi";
type Mode = "practice" | "ranked";
type Busy = Mode | "resume-practice" | "resume-ranked" | null;
type Readiness = { state: "loading" } | { state: "error" } | { state: "ready"; view: PaperReadinessView };
type Phase = { kind: "idle" } | { kind: "running"; paper: QbPaperView; active: ActivePaper } | { kind: "between"; active: ActivePaper } | { kind: "leaving" };
type Message = { variant: "error" | "warning" | "info"; text: string; resultId?: string; signIn?: boolean };

/** The result page of a submitted part. */
export function paperResultPath(slot: QbSlot, attemptId: string): string {
  return `/tools/mock-tests/exam/${slot}/result?attempt=${encodeURIComponent(attemptId)}`;
}

/** What a refused POST /api/mocktest/papers means for the student (pure). */
export function startErrorText(result: Pick<PaperApiResult<unknown>, "status" | "reason" | "fieldErrors">, t: MocktestMessages["paper"]["errors"], common: MocktestMessages["common"]): string {
  if (result.status === 0) return common.networkError;
  if (result.status === 409) {
    if (result.reason === "bank_thin") return t.bankThin;
    if (result.reason === "ranked_off") return t.rankedOff;
    if (result.reason === "ranked_unavailable") return t.rankedUnavailable;
  }
  if (result.status === 401 || result.status === 403) return t.rankedSignIn;
  if (result.status === 422 && result.fieldErrors?.language) return t.language;
  if (result.status === 429) return t.rateLimited;
  if (result.status === 503) return t.off;
  if (result.status === 404) return t.unpublished;
  return t.generic;
}

/** Is a student signed in right now (asked fresh, not the page's first answer)? null when unknown. */
async function studentSignedIn(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/session", { headers: { accept: "application/json" }, cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { authenticated?: boolean; role?: string } } | null;
    return body?.data?.authenticated === true && body.data.role === "student";
  } catch {
    return null;
  }
}

/**
 * Paper 1 of a pair is scored as soon as it is submitted, in the background, so its question
 * statistics are recorded within the plausible-timing window and its tool use is noted once (plan
 * §B11). A lead-gate answer or a failure is ignored: its result page scores it later as usual.
 * Practice papers only (ranked papers are scored when saved to the account).
 */
async function scorePartInBackground(attempt: PaperLocalAttempt): Promise<void> {
  if (attempt.mode !== "practice") return;
  const scored = await paperApi<ScoredAttempt<QbSubject>>("/api/mocktest/score", { body: paperScoreBody(attempt, true) });
  if (scored.ok && scored.data) updatePaperAttempt(attempt.id, { score: scored.data.result.score });
}

/**
 * The start panel of an exam-pattern mock (client; QB-MOCKTEST-UI, docs/question-bank-plan.md §B10.6,
 * §B14 package 5). In order:
 * 1. Readiness first (GET /api/mocktest/papers/readiness), so nobody is asked for contact details
 *    for an exam the bank cannot serve: full, a labelled shorter set, or "coming soon: X of Y".
 * 2. An unfinished paper on this device resumes (the SAME paper, by its token or, ranked, the
 *    student's session; never gated). Practice and ranked papers are kept apart, and a new practice
 *    paper starts only after the unfinished one is resumed or left.
 * 3. Start: papers of 60 minutes or more ask for contact details first (`useLeadGate`, tool
 *    "mock-test"; fails open), then POST /api/mocktest/papers makes a new paper and the runner opens.
 * 4. The monthly ranked paper: signed-in students only, one sitting, no compensatory time.
 * The JEE (Advanced) pair runs Paper 1, a break, then Paper 2 (nothing else starts in between).
 */
export function ExamStart({ slot, t }: { slot: QbSlot; t: MocktestMessages }) {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <p className="text-sm text-muted" role="status">
        {t.paper.start.loading}
      </p>
    );
  }
  return <ExamStartClient slot={slot} t={t} />;
}

function ExamStartClient({ slot, t }: { slot: QbSlot; t: MocktestMessages }) {
  const locale = useLocale();
  const router = useRouter();
  const tp = t.paper;
  const ts = tp.start;
  const meta = QB_SLOT_META[slot];
  const ids = { title: useId(), ranked: useId() };
  const [canStore] = useState(() => storageAvailable());
  const [actives, setActives] = useState<Record<Mode, ActivePaper | null>>(() => ({
    practice: readActivePaper(slot, "practice"),
    ranked: readActivePaper(slot, "ranked"),
  }));
  const [language, setLanguage] = useState<Lang>(() => actives.practice?.language ?? readPreferredLanguage() ?? locale);
  // The student picked a language on this page: it is never switched for them after that.
  const languageChosen = useRef(false);
  const [readiness, setReadiness] = useState<Readiness>({ state: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [compensatory, setCompensatory] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const tGate = useMocktestLeadGateMessages();
  // Start was pressed and the contact form opened instead: start once THIS form unlocks.
  const pending = useRef<Mode | null>(null);
  const gate = useLeadGate({
    tool: "mock-test",
    onUnlocked: ({ byThisHost }) => {
      const mode = pending.current;
      pending.current = null;
      if (mode && startsAfterUnlock(true, byThisHost)) void begin(mode);
    },
  });
  const introRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (gate.gateOpen) introRef.current?.focus();
  }, [gate.gateOpen]);
  // After a part of a pair is submitted the test screen closes: focus moves to "Paper 1 submitted".
  const betweenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase.kind === "between") betweenRef.current?.focus();
  }, [phase.kind]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setReadiness({ state: "loading" });
      const result = await paperApi<PaperReadinessView>(readinessUrl(slot, language));
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setReadiness({ state: "error" });
        return;
      }
      // A remembered (not chosen) language the bank cannot serve yet: switch once to one it can
      // (the check runs again for it), so the page never says "coming soon" while a paper is ready.
      const startable = startableLanguages(result.data);
      if (!languageChosen.current && startable.length > 0 && !startable.includes(language)) {
        languageChosen.current = true;
        setLanguage(startable[0]);
        return;
      }
      setReadiness({ state: "ready", view: result.data });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slot, language, reloadKey]);

  const view = readiness.state === "ready" ? readiness.view : null;
  const status: ExamStatus | null = view ? examStatus(view) : null;
  const startable = view ? startableLanguages(view) : [];
  const controls = startControls(view);
  const canStart = status !== null && (status.kind === "full" || status.kind === "short") && startable.includes(language);
  const minutes = status ? expectedMinutes(status) : null;
  const asksAtStart = status ? asksContactBeforePaper(status) : true;
  // An unfinished practice paper is resumed or left first: a new one never replaces it silently.
  const practiceBlocked = actives.practice !== null;

  /** Keeps (or forgets) the paper being taken in one mode, on this device and on screen. */
  function storeActive(mode: Mode, value: ActivePaper | null) {
    if (value) writeActivePaper(value);
    else clearActivePaper(slot, mode);
    setActives((prev) => ({ ...prev, [mode]: value }));
  }

  async function openPart(target: ActivePaper): Promise<void> {
    setBusy(target.mode === "ranked" ? "resume-ranked" : "resume-practice");
    setMessage(null);
    const part = target.parts[target.current];
    const result = await paperApi<QbPaperView>(paperUrl(part.id), { token: target.token });
    // A ranked paper opens with the student's session only: is a student signed in at all?
    const student = !result.ok && result.status === 404 && target.mode === "ranked" ? await studentSignedIn() : null;
    setBusy(null);
    if (result.ok && result.data) {
      if (result.data.scored) {
        // Already scored (another tab or device): show its result if this device has it.
        const local = listPaperAttempts().find((a) => a.paperId === part.id);
        storeActive(target.mode, null);
        if (local) router.push(localePath(paperResultPath(slot, local.id), locale));
        else setMessage({ variant: "info", text: tp.errors.alreadySubmitted });
        return;
      }
      // The clock is measured again now (0 when this device is close enough to the server), so a
      // device clock moved since the paper was made never adds time (`initialPaperState`).
      const offset = result.serverDate ? serverClockOffset(result.serverDate, result.sentAt, result.receivedAt) : target.clockOffsetMs;
      const updated = { ...target, clockOffsetMs: offset };
      storeActive(target.mode, updated);
      setPhase({ kind: "running", paper: runnerPaper(result.data), active: updated });
      return;
    }
    if (result.status === 404) {
      if (target.mode === "ranked" && student !== true) {
        // Signed out (or unknown): the answers on this device are kept; signing in opens the paper.
        setMessage({ variant: "info", text: ts.resumeRankedSignIn, signIn: true });
        return;
      }
      for (const p of target.parts) clearProgress(paperProgressId(p.id));
      storeActive(target.mode, null);
      setMessage({ variant: "warning", text: tp.errors.expired });
      return;
    }
    setMessage({ variant: "error", text: result.status === 0 ? t.common.networkError : tp.errors.generic });
  }

  async function begin(mode: Mode): Promise<void> {
    setBusy(mode);
    setMessage(null);
    const recent = readRecentPapers();
    const result = await paperApi<PaperStart>("/api/mocktest/papers", {
      body: {
        slot,
        mode,
        language,
        compensatory: mode === "practice" && compensatory,
        ...(recent.length > 0 ? { recent } : {}),
      },
    });
    setBusy(null);
    if (!result.ok || !result.data || result.data.papers.length === 0) {
      setMessage({ variant: result.status === 409 ? "warning" : "error", text: startErrorText(result, tp.errors, t.common) });
      if (result.reason === "bank_thin") setReloadKey((k) => k + 1);
      return;
    }
    const start = result.data;
    const offset = serverClockOffset(result.serverDate, result.sentAt, result.receivedAt);
    let next = activePaperFromStart(start, { slot, mode, language, clockOffsetMs: offset, now: Date.now() });
    if (mode === "ranked" && start.resumed) {
      // This month's ranked paper already exists: continue the first part not yet submitted.
      const local = listPaperAttempts();
      const attempts = start.papers.map((p) => local.find((a) => a.paperId === p.id)?.id ?? null);
      const index = start.papers.findIndex((p, i) => !p.scored && attempts[i] === null);
      if (index === -1) {
        const last = [...attempts].reverse().find((id): id is string => id !== null);
        storeActive("ranked", null);
        setMessage({ variant: "info", text: tp.ranked.done, ...(last ? { resultId: last } : {}) });
        return;
      }
      next = { ...next, current: index, attempts };
    }
    if (start.token) for (const p of start.papers) rememberRecentPaper({ id: p.id, token: start.token });
    // A practice paper left unfinished is replaced: its progress on this device goes too.
    const replaced = actives.practice;
    if (mode === "practice" && replaced && !start.papers.some((p) => p.id === replaced.parts[0].id)) {
      for (const p of replaced.parts) clearProgress(paperProgressId(p.id));
    }
    writePreferredLanguage(language);
    storeActive(mode, next);
    setPhase({ kind: "running", paper: runnerPaper(start.papers[next.current]), active: next });
  }

  async function startPaper(mode: Mode): Promise<void> {
    if (busy) return;
    if (asksAtStart && !(await gate.requestAccess())) {
      // The contact form opens below; nothing is made or timed until it is sent (or skipped).
      pending.current = mode;
      return;
    }
    await begin(mode);
  }

  function onSubmitted(attempt: PaperLocalAttempt, current: ActivePaper) {
    const { active: next, done } = activeAfterSubmit(current, attempt.id);
    if (done) {
      storeActive(current.mode, null);
      setPhase({ kind: "leaving" });
      router.push(localePath(paperResultPath(slot, attempt.id), locale));
      return;
    }
    void scorePartInBackground(attempt);
    storeActive(current.mode, next);
    setPhase({ kind: "between", active: next });
  }

  if (phase.kind === "running") {
    return (
      <GeneratedMockRunner
        key={phase.paper.id}
        paper={phase.paper}
        active={phase.active}
        t={t}
        onSubmitted={(attempt) => onSubmitted(attempt, phase.active)}
      />
    );
  }
  if (phase.kind === "leaving") {
    return (
      <p role="status" className="text-sm text-muted">
        {t.result.loading}
      </p>
    );
  }

  const idle = phase.kind === "idle";
  const partLabel = (index: number) => format(tp.partLabel, { n: index + 1 });
  // The up-front note follows the live mode; a long paper says it asks before the start.
  const noteMessages = asksAtStart ? { ...tGate, note: { ...tGate.note, required: t.gate.noteStartRequired, optional: t.gate.noteStartOptional } } : tGate;
  const startFormMessages = { ...tGate, continueWithoutSaving: t.gate.startWithoutSaving };
  const summary = view?.composition ? compositionSummary(view.composition) : null;
  const examName = meta.examName[locale];
  const rankedInfo = view?.available ? view.ranked : null;
  // "I have read the instructions": with the practice form, or with the ranked start when only that is shown.
  const agreeBox = (
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-5 accent-navy" />
      {ts.agree}
    </label>
  );

  return (
    <div className="space-y-5">
      {!canStore && <Notice variant="warning">{t.instructions.storageWarning}</Notice>}

      {phase.kind === "between" && (
        <div ref={betweenRef} tabIndex={-1} className="outline-none">
          <Notice variant="success" title={format(ts.nextTitle, { part: partLabel(phase.active.current - 1) })}>
            <p>{format(ts.nextBody, { next: partLabel(phase.active.current) })}</p>
            <Button className="mt-3" disabled={busy !== null} onClick={() => void openPart(phase.active)}>
              {busy === `resume-${phase.active.mode}` ? ts.opening : format(ts.nextStart, { next: partLabel(phase.active.current) })}
            </Button>
          </Notice>
        </div>
      )}

      {idle &&
        (["ranked", "practice"] as const).map((mode) => {
          const paper = actives[mode];
          if (!paper) return null;
          return (
            <Notice key={mode} variant="info" title={mode === "ranked" ? ts.resumeRankedTitle : ts.resumeTitle}>
              <p>{format(ts.resumeBody, { date: formatDateTime(paper.parts[0].createdAt, locale) })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={busy !== null} onClick={() => void openPart(paper)}>
                  {busy === `resume-${mode}` ? ts.opening : ts.resume}
                </Button>
                {mode === "practice" && (
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      for (const p of paper.parts) clearProgress(paperProgressId(p.id));
                      storeActive("practice", null);
                    }}
                  >
                    {ts.discard}
                  </Button>
                )}
              </div>
            </Notice>
          );
        })}

      <section aria-labelledby={ids.title} className="rounded-card border border-line bg-white p-5 shadow-soft">
        <h2 id={ids.title} className="text-xl font-extrabold text-navy">
          {ts.title}
        </h2>
        <div className="mt-3" aria-live="polite" aria-busy={readiness.state === "loading"}>
          {readiness.state === "loading" && <p className="text-sm text-muted">{ts.loading}</p>}
          {readiness.state === "error" && (
            <Notice variant="error">
              <p>{ts.error}</p>
              <Button className="mt-2" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                {t.common.retry}
              </Button>
            </Notice>
          )}
          {status && (
            <p className="text-sm font-semibold text-ink" data-exam-status={status.kind}>
              {examStatusText(status, meta.placeholder, tp)}
            </p>
          )}
        </div>

        {view?.sample && canStart && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DemoBadge label={tp.sample} />
            <p className="text-xs text-muted">{tp.sampleNote}</p>
          </div>
        )}

        {summary && canStart && (
          <div className="mt-4 rounded-control bg-surface p-3 text-sm">
            <p className="font-bold text-navy">{ts.compositionTitle}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {summary.official > 0 && (
                <li>{format(summary.years ? ts.official : ts.officialNoYears, { n: summary.official, exam: examName, years: summary.years })}</li>
              )}
              {summary.aspire > 0 && <li>{format(ts.aspire, { n: summary.aspire })}</li>}
              {summary.sample > 0 && <li>{format(ts.sampleCount, { n: summary.sample })}</li>}
              {summary.adapted > 0 && <li>{format(ts.adapted, { n: summary.adapted })}</li>}
              <li>{format(ts.difficulty, summary.difficulty)}</li>
              {summary.hindiShortfall > 0 && <li>{format(ts.hindiShortfall, { n: summary.hindiShortfall })}</li>}
            </ul>
            {view?.readiness && view.readiness.variety >= 1 && (
              <p className="mt-2 text-xs text-muted">{format(ts.variety, { n: Math.floor(view.readiness.variety) })}</p>
            )}
          </div>
        )}

        {idle && view && controls.practice && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (agreed && canStart && !practiceBlocked) void startPaper("practice");
            }}
          >
            <LeadGateNote messages={noteMessages} />
            <fieldset>
              <legend className="text-sm font-bold text-navy">{ts.language}</legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {view.languages.map((lang) => {
                  const level = view.readiness?.byLanguage[lang] ?? "thin";
                  const name = lang === "hi" ? "हिन्दी" : "English";
                  return (
                    <label key={lang} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`exam-lang-${slot}`}
                        value={lang}
                        checked={language === lang}
                        onChange={() => {
                          languageChosen.current = true;
                          setLanguage(lang);
                        }}
                        className="size-5 accent-navy"
                      />
                      <span lang={lang === "hi" ? "hi" : "en"}>{name}</span>
                      {level !== "full" && <span className="text-xs text-muted">({level === "short" ? ts.languageShort : ts.languageThin})</span>}
                    </label>
                  );
                })}
              </div>
              {view.languages.includes("hi") && <p className="mt-1 text-xs text-muted">{ts.languageNote}</p>}
            </fieldset>
            {view.compensatoryMinutes !== null && view.compensatoryMinutes > 0 && (
              <div>
                <label className="flex min-h-11 items-start gap-2 pt-2.5 text-sm">
                  <input type="checkbox" checked={compensatory} onChange={(e) => setCompensatory(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy" />
                  <span>{format(ts.compensatory, { minutes: view.compensatoryMinutes })}</span>
                </label>
                <p className="ml-7 text-xs text-muted">{ts.compensatoryNote}</p>
              </div>
            )}
            {agreeBox}
            <Button type="submit" disabled={!agreed || !canStart || practiceBlocked || busy !== null || gate.gateOpen} aria-busy={busy === "practice" || undefined}>
              {busy === "practice" ? ts.making : ts.practice}
            </Button>
            {practiceBlocked && <p className="text-xs text-muted">{ts.finishFirst}</p>}
          </form>
        )}
      </section>

      {rankedInfo && rankedInfo.mode === "monthly" && (
        <section aria-labelledby={ids.ranked} className="rounded-card border border-[#d7e7fb] bg-[#eef5ff] p-5">
          <h2 id={ids.ranked} className="flex items-center gap-2 text-lg font-extrabold text-navy">
            <Trophy aria-hidden="true" className="size-5" />
            {tp.ranked.title}
          </h2>
          <p className="mt-2 text-sm">{tp.ranked.body}</p>
          {rankedInfo.closesAt !== null && <p className="mt-1 text-sm text-muted">{format(tp.ranked.closes, { date: formatDateTime(rankedInfo.closesAt, locale) })}</p>}
          <div className="mt-3">
            {!rankedInfo.signedIn ? (
              <>
                <p className="text-sm">{tp.ranked.signIn}</p>
                <ButtonLink href={buildLoginHref("/student", locale)} variant="outline" className="mt-2">
                  {t.common.signIn}
                </ButtonLink>
              </>
            ) : !rankedInfo.available ? (
              <p className="text-sm">{tp.ranked.unavailable}</p>
            ) : (
              idle && (
                <>
                  <p className="text-xs text-muted">{tp.ranked.noCompensatory}</p>
                  {controls.agreeIn === "ranked" && <div className="mt-2">{agreeBox}</div>}
                  <Button
                    className="mt-2"
                    variant="dark"
                    disabled={!agreed || busy !== null || gate.gateOpen}
                    aria-busy={busy === "ranked" || undefined}
                    onClick={() => void startPaper("ranked")}
                  >
                    {busy === "ranked" ? ts.making : tp.ranked.start}
                  </Button>
                  {!agreed && <p className="mt-1 text-xs text-muted">{tp.ranked.agreeFirst}</p>}
                </>
              )
            )}
          </div>
          <ButtonLink href={localePath(`/tools/mock-tests/leaderboard?test=bp-${slot}-ranked`, locale)} variant="outline" className="mt-3">
            {tp.ranked.board}
          </ButtonLink>
        </section>
      )}

      {message && (
        <Notice variant={message.variant} role={message.variant === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.resultId && (
            <ButtonLink href={localePath(paperResultPath(slot, message.resultId), locale)} variant="outline" className="mt-2">
              {tp.result.title}
            </ButtonLink>
          )}
          {message.signIn && (
            <ButtonLink href={buildLoginHref("/student", locale)} variant="outline" className="mt-2">
              {t.common.signIn}
            </ButtonLink>
          )}
        </Notice>
      )}

      {gate.gateOpen && (
        <div className="space-y-3" data-mocktest-gate="start">
          <p ref={introRef} tabIndex={-1} className="text-sm text-muted outline-none">
            {format(ts.contactIntro, { n: minutes ?? "" })}
          </p>
          {/* Its own form, after the start form (never nested); focus moved to the line above after the click. */}
          <LeadGateForm {...gate.formProps} messages={startFormMessages} variant="compact" headingLevel={2} submitLabel={t.gate.startSubmit} focusOnMount={false} />
        </div>
      )}
    </div>
  );
}
