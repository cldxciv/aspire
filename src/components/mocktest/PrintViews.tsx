"use client";

import { Download, Printer } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button, ButtonLink, EmptyState, Notice } from "@/components/ui";
import { topicLabel } from "@/content/mocktest/topics";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { ScoreResult } from "@/lib/mocktest/scoring";
import { buildStudyPlan } from "@/lib/mocktest/study-plan";
import { formatVerifyId } from "@/lib/mocktest/timing";
import type { RunnerTest, ScoredAttempt } from "@/lib/mocktest/types";
import { formatDate, formatDuration, percent, type MocktestMessages } from "./format";
import { useScoredAttempt, useSessionStatus } from "./hooks";
import { attemptQuery, useAttemptParams } from "./ResultView";

/**
 * Printable views of one attempt: the certificate and the report for parents.
 * Print CSS shows only `.mt-print-area` (the site header, footer and controls are hidden).
 *
 * Certificates (QA-SEC-M6 L7): an attempt SAVED to the signed-in student's account gets a
 * certificate of participation with a verification id that anyone can check at
 * /tools/mock-tests/verify (test, date and score band only). Anything else (guests, attempts only
 * on this device) is a "self-generated practice certificate — not verified by Aspire", without
 * Aspire's name as issuer.
 */

const PRINT_CSS = `
@media print {
  @page { margin: 12mm; }
  body * { visibility: hidden !important; }
  .mt-print-area, .mt-print-area * { visibility: visible !important; }
  .mt-print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
  .mt-no-print { display: none !important; }
}`;

export function PrintStyles() {
  return <style>{PRINT_CSS}</style>;
}

function useLoaded(test: RunnerTest) {
  const params = useAttemptParams();
  const state = useScoredAttempt(test.id, params);
  return { params, state };
}

function Missing({ t }: { t: MocktestMessages }) {
  const locale = useLocale();
  return (
    <EmptyState
      title={t.result.notFoundTitle}
      description={t.result.notFoundBody}
      action={<ButtonLink href={localePath("/tools/mock-tests", locale)}>{t.common.backToTests}</ButtonLink>}
    />
  );
}

function Status({ state, t }: { state: ReturnType<typeof useScoredAttempt>; t: MocktestMessages }) {
  if (state.state === "loading") return <p role="status" className="py-10 text-center text-muted">{t.common.loading}</p>;
  if (state.state === "missing") return <Missing t={t} />;
  if (state.state === "error") return <Notice variant="error" role="alert">{t.common.networkError}</Notice>;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Certificate

export function CertificateView({ test, t }: { test: RunnerTest; t: MocktestMessages }) {
  const { params, state } = useLoaded(test);
  if (state.state !== "ready") return <Status state={state} t={t} />;
  return (
    <Certificate
      test={test}
      t={t}
      scored={state.scored}
      submittedAt={state.source.attempt.submittedAt}
      verifyId={state.saved?.verifyId ?? null}
      backHref={attemptQuery(params)}
    />
  );
}

/** The certificate itself (exported for tests). */
export function Certificate({
  test,
  t,
  scored,
  submittedAt,
  verifyId,
  backHref,
}: {
  test: RunnerTest;
  t: MocktestMessages;
  scored: ScoredAttempt;
  submittedAt: number;
  /** Set only for an attempt saved to the signed-in student's account. */
  verifyId: string | null;
  backHref: string;
}) {
  const locale = useLocale();
  const session = useSessionStatus();
  const inputId = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const suggested = session.state === "signedIn" && session.role === "student" ? session.displayName ?? "" : "";
  const name = typed ?? suggested;
  const tc = t.certificate;
  const verified = verifyId !== null;
  const verifyPath = localePath("/tools/mock-tests/verify", locale);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const verifyUrl = verified ? `${origin}${verifyPath}?id=${formatVerifyId(verifyId)}` : "";

  return (
    <div className="space-y-5">
      <PrintStyles />
      <div className="mt-no-print flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="text-sm font-bold text-navy">
            {tc.nameLabel}
          </label>
          <input
            id={inputId}
            value={name}
            maxLength={60}
            autoComplete="name"
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 min-h-11 w-full max-w-md rounded-control border border-line bg-white px-3"
            placeholder={tc.namePlaceholder}
          />
        </div>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-4" />
          {tc.print}
        </Button>
        <ButtonLink href={localePath(`/tools/mock-tests/${test.id}/result${backHref}`, locale)} variant="outline">
          {t.result.title}
        </ButtonLink>
      </div>

      <article className="mt-print-area relative overflow-hidden rounded-card border-[6px] border-double border-gold bg-white px-6 py-10 text-center shadow-card sm:px-12">
        {scored.sample && (
          <p className="absolute top-3 right-3 rounded-md border border-dashed border-[#d9b64a] bg-gold-soft px-2 py-0.5 text-[11px] font-extrabold uppercase text-[#7a5600]">
            {t.common.sample}
          </p>
        )}
        {verified ? (
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue">Aspire IIT &amp; Medical</p>
        ) : (
          <p className="mx-auto max-w-xl rounded-md border-2 border-dashed border-[#c0392b] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-[#9c2b1f]">
            {tc.selfLabel}
          </p>
        )}
        <h2 className="mt-3 font-serif text-[clamp(1.8rem,4vw,2.6rem)] font-semibold text-navy">{verified ? tc.heading : tc.selfHeading}</h2>
        <p className="mt-6 text-muted">{verified ? tc.intro : tc.selfIntro}</p>
        <p className="mx-auto mt-2 min-h-12 max-w-xl border-b-2 border-navy/30 pb-1 font-serif text-[clamp(1.5rem,3.5vw,2.2rem)] text-ink">
          {name.trim() || <span className="text-muted/60">{tc.namePlaceholder}</span>}
        </p>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed">
          {format(tc.body, {
            test: test.title[locale],
            date: formatDate(submittedAt, locale),
            score: scored.result.score,
            max: scored.result.maxScore,
          })}
        </p>
        {verified ? (
          <>
            <p className="mt-8 text-sm font-bold text-navy">{tc.issuer}</p>
            <p className="mt-4 text-sm">
              <span className="font-semibold text-muted">{tc.verifyIdLabel}: </span>
              <span className="font-mono font-bold tracking-wider text-ink">{formatVerifyId(verifyId)}</span>
            </p>
            <p className="mt-1 break-all text-xs text-muted">{format(tc.verifyAt, { url: verifyUrl })}</p>
            <p className="mx-auto mt-4 max-w-xl text-xs text-muted">{tc.disclaimer}</p>
            <p className="mx-auto mt-1 max-w-xl text-xs text-muted">{tc.verifyNote}</p>
          </>
        ) : (
          <p className="mx-auto mt-8 max-w-xl text-xs text-muted">{tc.selfDisclaimer}</p>
        )}
        {scored.sample && <p className="mt-2 text-xs font-semibold text-[#7a5600]">{tc.sampleNote}</p>}
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Report for parents

/** Topics of the first study week of the 30-day plan (days 1–6), in plan order. */
function firstWeekTopics(result: ScoreResult, locale: Locale): string[] {
  const labels: string[] = [];
  for (const day of buildStudyPlan(result.topics).slice(0, 6)) {
    for (const block of day.blocks) {
      if (!block.topic) continue;
      const label = topicLabel(block.topic, locale);
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

/** Plain-text version of the parent report (for the download button). Pure. */
export function buildParentReportText(input: {
  test: RunnerTest;
  result: ScoreResult;
  submittedAt: number;
  sample: boolean;
  t: MocktestMessages;
  locale: Locale;
}): string {
  const { test, result, t, locale } = input;
  const tr = t.report;
  const strong = result.topics.filter((x) => x.level === "strong").map((x) => topicLabel(x.topic, locale));
  const focus = result.topics.filter((x) => x.level === "weak" || x.level === "skipped").map((x) => topicLabel(x.topic, locale));
  const lines = [
    tr.heading,
    "",
    `${tr.test}: ${test.title[locale]}`,
    `${tr.date}: ${formatDate(input.submittedAt, locale)}`,
    `${tr.score}: ${result.score} / ${result.maxScore}`,
    `${tr.accuracy}: ${result.accuracy === null ? "—" : `${percent(result.accuracy)} %`}`,
    `${tr.counts}: ${result.correct} / ${result.wrong} / ${result.unattempted}`,
    `${tr.time}: ${formatDuration(result.timeSec, t.common)}`,
    "",
    `${tr.subjects}:`,
    ...result.subjects.map((s) => {
      const label = test.sections.find((x) => x.subject === s.subject)?.label[locale] ?? s.subject;
      return `- ${label}: ${s.score} / ${s.maxScore} (${s.correct} / ${s.wrong} / ${s.unattempted})`;
    }),
    "",
    `${tr.strengths}: ${strong.length > 0 ? strong.join(", ") : tr.none}`,
    `${tr.focus}: ${focus.length > 0 ? focus.join(", ") : tr.none}`,
    "",
    `${tr.planSummary}: ${format(tr.planLine, { topics: firstWeekTopics(result, locale).join(", ") || tr.none })}`,
    "",
    t.parents.notConnected,
    ...(input.sample ? ["", tr.sampleNote] : []),
  ];
  return `${lines.join("\n")}\n`;
}

export function ParentReportView({ test, t }: { test: RunnerTest; t: MocktestMessages }) {
  const { params, state } = useLoaded(test);
  if (state.state !== "ready") return <Status state={state} t={t} />;
  return <ParentReport test={test} t={t} scored={state.scored} submittedAt={state.source.attempt.submittedAt} backHref={attemptQuery(params)} />;
}

function ParentReport({
  test,
  t,
  scored,
  submittedAt,
  backHref,
}: {
  test: RunnerTest;
  t: MocktestMessages;
  scored: ScoredAttempt;
  submittedAt: number;
  backHref: string;
}) {
  const locale = useLocale();
  const tr = t.report;
  const { result } = scored;
  const strong = result.topics.filter((x) => x.level === "strong");
  const focus = result.topics.filter((x) => x.level === "weak" || x.level === "skipped");
  const text = useMemo(
    () => buildParentReportText({ test, result, submittedAt, sample: scored.sample, t, locale }),
    [test, result, submittedAt, scored.sample, t, locale],
  );

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aspire-mock-test-report-${test.id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const rows: [string, string][] = [
    [tr.test, test.title[locale]],
    [tr.date, formatDate(submittedAt, locale)],
    [tr.score, format(t.common.scoreOf, { score: result.score, max: result.maxScore })],
    [tr.accuracy, result.accuracy === null ? "—" : `${percent(result.accuracy)} %`],
    [tr.counts, `${result.correct} / ${result.wrong} / ${result.unattempted}`],
    [tr.time, formatDuration(result.timeSec, t.common)],
  ];

  return (
    <div className="space-y-5">
      <PrintStyles />
      <div className="mt-no-print flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-4" />
          {tr.print}
        </Button>
        <Button variant="outline" onClick={download}>
          <Download aria-hidden="true" className="size-4" />
          {tr.download}
        </Button>
        <ButtonLink href={localePath(`/tools/mock-tests/${test.id}/result${backHref}`, locale)} variant="outline">
          {t.result.title}
        </ButtonLink>
      </div>
      <Notice className="mt-no-print">{t.parents.notConnected}</Notice>

      <article className="mt-print-area rounded-card border border-line bg-white p-6 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue">Aspire IIT &amp; Medical</p>
        <h2 className="mt-1 text-2xl font-extrabold text-navy">{tr.heading}</h2>
        <p className="mt-1 text-sm text-muted">{tr.intro}</p>
        {scored.sample && <p className="mt-2 text-sm font-semibold text-[#7a5600]">{tr.sampleNote}</p>}
        <dl className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-line/70 py-1.5 text-sm">
              <dt className="font-semibold text-muted">{label}</dt>
              <dd className="text-right font-bold text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 font-extrabold text-navy">{tr.subjects}</h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-1.5 pr-3">{t.result.subject}</th>
              <th scope="col" className="py-1.5 pr-3">{t.result.marks}</th>
              <th scope="col" className="py-1.5">{tr.counts}</th>
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((s) => (
              <tr key={s.subject} className="border-b border-line/60">
                <th scope="row" className="py-1.5 pr-3 font-semibold">
                  {test.sections.find((x) => x.subject === s.subject)?.label[locale]}
                </th>
                <td className="py-1.5 pr-3 tabular-nums">{format(t.common.scoreOf, { score: s.score, max: s.maxScore })}</td>
                <td className="py-1.5 tabular-nums">{`${s.correct} / ${s.wrong} / ${s.unattempted}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="font-extrabold text-navy">{tr.strengths}</h3>
            <p className="mt-1 text-sm">{strong.length > 0 ? strong.map((x) => topicLabel(x.topic, locale)).join(", ") : tr.none}</p>
          </div>
          <div>
            <h3 className="font-extrabold text-navy">{tr.focus}</h3>
            <p className="mt-1 text-sm">{focus.length > 0 ? focus.map((x) => topicLabel(x.topic, locale)).join(", ") : tr.none}</p>
          </div>
        </div>
        <h3 className="mt-6 font-extrabold text-navy">{tr.planSummary}</h3>
        <p className="mt-1 text-sm">{format(tr.planLine, { topics: firstWeekTopics(result, locale).join(", ") || tr.none })}</p>
        <p className="mt-6 border-t border-line pt-3 text-xs text-muted">{t.parents.notConnected}</p>
      </article>
    </div>
  );
}
