import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardView, ProfileForm, type LeaderboardTest } from "@/components/mocktest/LeaderboardView";
import { ButtonLink, DemoBadge, EmptyState, PageHero, Section } from "@/components/ui";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localizeImage } from "@/lib/data";
import { getVisibleMockTests, isSampleTest } from "@/lib/mocktest/catalog";
import { isLeaderboardTest } from "@/lib/mocktest/timing";

const PATH = "/tools/mock-tests/leaderboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("mocktest");
  return { title: t.meta.leaderboardTitle, description: t.meta.leaderboardDescription, alternates: await localeAlternates(PATH) };
}

/**
 * Opt-in PRACTICE leaderboards (D-034, QA-SEC-M6): weekly tests only, per window, by district and by
 * school (aggregate), timed by the server. Data comes from GET /api/mocktest/leaderboard (nicknames
 * only). Signed-in students manage their profile here.
 */
export default async function MockTestLeaderboardPage() {
  const [locale, t, tc, tTools] = await Promise.all([getLocale(), getMessages("mocktest"), getMessages("common"), getMessages("tools")]);
  const tests: LeaderboardTest[] = getVisibleMockTests().filter(isLeaderboardTest).map((test) => ({
    id: test.id,
    title: test.title,
    kind: test.kind,
    ...(test.windows ? { windows: test.windows } : {}),
    sample: isSampleTest(test),
  }));

  return (
    <>
      <PageHero
        title={t.leaderboard.title}
        lead={
          <>
            <p>{t.leaderboard.lead}</p>
            {tests.some((test) => test.sample) && <DemoBadge label={t.common.sample} className="mt-3" />}
          </>
        }
        crumbs={[
          { label: tTools.meta.title, href: localePath("/tools", locale) },
          { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
          { label: t.leaderboard.crumb },
        ]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.classroomDesks, locale)}
        imageLabel={tc.labels.illustrativeStockPhoto}
      />
      <Section aria-label={t.leaderboard.title}>
        {tests.length === 0 ? (
          <EmptyState
            title={t.comingSoon.title}
            description={t.comingSoon.body}
            action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.comingSoon.cta}</ButtonLink>}
          />
        ) : (
          <div className="space-y-8">
            <div className="rounded-control border border-[#d7e7fb] bg-[#eef5ff] px-4 py-3">
              <p className="font-extrabold text-navy">{t.leaderboard.honestLabel}</p>
              <p className="mt-1 text-sm text-muted">{t.leaderboard.rules}</p>
            </div>
            <Suspense fallback={<p className="text-sm text-muted">{t.leaderboard.loading}</p>}>
              <LeaderboardView tests={tests} t={t} />
            </Suspense>
            <ProfileForm t={t} />
          </div>
        )}
      </Section>
    </>
  );
}
