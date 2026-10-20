"use client";

import { Ban, CircleCheck, Copy, KeyRound, Link2, LoaderCircle, Pencil, RefreshCw, TriangleAlert, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { describedBy, inputClasses } from "@/components/auth/fields";
import { Badge, Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { callApi, retryAfterMinutes, type ApiFailure } from "@/lib/auth/client-api";
import { DISPLAY_NAME_MAX_LENGTH, LOGIN_ID_PATTERN } from "@/lib/auth/identifiers";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { ROLES, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";

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
};

export type UserManagerMessages = {
  users: Messages<"portal">["admin"]["users"];
  errors: Messages<"portal">["errors"];
  roles: Messages<"auth">["roles"];
};

type UsersT = UserManagerMessages["users"];
type TempPassword = { name: string; loginId: string; password: string };
type Confirmation = { kind: "disable" | "reset"; user: AdminUserView };
type RoleFilter = "all" | Role;
type StatusFilter = "all" | "active" | "disabled";

const PAGE_PATH = "/admin/users";

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

/** Localised copy for a failed admin API call (the server's English text is never shown). */
export function adminFailureMessage(result: ApiFailure, m: UserManagerMessages, minutes = retryAfterMinutes): string {
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
}: {
  initialUsers: AdminUserView[];
  currentUserId: string;
  messages: UserManagerMessages;
}) {
  const t = m.users;
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
  const filterIds = useId();

  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const students = useMemo(() => users.filter((user) => user.role === "student"), [users]);
  const visible = filterUsers(users, { role: roleFilter, status: statusFilter, query });
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

  async function confirmAction() {
    const current = confirmation;
    setConfirmation(null);
    if (!current) return;
    if (current.kind === "disable") await setDisabled(current.user, true);
    else await resetPassword(current.user);
  }

  return (
    <div className="grid gap-6">
      <CreateUserForm
        m={m}
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

        <fieldset className="mb-4 grid gap-3 rounded-control bg-[#f8fbff] p-3 sm:grid-cols-[repeat(2,minmax(0,12rem))_minmax(0,1fr)]">
          <legend className="sr-only">{t.filtersLabel}</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${filterIds}-role`} className="text-xs font-bold text-[#354b66]">
              {t.filterRole}
            </label>
            <select
              id={`${filterIds}-role`}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              className={cn(inputClasses, "border-[#b9cbe0]")}
            >
              <option value="all">{t.all}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {m.roles[role]}
                </option>
              ))}
            </select>
          </div>
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
              return (
                <li key={user.id} className={cn("rounded-control border border-line p-4", user.disabled ? "bg-[#f8f9fb]" : "bg-white")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 break-words font-bold text-navy">
                        {user.displayName}
                        {self && <Badge variant="info">{t.you}</Badge>}
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

                  <div role="group" aria-label={format(t.actionsFor, { name: user.displayName })} className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRenaming({ id: user.id, value: user.displayName })}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      {t.rename}
                    </Button>
                    {!self && (
                      <Button variant="outline" disabled={busy} onClick={() => setConfirmation({ kind: "reset", user })}>
                        <KeyRound aria-hidden="true" className="size-4" />
                        {t.resetPassword}
                      </Button>
                    )}
                    {!self &&
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

function CreateUserForm({
  m,
  onCreated,
  onFailure,
}: {
  m: UserManagerMessages;
  onCreated: (user: AdminUserView, temporaryPassword: string) => Promise<void>;
  onFailure: (result: ApiFailure) => string;
}) {
  const t = m.users;
  const id = useId();
  const [role, setRole] = useState<Role>("student");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [errors, setErrors] = useState<{ displayName?: string; loginId?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);

  function focusFirst(next: { displayName?: string; loginId?: string }) {
    if (next.displayName) nameRef.current?.focus();
    else if (next.loginId) loginRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const name = displayName.trim().replace(/\s+/g, " ");
    const login = loginId.trim().toLowerCase();
    const next: { displayName?: string; loginId?: string } = {};
    if (!name) next.displayName = t.errors.displayNameRequired;
    else if (Array.from(name).length > DISPLAY_NAME_MAX_LENGTH) next.displayName = t.errors.invalidDisplayName;
    if (!login) next.loginId = t.errors.loginIdRequired;
    else if (!LOGIN_ID_PATTERN.test(login)) next.loginId = t.errors.invalidLoginId;
    setErrors(next);
    setFormError(null);
    if (next.displayName || next.loginId) return focusFirst(next);

    setPending(true);
    const result = await callApi<{ user: AdminUserView; temporaryPassword: string }>("/api/admin/users", {
      body: { role, displayName: name, loginId: login },
    });
    setPending(false);
    if (result.ok) {
      setDisplayName("");
      setLoginId("");
      await onCreated(result.data.user, result.data.temporaryPassword);
      return;
    }
    if (result.error === "validation" && Object.keys(result.fieldErrors).length) {
      const fields: { displayName?: string; loginId?: string } = {};
      if ("loginId" in result.fieldErrors) {
        fields.loginId = result.fieldErrors.loginId === "loginIdTaken" ? t.errors.loginIdTaken : t.errors.invalidLoginId;
      }
      if ("displayName" in result.fieldErrors) fields.displayName = t.errors.invalidDisplayName;
      setErrors(fields);
      focusFirst(fields);
      return;
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
            onChange={(event) => setRole(event.target.value as Role)}
            className={cn(inputClasses, "border-[#b9cbe0]")}
          >
            {ROLES.map((option) => (
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
