import { Building2, CalendarDays, Trophy, Users, type LucideIcon } from "lucide-react";
import { DemoBadge, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { Stat } from "@/lib/types";

/** The four headline figures of the approved design, in display order (plan §4.2). Icons are decorative. */
const STAT_SLOTS: { id: string; Icon: LucideIcon }[] = [
  { id: "stat-campuses", Icon: Building2 },
  { id: "stat-years", Icon: CalendarDays },
  { id: "stat-doctors-iitians", Icon: Users },
  { id: "stat-verified-rankers", Icon: Trophy },
];

/** Full class names so Tailwind generates them. */
const LG_COLUMNS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"];

/**
 * True when the band has a headline stat to show (same STAT_SLOTS filter as StatsBand below).
 * The homepage layout passes a null slot otherwise (docs/page-layout-plan.md §4 slot contract).
 */
export function statsBandHasItems(stats: Stat[]): boolean {
  return STAT_SLOTS.some(({ id }) => stats.some((s) => s.id === id));
}

/**
 * Full-bleed light-blue stats band under the hero. Shows only the four headline
 * stats above, with value, label and context exactly as stored (never the design's
 * filler numbers). Each placeholder figure carries a DEMO badge. Renders nothing when
 * none of them is publishable (production today): no pseudo-stats.
 */
export function StatsBand({ stats, locale }: { stats: Stat[]; locale: Locale }) {
  const items = STAT_SLOTS.flatMap(({ id, Icon }) => {
    const stat = stats.find((s) => s.id === id);
    return stat ? [{ stat, Icon }] : [];
  });
  if (items.length === 0) return null;
  const t = messagesFor(locale, "home").stats;
  const demoLabel = messagesFor(locale, "common").labels.demo;

  return (
    <Section tone="blue" aria-labelledby="home-stats-title" className="py-10! md:py-12! lg:py-14!">
      <h2 id="home-stats-title" className="sr-only font-serif">
        {t.title}
      </h2>
      <ul className={cn("grid grid-cols-1 gap-x-8 gap-y-8 min-[440px]:grid-cols-2 lg:gap-x-10", LG_COLUMNS[items.length])}>
        {items.map(({ stat, Icon }) => (
          <li
            key={stat.id}
            className="flex min-w-0 items-center gap-4 lg:border-l lg:border-[#c9d9ee] lg:pl-8 lg:first:border-l-0 lg:first:pl-0 xl:gap-5"
          >
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-navy ring-1 ring-[#d3e2f5]"
            >
              <Icon className="size-7" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <p className="font-serif text-[2rem] font-semibold leading-none tracking-tight text-navy">{stat.value}</p>
              <p className="mt-2 font-semibold leading-snug text-ink">{stat.label}</p>
              {stat.context && <p className="mt-0.5 text-sm leading-snug text-muted">{stat.context}</p>}
              {stat.status === "placeholder" && <DemoBadge label={demoLabel} className="mt-2" />}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
