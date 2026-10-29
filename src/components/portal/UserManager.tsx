"use client";

import { Ban, CircleCheck, Copy, KeyRound, Link2, LoaderCircle, Pencil, RefreshCw, ShieldCheck, ShieldOff, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { describedBy, inputClasses } from "@/components/auth/fields";
import { SuperAdminBadge } from "@/components/crm/SuperAdminBadge";
import { Badge, Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type consolePeopleEn from "@/i18n/messages/en/console-people";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { callApi, retryAfterMinutes, type ApiFailure } from "@/lib/auth/client-api";
import { DISPLAY_NAME_MAX_LENGTH, LOGIN_ID_PATTERN } from "@/lib/auth/identifiers";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { ROLES, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import type { PeopleCrm } from "@/lib/console/people-types";
import { SUPER_ADMIN_CLI, type CrmArea, type SuperAdminEntry, type SuperAdminList } from "@/lib/crm/lead-ops-types";
import { CRM_ROLES, type CrmRole } from "@/lib/crm/types";

/** What the admin API returns for each account (`PublicUser`): never a password or hash. */
export type AdminUserView = {
  id: string;
  role: Role;
  displayName: string;
  loginId: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt?: string;
  linkedStudentIds?: string[];
  linkedParentIds?: string[];
  /** Staff accounts: CRM role, access, areas, away status and open enquiries (null = no CRM membership yet). */
  crm?: PeopleCrm | null;
};

/** People list words (src/i18n/messages/{en,hi}/console-people.ts, admin console 1b §5.L). */
export type ConsolePeopleMessages = typeof consolePeopleEn;

export type UserManagerMessages = {
  users: Messages<"portal">["admin"]["users"];
  errors: Messages<"portal">["errors"];
  roles: Messages<"auth">["roles"];
  people: ConsolePeopleMessages;
};

type UsersT = UserManagerMessages["users"];
type TempPassword = { name: string; loginId: string; password: string };
type Confirmation = { kind: "disable" | "reset"; user: AdminUserView };
type SuperAdminChange = { user: AdminUserView; grant: boolean };
type RoleFilter = "all" | Role;
type StatusFilter = "all" | "active" | "disabled";

const PAGE_PATH = "/admin/users";

/** The role chips, in the order the People list shows them (§5.L). */
export const ROLE_CHIPS = ["all", "staff", "admin", "student", "parent"] as const satisfies readonly RoleFilter[];

/** How many accounts each chip holds (all statuses, before the search). */
export function countByRole(users: readonly AdminUserView[]): Record<(typeof ROLE_CHIPS)[number], number> {
  const counts = { all: users.length, staff: 0, admin: 0, student: 0, parent: 0 };
  for (const user of users) counts[user.role] += 1;
  return counts;
}

/** An area's name in the page language, marked when it is no longer in use. */
function areaLabel(area: { en: string; hi: string; active: boolean }, locale: Locale, inactive: string): string {
  const name = locale === "hi" ? area.hi || area.en : area.en;
  return area.active ? name : format(inactive, { name });
}

function isUser(user: AdminUserView | undefined): user is AdminUserView {
  return user !== undefined;
}

/** Client-side filter (role, status, name / login-id search). */
export function filterUsers(
  users: readonly AdminUserView[],
  filter: { role: RoleFilter; status: StatusFilter; query: string },
): AdminUserView[] {
  const query = filter.query.trim().toLowerCase();
  return users.filter(
    (user) =>
      (filter.role === "all" || user.role === filter.role) &&
      (filter.status === "all" || user.disabled === (filter.status === "disabled")) &&
      (!query || user.displayName.toLowerCase().includes(query) || user.loginId.includes(query)),
  );
}

/**
 * Localised copy for a failed admin API call (the server's English text is never shown). Takes only
 * the portal messages it reads, so callers without the People words can use it too.
 */
export function adminFailureMessage(result: ApiFailure, m: Pick<UserManagerMessages, "users" | "errors">, minutes = retryAfterMinutes): string {
  if (result.error === "unauthenticated") return m.errors.sessionExpired;
  if (result.known === "passwordChangeRequired") return m.errors.passwordChangeRequired;
  const known = result.known;
  if (known && known in m.users.errors) return m.users.errors[known as keyof UsersT["errors"]];
  switch (result.error) {
    case "forbidden":
      return m.errors.forbidden;
    case "not_found":
      return m.users.errors.userNotFound;
    case "not_configured":
      return m.errors.notConfigured;
    case "network":
      return m.errors.network;
    case "rate_limited":
      return format(m.errors.rateLimited, { minutes: minutes(result.retryAfterSeconds) });
    case "validation":
    case "bad_request":
      return m.errors.validation;
    default:
      return m.errors.server;
  }
}

/**
 * Admin user management (D-029) on top of `/api/admin/users/**`: list with filters, create
 * (the generated temporary password is shown ONCE in a dialog, then dropped from memory),
 * rename, disable / enable, reset password (new temporary password shown once) and
 * parent↔student links. Every write is same-origin JSON; the server re-checks the admin role,
 * refuses self-disable / self-reset / removing the last admin, and audits each change.
 */
export function UserManager({
  initialUsers,
  currentUserId,
  messages: m,
  centreNames = {},
}: {
  initialUsers: AdminUserView[];
  currentUserId: string;
  messages: UserManagerMessages;
  /** Centre slug → name in the page language, for the older centre scope on staff rows. */
  centreNames?: Readonly<Record<string, string>>;
}) {
  const t = m.users;
  const p = m.people;
  const locale = useLocale();
  const [users, setUsers] = useState<AdminUserView[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [temp, setTemp] = useState<TempPassword | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string; error?: string } | null>(null);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  // Super admins (D-044): who they are, and whether the viewer is one (decides what is offered;
  // the server enforces the same rules on every call).
  const [superAdmins, setSuperAdmins] = useState<SuperAdminList | null>(null);
  const [saChange, setSaChange] = useState<SuperAdminChange | null>(null);
  const filterIds = useId();
  const sa = t.superAdmin;
  const youAreSuperAdmin = superAdmins?.youAreSuperAdmin === true;
  // Every ACTIVE grant, effective or not: a disabled account with a live grant is protected too (H1)
  // and its grant can still be revoked by a super admin.
  const grants = useMemo(() => new Map((superAdmins?.items ?? []).map((item) => [item.userId, item])), [superAdmins]);

  useEffect(() => {
    let cancelled = false;
    void callApi<SuperAdminList>("/api/admin/super-admins").then((result) => {
      if (!cancelled && result.ok) setSuperAdmins(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const students = useMemo(() => users.filter((user) => user.role === "student"), [users]);
  const visible = filterUsers(users, { role: roleFilter, status: statusFilter, query });
  const roleCounts = useMemo(() => countByRole(users), [users]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeZone: "Asia/Kolkata" }),
    [locale],
  );

  /** Shows the failure; on 401 / pending temporary password it also leaves the page. */
  function fail(result: ApiFailure): string {
    const message = adminFailureMessage(result, m);
    if (result.error === "unauthenticated") window.location.assign(buildLoginHref(PAGE_PATH, locale));
    else if (result.known === "passwordChangeRequired") window.location.assign(buildChangePasswordHref(locale, PAGE_PATH));
    return message;
  }

  function succeed(message: string) {
    setPageError(null);
    setAnnouncement(message);
  }

  async function refresh() {
    setRefreshing(true);
    const result = await callApi<AdminUserView[]>("/api/admin/users");
    setRefreshing(false);
    if (result.ok) setUsers(result.data);
    else setPageError(fail(result));
  }

  async function run<T>(request: () => Promise<{ ok: true; data: T } | ApiFailure>): Promise<T | null> {
    setBusy(true);
    setAnnouncement("");
    try {
      const result = await request();
      if (!result.ok) {
        setPageError(fail(result));
        return null;
      }
      return result.data;
    } finally {
      setBusy(false);
    }
  }

  const userUrl = (id: string) => `/api/admin/users/${encodeURIComponent(id)}`;

  async function setDisabled(user: AdminUserView, disabled: boolean) {
    const data = await run(() => callApi<{ user: AdminUserView }>(userUrl(user.id), { method: "PATCH", body: { disabled } }));
    if (!data) return;
    succeed(format(disabled ? t.announce.disabled : t.announce.enabled, { name: user.displayName }));
    await refresh();
  }

  async function resetPassword(user: AdminUserView) {
    const data = await run(() =>
      callApi<{ user: AdminUserView; temporaryPassword: string }>(`${userUrl(user.id)}/reset-password`, { method: "POST" }),
    );
    if (!data) return;
    setTemp({ name: data.user.displayName, loginId: data.user.loginId, password: data.temporaryPassword });
    succeed(format(t.announce.reset, { name: data.user.displayName }));
    await refresh();
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renaming) return;
    const value = renaming.value.trim().replace(/\s+/g, " ");
    if (!value) return setRenaming({ ...renaming, error: t.errors.displayNameRequired });
    if (Array.from(value).length > DISPLAY_NAME_MAX_LENGTH) return setRenaming({ ...renaming, error: t.errors.invalidDisplayName });
    const data = await run(() =>
      callApi<{ user: AdminUserView }>(userUrl(renaming.id), { method: "PATCH", body: { displayName: value } }),
    );
    if (!data) return;
    setRenaming(null);
    succeed(format(t.announce.renamed, { name: data.user.displayName }));
    await refresh();
  }

  async function setLink(parent: AdminUserView, studentId: string, linked: boolean) {
    const student = byId.get(studentId);
    const data = await run(() =>
      callApi<{ changed: boolean }>(`${userUrl(parent.id)}/links/${encodeURIComponent(studentId)}`, {
        method: linked ? "PUT" : "DELETE",
      }),
    );
    if (!data) return;
    setLinkChoice((current) => ({ ...current, [parent.id]: "" }));
    succeed(
      format(linked ? t.announce.linked : t.announce.unlinked, {
        student: student?.displayName ?? studentId,
        parent: parent.displayName,
      }),
    );
    await refresh();
  }

  function grantLine(entry: SuperAdminEntry): string {
    const date = dateFormat.format(new Date(entry.grantedAt));
    if (entry.via === "bootstrap") return format(sa.setAutomatically, { name: entry.displayName, date });
    if (entry.via === "cli" || !entry.grantedBy) return format(sa.grantedOnServer, { name: entry.displayName, date });
    return format(sa.grantedBy, { name: entry.displayName, by: entry.grantedBy.displayName, date });
  }

  async function confirmAction() {
    const current = confirmation;
    setConfirmation(null);
    if (!current) return;
    if (current.kind === "disable") await setDisabled(current.user, true);
    else await resetPassword(current.user);
  }

  return (
    <div className="grid gap-6">
      {superAdmins && (
        <section aria-labelledby="admin-super-admins" className="rounded-card border border-[#f2dfa0] bg-[#fffdf5] p-5 shadow-soft md:p-6">
          <h2 id="admin-super-admins" className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-navy">
            <ShieldCheck aria-hidden="true" className="size-5 text-[#7a5600]" />
            {sa.listTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">{sa.listIntro}</p>
          {superAdmins.bootstrapPending ? (
            <Notice variant="warning" className="mt-3">
              {format(sa.noneBanner, { command: SUPER_ADMIN_CLI })}
            </Notice>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {superAdmins.items
                .filter((item) => item.effective)
                .map((item) => (
                  <li key={item.userId}>{grantLine(item)}</li>
                ))}
            </ul>
          )}
          {!youAreSuperAdmin && <p className="mt-3 text-sm text-muted">{sa.staffOnlySuperAdmin}</p>}
        </section>
      )}

      <CreateUserForm
        m={m}
        allowStaff={superAdmins === null || youAreSuperAdmin}
        onCreated={async (user, password) => {
          setTemp({ name: user.displayName, loginId: user.loginId, password });
          succeed(format(t.announce.created, { name: user.displayName }));
          await refresh();
        }}
        onFailure={fail}
      />

      <section aria-labelledby="admin-users-list" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="admin-users-list" className="text-lg font-extrabold text-navy">
              {t.listTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {format(t.count, { shown: visible.length, total: users.length })}
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing || busy}>
            <RefreshCw aria-hidden="true" className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} />
            {refreshing ? t.refreshing : t.refresh}
          </Button>
        </div>

        <div role="group" aria-label={p.chips.label} className="mb-3 flex flex-wrap gap-2">
          {ROLE_CHIPS.map((chip) => {
            const pressed = roleFilter === chip;
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={pressed}
                onClick={() => setRoleFilter(chip)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                  pressed ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue",
                )}
              >
                {format(p.chips.withCount, { label: p.chips[chip], count: roleCounts[chip] })}
              </button>
            );
          })}
        </div>

        <fieldset className="mb-4 grid gap-3 rounded-control bg-[#f8fbff] p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <legend className="sr-only">{t.filtersLabel}</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${filterIds}-status`} className="text-xs font-bold text-[#354b66]">
              {t.filterStatus}
            </label>
            <select
              id={`${filterIds}-status`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className={cn(inputClasses, "border-[#b9cbe0]")}
            >
              <option value="all">{t.all}</option>
              <option value="active">{t.active}</option>
              <option value="disabled">{t.disabled}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${filterIds}-search`} className="text-xs font-bold text-[#354b66]">
              {t.search}
            </label>
            <input
              id={`${filterIds}-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              className={cn(inputClasses, "border-[#b9cbe0]")}
            />
          </div>
        </fieldset>

        {pageError && (
          <Notice variant="error" role="alert" className="mb-4">
            {pageError}
          </Notice>
        )}
        <div role="status" className={cn(announcement ? "mb-4" : "sr-only")}>
          {announcement && <Notice variant="success">{announcement}</Notice>}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-6 text-center text-muted">
            {t.empty}
          </p>
        ) : (
          <ul className="grid gap-3">
            {visible.map((user) => {
              const self = user.id === currentUserId;
              const linkedStudents = (user.linkedStudentIds ?? []).map((id) => byId.get(id)).filter(isUser);
              const linkedParents = (user.linkedParentIds ?? []).map((id) => byId.get(id)).filter(isUser);
              const available = students.filter((student) => !(user.linkedStudentIds ?? []).includes(student.id));
              const choiceId = `${filterIds}-link-${user.id}`;
              const grant = grants.get(user.id);
              // Staff logins and super admins' accounts are changed by super admins only (D-044, Q7, H1).
              const protectedTarget = superAdmins !== null && !youAreSuperAdmin && (user.role === "staff" || (grant !== undefined && !self));
              // Grant: enabled admins only. Revoke: any live grant, including a disabled account's.
              const canToggleSuperAdmin = youAreSuperAdmin && user.role === "admin" && (grant !== undefined || !user.disabled);
              return (
                <li key={user.id} className={cn("rounded-control border border-line p-4", user.disabled ? "bg-[#f8f9fb]" : "bg-white")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 break-words font-bold text-navy">
                        {user.displayName}
                        {self && <Badge variant="info">{t.you}</Badge>}
                        {grant?.effective && <SuperAdminBadge label={sa.badge} />}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted">
                        {t.loginId}:{" "}
                        <span lang="en" className="font-mono text-ink">
                          {user.loginId}
                        </span>
                      </p>
                      <p className="text-xs text-muted" suppressHydrationWarning>
                        {format(t.created, { date: dateFormat.format(new Date(user.createdAt)) })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="info">{m.roles[user.role]}</Badge>
                      <Badge variant={user.disabled ? "warning" : "success"}>{user.disabled ? t.disabled : t.active}</Badge>
                      {user.mustChangePassword && <Badge variant="neutral">{t.mustChange}</Badge>}
                    </div>
                  </div>

                  {user.role === "parent" && (
                    <div className="mt-3 rounded-md bg-[#f8fbff] p-3">
                      <p className="text-xs font-bold text-[#354b66]">{t.linkedLearners}</p>
                      {linkedStudents.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {linkedStudents.map((student) => (
                            <li
                              key={student.id}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-3 pr-0.5 text-sm"
                            >
                              <span className={cn(student.disabled && "text-muted line-through")}>{student.displayName}</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setLink(user, student.id, false)}
                                aria-label={format(t.unlinkLabel, { student: student.displayName, parent: user.displayName })}
                                className="inline-flex min-h-9 items-center rounded-full px-2.5 text-xs font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
                              >
                                {t.unlink}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-sm text-muted">{t.none}</p>
                      )}
                      {available.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
                            <label htmlFor={choiceId} className="text-xs font-bold text-[#354b66]">
                              {t.addLink}
                            </label>
                            <select
                              id={choiceId}
                              value={linkChoice[user.id] ?? ""}
                              onChange={(event) => setLinkChoice((current) => ({ ...current, [user.id]: event.target.value }))}
                              className={cn(inputClasses, "border-[#b9cbe0]")}
                            >
                              <option value="">{t.chooseStudent}</option>
                              {available.map((student) => (
                                <option key={student.id} value={student.id}>
                                  {student.displayName} ({student.loginId})
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button
                            variant="outline"
                            disabled={busy || !linkChoice[user.id]}
                            onClick={() => setLink(user, linkChoice[user.id], true)}
                          >
                            <Link2 aria-hidden="true" className="size-4" />
                            {t.link}
                          </Button>
                        </div>
                      ) : (
                        students.length === 0 && <p className="mt-2 text-sm text-muted">{t.noStudents}</p>
                      )}
                    </div>
                  )}

                  {user.role === "student" && (
                    <p className="mt-3 text-sm text-muted">
                      <span className="font-bold text-[#354b66]">{t.linkedParents}:</span>{" "}
                      {linkedParents.length ? linkedParents.map((parent) => parent.displayName).join(", ") : t.none}
                    </p>
                  )}

                  {user.role === "staff" && <StaffFacts user={user} p={p} locale={locale} dateFormat={dateFormat} centreNames={centreNames} />}

                  {renaming?.id === user.id && (
                    <form onSubmit={saveRename} noValidate className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-[#f8fbff] p-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
                        <label htmlFor={`${choiceId}-rename`} className="text-xs font-bold text-[#354b66]">
                          {format(t.renameTitle, { name: user.displayName })}
                        </label>
                        <input
                          id={`${choiceId}-rename`}
                          value={renaming.value}
                          onChange={(event) => setRenaming({ id: user.id, value: event.target.value })}
                          autoComplete="off"
                          autoFocus
                          aria-invalid={renaming.error ? true : undefined}
                          aria-describedby={describedBy(`${choiceId}-rename`, false, Boolean(renaming.error))}
                          className={cn(inputClasses, renaming.error ? "border-danger" : "border-[#b9cbe0]")}
                        />
                        {renaming.error && (
                          <p id={`${choiceId}-rename-error`} className="text-sm font-semibold text-danger">
                            {renaming.error}
                          </p>
                        )}
                      </div>
                      <Button type="submit" variant="dark" disabled={busy}>
                        {busy ? t.saving : t.save}
                      </Button>
                      <Button variant="outline" onClick={() => setRenaming(null)}>
                        {t.cancel}
                      </Button>
                    </form>
                  )}

                  {grant && <p className="mt-2 text-xs text-[#5c4a12]">{grantLine(grant)}</p>}
                  {protectedTarget && <p className="mt-2 text-xs text-muted">{user.role === "staff" ? sa.staffOnlySuperAdmin : t.errors.superAdminTarget}</p>}

                  <div role="group" aria-label={format(t.actionsFor, { name: user.displayName })} className="mt-3 flex flex-wrap gap-2">
                    {canToggleSuperAdmin && (
                      <Button variant="outline" disabled={busy} onClick={() => setSaChange({ user, grant: !grant })}>
                        {grant ? <ShieldOff aria-hidden="true" className="size-4" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
                        {grant ? sa.revoke : sa.grant}
                      </Button>
                    )}
                    {!protectedTarget && (
                      <Button variant="outline" disabled={busy} onClick={() => setRenaming({ id: user.id, value: user.displayName })}>
                        <Pencil aria-hidden="true" className="size-4" />
                        {t.rename}
                      </Button>
                    )}
                    {!self && !protectedTarget && (
                      <Button variant="outline" disabled={busy} onClick={() => setConfirmation({ kind: "reset", user })}>
                        <KeyRound aria-hidden="true" className="size-4" />
                        {t.resetPassword}
                      </Button>
                    )}
                    {!self &&
                      !protectedTarget &&
                      (user.disabled ? (
                        <Button variant="outline" disabled={busy} onClick={() => setDisabled(user, false)}>
                          <CircleCheck aria-hidden="true" className="size-4" />
                          {t.enable}
                        </Button>
                      ) : (
                        <Button variant="outline" disabled={busy} onClick={() => setConfirmation({ kind: "disable", user })}>
                          <Ban aria-hidden="true" className="size-4" />
                          {t.disable}
                        </Button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={confirmation !== null} titleId="admin-confirm-title" onClose={() => setConfirmation(null)}>
        {confirmation && (
          <div className="p-5 md:p-6">
            <h2 id="admin-confirm-title" className="text-lg font-extrabold text-navy">
              {format(confirmation.kind === "disable" ? t.disableTitle : t.resetTitle, { name: confirmation.user.displayName })}
            </h2>
            <p className="mt-2 text-muted">{confirmation.kind === "disable" ? t.disableBody : t.resetBody}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmation(null)}>
                {t.cancel}
              </Button>
              <Button variant="dark" onClick={confirmAction}>
                {t.confirm}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={temp !== null} titleId="admin-temp-title" onClose={() => setTemp(null)}>
        {temp && <TempPasswordContent temp={temp} t={t} onDone={() => setTemp(null)} />}
      </Modal>

      <Modal open={saChange !== null} titleId="admin-sa-title" onClose={() => setSaChange(null)}>
        {saChange && (
          <SuperAdminChangeForm
            change={saChange}
            m={m}
            onCancel={() => setSaChange(null)}
            onDone={(list) => {
              setSuperAdmins(list);
              succeed(format(saChange.grant ? sa.granted : sa.revoked, { name: saChange.user.displayName }));
              setSaChange(null);
            }}
            onFailure={fail}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * A staff account's CRM facts (admin console 1b §5.L): CRM role, access, lead-routing areas, the
 * older centre scope, "Away until" and open enquiries, with links to where they are changed.
 */
export function StaffFacts({
  user,
  p,
  locale,
  dateFormat,
  centreNames = {},
}: {
  user: AdminUserView;
  p: ConsolePeopleMessages;
  locale: Locale;
  dateFormat: Intl.DateTimeFormat;
  /** Centre slug → name in the page language; an unknown slug is shown as written. */
  centreNames?: Readonly<Record<string, string>>;
}) {
  const crm = user.crm ?? null;
  const s = p.staff;
  const linkClass = "inline-flex min-h-11 items-center font-bold text-blue underline-offset-2 hover:underline";
  return (
    <div role="group" aria-label={format(s.detailsLabel, { name: user.displayName })} className="mt-3 rounded-md bg-[#f8fbff] p-3 text-sm">
      {crm ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="info">{s.crmRole[crm.crmRole]}</Badge>
            <Badge variant={crm.active ? "success" : "warning"}>{crm.active ? s.access.active : s.access.inactive}</Badge>
            {crm.awayUntil && (
              <Badge variant="warning">
                <span suppressHydrationWarning>{format(s.away, { date: dateFormat.format(new Date(crm.awayUntil)) })}</span>
              </Badge>
            )}
          </div>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
            <dt className="font-bold text-[#354b66]">{s.areas}</dt>
            <dd className="min-w-0 break-words">{crm.areaNames.length ? crm.areaNames.map((area) => areaLabel(area, locale, s.areaInactive)).join(", ") : s.noAreas}</dd>
            <dt className="font-bold text-[#354b66]">{s.centres}</dt>
            <dd className="min-w-0 break-words">
              {crm.centreSlugs.length
                ? crm.centreSlugs.map((slug, index) => (
                    <Fragment key={slug}>
                      {index > 0 && ", "}
                      {centreNames[slug] ?? (
                        <span lang="en" translate="no">
                          {slug}
                        </span>
                      )}
                    </Fragment>
                  ))
                : s.everyCentre}
            </dd>
            <dt className="font-bold text-[#354b66]">{s.openLeads}</dt>
            <dd className="tabular-nums">{crm.openLeads}</dd>
          </dl>
        </>
      ) : (
        <p className="text-muted">{s.noMembership}</p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-4">
        <Link href={localePath("/crm/settings/areas", locale)} className={linkClass}>
          {s.areasLink}
        </Link>
        <Link href={localePath("/crm/staff", locale)} className={linkClass}>
          {s.rulesLink}
        </Link>
      </p>
    </div>
  );
}

/** Native modal `<dialog>` (focus trap, Esc to close, inert background). */
function Modal({
  open,
  titleId,
  onClose,
  children,
}: {
  open: boolean;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-surface="light"
      className="m-auto w-[min(92vw,34rem)] rounded-card border border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60"
    >
      {children}
    </dialog>
  );
}

function TempPasswordContent({ temp, t, onDone }: { temp: TempPassword; t: UsersT; onDone: () => void }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const codeRef = useRef<HTMLElement>(null);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(temp.password);
      setCopy("copied");
    } catch {
      setCopy("failed");
      const element = codeRef.current;
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div className="p-5 md:p-6">
      <h2 id="admin-temp-title" className="text-lg font-extrabold text-navy">
        {format(t.tempTitle, { name: temp.name })}
      </h2>
      <div className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{format(t.tempWarning, { name: temp.name })}</p>
      </div>
      <dl className="mt-4 grid gap-3">
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{t.tempLoginId}</dt>
          <dd lang="en" className="font-mono text-ink">
            {temp.loginId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{t.tempPassword}</dt>
          <dd className="mt-1">
            <code
              ref={codeRef}
              lang="en"
              translate="no"
              className="block select-all break-all rounded-control border border-line bg-[#f4f7fb] px-3 py-2 font-mono text-lg font-bold tracking-wide text-navy"
            >
              {temp.password}
            </code>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">{t.tempNext}</p>
      <p role="status" className="mt-2 min-h-5 text-sm font-semibold">
        {copy === "copied" ? <span className="text-success">{t.copied}</span> : copy === "failed" ? <span className="text-danger">{t.copyFailed}</span> : ""}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={copyPassword}>
          <Copy aria-hidden="true" className="size-4" />
          {t.copy}
        </Button>
        <Button variant="dark" onClick={onDone}>
          {t.done}
        </Button>
      </div>
    </div>
  );
}

/**
 * Grant / revoke super admin (D-044): the SA re-enters their current password; the server checks
 * it (5 tries per 15 minutes), refuses the last super admin (409) and non-admin targets (422).
 */
function SuperAdminChangeForm({
  change,
  m,
  onCancel,
  onDone,
  onFailure,
}: {
  change: SuperAdminChange;
  m: UserManagerMessages;
  onCancel: () => void;
  onDone: (list: SuperAdminList) => void;
  onFailure: (result: ApiFailure) => string;
}) {
  const t = m.users;
  const sa = t.superAdmin;
  const id = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError(sa.passwordRequired);
      return;
    }
    setPending(true);
    const result = await callApi<SuperAdminList>(`/api/admin/super-admins/${encodeURIComponent(change.user.id)}`, {
      method: "PUT",
      body: { superAdmin: change.grant, currentPassword: password },
    });
    setPending(false);
    setPassword("");
    if (result.ok) {
      onDone(result.data);
      return;
    }
    if (result.error === "validation" && "currentPassword" in result.fieldErrors) setError(t.errors.wrongPassword);
    else setError(onFailure(result));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="p-5 md:p-6">
      <h2 id="admin-sa-title" className="text-lg font-extrabold text-navy">
        {format(change.grant ? sa.grantTitle : sa.revokeTitle, { name: change.user.displayName })}
      </h2>
      <p className="mt-2 text-muted">{change.grant ? sa.grantBody : sa.revokeBody}</p>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="text-sm font-bold text-navy">
          {sa.password}
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(`${id}-password`, true, Boolean(error))}
          className={cn(inputClasses, error ? "border-danger" : "border-[#b9cbe0]")}
        />
        <p id={`${id}-password-hint`} className="text-xs text-muted">
          {sa.passwordHint}
        </p>
        {error && (
          <p id={`${id}-password-error`} role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" variant="dark" disabled={pending}>
          {pending ? t.working : sa.confirm}
        </Button>
      </div>
    </form>
  );
}

type CreateErrors = { displayName?: string; loginId?: string; crmRole?: string };

/** Areas a new staff login can join: active ones that were not merged away. */
export function joinableAreas(areas: readonly CrmArea[]): CrmArea[] {
  return areas.filter((area) => area.active && !area.mergedInto);
}

export function CreateUserForm({
  m,
  allowStaff,
  onCreated,
  onFailure,
  initialRole = "student",
}: {
  m: UserManagerMessages;
  /** Staff (CRM) logins are a super-admin action (D-044, Q7). */
  allowStaff: boolean;
  onCreated: (user: AdminUserView, temporaryPassword: string) => Promise<void>;
  onFailure: (result: ApiFailure) => string;
  /** The role selected at first (tests render the staff fields with "staff"). */
  initialRole?: Role;
}) {
  const t = m.users;
  const c = m.people.create;
  const locale = useLocale();
  const id = useId();
  const [role, setRole] = useState<Role>(initialRole);
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  // Staff only (admin console 1b §5.L): the CRM role is chosen on purpose (no preselection) and
  // areas are optional; the server refuses a staff login without a role.
  const [crmRole, setCrmRole] = useState<CrmRole | null>(null);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  // null = not loaded yet (shown as "Loading areas…"); loaded once the staff role is chosen.
  const [areas, setAreas] = useState<CrmArea[] | "failed" | null>(null);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);
  const crmRoleRef = useRef<HTMLInputElement>(null);
  const staff = role === "staff";

  useEffect(() => {
    if (!staff || areas !== null) return;
    let cancelled = false;
    void callApi<CrmArea[]>("/api/crm/areas").then((result) => {
      if (!cancelled) setAreas(result.ok ? joinableAreas(result.data) : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [staff, areas]);

  function focusFirst(next: CreateErrors) {
    if (next.displayName) nameRef.current?.focus();
    else if (next.loginId) loginRef.current?.focus();
    else if (next.crmRole) crmRoleRef.current?.focus();
  }

  function toggleArea(areaId: string, on: boolean) {
    setAreaIds((current) => (on ? [...current.filter((value) => value !== areaId), areaId] : current.filter((value) => value !== areaId)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const name = displayName.trim().replace(/\s+/g, " ");
    const login = loginId.trim().toLowerCase();
    const next: CreateErrors = {};
    if (!name) next.displayName = t.errors.displayNameRequired;
    else if (Array.from(name).length > DISPLAY_NAME_MAX_LENGTH) next.displayName = t.errors.invalidDisplayName;
    if (!login) next.loginId = t.errors.loginIdRequired;
    else if (!LOGIN_ID_PATTERN.test(login)) next.loginId = t.errors.invalidLoginId;
    if (staff && !crmRole) next.crmRole = c.crmRoleRequired;
    setErrors(next);
    setFormError(null);
    if (next.displayName || next.loginId || next.crmRole) return focusFirst(next);

    setPending(true);
    const body: Record<string, unknown> = { role, displayName: name, loginId: login };
    if (staff && crmRole) body.crm = { crmRole, centreSlugs: [], areaIds };
    const result = await callApi<{ user: AdminUserView; temporaryPassword: string }>("/api/admin/users", { body });
    setPending(false);
    if (result.ok) {
      setDisplayName("");
      setLoginId("");
      setCrmRole(null);
      setAreaIds([]);
      await onCreated(result.data.user, result.data.temporaryPassword);
      return;
    }
    if (result.error === "validation" && Object.keys(result.fieldErrors).length) {
      const fields: CreateErrors = {};
      if ("loginId" in result.fieldErrors) {
        fields.loginId = result.fieldErrors.loginId === "loginIdTaken" ? t.errors.loginIdTaken : t.errors.invalidLoginId;
      }
      if ("displayName" in result.fieldErrors) fields.displayName = t.errors.invalidDisplayName;
      if ("crm" in result.fieldErrors || "crm.crmRole" in result.fieldErrors) fields.crmRole = c.crmRoleRequired;
      const areaProblem = "crm.areaIds" in result.fieldErrors;
      if (areaProblem) {
        // An area changed since the list loaded: reload it and let the admin choose again.
        setAreas(null);
        setAreaIds([]);
        setFormError(c.areasFailed);
      }
      setErrors(fields);
      focusFirst(fields);
      if (Object.keys(fields).length > 0 || areaProblem) return;
    }
    setFormError(onFailure(result));
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {t.createTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.createDescription}</p>
      <form noValidate onSubmit={onSubmit} aria-busy={pending || undefined} className="mt-4 grid gap-4 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className="text-sm font-bold text-navy">
            {t.role}
          </label>
          <select
            id={`${id}-role`}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as Role);
              setErrors((current) => ({ ...current, crmRole: undefined }));
            }}
            className={cn(inputClasses, "border-[#b9cbe0]")}
          >
            {ROLES.filter((option) => allowStaff || option !== "staff").map((option) => (
              <option key={option} value={option}>
                {m.roles[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-bold text-navy">
            {t.displayName}
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            aria-invalid={errors.displayName ? true : undefined}
            aria-describedby={describedBy(`${id}-name`, true, Boolean(errors.displayName))}
            className={cn(inputClasses, errors.displayName ? "border-danger" : "border-[#b9cbe0]")}
          />
          <p id={`${id}-name-hint`} className="text-xs text-muted">
            {t.displayNameHint}
          </p>
          {errors.displayName && (
            <p id={`${id}-name-error`} className="text-sm font-semibold text-danger">
              {errors.displayName}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-login`} className="text-sm font-bold text-navy">
            {t.loginId}
          </label>
          <input
            ref={loginRef}
            id={`${id}-login`}
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
            aria-invalid={errors.loginId ? true : undefined}
            aria-describedby={describedBy(`${id}-login`, true, Boolean(errors.loginId))}
            className={cn(inputClasses, "font-mono", errors.loginId ? "border-danger" : "border-[#b9cbe0]")}
          />
          <p id={`${id}-login-hint`} className="text-xs text-muted">
            {t.loginIdHint}
          </p>
          {errors.loginId && (
            <p id={`${id}-login-error`} className="text-sm font-semibold text-danger">
              {errors.loginId}
            </p>
          )}
        </div>

        {staff && (
          <div className="grid gap-4 md:col-span-3 md:grid-cols-2">
            <fieldset
              aria-describedby={errors.crmRole ? `${id}-crm-hint ${id}-crm-error` : `${id}-crm-hint`}
              className={cn("min-w-0 rounded-control border p-3", errors.crmRole ? "border-danger" : "border-[#d7e3f0]")}
            >
              <legend className="px-1 text-sm font-bold text-navy">{c.crmRole}</legend>
              <p id={`${id}-crm-hint`} className="text-xs text-muted">
                {c.crmRoleHint}
              </p>
              <div className="mt-2 grid gap-1">
                {CRM_ROLES.map((option, index) => (
                  <label key={option} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                      ref={index === 0 ? crmRoleRef : undefined}
                      type="radio"
                      name={`${id}-crm-role`}
                      value={option}
                      checked={crmRole === option}
                      required
                      onChange={() => {
                        setCrmRole(option);
                        setErrors((current) => ({ ...current, crmRole: undefined }));
                      }}
                      className="size-5 accent-navy"
                    />
                    {m.people.staff.crmRole[option]}
                  </label>
                ))}
              </div>
              {errors.crmRole && (
                <p id={`${id}-crm-error`} className="mt-1 text-sm font-semibold text-danger">
                  {errors.crmRole}
                </p>
              )}
            </fieldset>

            <fieldset aria-describedby={`${id}-areas-hint`} className="min-w-0 rounded-control border border-[#d7e3f0] p-3">
              <legend className="px-1 text-sm font-bold text-navy">{c.areas}</legend>
              <p id={`${id}-areas-hint`} className="text-xs text-muted">
                {c.areasHint}
              </p>
              {areas === null ? (
                <p role="status" className="mt-2 text-sm text-muted">
                  {c.areasLoading}
                </p>
              ) : areas === "failed" ? (
                <p className="mt-2 text-sm text-muted">{c.areasFailed}</p>
              ) : areas.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{c.noAreasYet}</p>
              ) : (
                <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                  {areas.map((area) => (
                    <label key={area.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        value={area.id}
                        checked={areaIds.includes(area.id)}
                        onChange={(event) => toggleArea(area.id, event.target.checked)}
                        className="size-5 accent-navy"
                      />
                      {areaLabel({ en: area.nameEn, hi: area.nameHi, active: area.active }, locale, c.areaInactive)}
                    </label>
                  ))}
                </div>
              )}
              {areaIds.length === 0 && (
                <p className="mt-2 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-2 text-sm text-[#5c4a12]">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>{c.noAreasWarning}</span>
                </p>
              )}
            </fieldset>
          </div>
        )}

        <div className="md:col-span-3">
          {formError && (
            <Notice variant="error" role="alert" className="mb-3">
              {formError}
            </Notice>
          )}
          <Button type="submit" variant="dark" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <UserPlus aria-hidden="true" className="size-4" />
            )}
            {pending ? t.creating : t.create}
          </Button>
        </div>
      </form>
    </section>
  );
}
