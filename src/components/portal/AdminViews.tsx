import { BriefcaseBusiness, FileText, History, Inbox, KeyRound, LogIn, MapPin, Trophy, UsersRound } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH, CRM_HOME } from "@/lib/auth/paths";
import type { Role } from "@/lib/auth/roles";
import { localizeImage } from "@/lib/data";
import { AccountPanel, NotConnected, PortalPageHeader, PortalPanel, QuickLinks, StatTiles } from "./PortalBlocks";

/** Account counts from the account database (real numbers, not metrics). */
export type AccountCounts = { students: number; parents: number; admins: number; disabled: number; pending: number };

export function countAccounts(
  users: readonly { role: Role; disabled: boolean; mustChangePassword: boolean }[],
): AccountCounts {
  return {
    students: users.filter((u) => u.role === "student").length,
    parents: users.filter((u) => u.role === "parent").length,
    admins: users.filter((u) => u.role === "admin").length,
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

/** Admin overview. `account` is null for the data-free preview (D-014): tiles show "—". */
export function AdminOverview({
  account,
  locale,
  m,
}: {
  account: AdminAccountView | null;
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
          tile(o.stats.students, counts?.students),
          tile(o.stats.parents, counts?.parents),
          tile(o.stats.admins, counts?.admins),
          tile(o.stats.disabled, counts?.disabled),
          tile(o.stats.pending, counts?.pending),
        ]}
      />

      <PortalPanel id="admin-areas" title={o.areasTitle}>
        <QuickLinks
          area="admin"
          links={[
            { title: o.areas.crmTitle, description: o.areas.crmBody, href: href(CRM_HOME), icon: BriefcaseBusiness },
            { title: o.areas.usersTitle, description: o.areas.usersBody, href: href("/admin/users"), icon: UsersRound },
            { title: o.areas.auditTitle, description: o.areas.auditBody, href: href("/admin/audit"), icon: History },
            { title: o.areas.enquiriesTitle, description: o.areas.enquiriesBody, href: href("/admin/enquiries"), icon: Inbox },
            { title: o.areas.contentTitle, description: o.areas.contentBody, href: href("/admin/content"), icon: FileText },
            { title: o.areas.centresTitle, description: o.areas.centresBody, href: href("/admin/centres"), icon: MapPin },
            { title: o.areas.resultsTitle, description: o.areas.resultsBody, href: href("/admin/results"), icon: Trophy },
          ]}
        />
      </PortalPanel>

      <Notice variant="warning" className="mt-6" title={o.notConnectedTitle}>
        {o.notConnectedBody}
      </Notice>
    </>
  );
}

type SectionKey = "content" | "centres" | "results";

/** Admin areas with no data store yet: header + one honest empty state. */
export function AdminSection({ section, preview, t }: { section: SectionKey; preview: boolean; t: Messages<"portal"> }) {
  const page = t.admin[section];
  return (
    <>
      <PortalPageHeader
        area="admin"
        eyebrow={t.areas.admin.label}
        title={page.title}
        description={page.description}
        badge={preview ? t.blocks.previewBadge : undefined}
      />
      <PortalPanel id={`admin-${section}-panel`} title={page.panelTitle}>
        <NotConnected title={page.emptyTitle} system={page.system} requiresLabel={t.blocks.requires}>
          {page.body}
        </NotConnected>
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
