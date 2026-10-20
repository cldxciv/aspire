import type { Metadata } from "next";
import { AttemptPage, attemptPageMetadata, attemptPageParams } from "@/components/mocktest/AttemptPage";
import { CertificateView } from "@/components/mocktest/PrintViews";

export const ensureStatic = "navigation";
export const instant = false;

export function generateStaticParams() {
  return attemptPageParams();
}

export async function generateMetadata({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/certificate">): Promise<Metadata> {
  return attemptPageMetadata((await params).testId, "certificate");
}

/** Printable certificate of participation for one attempt (its own score only, no rank claims). */
export default async function MockTestCertificatePage({ params }: PageProps<"/[lang]/tools/mock-tests/[testId]/certificate">) {
  const { testId } = await params;
  return AttemptPage({ testId, kind: "certificate", render: (test, t) => <CertificateView test={test} t={t} /> });
}
