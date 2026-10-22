import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MocktestLeadGateMessages } from "@/components/mocktest/lead-gate";
import { PaperResultView } from "@/components/mocktest/PaperResultView";
import { Container, PageHero } from "@/components/ui";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { chapterLabelsFor } from "@/components/mocktest/chapter-labels";
import { QB_SLOT_META } from "@/lib/qb/patterns";
import { isQbSlot, QB_SLOTS } from "@/lib/qb/types";

/** D-017: an unknown slot is a real 404. The result itself is loaded in the browser (`?attempt=` / `?saved=`). */
export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return QB_SLOTS.map((slot) => ({ slot }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/exam/[slot]/result">): Promise<Metadata> {
  const { slot } = await params;
  const [locale, t] = await Promise.all([getLocale(), getMessages("mocktest")]);
  const title = t.paper.result.title;
  return {
    title: isQbSlot(slot) ? `${title} · ${QB_SLOT_META[slot].title[locale]}` : t.meta.title,
    // One student's paper: never indexed.
    robots: { index: false, follow: false },
  };
}

/** The result of one generated paper: score, section-wise analysis, solutions when released. */
export default async function ExamPatternResultPage({ params }: PageProps<"/[lang]/tools/mock-tests/exam/[slot]/result">) {
  const { slot } = await params;
  if (!isQbSlot(slot)) notFound();
  const [locale, t, tc, tTools, tGate] = await Promise.all([
    getLocale(),
    getMessages("mocktest"),
    getMessages("common"),
    getMessages("tools"),
    getMessages("leadGate"),
  ]);
  const meta = QB_SLOT_META[slot];
  return (
    <>
      <PageHero
        title={t.paper.result.title}
        lead={<p>{meta.title[locale]}</p>}
        crumbs={[
          { label: tTools.meta.title, href: localePath("/tools", locale) },
          { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
          { label: meta.title[locale], href: localePath(`/tools/mock-tests/exam/${slot}`, locale) },
          { label: t.paper.result.title },
        ]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
      />
      <Container className="py-8 md:py-10">
        <Suspense fallback={<p className="py-10 text-center text-muted">{t.common.loading}</p>}>
          {/* The result may ask for contact details before the score (lead gate, docs/lead-gate-plan.md §8.4). */}
          <MocktestLeadGateMessages messages={tGate}>
            <PaperResultView slot={slot} t={t} chapterLabels={chapterLabelsFor(slot)} />
          </MocktestLeadGateMessages>
        </Suspense>
      </Container>
    </>
  );
}
