import { CalendarRange, Gauge, LayoutGrid, Timer, Trophy, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AskAspire } from "@/components/ask/AskAspire";
import { RanchoAccountCard, RanchoAccountFallback } from "@/components/pwa/RanchoAccountCard";
import { RanchoInstallCard } from "@/components/pwa/RanchoInstallCard";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { Container, HERO_PANEL, SECTION_PANEL } from "@/components/ui/Layout";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { cn } from "@/lib/cn";

const PATH = "/rancho";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("ranchoApp");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates(PATH) };
}

/** "Rancho can also help with": big tiles into the student tools (locale-free paths). */
const TOOL_TILES: { key: "predictor" | "mockTests" | "planner" | "allTools"; href: string; Icon: LucideIcon }[] = [
  { key: "predictor", href: "/tools/predictor", Icon: Gauge },
  { key: "mockTests", href: "/tools/mock-tests", Icon: Timer },
  { key: "planner", href: "/tools/planner", Icon: CalendarRange },
  { key: "allTools", href: "/tools", Icon: LayoutGrid },
];
const LEADERBOARD_PATH = "/tools/mock-tests/leaderboard";

/**
 * The mascot's idle blink plays once and finishes within 4.5 s instead of looping (WCAG 2.2.2);
 * reduced motion stops it entirely. Same rule as RANCHO_MOTION_ONCE on the Ask page.
 */
const MOTION_ONCE = "[&_svg_*]:[animation-iteration-count:1] [&_svg_*]:[animation-duration:4.5s]";

/**
 * /rancho and /hi/rancho — the Rancho app home and the installed app's start page (manifest
 * `start_url`, src/app/manifest.ts). Mobile first: Rancho's greeting, the Rancho chat (the same
 * AskAspire tool as /tools/ask, with its AI and privacy notes), big tiles into the other tools,
 * a sign-in card and, on desktop Chrome/Edge, an install card (phones and tablets get the
 * site-wide "Get the Rancho app" bar instead).
 *
 * The page is static; only the sign-in card reads the session, inside <Suspense>, so nothing
 * about a visitor is ever in the prerendered HTML.
 */
export default async function RanchoAppPage() {
  const [locale, t, ask, auth] = await Promise.all([
    getLocale(),
    getMessages("ranchoApp"),
    getMessages("ask"),
    getMessages("auth"),
  ]);
  const href = (path: string) => localePath(path, locale);

  return (
    <>
      <section
        aria-labelledby="rancho-title"
        data-surface="dark"
        className={cn(HERO_PANEL, "bg-linear-to-br from-navy to-navy-2 text-white")}
      >
        <Container gutters="section" className="flex items-center gap-4 py-6 sm:gap-6 sm:py-8 lg:py-10">
          <div
            className={cn(
              "grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dce9fb] ring-2 ring-gold sm:size-24",
              MOTION_ONCE,
            )}
          >
            <RanchoMascot variant="head" title={t.home.mascotLabel} className="size-[92%]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{t.home.eyebrow}</p>
            <h1 id="rancho-title" className="mt-1 text-[clamp(1.6rem,4vw,2.5rem)] font-extrabold leading-tight">
              {t.home.title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[#d3e1f3]">{t.home.lead}</p>
            <p className="mt-1.5 max-w-2xl text-sm text-[#b9d3f3]">{t.home.aiNote}</p>
          </div>
        </Container>
      </section>

      <section className={cn(SECTION_PANEL, "bg-surface")}>
        <Container gutters="section" className="py-5 sm:py-8 lg:py-12">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
            <AskAspire
              messages={ask}
              locale={locale}
              links={{
                enquiry: href("/admissions#enquiry"),
                signIn: href("/login"),
                privacy: href("/privacy"),
              }}
            />

            <div className="grid min-w-0 gap-6">
              <section aria-labelledby="rancho-tools" className="rounded-card border border-line bg-white p-5 shadow-soft">
                <h2 id="rancho-tools" className="text-lg font-extrabold text-navy">
                  {t.tools.title}
                </h2>
                <ul className="mt-4 grid grid-cols-2 gap-3">
                  {TOOL_TILES.map(({ key, href: path, Icon }) => (
                    <li
                      key={key}
                      className="relative flex min-h-32 flex-col rounded-xl border border-line bg-surface/60 p-3 transition-colors hover:border-blue"
                    >
                      <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-white text-blue">
                        <Icon className="size-5" strokeWidth={1.9} />
                      </span>
                      {/* The whole tile is the link's tap target (after:inset-0); the leaderboard link sits above it. */}
                      <Link
                        href={href(path)}
                        className="mt-2 font-bold leading-snug text-navy after:absolute after:inset-0 after:rounded-xl hover:underline"
                      >
                        {t.tools[key].title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">{t.tools[key].body}</p>
                      {key === "mockTests" && (
                        <Link
                          href={href(LEADERBOARD_PATH)}
                          className="relative z-10 -mb-1 mt-auto inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-blue hover:underline"
                        >
                          <Trophy aria-hidden="true" className="size-4" />
                          {t.tools.leaderboard}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <Suspense fallback={<RanchoAccountFallback t={t.account} />}>
                <RanchoAccountCard locale={locale} t={t.account} auth={{ roles: auth.roles, signOut: auth.signOut }} />
              </Suspense>

              <RanchoInstallCard messages={t.install.card} />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
