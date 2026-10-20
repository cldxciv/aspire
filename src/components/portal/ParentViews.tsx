import { KeyRound, LifeBuoy, LogIn, Megaphone, PlugZap, TrendingUp, UserRound } from "lucide-react";
import { Badge, ButtonLink, EmptyState, Notice } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { localizeImage } from "@/lib/data";
import { AccountPanel, NotConnected, PortalPageHeader, PortalPanel, QuickLinks } from "./PortalBlocks";

/** A learner linked to the signed-in parent by an admin (enabled accounts only): display name only. */
export type LinkedLearnerView = { id: string; displayName: string };

export type ParentAccountView = { displayName: string; loginId: string; learners: LinkedLearnerView[] };

export type ParentViewMessages = {
  portal: Messages<"portal">;
  roles: Messages<"auth">["roles"];
  photoLabel: string;
};

/**
 * Parent dashboard. `account` is null for the data-free preview (D-014). Lists ONLY the
 * learners linked to this parent (resolved server-side from the session's own user id), each
 * with honest "not connected" states; an empty state when none is linked.
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
        badge={account ? t.blocks.accountOnlyBadge : t.blocks.previewBadge}
      />

      <AccountPanel
        id="parent-account"
        title={t.account.title}
        image={localizeImage(stockImages.hamirpurHills, locale)}
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
          <ul className="grid gap-3 lg:grid-cols-2">
            {account.learners.map((learner) => (
              <li key={learner.id} className="rounded-control border border-line bg-white p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-[#0f6b48]">
                    <UserRound className="size-5" />
                  </span>
                  <h3 className="min-w-0 break-words font-bold text-navy">{learner.displayName}</h3>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[p.progress, p.updates, p.attendance].map((label) => (
                    <div key={label} className="rounded-md bg-[#f8fbff] px-3 py-2">
                      <dt className="text-xs font-semibold text-muted">{label}</dt>
                      <dd className="mt-1">
                        <Badge variant="neutral">
                          <PlugZap aria-hidden="true" className="size-3" />
                          {t.blocks.notConnected}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                </dl>
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

/** Parent progress page: one honest panel per linked learner (or the empty / preview state). */
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
        badge={learners ? t.blocks.accountOnlyBadge : t.blocks.previewBadge}
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
        <div className="grid gap-6">
          {learners.map((learner, index) => (
            <PortalPanel key={learner.id} id={`parent-progress-learner-${index}`} title={learner.displayName}>
              <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
                {page.body}
              </NotConnected>
            </PortalPanel>
          ))}
        </div>
      )}
    </>
  );
}

/** Parent updates page: announcements are not connected. */
export function ParentUpdates({ preview, t }: { preview: boolean; t: Messages<"portal"> }) {
  const page = t.parent.updatesPage;
  return (
    <>
      <PortalPageHeader
        area="parent"
        eyebrow={t.areas.parent.label}
        title={page.title}
        description={page.description}
        badge={preview ? t.blocks.previewBadge : t.blocks.accountOnlyBadge}
      />
      <PortalPanel id="parent-updates-feed" title={page.panelTitle}>
        <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
          {page.body}
        </NotConnected>
      </PortalPanel>
    </>
  );
}
