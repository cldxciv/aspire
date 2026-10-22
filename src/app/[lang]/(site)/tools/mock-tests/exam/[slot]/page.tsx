import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamStart } from "@/components/mocktest/ExamStart";
import { formatDate } from "@/components/mocktest/format";
import { MocktestLeadGateMessages } from "@/components/mocktest/lead-gate";
import { PaletteLegend } from "@/components/mocktest/QuestionPalette";
import { Badge, Container, Notice, PageHero } from "@/components/ui";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { blueprintTotals, defaultBlueprint, PATTERNS, QB_SLOT_META } from "@/lib/qb/patterns";
import { isQbSlot, QB_SLOTS, type QbBlueprintSection } from "@/lib/qb/types";

/**
 * D-017: an unknown slot is a real 404 (every slot is prerendered and the check runs before
 * anything streams). The page itself is static: the pattern comes from code constants
 * (src/lib/qb/patterns.ts, checked against the official documents), and everything that depends on
 * the question bank or the visitor — readiness, the honest composition, the ranked paper, the start
 * buttons — is loaded in the browser by <ExamStart> from GET /api/mocktest/papers/readiness.
 */
export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return QB_SLOTS.map((slot) => ({ slot }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/exam/[slot]">): Promise<Metadata> {
  const { slot } = await params;
  const [locale, t] = await Promise.all([getLocale(), getMessages("mocktest")]);
  if (!isQbSlot(slot)) return { title: t.meta.title };
  const meta = QB_SLOT_META[slot];
  return {
    title: `${meta.title[locale]} · ${t.meta.title}`,
    description: meta.summary[locale],
    alternates: await localeAlternates(`/tools/mock-tests/exam/${slot}`),
  };
}

function sectionType(section: QbBlueprintSection): "single" | "multiple" | "integer" | "decimal2" | "match_list" | "passage" {
  if (section.format === "match_list") return "match_list";
  if (section.format === "passage") return "passage";
  if (section.type === "numerical") return section.answerFormat === "integer" ? "integer" : "decimal2";
  return section.type;
}

const signedMark = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

/** One exam-pattern mock: its official pattern and rules (server), and the start panel (client). */
export default async function ExamPatternMockPage({ params }: PageProps<"/[lang]/tools/mock-tests/exam/[slot]">) {
  const { slot } = await params;
  if (!isQbSlot(slot)) notFound();
  const [locale, t, tc, tTools, tGate] = await Promise.all([
    getLocale(),
    getMessages("mocktest"),
    getMessages("common"),
    getMessages("tools"),
    getMessages("leadGate"),
  ]);
  const tp = t.paper;
  const meta = QB_SLOT_META[slot];
  const pattern = PATTERNS[meta.exam];
  const blueprint = defaultBlueprint(slot);
  const totals = blueprintTotals(blueprint);
  const multiPart = blueprint.parts.length > 1;

  return (
    <>
      <PageHero
        title={meta.title[locale]}
        lead={
          <div className="space-y-2">
            <p>{meta.summary[locale]}</p>
            <p className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{meta.examName[locale]}</Badge>
              <span>{format(tp.list.realExam, { questions: totals.questions, minutes: totals.minutes, marks: totals.marks })}</span>
            </p>
          </div>
        }
        crumbs={[
          { label: tTools.meta.title, href: localePath("/tools", locale) },
          { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
          { label: meta.title[locale] },
        ]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
      />
      <Container className="py-8 md:py-10">
        {meta.placeholder && (
          <Notice variant="warning" className="mb-6">
            {tp.pattern.placeholder}
          </Notice>
        )}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-6">
            <section aria-labelledby="mt-exam-pattern" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
              <h2 id="mt-exam-pattern" className="text-xl font-extrabold text-navy">
                {tp.pattern.title}
              </h2>
              <p className="mt-2 text-sm text-muted">{pattern.note[locale]}</p>
              {blueprint.parts.map((part) => {
                const partTotals = totals.parts.find((p) => p.partId === part.id);
                return (
                  <div key={part.id} className="mt-4">
                    <h3 className="font-bold text-navy">
                      {format(tp.pattern.part, {
                        part: part.label[locale],
                        questions: partTotals?.questions ?? 0,
                        minutes: part.durationMinutes,
                        marks: partTotals?.marks ?? 0,
                      })}
                    </h3>
                    <ul className="mt-2 divide-y divide-line rounded-control border border-line text-sm">
                      {part.sections.map((section) => (
                        <li key={section.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
                          <span className="font-semibold text-ink">{section.label[locale]}</span>
                          <span className="text-muted">
                            {format(tp.pattern.section, {
                              count: section.count,
                              type: tp.pattern.types[sectionType(section)],
                              marking: format(tp.pattern.marking, { correct: section.marking.correct, wrong: signedMark(section.marking.wrong) }),
                            })}
                            {section.marking.partial ? ` · ${tp.pattern.partial}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {pattern.verifiedAt && <p className="mt-4 text-sm">{format(tp.pattern.verified, { date: formatDate(Date.parse(`${pattern.verifiedAt}T12:00:00+05:30`), locale) })}</p>}
              {pattern.sourceUrls.length > 0 && (
                <div className="mt-2 text-sm">
                  <p className="font-semibold text-navy">{tp.pattern.sources}</p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {pattern.sourceUrls.map((url, i) => (
                      <li key={url}>
                        <a href={url} rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-blue hover:underline">
                          {format(tp.pattern.document, { n: i + 1, host: new URL(url).hostname })}
                          <ExternalLink aria-hidden="true" className="size-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!meta.placeholder && <p className="mt-2 text-xs text-muted">{tp.pattern.reviewDue}</p>}
            </section>

            <section aria-labelledby="mt-exam-how" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
              <h2 id="mt-exam-how" className="text-xl font-extrabold text-navy">
                {tp.how.title}
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                <li>{tp.how.fresh}</li>
                <li>{tp.how.weights}</li>
                <li>{tp.how.mix}</li>
                <li>{tp.how.honest}</li>
                <li>{tp.how.sources}</li>
              </ul>
            </section>

            <section aria-labelledby="mt-exam-rules" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
              <h2 id="mt-exam-rules" className="text-xl font-extrabold text-navy">
                {tp.rules.title}
              </h2>
              <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed">
                <li>{tp.rules.timer}</li>
                <li>{tp.rules.saved}</li>
                <li>{tp.rules.review}</li>
                <li>{tp.rules.numerical}</li>
                <li>{tp.rules.language}</li>
                {multiPart && <li>{tp.rules.parts}</li>}
                <li>{tp.rules.practiceRelease}</li>
                {blueprint.ranked === "monthly" && <li>{tp.rules.rankedRelease}</li>}
              </ol>
              <h3 className="mt-6 font-bold text-navy">{t.instructions.legendTitle}</h3>
              <PaletteLegend t={t.runner} className="mt-3" />
            </section>
          </div>
          <div>
            <MocktestLeadGateMessages messages={tGate}>
              <ExamStart slot={slot} t={t} />
            </MocktestLeadGateMessages>
          </div>
        </div>
      </Container>
    </>
  );
}
