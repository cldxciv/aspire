import type { Metadata } from "next";
import { AttemptPage, attemptPageMetadata, attemptPageParams } from "@/components/mocktest/AttemptPage";
import { ResultView } from "@/components/mocktest/ResultView";

export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return attemptPageParams();
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/result">): Promise<Metadata> {
  return attemptPageMetadata((await params).testId, "result");
}

/** Result of one attempt: `?attempt=<id on this device>` or `?saved=<id in the student's account>`. */
export default async function MockTestResultPage({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/result">) {
  const { testId } = await params;
  return AttemptPage({ testId, kind: "result", render: (test, t) => <ResultView test={test} t={t} /> });
}
