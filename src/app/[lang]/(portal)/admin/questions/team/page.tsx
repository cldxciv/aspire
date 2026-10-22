import type { Metadata } from "next";
import { QbPageHeader } from "@/components/qb-admin/QbBlocks";
import { QbGate } from "@/components/qb-admin/QbGate";
import { TeamView } from "@/components/qb-admin/TeamView";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("qb");
  return { title: t.team.metaTitle, description: t.team.metaDescription };
}

/** Question-bank team and settings: administrators only (`manage_team`, §B6). */
export default async function TeamPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("qb")]);
  return (
    <QbGate path="/admin/questions/team" title={t.team.title} need="manage_team">
      {() => (
        <>
          <QbPageHeader eyebrow={t.area.label} title={t.team.title} description={t.team.lead} />
          <TeamView t={t} locale={locale} />
        </>
      )}
    </QbGate>
  );
}
