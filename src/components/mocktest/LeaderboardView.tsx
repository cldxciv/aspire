"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { districtName, HP_DISTRICTS } from "@/content/mocktest/districts";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { buildLoginHref } from "@/lib/auth/paths";
import { SCHOOL_MIN_PARTICIPANTS } from "@/lib/mocktest/leaderboard";
import type { IdentityIssue, NameIssue } from "@/lib/mocktest/schemas";
import type { Bilingual, LeaderboardData, MocktestProfile, TestWindow } from "@/lib/mocktest/types";
import { formatDate, formatDuration, formatMonth, formatNumber, type MocktestMessages } from "./format";
import { apiJson, useMounted, useSessionStatus } from "./hooks";

export interface LeaderboardTest {
  id: string;
  title: Bilingual;
  kind: "practice" | "weekly";
  windows?: TestWindow[];
  sample: boolean;
  /**
   * A monthly ranked paper of an exam-pattern mock ("bp-<slot>-ranked"): monthly windows, ranked by
   * score and the official tie-break (no time column: time is not a criterion).
   */
  ranked?: boolean;
}

type View = LeaderboardData["view"];

/**
 * Practice leaderboard with test / week / district / table filters (client; data from GET
 * /api/mocktest/leaderboard). Weekly tests only; times are measured by the server; schools appear
 * only in the aggregate schools table (QA-SEC-M6).
 */
export function LeaderboardView({ tests, t }: { tests: LeaderboardTest[]; t: MocktestMessages }) {
  const mounted = useMounted();
  if (!mounted) return <p className="text-sm text-muted">{t.leaderboard.loading}</p>;
  return <LeaderboardClient tests={tests} t={t} />;
}

function LeaderboardClient({ tests, t }: { tests: LeaderboardTest[]; t: MocktestMessages }) {
  const locale = useLocale();
  const search = useSearchParams();
  const tl = t.leaderboard;
  const requested = search.get("test");
  const [testId, setTestId] = useState(() => (tests.some((x) => x.id === requested) ? (requested as string) : tests[0]?.id ?? ""));
  const [windowId, setWindowId] = useState("");
  const [district, setDistrict] = useState("");
  const [view, setView] = useState<View>("students");
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());
  const [state, setState] = useState<{ status: "loading" | "error" | "ready"; data: LeaderboardData | null }>({ status: "loading", data: null });
  const ids = { test: useId(), window: useId(), district: useId(), view: useId() };

  const test = tests.find((x) => x.id === testId);
  const startedWindows = useMemo(
    () => (test?.windows ?? []).filter((w) => Date.parse(w.startsAt) <= now).reverse().slice(0, 12),
    [test, now],
  );

  useEffect(() => {
    if (!testId) return;
    let cancelled = false;
    const query = new URLSearchParams({ test: testId, view });
    if (windowId) query.set("window", windowId);
    if (district) query.set("district", district);
    apiJson<LeaderboardData>(`/api/mocktest/leaderboard?${query}`).then((response) => {
      if (cancelled) return;
      setState(response.ok && response.data ? { status: "ready", data: response.data } : { status: "error", data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [testId, windowId, district, view, reload]);

  if (tests.length === 0) return <Notice>{tl.unavailable}</Notice>;
  const data = state.data;
  const select = "mt-1 min-h-11 w-full rounded-control border border-line bg-white px-3 text-sm";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-card border border-line bg-white p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={ids.test} className="text-sm font-bold text-navy">{tl.test}</label>
          <select
            id={ids.test}
            className={select}
            value={testId}
            onChange={(e) => {
              setTestId(e.target.value);
              setWindowId("");
              setState({ status: "loading", data: null });
            }}
          >
            {tests.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title[locale]}
              </option>
            ))}
          </select>
        </div>
        {startedWindows.length > 0 && (
          <div>
            <label htmlFor={ids.window} className="text-sm font-bold text-navy">{test?.ranked ? t.paper.leaderboard.month : tl.window}</label>
            <select
              id={ids.window}
              className={select}
              value={windowId}
              onChange={(e) => {
                setWindowId(e.target.value);
                setState({ status: "loading", data: null });
              }}
            >
              {startedWindows.map((w, i) => (
                <option key={w.id} value={i === 0 ? "" : w.id}>
                  {test?.ranked
                    ? format(t.paper.leaderboard.monthOption, { month: formatMonth(Date.parse(w.startsAt), locale) })
                    : format(tl.windowOption, { date: formatDate(Date.parse(w.startsAt), locale) })}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={ids.district} className="text-sm font-bold text-navy">{tl.district}</label>
          <select
            id={ids.district}
            className={select}
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setState({ status: "loading", data: null });
            }}
          >
            <option value="">{tl.allDistricts}</option>
            {HP_DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name[locale]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.view} className="text-sm font-bold text-navy">{tl.view}</label>
          <select
            id={ids.view}
            className={select}
            value={view}
            onChange={(e) => {
              setView(e.target.value as View);
              setState({ status: "loading", data: null });
            }}
          >
            {(["students", "districts", "schools"] as View[]).map((v) => (
              <option key={v} value={v}>
                {tl.views[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {test?.sample && <Notice variant="warning">{tl.sampleNote}</Notice>}

      <div aria-live="polite" aria-busy={state.status === "loading"}>
        {state.status === "loading" && <p className="py-6 text-center text-muted">{tl.loading}</p>}
        {state.status === "error" && (
          <Notice variant="error">
            {tl.error}{" "}
            <Button size="sm" variant="link" onClick={() => { setState({ status: "loading", data: null }); setReload((n) => n + 1); }}>
              {t.common.retry}
            </Button>
          </Notice>
        )}
        {state.status === "ready" && data && (
          <>
            {data.me && <p className="mb-3 font-bold text-navy">{format(tl.me, { rank: data.me.rank, total: data.me.total })}</p>}
            {data.view === "students" ? (
              data.entries.length === 0 ? (
                <p className="rounded-control border border-dashed border-line bg-white p-6 text-center text-muted">{tl.empty}</p>
              ) : (
                <div className="overflow-x-auto rounded-card border border-line bg-white">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <caption className="sr-only">{format(tl.caption, { test: test?.title[locale] ?? "" })}</caption>
                    <thead>
                      <tr className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                        <th scope="col" className="px-3 py-2">{tl.rank}</th>
                        <th scope="col" className="px-3 py-2">{tl.nickname}</th>
                        <th scope="col" className="px-3 py-2">{tl.district}</th>
                        <th scope="col" className="px-3 py-2 text-right">{tl.score}</th>
                        {!data.ranked && <th scope="col" className="px-3 py-2 text-right">{tl.time}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry, i) => (
                        <tr key={i} className="border-b border-line/60">
                          <td className="px-3 py-2 font-bold tabular-nums">{entry.rank}</td>
                          <th scope="row" className="px-3 py-2 font-semibold">{entry.nickname}</th>
                          <td className="px-3 py-2">{districtName(entry.district, locale) ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{format(t.common.scoreOf, { score: entry.score, max: data.maxScore })}</td>
                          {!data.ranked && <td className="px-3 py-2 text-right tabular-nums">{formatDuration(entry.timeTakenSec, t.common)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : data.groups.length === 0 ? (
              <p className="rounded-control border border-dashed border-line bg-white p-6 text-center text-muted">
                {data.view === "schools" ? format(tl.schoolsNote, { n: SCHOOL_MIN_PARTICIPANTS }) : tl.empty}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-line bg-white">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <caption className="sr-only">{format(tl.caption, { test: test?.title[locale] ?? "" })}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="px-3 py-2">{tl.rank}</th>
                      <th scope="col" className="px-3 py-2">{data.view === "districts" ? tl.district : tl.school}</th>
                      <th scope="col" className="px-3 py-2 text-right">{tl.participants}</th>
                      <th scope="col" className="px-3 py-2 text-right">{tl.average}</th>
                      <th scope="col" className="px-3 py-2 text-right">{tl.best}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((group) => (
                      <tr key={group.name} className="border-b border-line/60">
                        <td className="px-3 py-2 font-bold tabular-nums">{group.rank}</td>
                        <th scope="row" className="px-3 py-2 font-semibold">
                          {data.view === "districts" ? districtName(group.name, locale) ?? group.name : group.name}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.participants, locale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.averageScore, locale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(group.bestScore, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.view === "schools" && (
                  <p className="border-t border-line px-3 py-2 text-xs text-muted">{format(tl.schoolsNote, { n: SCHOOL_MIN_PARTICIPANTS })}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Profile (opt-in)

export function ProfileForm({ t }: { t: MocktestMessages }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return <ProfileClient t={t} />;
}

function ProfileClient({ t }: { t: MocktestMessages }) {
  const locale = useLocale();
  const session = useSessionStatus();
  const tp = t.profile;
  const isStudent = session.state === "signedIn" && session.role === "student";
  const [form, setForm] = useState<MocktestProfile>({ nickname: "", district: null, school: null, showSchool: false, leaderboardOptIn: false });
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const ids = { nickname: useId(), district: useId(), school: useId(), nickHint: useId(), schoolHint: useId() };

  useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    apiJson<MocktestProfile | null>("/api/mocktest/profile").then((response) => {
      if (cancelled) return;
      if (response.ok && response.data) setForm(response.data);
      setStatus(response.ok ? "idle" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [isStudent]);

  if (session.state === "loading") return null;
  if (session.state === "guest") {
    return (
      <Notice title={tp.title}>
        <p>{tp.signedOut}</p>
        <ButtonLink href={buildLoginHref("/student", locale)} size="sm" variant="outline" className="mt-2">
          {t.common.signIn}
        </ButtonLink>
      </Notice>
    );
  }
  if (!isStudent) return <Notice title={tp.title}>{tp.notStudent}</Notice>;

  const message = (field: string) => {
    const code = errors[field]?.[0];
    if (!code) return null;
    return (tp.errors as Record<string, string>)[code as NameIssue | IdentityIssue] ?? tp.errors.generic;
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setErrors({});
    const response = await apiJson<MocktestProfile>("/api/mocktest/profile", {
      method: "PUT",
      body: { ...form, school: form.school?.trim() ? form.school : null },
    });
    if (response.ok && response.data) {
      setForm(response.data);
      setStatus("saved");
    } else {
      setErrors(response.fieldErrors ?? {});
      setStatus("error");
    }
  }

  const nickError = message("nickname");
  const schoolError = message("school");
  const input = "mt-1 min-h-11 w-full rounded-control border border-line bg-white px-3 text-sm";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft" noValidate>
      <div>
        <h2 className="text-lg font-extrabold text-navy">{tp.title}</h2>
        <p className="mt-1 text-sm text-muted">{tp.description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.nickname} className="text-sm font-bold text-navy">{tp.nickname}</label>
          <input
            id={ids.nickname}
            className={input}
            value={form.nickname}
            maxLength={24}
            autoComplete="nickname"
            aria-invalid={nickError ? true : undefined}
            aria-describedby={ids.nickHint}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          />
          <p id={ids.nickHint} className={nickError ? "mt-1 text-xs font-semibold text-danger" : "mt-1 text-xs text-muted"}>
            {nickError ?? tp.nicknameHint}
          </p>
        </div>
        <div>
          <label htmlFor={ids.district} className="text-sm font-bold text-navy">{tp.district}</label>
          <select
            id={ids.district}
            className={input}
            value={form.district ?? ""}
            onChange={(e) => setForm({ ...form, district: e.target.value || null })}
          >
            <option value="">{tp.districtNone}</option>
            {HP_DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name[locale]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={ids.school} className="text-sm font-bold text-navy">{tp.school}</label>
          <input
            id={ids.school}
            className={input}
            value={form.school ?? ""}
            maxLength={80}
            aria-invalid={schoolError ? true : undefined}
            aria-describedby={ids.schoolHint}
            onChange={(e) => setForm({ ...form, school: e.target.value })}
          />
          <p id={ids.schoolHint} className={schoolError ? "mt-1 text-xs font-semibold text-danger" : "mt-1 text-xs text-muted"}>
            {schoolError ?? tp.schoolHint}
          </p>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-navy"
          checked={form.showSchool}
          onChange={(e) => setForm({ ...form, showSchool: e.target.checked })}
        />
        {tp.showSchool}
      </label>
      <div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-4 accent-navy"
            checked={form.leaderboardOptIn}
            onChange={(e) => setForm({ ...form, leaderboardOptIn: e.target.checked })}
          />
          {tp.optIn}
        </label>
        <p className="text-xs text-muted">{tp.optInHint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={status === "saving" || status === "loading"}>
          {status === "saving" ? tp.saving : tp.save}
        </Button>
        <p role="status" className="text-sm font-semibold text-[#0f5a3c]">
          {status === "saved" ? tp.saved : ""}
        </p>
        {status === "error" && !nickError && !schoolError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t.common.networkError}
          </p>
        )}
      </div>
    </form>
  );
}
