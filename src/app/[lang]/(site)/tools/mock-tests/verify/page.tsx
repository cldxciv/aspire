import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyView } from "@/components/mocktest/VerifyView";
import { Container, PageHero } from "@/components/ui";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("mocktest");
  return { title: t.meta.verifyTitle, description: t.meta.verifyDescription, robots: { index: false, follow: false } };
}

/**
 * Public check of a mock-test certificate's verification id (QA-SEC-M6 L7). The page is static; the
 * client view reads `?id=` and asks GET /api/mocktest/verify/:id, which confirms the test, date and
 * score band only (no name). Not indexed.
 */
export default async function MockTestVerifyPage() {
  const [locale, t, tc, tTools] = await Promise.all([getLocale(), getMessages("mocktest"), getMessages("common"), getMessages("tools")]);
  return (
    <>
      <PageHero
        title={t.verify.title}
        lead={<p>{t.verify.lead}</p>}
        crumbs={[
          { label: tTools.meta.title, href: localePath("/tools", locale) },
          { label: t.hero.crumb, href: localePath("/tools/mock-tests", locale) },
          { label: t.verify.crumb },
        ]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
      />
      <Container className="py-8 md:py-10">
        <Suspense fallback={<p className="py-10 text-center text-muted">{t.common.loading}</p>}>
          <VerifyView t={t} />
        </Suspense>
      </Container>
    </>
  );
}
