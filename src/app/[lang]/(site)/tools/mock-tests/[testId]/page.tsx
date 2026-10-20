import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockTestRunner } from "@/components/mocktest/MockTestRunner";
import { PaletteLegend } from "@/components/mocktest/QuestionPalette";
import { Badge, Container, DemoBadge, Notice, PageHero } from "@/components/ui";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getAllMockTestIds, getVisibleMockTest, runnerPayload, summariseTest } from "@/lib/mocktest/catalog";
import { isLeaderboardTest, maxDurationMs, minDurationMs } from "@/lib/mocktest/timing";

/** D-017: unknown / hidden test ids return a real 404 (see programs/[slug]). */
export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return getAllMockTestIds().map((testId) => ({ testId }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]">): Promise<Metadata> {
  const { testId } = await params;
  const [locale, t] = await Promise.all([getLocale(), getMessages("mocktest")]);
  const test = getVisibleMockTest(testId);
  if (!test) return { title: t.meta.title };
  return {
    title: `${test.title[locale]} · ${t.meta.title}`,
    description: test.summary[locale],
    alternates: await localeAlternates(`/tools/mock-tests/${test.id}`),
  };
}

/**
 * The test page: instructions (server-rendered) and the CBT runner (client). The runner stays
 * distraction-free: no photos; once started it covers the site chrome.
 */
export default async function MockTestPage({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]">) {
  const { testId } = await params;
  const [locale, t, tc, tTools] = await Promise.all([getLocale(), getMessages("mocktest"), getMessages("common"), getMessages("tools")]);
  const test = getVisibleMockTest(testId);
  if (!test) notFound();
  const payload = runnerPayload(test);
  const summary = summariseTest(test);
  const ti = t.instructions;

  return (
    <>
      <PageHero
        title={test.title[locale]}
        lead={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{t.common.exams[test.exam]}</Badge>
            <span>{format(t.common.minutes, { n: test.durationMinutes })}</span>
            <span aria-hidden="true">·</span>
            <span>{format(t.common.questions, { n: summary.questionCount })}</span>
            <span aria-hidden="true">·</span>
            <span>{format(t.common.marks, { n: summary.maxScore })}</span>
            {summary.sample && <DemoBadge label={t.common.sample} />}
          </div>
        }
        crumbs={[
          { label: tTools.meta.title, href: localePath("/tools", locale) },
          { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
          { label: test.title[locale] },
        ]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
      />
      <Container className="py-8 md:py-10">
        {summary.sample && (
          <Notice variant="warning" className="mb-6">
            {t.common.sampleNote}
          </Notice>
        )}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="mt-instructions" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
            <h2 id="mt-instructions" className="text-xl font-extrabold text-navy">
              {ti.title}
            </h2>
            <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed">
              <li>{format(ti.duration, { n: test.durationMinutes })}</li>
              <li>{format(ti.questions, { n: summary.questionCount, sections: test.sections.length })}</li>
              <li>
                {ti.marking}{" "}
                {summary.markingNotes
                  .map((m) =>
                    format(m.type === "numerical" ? t.list.markingNumerical : t.list.markingMcq, {
                      correct: m.correct,
                      wrong: m.wrong === 0 ? "0" : `−${Math.abs(m.wrong)}`,
                    }),
                  )
                  .join("; ")}
              </li>
              <li>{ti.answerSaved}</li>
              <li>{ti.review}</li>
              {summary.markingNotes.some((m) => m.type === "numerical") && <li>{ti.numerical}</li>}
              <li>{ti.language}</li>
              <li>{ti.resumeInfo}</li>
              {isLeaderboardTest(test) && (
                <li>
                  {format(ti.leaderboardTiming, {
                    min: Math.round(minDurationMs(test.durationMinutes) / 60_000),
                    max: Math.round(maxDurationMs(test.durationMinutes) / 60_000),
                  })}
                </li>
              )}
            </ol>
            <h3 className="mt-6 font-bold text-navy">{ti.legendTitle}</h3>
            <PaletteLegend t={t.runner} className="mt-3" />
          </section>
          <div>
            <MockTestRunner test={payload} t={t} />
          </div>
        </div>
      </Container>
    </>
  );
}
