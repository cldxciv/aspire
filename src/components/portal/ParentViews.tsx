import { ArrowRight, KeyRound, LifeBuoy, LogIn, Megaphone, TrendingUp, UserRound } from "lucide-react";
import Link from "next/link";
import { ButtonLink, EmptyState, Notice } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { localizeImage } from "@/lib/data";
import { buildActivity, type LearnerTools } from "./learner-tools-view";
import { AccountPanel, NotConnected, PortalPageHeader, PortalPanel, QuickLinks } from "./PortalBlocks";
import { ActivityList, DoubtsBlock, LearnerToolFacts, MockTestsBlock, PlannerBlock, ToolSection } from "./ToolPanels";

/**
 * A learner linked to the signed-in parent by an admin (enabled accounts only), with their
 * practice-tool activity. Loaded server-side ONLY through `loadLinkedLearnersWithTools`, which
 * applies the record-level check (parents see linked learners only).
 */
export type LinkedLearnerView = { id: string; displayName: string; tools: LearnerTools };

export type ParentAccountView = { displayName: string; loginId: string; learners: LinkedLearnerView[] };

export type ParentViewMessages = {
  portal: Messages<"portal">;
  roles: Messages<"auth">["roles"];
  photoLabel: string;
};

/** Anchor of a learner's panel on /parent/progress (same order as the dashboard list). */
export function learnerProgressAnchor(index: number): string {
  return `parent-progress-learner-${index}`;
}

/**
 * Parent dashboard. `account` is null for the data-free preview (D-014). Lists ONLY the
 * learners linked to this parent (resolved server-side from the session's own user id), each
 * with a one-line summary of their practice-tool activity and "not connected" for attendance;
 * an empty state when none is linked.
 */
export function ParentOverview({
  account,
  locale,
  m,
}: {
  account: ParentAccountView | null;
  locale: Locale;
  m: ParentViewMessages;
}) {
  const t = m.portal;
  const p = t.parent;
  const href = (path: string) => localePath(path, locale);
  return (
    <>
      <PortalPageHeader
        area="parent"
        eyebrow={t.areas.parent.label}
        title={account ? format(p.welcome, { name: account.displayName }) : p.previewTitle}
        description={account ? p.lead : p.previewLead}
        badge={account ? t.blocks.toolDataBadge : t.blocks.previewBadge}
      />

      <AccountPanel
        id="parent-account"
        title={t.account.title}
        image={localizeImage(stockImages.booksAndNotebook, locale)}
        imageLabel={m.photoLabel}
        rows={
          account
            ? [
                { label: t.account.name, value: account.displayName },
                { label: t.account.loginId, value: account.loginId, latin: true },
                { label: t.account.accountType, value: m.roles.parent },
                { label: t.account.linkedLearners, value: String(account.learners.length) },
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
            <ButtonLink href={buildLoginHref("/parent", locale)} variant="dark">
              <LogIn aria-hidden="true" className="size-4" />
              {t.account.signIn}
            </ButtonLink>
          )
        }
      />

      <PortalPanel id="parent-learners" title={p.learnersTitle} description={p.learnersDescription} className="mb-6">
        {!account ? (
          <EmptyState title={p.previewTitle} description={p.previewLearners} />
        ) : account.learners.length === 0 ? (
          <NoLearners locale={locale} t={t} />
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {account.learners.map((learner, index) => (
              <li key={learner.id} className="flex min-w-0 flex-col rounded-control border border-line bg-white p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-[#0f6b48]">
                    <UserRound className="size-5" />
                  </span>
                  <h3 className="min-w-0 break-words font-bold text-navy">{learner.displayName}</h3>
                </div>
                <LearnerToolFacts tools={learner.tools} locale={locale} t={t} />
                <Link
                  href={href(`/parent/progress#${learnerProgressAnchor(index)}`)}
                  className="mt-auto inline-flex min-h-11 items-center gap-1 pt-2 text-sm font-bold text-blue hover:underline"
                >
                  {format(p.seeProgressFor, { name: learner.displayName })}
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PortalPanel>

      <PortalPanel id="parent-support" title={p.supportTitle}>
        <QuickLinks
          area="parent"
          links={[
            { title: p.links.updatesTitle, description: p.links.updatesBody, href: href("/parent/updates"), icon: Megaphone },
            { title: p.links.progressTitle, description: p.links.progressBody, href: href("/parent/progress"), icon: TrendingUp },
            { title: p.links.contactTitle, description: p.links.contactBody, href: href("/contact"), icon: LifeBuoy },
          ]}
        />
      </PortalPanel>

      <Notice className="mt-6" title={p.honestTitle}>
        {p.honestBody}
      </Notice>
    </>
  );
}

function NoLearners({ locale, t }: { locale: Locale; t: Messages<"portal"> }) {
  return (
    <EmptyState
      title={t.parent.noLearnersTitle}
      description={t.parent.noLearnersBody}
      action={
        <ButtonLink href={localePath("/contact", locale)} variant="outline">
          {t.parent.links.contactTitle}
        </ButtonLink>
      }
    />
  );
}

/**
 * Parent progress page (D-033: the portal IS the report — nothing is sent by message): one panel
 * per linked learner with their mock tests, study-planner consistency (counts only) and doubt
 * topics, plus classroom results / attendance as "not connected". Preview: no learner at all.
 */
export function ParentProgress({
  learners,
  locale,
  t,
}: {
  /** null = data-free preview. */
  learners: LinkedLearnerView[] | null;
  locale: Locale;
  t: Messages<"portal">;
}) {
  const page = t.parent.progressPage;
  return (
    <>
      <PortalPageHeader
        area="parent"
        eyebrow={t.areas.parent.label}
        title={page.title}
        description={page.description}
        badge={learners ? t.blocks.toolDataBadge : t.blocks.previewBadge}
      />
      {learners === null ? (
        <PortalPanel id="parent-progress-preview" title={t.parent.learnersTitle}>
          <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
            {page.body}
          </NotConnected>
        </PortalPanel>
      ) : learners.length === 0 ? (
        <PortalPanel id="parent-progress-none" title={t.parent.learnersTitle}>
          <NoLearners locale={locale} t={t} />
        </PortalPanel>
      ) : (
        <>
          <Notice className="mb-6" title={page.reportTitle}>
            {page.reportBody}
          </Notice>
          <div className="grid gap-6">
            {learners.map((learner, index) => (
              <PortalPanel key={learner.id} id={learnerProgressAnchor(index)} title={learner.displayName}>
                <div className="grid gap-4">
                  <MockTestsBlock id={`learner-${index}-mock`} level={3} audience="parent" locale={locale} t={t} view={learner.tools.mockTests} />
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <PlannerBlock id={`learner-${index}-planner`} level={3} audience="parent" locale={locale} t={t} view={learner.tools.planner} />
                    <DoubtsBlock id={`learner-${index}-doubts`} level={3} audience="parent" locale={locale} t={t} view={learner.tools.doubts} />
                  </div>
                  <ToolSection id={`learner-${index}-classroom`} level={3} title={page.classroomTitle}>
                    <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
                      {page.body}
                    </NotConnected>
                  </ToolSection>
                </div>
              </PortalPanel>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Parent updates page: recent practice-tool activity per linked learner (newest first), the D-033
 * note that nothing is sent by WhatsApp / SMS / email, and announcements as "not connected".
 */
export function ParentUpdates({
  learners,
  locale,
  t,
}: {
  /** null = data-free preview. */
  learners: LinkedLearnerView[] | null;
  locale: Locale;
  t: Messages<"portal">;
}) {
  const page = t.parent.updatesPage;
  return (
    <>
      <PortalPageHeader
        area="parent"
        eyebrow={t.areas.parent.label}
        title={page.title}
        description={page.description}
        badge={learners ? t.blocks.toolDataBadge : t.blocks.previewBadge}
      />
      {learners !== null && (
        <PortalPanel id="parent-activity" title={page.activityTitle} description={page.activityDescription} className="mb-6">
          {learners.length === 0 ? (
            <NoLearners locale={locale} t={t} />
          ) : (
            <div className="grid gap-5">
              {learners.map((learner, index) => (
                <section key={learner.id} aria-labelledby={`parent-activity-${index}`} className="min-w-0">
                  <h3 id={`parent-activity-${index}`} className="mb-2 break-words font-bold text-navy">
                    {learner.displayName}
                  </h3>
                  <ActivityList
                    items={buildActivity(learner.tools)}
                    labelledBy={`parent-activity-${index}`}
                    emptyText={page.activityEmpty}
                    locale={locale}
                    t={t}
                  />
                </section>
              ))}
            </div>
          )}
        </PortalPanel>
      )}
      {learners !== null && learners.length > 0 && (
        <Notice className="mb-6" title={t.parent.progressPage.reportTitle}>
          {t.parent.progressPage.reportBody}
        </Notice>
      )}
      <PortalPanel id="parent-updates-feed" title={page.panelTitle}>
        <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
          {page.body}
        </NotConnected>
      </PortalPanel>
    </>
  );
}
