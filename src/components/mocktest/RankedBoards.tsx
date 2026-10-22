import { connection } from "next/server";
import { ButtonLink, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { generationEnabled, qbPaperPort } from "@/lib/mocktest/generated";
import { blueprintTestIdFor, blueprintTestTitle } from "@/lib/mocktest/resolve";
import { QB_SLOTS } from "@/lib/qb/types";
import type { MocktestMessages } from "./format";
import { LeaderboardView, ProfileForm, type LeaderboardTest } from "./LeaderboardView";

/**
 * Monthly ranked boards of exam-pattern mocks on the leaderboard page (QB-MOCKTEST-UI,
 * docs/question-bank-plan.md §B10.3): one board per exam with monthly ranked papers ("bp-<slot>-ranked"),
 * listing only the months that had a ranked paper. Same paper for everyone in a month; ranked by score
 * and the official tie-break rules (never by time); ranks are indicative. Request time only (the bank
 * is read): render inside `<Suspense>`.
 */
export async function loadRankedBoards(now: number = Date.now()): Promise<LeaderboardTest[]> {
  if (!generationEnabled()) return [];
  try {
    const port = await qbPaperPort();
    const tests: LeaderboardTest[] = [];
    for (const slot of QB_SLOTS) {
      const board = await port.rankedBoard(slot, now);
      if (!board || board.windows.length === 0) continue;
      tests.push({
        id: blueprintTestIdFor(slot, "ranked"),
        title: blueprintTestTitle({ slot, mode: "ranked", part: null }),
        kind: "weekly",
        windows: board.windows.map((w) => w.window).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
        // Ranked papers are always full-length and never use sample questions (plan §B10.3).
        sample: false,
        ranked: true,
      });
    }
    return tests;
  } catch {
    return [];
  }
}

export function RankedBoardsView({ tests, t, weeklyCount }: { tests: LeaderboardTest[]; t: MocktestMessages; weeklyCount: number }) {
  const tl = t.paper.leaderboard;
  return (
    <section aria-labelledby="mt-ranked-boards" className="space-y-5">
      <h2 id="mt-ranked-boards" className="text-2xl font-extrabold text-navy">
        {tl.title}
      </h2>
      <div className="rounded-control border border-[#d7e7fb] bg-[#eef5ff] px-4 py-3">
        <p className="font-extrabold text-navy">{tl.note}</p>
        <p className="mt-1 text-sm text-muted">{tl.rules}</p>
      </div>
      <LeaderboardView tests={tests} t={t} />
      {weeklyCount === 0 && <ProfileForm t={t} />}
    </section>
  );
}

export async function RankedBoards({ t, locale, weeklyCount }: { t: MocktestMessages; locale: Locale; weeklyCount: number }) {
  await connection();
  const tests = await loadRankedBoards();
  if (tests.length === 0) {
    if (weeklyCount > 0) return null;
    return (
      <EmptyState
        title={t.comingSoon.title}
        description={t.comingSoon.body}
        action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.comingSoon.cta}</ButtonLink>}
      />
    );
  }
  return <RankedBoardsView tests={tests} t={t} weeklyCount={weeklyCount} />;
}
