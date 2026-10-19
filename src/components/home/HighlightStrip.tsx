import { Container, DemoBadge } from "@/components/ui";
import type { Stat } from "@/lib/types";

/** Mockup "stats" row, kept qualitative: no numeric claims (docs/content-verification.md). */
const HIGHLIGHTS = [
  { title: "Results matter", text: "Student journeys, year by year" },
  { title: "JEE · NEET", text: "Focused entrance preparation" },
  { title: "Himachal", text: "Local learning and guidance" },
  { title: "Student-first", text: "Guidance beyond the classroom" },
];

const stripClasses = "gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-card";

/**
 * Stats strip under the hero. Shows the headline figures from getStats("headline")
 * exactly as stated by the source — each placeholder figure DEMO-labelled — and falls
 * back to the qualitative mockup strip when no figures are publishable (production
 * until Aspire verifies them).
 */
export function HighlightStrip({ stats }: { stats: Stat[] }) {
  return (
    <Container className="relative z-10 mt-4 md:-mt-6">
      {stats.length > 0 ? (
        // Flex items grow to fill each row, so an odd count never leaves an empty grey cell.
        <ul aria-label="Aspire at a glance" className={`flex flex-wrap ${stripClasses}`}>
          {stats.map((stat) => (
            <li
              key={stat.id}
              className="grow basis-[calc(50%-1px)] bg-white px-2 py-4 text-center sm:basis-[calc(33.333%-1px)] sm:p-5 lg:basis-0"
            >
              <p className="text-xl font-extrabold leading-tight text-navy sm:text-[25px]">{stat.value}</p>
              <p className="mt-1 text-xs font-semibold text-ink">{stat.label}</p>
              {stat.context && <p className="mt-0.5 text-[11px] text-muted">{stat.context}</p>}
              {stat.status === "placeholder" && <DemoBadge label="Demo" className="mt-2" />}
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label="What Aspire focuses on" className={`grid grid-cols-2 lg:grid-cols-4 ${stripClasses}`}>
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="bg-white px-2 py-4 text-center sm:p-5">
              <p className="text-lg font-extrabold leading-tight text-navy sm:text-[25px]">{item.title}</p>
              <p className="mt-1 text-xs text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
