import { BarChart3, CalendarDays, Clock, ListChecks, Timer, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MyAttempts, WindowStatus } from "@/components/mocktest/MyAttempts";
import { Badge, ButtonLink, DemoBadge, EmptyState, MediaSplit, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { stockImages } from "@/content/images";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localizeImage } from "@/lib/data";
import { getVisibleMockTests, summariseTest } from "@/lib/mocktest/catalog";
import { isLeaderboardTest } from "@/lib/mocktest/timing";

const PATH = "/tools/mock-tests";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("mocktest");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates(PATH) };
}

/**
 * Free CBT mock tests (M6, D-032 – D-034). Sample tests are visible only with placeholder content
 * on (dev / demo) and are always labelled; production shows "Practice tests coming soon".
 */
export default async function MockTestsPage() {
  const [locale, t, tc, tTools] = await Promise.all([getLocale(), getMessages("mocktest"), getMessages("common"), getMessages("tools")]);
  const tests = getVisibleMockTests().map(summariseTest);
  const stockLabel = tc.labels.illustrativeStockPhoto;
  const anySample = tests.some((test) => test.sample);
  const titles = Object.fromEntries(tests.map((test) => [test.id, test.title]));

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={
          <>
            <p>{t.hero.lead}</p>
            {anySample && <DemoBadge label={tc.labels.demoPending} className="mt-3" />}
          </>
        }
        crumbs={[{ label: tTools.meta.title, href: localePath("/tools", locale) }, { label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.pocketWatchWorksheet, locale)}
        imageLabel={stockLabel}
      >
        {tests.length > 0 && (
          <>
            <ButtonLink href="#tests">{t.hero.start}</ButtonLink>
            <ButtonLink href={localePath(`${PATH}/leaderboard`, locale)} variant="light">
              <Trophy aria-hidden="true" className="size-4" />
              {t.hero.leaderboard}
            </ButtonLink>
          </>
        )}
      </PageHero>

      <Section id="tests" aria-labelledby="mt-tests-heading" className="scroll-mt-24">
        <SectionHeading id="mt-tests-heading" eyebrow={t.list.eyebrow} title={t.list.title} description={t.list.description} />
        {tests.length === 0 ? (
          <EmptyState
            title={t.comingSoon.title}
            description={t.comingSoon.body}
            action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.comingSoon.cta}</ButtonLink>}
          />
        ) : (
          <>
            {anySample && (
              <Notice variant="warning" className="mb-5">
                {t.common.sampleNote}
              </Notice>
            )}
            <ul className="grid gap-5 lg:grid-cols-3">
              {tests.map((test) => (
                <li key={test.id} className="flex flex-col rounded-card border border-line bg-white p-5 shadow-soft">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={test.kind === "weekly" ? "success" : "info"}>
                      {test.kind === "weekly" ? t.list.weekly : t.list.practice}
                    </Badge>
                    <Badge variant="neutral">{t.common.exams[test.exam]}</Badge>
                    {test.sample && <DemoBadge label={t.common.sample} />}
                  </div>
                  <h3 className="mt-3 text-xl font-extrabold leading-snug text-navy">{test.title[locale]}</h3>
                  <p className="mt-2 text-sm text-muted">{test.summary[locale]}</p>
                  <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Clock aria-hidden="true" className="size-4 text-blue" />
                      {format(t.common.minutes, { n: test.durationMinutes })}
                    </li>
                    <li className="flex items-center gap-2">
                      <ListChecks aria-hidden="true" className="size-4 text-blue" />
                      {format(t.common.questions, { n: test.questionCount })}
                    </li>
                    <li className="col-span-2 flex items-center gap-2">
                      <BarChart3 aria-hidden="true" className="size-4 text-blue" />
                      {format(t.common.marks, { n: test.maxScore })} · {test.subjects.map((s) => s.label[locale]).join(", ")}
                    </li>
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    <strong>{t.list.marking}:</strong>{" "}
                    {test.markingNotes
                      .map((m) =>
                        format(m.type === "numerical" ? t.list.markingNumerical : t.list.markingMcq, {
                          correct: m.correct,
                          wrong: m.wrong === 0 ? "0" : `−${Math.abs(m.wrong)}`,
                        }),
                      )
                      .join("; ")}
                  </p>
                  {test.windows && (
                    <div className="mt-3 rounded-control bg-surface p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-navy">
                        <CalendarDays aria-hidden="true" className="size-4" />
                        {t.list.windowsTitle}
                      </p>
                      <p className="mt-1 text-xs text-muted">{t.list.windowsNote}</p>
                      <div className="mt-2">
                        <WindowStatus windows={test.windows} t={t.list} />
                      </div>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <ButtonLink href={localePath(`${PATH}/${test.id}`, locale)}>
                      <Timer aria-hidden="true" className="size-4" />
                      {t.list.start}
                    </ButtonLink>
                    {isLeaderboardTest(test) ? (
                      <ButtonLink href={localePath(`${PATH}/leaderboard?test=${test.id}`, locale)} variant="outline">
                        {t.list.leaderboard}
                      </ButtonLink>
                    ) : (
                      <p className="self-center text-xs text-muted">{t.list.practiceNote}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section tone="surface" aria-labelledby="mt-how-heading">
        <MediaSplit image={localizeImage(stockImages.deskLampEvening, locale)} imageLabel={stockLabel} imageSide="left">
          <SectionHeading id="mt-how-heading" eyebrow={t.how.eyebrow} title={t.how.title} />
          <dl className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [t.how.examTitle, t.how.examBody],
                [t.how.resultsTitle, t.how.resultsBody],
                [t.how.planTitle, t.how.planBody],
                [t.how.leaderboardTitle, t.how.leaderboardBody],
              ] as const
            ).map(([title, body]) => (
              <div key={title} className="rounded-control border border-line bg-white p-4">
                <dt className="font-bold text-navy">{title}</dt>
                <dd className="mt-1 text-sm text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </MediaSplit>
      </Section>

      {tests.length > 0 && (
        <Section aria-labelledby="mt-attempts-heading">
          <MediaSplit image={localizeImage(stockImages.notebookSolutions, locale)} imageLabel={stockLabel} imageSide="right">
            <SectionHeading id="mt-attempts-heading" title={t.attempts.title} description={t.attempts.description} />
            <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
              <MyAttempts titles={titles} t={t} />
            </Suspense>
            <div className="mt-6 rounded-control border border-line bg-surface p-4">
              <h3 className="font-bold text-navy">{t.parents.title}</h3>
              <p className="mt-1 text-sm text-muted">{t.parents.body}</p>
              <p className="mt-1 text-sm text-muted">{t.parents.notConnected}</p>
            </div>
          </MediaSplit>
        </Section>
      )}
    </>
  );
}
