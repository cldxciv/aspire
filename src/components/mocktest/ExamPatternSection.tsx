import { ArrowRight, BarChart3, Clock, ListChecks, Trophy } from "lucide-react";
import { connection } from "next/server";
import { Badge, ButtonLink, DemoBadge, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { showPlaceholderContent } from "@/lib/content-mode";
import { blueprintTotals, defaultBlueprint, QB_SLOT_META } from "@/lib/qb/patterns";
import type { QbSlot } from "@/lib/qb/types";
import { examPatternStatus as statusOf, loadExamPatternItems, type ExamPatternItem } from "./exam-pattern-items";
import type { MocktestMessages } from "./format";
import { examStatusText } from "./paper-model";

export { loadExamPatternItems, type ExamPatternItem };

/**
 * "Exam-pattern mocks: a new paper every attempt" on /tools/mock-tests (QB-MOCKTEST-UI,
 * docs/question-bank-plan.md §B14 package 5). `ExamPatternMocks` is the request-time part (under
 * `<Suspense>` after `await connection()`, because the bank is seeded and read); `ExamPatternList`
 * renders what it found, so its states are testable without a database.
 *
 * Honest by construction: each exam says what the bank can serve RIGHT NOW — a full-length paper, a
 * labelled shorter practice set ("38 of 75 questions"), or "coming soon: the bank has X of Y" — and a
 * slot that is not published says so. Titles and the real exam's size come from code constants.
 * Loading and the status check live in ./exam-pattern-items (shared with the sitemap).
 */

/** The real exam's size from the code's default blueprint (titles and sizes never need the database). */
function realExam(slot: QbSlot) {
  const totals = blueprintTotals(defaultBlueprint(slot));
  return { questions: totals.questions, minutes: totals.minutes, marks: totals.marks };
}

const STATUS_BADGE = { full: "success", short: "info", thin: "neutral", unpublished: "neutral", off: "warning" } as const;

export function ExamPatternList({ items, t, locale }: { items: readonly ExamPatternItem[]; t: MocktestMessages; locale: Locale }) {
  const tp = t.paper;
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {items.map((item) => {
        const meta = QB_SLOT_META[item.slot];
        const status = statusOf(item);
        const real = realExam(item.slot);
        const sample = item.view?.sample === true && (status.kind === "full" || status.kind === "short");
        const ranked = item.view?.available === true && item.view.ranked.mode === "monthly";
        const headingId = `mt-exam-${item.slot}`;
        return (
          <li key={item.slot} className="flex flex-col rounded-card border border-line bg-white p-5 shadow-soft" data-exam-status={status.kind}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_BADGE[status.kind]}>{tp.status[status.kind]}</Badge>
              {sample && <DemoBadge label={tp.sample} />}
            </div>
            <h3 id={headingId} className="mt-3 text-xl font-extrabold leading-snug text-navy">
              {meta.title[locale]}
            </h3>
            <p className="mt-2 text-sm text-muted">{meta.summary[locale]}</p>
            <ul className="mt-4 grid gap-2 text-sm">
              <li className="flex items-center gap-2">
                <ListChecks aria-hidden="true" className="size-4 shrink-0 text-blue" />
                {format(tp.list.realExam, real)}
              </li>
              <li className="flex items-start gap-2">
                {status.kind === "full" || status.kind === "short" ? (
                  <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
                ) : (
                  <BarChart3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
                )}
                <span>{examStatusText(status, meta.placeholder, tp)}</span>
              </li>
              {ranked && (
                <li className="flex items-center gap-2">
                  <Trophy aria-hidden="true" className="size-4 shrink-0 text-blue" />
                  {tp.list.ranked}
                </li>
              )}
            </ul>
            {sample && <p className="mt-3 text-xs text-muted">{tp.sampleNote}</p>}
            <div className="mt-auto pt-5">
              <ButtonLink
                href={localePath(`/tools/mock-tests/exam/${item.slot}`, locale)}
                variant={status.kind === "full" || status.kind === "short" ? "primary" : "outline"}
              >
                {format(tp.list.open, { exam: meta.examName[locale] })}
                <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The request-time section body: under `<Suspense>` on the list page. */
export async function ExamPatternMocks({ t, locale }: { t: MocktestMessages; locale: Locale }) {
  await connection();
  const items = await loadExamPatternItems({ placeholderMode: showPlaceholderContent() });
  if (!items) return <Notice variant="warning">{t.paper.list.error}</Notice>;
  return <ExamPatternList items={items} t={t} locale={locale} />;
}
