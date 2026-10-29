import { History, Inbox, KeyRound, LogIn, MonitorCheck, Route, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH, CRM_HOME } from "@/lib/auth/paths";
import type { Role } from "@/lib/auth/roles";
import { localizeImage } from "@/lib/data";
import { AccountPanel, PortalPageHeader, PortalPanel, QuickLinks, StatTiles } from "./PortalBlocks";

/**
 * Account counts from the account database (real numbers, not metrics). `staff` = counsellor and
 * centre-manager accounts (core role `staff`, D-038).
 */
export type AccountCounts = { staff: number; admins: number; students: number; parents: number; disabled: number; pending: number };

export function countAccounts(
  users: readonly { role: Role; disabled: boolean; mustChangePassword: boolean }[],
): AccountCounts {
  return {
    staff: users.filter((u) => u.role === "staff").length,
    admins: users.filter((u) => u.role === "admin").length,
    students: users.filter((u) => u.role === "student").length,
    parents: users.filter((u) => u.role === "parent").length,
    disabled: users.filter((u) => u.disabled).length,
    pending: users.filter((u) => u.mustChangePassword && !u.disabled).length,
  };
}

export type AdminAccountView = { displayName: string; loginId: string; counts: AccountCounts };

export type AdminViewMessages = {
  portal: Messages<"portal">;
  roles: Messages<"auth">["roles"];
  photoLabel: string;
};

/**
 * Admin overview. `account` is null for the data-free preview (D-014): tiles show "—".
 * `numbers` (admin console 1b, 1B-NUMBERS): the five numbers by centre and Needs attention, shown
 * first; the page passes their preview ("—", no database read) when `account` is null.
 */
export function AdminOverview({
  account,
  numbers,
  locale,
  m,
}: {
  account: AdminAccountView | null;
  numbers?: ReactNode;
  locale: Locale;
  m: AdminViewMessages;
}) {
  const t = m.portal;
  const o = t.admin.overview;
  const href = (path: string) => localePath(path, locale);
  const counts = account?.counts;
  const tile = (label: string, value: number | undefined) => ({
    label,
    value: value === undefined ? "—" : String(value),
    note: value === undefined ? t.blocks.noLiveData : o.statNote,
  });
  return (
    <>
      <PortalPageHeader
        area="admin"
        eyebrow={t.areas.admin.label}
        title={o.title}
        description={account ? o.lead : o.previewLead}
        badge={account ? undefined : t.blocks.previewBadge}
      />

      {numbers}

      <AccountPanel
        id="admin-account"
        title={t.account.title}
        image={localizeImage(stockImages.classroomDesks, locale)}
        imageLabel={m.photoLabel}
        rows={
          account
            ? [
                { label: t.account.name, value: account.displayName },
                { label: t.account.loginId, value: account.loginId, latin: true },
                { label: t.account.accountType, value: m.roles.admin },
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
            <ButtonLink href={buildLoginHref("/admin", locale)} variant="dark">
              <LogIn aria-hidden="true" className="size-4" />
              {t.account.signIn}
            </ButtonLink>
          )
        }
      />

      <StatTiles
        area="admin"
        label={o.statsLabel}
        noValueLabel={t.blocks.noValue}
        defaultNote={t.blocks.noLiveData}
        tiles={[
          tile(o.stats.staff, counts?.staff),
          tile(o.stats.admins, counts?.admins),
          tile(o.stats.students, counts?.students),
          tile(o.stats.parents, counts?.parents),
          tile(o.stats.disabled, counts?.disabled),
          tile(o.stats.pending, counts?.pending),
        ]}
      />

      <PortalPanel id="admin-areas" title={o.areasTitle}>
        <QuickLinks
          area="admin"
          links={[
            { title: o.areas.crmTitle, description: o.areas.crmBody, href: href(CRM_HOME), icon: Inbox },
            { title: o.areas.websiteTitle, description: o.areas.websiteBody, href: href("/admin/website"), icon: MonitorCheck },
            { title: o.areas.usersTitle, description: o.areas.usersBody, href: href("/admin/users"), icon: UsersRound },
            { title: o.areas.auditTitle, description: o.areas.auditBody, href: href("/admin/audit"), icon: History },
            { title: o.areas.comingTitle, description: o.areas.comingBody, href: href("/admin/coming"), icon: Route },
          ]}
        />
      </PortalPanel>
    </>
  );
}

/** Preview stand-in for the admin-only tools (users, audit): no data, a sign-in link. */
export function AdminPreviewPanel({
  id,
  title,
  body,
  locale,
  path,
  t,
}: {
  id: string;
  title: string;
  body: string;
  locale: Locale;
  path: string;
  t: Messages<"portal">;
}) {
  return (
    <PortalPanel id={id} title={title}>
      <div className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-6 text-center">
        <p className="text-muted">{body}</p>
        <div className="mt-4 flex justify-center">
          <ButtonLink href={buildLoginHref(path, locale)} variant="dark">
            <LogIn aria-hidden="true" className="size-4" />
            {t.account.signIn}
          </ButtonLink>
        </div>
      </div>
    </PortalPanel>
  );
}
