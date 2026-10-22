"use client";

import { AlarmClock, ArrowRight, BellRing, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { SlaSummary } from "@/lib/crm/lead-ops-types";
import { sendCrm } from "../api";
import { slaTimeLabel, type CrmMessages } from "../format";
import { areaLines, baseTitle, executiveDigest, hasAlerts, summaryRequest, superAdminLinks, titleWithCount } from "./model";

/**
 * The first-call alert strip under every CRM header (owner: LR-SLA; docs/lead-routing-plan.md §15,
 * D-041: in-app only, nothing is sent). A client island: fetches `/api/crm/sla/summary` on render
 * and every 60 s (and when the tab comes back), and shows
 * - the viewer's own calls waiting (+ late, next due, call-backs due);
 * - area heads: a digest per area and per executive (A7), not one alert per lead;
 * - super admins: escalated calls, the no-area queues, unmatched places, Meta health.
 * The tab title carries the waiting count ("(3) Today's calls"), the app badge too where the
 * browser supports it, and an optional chime (off by default, remembered per browser) plays when
 * the count grows. Renders NOTHING until the first answer, and whenever there is nothing to say.
 *
 * The PROPS are frozen (CrmGate renders it on every CRM page with these, all serialisable).
 */
export interface SlaAlertStripProps {
  locale: Locale;
  /** The viewer's CRM role and super-admin flag decide which counts the summary has. */
  role: "admin" | "manager" | "counsellor";
  superAdmin: boolean;
  /** LOCALE-FREE path of the current page (where to return after signing in again). */
  pagePath: string;
  /** `crm.speed.strip` + the CRM error texts. */
  t: { strip: CrmMessages["speed"]["strip"]; errors: CrmMessages["errors"] };
}

export const SLA_POLL_MS = 60_000;
export const CHIME_STORAGE_KEY = "aspire.crm.slaChime";

function readChime(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CHIME_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeChime(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(CHIME_STORAGE_KEY, "1");
    else window.localStorage.removeItem(CHIME_STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** A short, quiet two-note chime (Web Audio); never throws. */
function playChime(): void {
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.05;
      oscillator.connect(gain).connect(context.destination);
      const start = context.currentTime + index * 0.18;
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    });
    window.setTimeout(() => void context.close().catch(() => undefined), 800);
  } catch {
    // No audio: the strip and the tab title still show the count.
  }
}

function setBadge(count: number): void {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // Badging is optional.
  }
}

const toneClass = {
  info: "border-[#bcd6fb] bg-white text-[#0755b5]",
  warn: "border-[#f2dfa0] bg-white text-[#6b4a00]",
  danger: "border-[#f2b8b5] bg-white text-[#8a1c14]",
} as const;

/** `role`, `superAdmin` and `pagePath` are part of the frozen props; the server decides what the summary holds. */
export function SlaAlertStrip({ locale, t }: SlaAlertStripProps) {
  const s = t.strip;
  const [summary, setSummary] = useState<SlaSummary | null>(null);
  // The strip renders nothing before its first answer, so reading storage here cannot mismatch hydration.
  const [chime, setChime] = useState(readChime);
  const stopped = useRef(false);
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (stopped.current) return;
      void sendCrm<SlaSummary>(summaryRequest(locale)).then((result) => {
        if (!active) return;
        if (!result.ok) {
          // Signed out / no membership: stop asking; the page itself handles the session.
          if (result.error === "unauthenticated" || result.error === "forbidden") stopped.current = true;
          return;
        }
        setSummary(result.data);
      });
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") load();
    }, SLA_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locale]);

  // Tab title, app badge and the chime follow the viewer's own waiting count. The base title is
  // always read from the LIVE document title (the page may have changed it since).
  useEffect(() => {
    if (!summary) return;
    const count = summary.mine.callNow;
    document.title = titleWithCount(s, document.title, count);
    setBadge(count);
    if (lastCount.current !== null && count > lastCount.current && chime) playChime();
    lastCount.current = count;
  }, [summary, chime, s]);

  // On unmount / when hidden (Cache Components keeps old routes in <Activity> and runs this AFTER
  // the next route commits): only strip our count prefix from whatever the title is NOW, never
  // restore an older title over the next page's own.
  useEffect(
    () => () => {
      const current = document.title;
      const stripped = baseTitle(current);
      if (stripped !== current) document.title = stripped;
    },
    [],
  );

  return (
    <SlaAlertStripView
      summary={summary}
      locale={locale}
      t={s}
      chime={chime}
      onToggleChime={() => {
        const next = !chime;
        setChime(next);
        writeChime(next);
      }}
    />
  );
}

/**
 * The strip's markup for one summary (pure; server-renderable for tests). Nothing when there is
 * nothing to say. Every count is written out; links go to the list behind it.
 */
export function SlaAlertStripView({
  summary,
  locale,
  t: s,
  chime,
  onToggleChime,
}: {
  summary: SlaSummary | null;
  locale: Locale;
  t: CrmMessages["speed"]["strip"];
  chime: boolean;
  onToggleChime?: () => void;
}) {
  if (!hasAlerts(summary)) return null;
  const { mine, area, sa } = summary;
  const now = Date.parse(summary.generatedAt);
  const href = (path: string) => localePath(path, locale);
  const saLinks = sa ? superAdminLinks(sa, s) : [];
  const lines = area ? areaLines(area, s) : [];
  const digest = area ? executiveDigest(area, s) : "";

  return (
    <section aria-label={s.label} className="mb-4 rounded-card border border-[#f2dfa0] bg-[#fffbeb] p-3 text-sm text-ink shadow-soft md:p-4" data-sla-strip="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {(mine.callNow > 0 || mine.retriesDue > 0) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <AlarmClock aria-hidden="true" className="size-4 shrink-0 text-[#6b4a00]" />
              {mine.callNow > 0 && <strong className="font-extrabold text-navy">{format(s.callNow, { count: mine.callNow })}</strong>}
              {mine.overdue > 0 && <span className="font-bold text-[#8a1c14]">{format(s.overdue, { count: mine.overdue })}</span>}
              {mine.nextDueAt && <span>{format(s.nextDue, { time: slaTimeLabel(mine.nextDueAt, now, locale) })}</span>}
              {mine.retriesDue > 0 && <span>{format(s.retriesDue, { count: mine.retriesDue })}</span>}
              <Link href={href("/crm/today")} className="inline-flex min-h-11 items-center gap-1 font-bold text-blue underline-offset-2 hover:underline">
                {s.open}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </p>
          )}
          {area && (lines.length > 0 || digest) && (
            <div>
              <p className="flex items-center gap-2 font-bold text-navy">
                <BellRing aria-hidden="true" className="size-4 shrink-0 text-[#6b4a00]" />
                {sa ? s.saAreaTitle : s.areaTitle}
              </p>
              <ul className="mt-1 space-y-0.5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {digest && <li className="text-muted">{digest}</li>}
              </ul>
              <Link href={href("/crm/dashboard")} className="inline-flex min-h-11 items-center gap-1 font-bold text-blue underline-offset-2 hover:underline">
                {s.openDashboard}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
          {saLinks.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {saLinks.map((link) => (
                <li key={link.text}>
                  <Link
                    href={href(link.href)}
                    className={cn("inline-flex min-h-11 items-center rounded-control border px-3 font-bold hover:underline", toneClass[link.tone])}
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">{s.inAppOnly}</p>
        </div>
        <button
          type="button"
          aria-pressed={chime}
          onClick={onToggleChime}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-xs font-bold text-navy hover:border-blue"
        >
          {chime ? <Volume2 aria-hidden="true" className="size-4" /> : <VolumeX aria-hidden="true" className="size-4" />}
          <span className="sr-only">{s.chime}: </span>
          {chime ? s.chimeOn : s.chimeOff}
        </button>
      </div>
    </section>
  );
}
