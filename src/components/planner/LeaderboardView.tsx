"use client";

import { Medal } from "lucide-react";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Badge, Button, ButtonLink, Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { NICKNAME, nicknameIssue } from "@/lib/planner/nickname";
import { formatDate, formatNumber, LONG_DATE, type PlannerMessages } from "./model";
import type { AccountInfo } from "./planner-store";

interface Board {
  week: { start: string; end: string };
  entries: { rank: number; nickname: string; xp: number; me: boolean }[];
  participants: number;
  me: { optedIn: boolean; nickname: string | null; rank: number | null; xp: number | null };
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; board: Board };

/**
 * Weekly XP leaderboard (D-034): signed-in students only, opt-in, nickname only. Guests see how to
 * sign in; the server enforces all of it (src/app/api/planner/leaderboard/route.ts).
 */
export function LeaderboardView({
  t,
  locale,
  signedIn,
  account,
  online,
  signInHref,
  onAccountChange,
}: {
  t: PlannerMessages;
  locale: Locale;
  signedIn: boolean;
  account: AccountInfo | null;
  online: boolean;
  signInHref: string;
  onAccountChange: (info: AccountInfo) => void;
}) {
  const id = useId();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [nickname, setNickname] = useState(account?.nickname ?? account?.suggestedNickname ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/planner/leaderboard", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { data: Board };
      setLoad({ status: "ready", board: body.data });
    } catch {
      setLoad({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (!signedIn || !online) return;
    let cancelled = false;
    fetch("/api/planner/leaderboard", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data: Board };
        if (!cancelled) setLoad({ status: "ready", board: body.data });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, online]);

  async function save(optIn: boolean, event?: FormEvent) {
    event?.preventDefault();
    setMessage(null);
    if (optIn) {
      const issue = nicknameIssue(nickname);
      if (issue) {
        setFieldError(t.leaderboard.issues[issue]);
        return;
      }
    }
    setFieldError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/planner/leaderboard", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(optIn ? { optIn, nickname } : { optIn }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; data: { optedIn: boolean; nickname: string | null } }
        | { ok: false; fieldErrors?: Record<string, string[]> }
        | null;
      if (!response.ok || !body || !body.ok) {
        const serverField = body && !body.ok ? body.fieldErrors?.nickname?.[0] : undefined;
        if (serverField) setFieldError(serverField);
        else setMessage({ kind: "error", text: t.leaderboard.saveError });
        return;
      }
      onAccountChange({
        optedIn: body.data.optedIn,
        nickname: body.data.nickname,
        suggestedNickname: account?.suggestedNickname ?? null,
      });
      if (body.data.nickname) setNickname(body.data.nickname);
      setMessage({ kind: "success", text: optIn ? t.leaderboard.saved : t.leaderboard.left });
      await refresh();
    } catch {
      setMessage({ kind: "error", text: t.leaderboard.saveError });
    } finally {
      setBusy(false);
    }
  }

  const n = (value: number) => formatNumber(value, locale);
  const header = (
    <div>
      <h2 className="font-serif text-2xl font-bold text-navy">{t.leaderboard.title}</h2>
      <p className="mt-2">
        <Badge variant="neutral">{t.leaderboard.selfReported}</Badge>
      </p>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.leaderboard.intro}</p>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.leaderboard.selfReportedNote}</p>
    </div>
  );

  if (!signedIn) {
    return (
      <div className="grid gap-4">
        {header}
        <Notice variant="info">{t.leaderboard.guest}</Notice>
        <div>
          <ButtonLink href={signInHref} variant="dark">
            {t.leaderboard.signIn}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const optedIn = account?.optedIn ?? false;
  const inputId = `${id}-nickname`;
  return (
    <div className="grid gap-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <section aria-labelledby={`${id}-board`} className="min-w-0 rounded-card border border-line bg-white p-4 shadow-soft">
          <h3 id={`${id}-board`} className="font-extrabold text-navy">
            {load.status === "ready"
              ? format(t.leaderboard.week, { start: formatDate(load.board.week.start, locale, LONG_DATE) })
              : t.leaderboard.title}
          </h3>
          {!online ? (
            <p className="mt-2 text-sm text-muted">{t.leaderboard.offline}</p>
          ) : load.status === "loading" ? (
            <p className="mt-2 text-sm text-muted" role="status">
              {t.leaderboard.loading}
            </p>
          ) : load.status === "error" ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {t.leaderboard.error}
            </p>
          ) : load.board.entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.leaderboard.empty}</p>
          ) : (
            <>
              <table className="mt-3 w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th scope="col" className="w-16 py-2 font-semibold">
                      {t.leaderboard.rank}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t.leaderboard.name}
                    </th>
                    <th scope="col" className="w-20 py-2 text-right font-semibold">
                      {t.leaderboard.xp}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {load.board.entries.map((entry, index) => (
                    <tr key={`${entry.rank}-${index}`} className={`border-b border-line last:border-0 ${entry.me ? "bg-gold-soft font-bold" : ""}`}>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1">
                          {entry.rank <= 3 && <Medal aria-hidden="true" className="size-4 text-[#b07d00]" />}
                          {n(entry.rank)}
                        </span>
                      </td>
                      <td className="truncate py-2 text-ink">
                        {entry.nickname}
                        {entry.me && <span className="ml-1 text-xs font-semibold text-muted">({t.leaderboard.you})</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{n(entry.xp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {load.board.me.rank !== null && (
                <p className="mt-3 text-sm font-semibold text-navy">
                  {format(t.leaderboard.yourRank, { rank: n(load.board.me.rank), count: n(load.board.participants) })}
                </p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby={`${id}-join`} className="min-w-0 rounded-card border border-line bg-surface p-4">
          <h3 id={`${id}-join`} className="font-extrabold text-navy">
            {t.leaderboard.joinTitle}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {optedIn && account?.nickname ? format(t.leaderboard.joined, { nickname: account.nickname }) : t.leaderboard.notJoined}
          </p>
          <form onSubmit={(event) => void save(true, event)} noValidate className="mt-3 grid gap-3">
            <div>
              <label htmlFor={inputId} className="block text-sm font-semibold text-navy">
                {t.leaderboard.nickname}
              </label>
              <input
                id={inputId}
                type="text"
                autoComplete="off"
                maxLength={NICKNAME.max * 2}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={`${inputId}-hint${fieldError ? ` ${inputId}-error` : ""}`}
                className="mt-1 block min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-sm text-ink"
              />
              <p id={`${inputId}-hint`} className="mt-1 text-xs text-muted">
                {t.leaderboard.nicknameHint}
              </p>
              {fieldError && (
                <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm font-semibold text-danger">
                  {fieldError}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="dark" disabled={busy || !online}>
                {optedIn ? t.leaderboard.rename : t.leaderboard.join}
              </Button>
              {optedIn && (
                <Button type="button" variant="outline" disabled={busy || !online} onClick={() => void save(false)}>
                  {t.leaderboard.leave}
                </Button>
              )}
            </div>
          </form>
          {message && (
            <Notice variant={message.kind} role={message.kind === "error" ? "alert" : "status"} className="mt-3">
              {message.text}
            </Notice>
          )}
        </section>
      </div>
    </div>
  );
}
