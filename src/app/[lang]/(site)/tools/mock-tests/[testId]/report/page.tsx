import type { Metadata } from "next";
import { AttemptPage, attemptPageMetadata, attemptPageParams } from "@/components/mocktest/AttemptPage";
import { ParentReportView } from "@/components/mocktest/PrintViews";

export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return attemptPageParams();
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/report">): Promise<Metadata> {
  return attemptPageMetadata((await params).testId, "report");
}

/**
 * Report for parents (D-033): printable / downloadable. No WhatsApp or email provider is connected,
 * and the page says so; linked parents see results in the parent portal (Phase 2).
 */
export default async function MockTestReportPage({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/report">) {
  const { testId } = await params;
  return AttemptPage({ testId, kind: "report", render: (test, t) => <ParentReportView test={test} t={t} /> });
}
