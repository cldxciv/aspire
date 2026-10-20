"use client";

import { Award, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { computeBadges, type BadgeId } from "@/lib/mocktest/badges";
import { listLocalAttempts, type LocalAttempt } from "@/lib/mocktest/local-store";
import type { AttemptsSummary, Bilingual, SavedAttemptSummary, TestWindow } from "@/lib/mocktest/types";
import { formatDate, formatDateTime, type MocktestMessages } from "./format";
import { apiJson, useMounted, useSessionStatus } from "./hooks";

const BADGE_ICON: Record<BadgeId, typeof Award> = { "first-test": Award, "streak-3": Flame, "top-10": Trophy };

/**
 * "Your attempts" on the list page: this browser's attempts (guests and students) plus, for
 * signed-in students, the attempts saved to their account, and the badges earned.
 */
export function MyAttempts({ titles, t }: { titles: Record<string, Bilingual>; t: MocktestMessages }) {
  const mounted = useMounted();
  if (!mounted) return <p className="text-sm text-muted">{t.common.loading}</p>;
  return <MyAttemptsClient titles={titles} t={t} />;
}

function MyAttemptsClient({ titles, t }: { titles: Record<string, Bilingual>; t: MocktestMessages }) {
  const locale = useLocale();
  const session = useSessionStatus();
  const ta = t.attempts;
  const [local] = useState<LocalAttempt[]>(() => listLocalAttempts().filter((a) => titles[a.testId]));
  const [server, setServer] = useState<{ attempts: SavedAttemptSummary[]; summary: AttemptsSummary } | null>(null);
  const isStudent = session.state === "signedIn" && session.role === "student";

  useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    apiJson<{ attempts: SavedAttemptSummary[]; summary: AttemptsSummary }>("/api/mocktest/attempts").then((response) => {
      if (!cancelled && response.ok && response.data) setServer(response.data);
    });
    return () => {
      cancelled = true;
    };
  }, [isStudent]);

  const savedIds = new Set(local.map((a) => a.savedId).filter(Boolean));
  const serverOnly = (server?.attempts ?? []).filter((a) => !savedIds.has(a.id) && titles[a.testId]);
  const badges = new Set<BadgeId>([...computeBadges({ attemptTimes: local.map((a) => a.submittedAt) }), ...(server?.summary.badges ?? [])]);
  const badgeText: Record<BadgeId, [string, string]> = {
    "first-test": [ta.badges.firstTest, ta.badges.firstTestBody],
    "streak-3": [ta.badges.streak3, ta.badges.streak3Body],
    "top-10": [ta.badges.top10, ta.badges.top10Body],
  };

  const row = (key: string, testId: string, when: number, score: string, href: string, where: string) => (
    <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-white px-4 py-3">
      <div>
        <p className="font-bold text-navy">{titles[testId]?.[locale] ?? testId}</p>
        <p className="text-xs text-muted">
          {format(ta.submitted, { date: formatDateTime(when, locale) })} · {where}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-extrabold tabular-nums text-ink">{score}</span>
        <Link href={href} className="text-sm font-bold text-blue hover:underline">
          {ta.view}
        </Link>
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      {local.length === 0 && serverOnly.length === 0 ? (
        <p className="rounded-control border border-dashed border-line bg-white p-5 text-center text-muted">{ta.empty}</p>
      ) : (
        <ul className="space-y-2">
          {local.map((a) =>
            row(
              a.id,
              a.testId,
              a.submittedAt,
              a.score !== undefined && a.maxScore !== undefined ? format(t.common.scoreOf, { score: a.score, max: a.maxScore }) : ta.unscored,
              localePath(`/tools/mock-tests/${a.testId}/result?attempt=${encodeURIComponent(a.id)}`, locale),
              a.savedId ? `${ta.onDevice} · ${ta.inAccount}` : ta.onDevice,
            ),
          )}
          {serverOnly.map((a) =>
            row(
              a.id,
              a.testId,
              a.submittedAt,
              format(t.common.scoreOf, { score: a.score, max: a.maxScore }),
              localePath(`/tools/mock-tests/${a.testId}/result?saved=${encodeURIComponent(a.id)}`, locale),
              ta.inAccount,
            ),
          )}
        </ul>
      )}
      {session.state === "guest" && <p className="text-sm text-muted">{ta.signedOutNote}</p>}
      <div>
        <h3 className="font-extrabold text-navy">{ta.badgesTitle}</h3>
        {badges.size === 0 ? (
          <p className="mt-1 text-sm text-muted">{ta.noBadges}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-3">
            {[...badges].map((id) => {
              const Icon = BADGE_ICON[id];
              return (
                <li key={id} className="flex items-center gap-2 rounded-control border border-[#efd27a] bg-gold-soft px-3 py-2">
                  <Icon aria-hidden="true" className="size-5 text-[#8b5b00]" />
                  <span>
                    <strong className="block text-sm text-ink">{badgeText[id][0]}</strong>
                    <span className="text-xs text-muted">{badgeText[id][1]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "Open now: …" for a weekly test's windows (client clock; nothing during server render). */
export function WindowStatus({ windows, t }: { windows: TestWindow[]; t: MocktestMessages["list"] }) {
  const mounted = useMounted();
  return mounted ? <WindowStatusClient windows={windows} t={t} /> : null;
}

function WindowStatusClient({ windows, t }: { windows: TestWindow[]; t: MocktestMessages["list"] }) {
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const open = windows.find((w) => Date.parse(w.startsAt) <= now && now <= Date.parse(w.endsAt));
  return (
    <p className="text-sm font-semibold text-navy">
      {open ? (
        <>
          <Badge variant="success" className="mr-2">
            ●
          </Badge>
          {format(t.openNow, { start: formatDate(Date.parse(open.startsAt), locale), end: formatDate(Date.parse(open.endsAt), locale) })}
        </>
      ) : (
        t.noWindow
      )}
    </p>
  );
}
