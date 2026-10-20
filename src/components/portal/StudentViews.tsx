import { BookOpen, CalendarCheck, CalendarDays, KeyRound, LogIn, TrendingUp } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { localizeImage } from "@/lib/data";
import { AccountPanel, AreaStatusCards, NotConnected, PortalPageHeader, PortalPanel } from "./PortalBlocks";

/** The signed-in student's own account facts (from the session / account database). */
export type StudentAccountView = { displayName: string; loginId: string; linkedParents: number };

export type StudentViewMessages = {
  portal: Messages<"portal">;
  roles: Messages<"auth">["roles"];
  photoLabel: string;
};

/**
 * Student dashboard. `account` is null for the data-free preview (D-014). Shows only the
 * account's own details and honest "not connected" cards (D-029): no timetable, results or
 * attendance data exists, so none is shown or estimated.
 */
export function StudentOverview({
  account,
  locale,
  m,
}: {
  account: StudentAccountView | null;
  locale: Locale;
  m: StudentViewMessages;
}) {
  const t = m.portal;
  const s = t.student;
  const href = (path: string) => localePath(path, locale);
  return (
    <>
      <PortalPageHeader
        area="student"
        eyebrow={t.areas.student.label}
        title={account ? format(s.welcome, { name: account.displayName }) : s.previewTitle}
        description={account ? s.lead : s.previewLead}
        badge={account ? t.blocks.accountOnlyBadge : t.blocks.previewBadge}
      />

      <AccountPanel
        id="student-account"
        title={t.account.title}
        image={localizeImage(stockImages.notebookPlanning, locale)}
        imageLabel={m.photoLabel}
        rows={
          account
            ? [
                { label: t.account.name, value: account.displayName },
                { label: t.account.loginId, value: account.loginId, latin: true },
                { label: t.account.accountType, value: m.roles.student },
                { label: t.account.linkedParents, value: String(account.linkedParents) },
              ]
            : undefined
        }
        emptyText={t.account.previewBody}
        action={
          account ? (
            <ButtonLink href={href(CHANGE_PASSWORD_PATH)} variant="outline">
              <KeyRound aria-hidden="true" className="size-4" />
              {t.account.changePassword}
            </ButtonLink>
          ) : (
            <ButtonLink href={buildLoginHref("/student", locale)} variant="dark">
              <LogIn aria-hidden="true" className="size-4" />
              {t.account.signIn}
            </ButtonLink>
          )
        }
      />

      <PortalPanel id="student-areas" title={s.areasTitle} description={s.areasDescription}>
        <AreaStatusCards
          area="student"
          labels={t.blocks}
          cards={[
            { ...s.cards.timetable, icon: CalendarDays, href: href("/student/timetable") },
            { ...s.cards.results, icon: TrendingUp, href: href("/student/progress") },
            { ...s.cards.attendance, icon: CalendarCheck, href: href("/student/progress") },
            { ...s.cards.resources, icon: BookOpen, href: href("/student/resources") },
          ]}
        />
      </PortalPanel>

      <Notice className="mt-6" title={s.honestTitle}>
        {s.honestBody}
      </Notice>
    </>
  );
}

type SectionKey = "timetable" | "resources" | "progress";

/** Student section pages (timetable, study material, progress): header + one honest empty state. */
export function StudentSection({
  section,
  preview,
  locale,
  t,
}: {
  section: SectionKey;
  preview: boolean;
  locale: Locale;
  t: Messages<"portal">;
}) {
  const s = t.student;
  const page = s[section];
  const system =
    section === "timetable" ? s.cards.timetable.system : section === "resources" ? s.cards.resources.system : s.progress.system;
  return (
    <>
      <PortalPageHeader
        area="student"
        eyebrow={t.areas.student.label}
        title={page.title}
        description={page.description}
        badge={preview ? t.blocks.previewBadge : t.blocks.accountOnlyBadge}
      />
      <PortalPanel id={`student-${section}-panel`} title={page.panelTitle}>
        <NotConnected
          title={page.emptyTitle}
          system={system}
          requiresLabel={t.blocks.requires}
          action={
            section === "resources" ? (
              <ButtonLink href={localePath("/resources", locale)} variant="outline">
                {s.resources.browsePublic}
              </ButtonLink>
            ) : undefined
          }
        >
          {page.body}
        </NotConnected>
      </PortalPanel>
    </>
  );
}
