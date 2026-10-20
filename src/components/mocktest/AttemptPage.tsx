import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Container, DemoBadge, PageHero } from "@/components/ui";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { getAllMockTestIds, getVisibleMockTest, runnerPayload } from "@/lib/mocktest/catalog";
import type { RunnerTest } from "@/lib/mocktest/types";
import type { MocktestMessages } from "./format";
import { MocktestLeadGateMessages } from "./lead-gate";

/**
 * Shared server shell of the per-attempt pages (result, certificate, report): breadcrumbs + the
 * page's one h1, then a client view that reads `?attempt=` / `?saved=` (under Suspense). These pages
 * show one student's attempt, so they are never indexed.
 */

export function attemptPageParams() {
  return getAllMockTestIds().map((testId) => ({ testId }));
}

export type AttemptPageKind = "result" | "certificate" | "report";

function titleOf(kind: AttemptPageKind, t: MocktestMessages): string {
  if (kind === "result") return t.result.title;
  if (kind === "certificate") return t.meta.certificateTitle;
  return t.meta.reportTitle;
}

export async function attemptPageMetadata(testId: string, kind: AttemptPageKind): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages("mocktest")]);
  const test = getVisibleMockTest(testId);
  const title = titleOf(kind, t);
  return {
    title: test ? `${title} · ${test.title[locale]}` : t.meta.title,
    robots: { index: false, follow: false },
  };
}

export async function AttemptPage({
  testId,
  kind,
  render,
}: {
  testId: string;
  kind: AttemptPageKind;
  render: (test: RunnerTest, t: MocktestMessages) => ReactNode;
}) {
  const [locale, t, tc, tTools, tGate] = await Promise.all([
    getLocale(),
    getMessages("mocktest"),
    getMessages("common"),
    getMessages("tools"),
    getMessages("leadGate"),
  ]);
  const test = getVisibleMockTest(testId);
  if (!test) notFound();
  const payload = runnerPayload(test);
  const title = titleOf(kind, t);
  const crumbs = [
    { label: tTools.meta.title, href: localePath("/tools", locale) },
    { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
    { label: test.title[locale], href: localePath(`/tools/mock-tests/${test.id}`, locale) },
    { label: title },
  ];
  return (
    <>
      <div className="mt-no-print">
        <PageHero
          title={title}
          lead={
            <p className="flex flex-wrap items-center gap-2">
              <span>{test.title[locale]}</span>
              {payload.sample && <DemoBadge label={t.common.sample} />}
            </p>
          }
          crumbs={crumbs}
          homeLabel={tc.labels.home}
          homeHref={localePath("/", locale)}
        />
      </div>
      <Container className="py-8 md:py-10">
        <Suspense fallback={<p className="py-10 text-center text-muted">{t.common.loading}</p>}>
          {/* The result view may ask for contact details before the score (lead gate, plan §8.4). */}
          <MocktestLeadGateMessages messages={tGate}>{render(payload, t)}</MocktestLeadGateMessages>
        </Suspense>
      </Container>
    </>
  );
}
