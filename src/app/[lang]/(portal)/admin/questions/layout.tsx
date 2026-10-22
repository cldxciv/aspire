import { Suspense, type ReactNode } from "react";
import { QbTabLinks, QbTabs } from "@/components/qb-admin/QbTabs";
import { getLocale, getMessages } from "@/i18n/server";

/**
 * Question bank (`/admin/questions/**`, docs/question-bank-plan.md §B6–B7): the section tab bar
 * above every page. Access is checked per page by `<QbGate>` (each page needs the viewer for its
 * own capabilities and its own `next` path); this layout reads no request data, so it prerenders.
 */
export default async function QuestionBankLayout({ children }: { children: ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <>
      <Suspense fallback={<QbTabLinks locale={locale} t={t.tabs} pathname={null} />}>
        <QbTabs locale={locale} t={t.tabs} />
      </Suspense>
      {children}
    </>
  );
}
