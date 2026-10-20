"use client";

import { Ban, Copy, KeyRound, LoaderCircle, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent, type Ref } from "react";
import { describedBy, inputClasses } from "@/components/auth/fields";
import { Badge, Button, EmptyState, Notice, type BadgeVariant } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { callApi, retryAfterMinutes, type ApiFailure } from "@/lib/auth/client-api";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";
import { McpDialog } from "./McpDialog";
import {
  claudeCodeCommand,
  hasWriteScope,
  MCP_EXPIRY_DAYS,
  MCP_EXPIRY_OPTIONS,
  normaliseTokenName,
  sortTokens,
  tokenNameIssue,
  type McpScopeChoice,
  type McpTokenCreated,
  type McpTokenStatus,
  type McpTokenView,
} from "./token-view";

type McpT = Messages<"mcp">;

/** Only what the browser needs: the explainer and page copy stay on the server. */
export type McpTokenManagerMessages = {
  mcp: Pick<McpT, "create" | "secret" | "list" | "status" | "scopes" | "revoke" | "announce" | "errors">;
  errors: Messages<"portal">["errors"];
};

const PAGE_PATH = "/admin/mcp";
const API_PATH = "/api/admin/mcp-tokens";

const STATUS_BADGE: Record<McpTokenStatus, BadgeVariant> = {
  active: "success",
  expired: "warning",
  revoked: "neutral",
  creator_inactive: "warning",
};

/** Localised copy for a failed call (the server's English text is never shown). */
export function mcpFailureMessage(result: ApiFailure, m: McpTokenManagerMessages, minutes = retryAfterMinutes): string {
  if (result.error === "unauthenticated") return m.errors.sessionExpired;
  if (result.known === "passwordChangeRequired") return m.errors.passwordChangeRequired;
  switch (result.error) {
    case "forbidden":
      return m.errors.forbidden;
    case "not_found":
      return m.mcp.errors.tokenNotFound;
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

/** Label for a token's scopes ("Read only" / "Read + write"). */
export function scopeLabel(scopes: string, t: McpT["scopes"]): string {
  return hasWriteScope(scopes) ? t.readWrite : t.read;
}

/** Expiry select label: "1 day", "30 days", "90 days (recommended)", "1 year". */
export function expiryLabel(days: number, t: McpT["create"]): string {
  const label = days === 1 ? t.expiryOneDay : days === 365 ? t.expiryOneYear : format(t.expiryDays, { days });
  return days === MCP_EXPIRY_DAYS.default ? format(t.expiryRecommended, { label }) : label;
}

/**
 * Admin management of MCP access tokens on top of `/api/admin/mcp-tokens/**`: create (the
 * plaintext token is shown ONCE in a dialog with a ready-to-paste Claude Code command, then
 * dropped from memory), list with status badges, and revoke after an in-page confirmation.
 * The server re-checks the admin role on every call and audits each change.
 */
export function McpTokenManager({
  initialTokens,
  messages: m,
}: {
  initialTokens: McpTokenView[];
  messages: McpTokenManagerMessages;
}) {
  const t = m.mcp;
  const locale = useLocale();
  const ids = useId();
  const [tokens, setTokens] = useState<McpTokenView[]>(() => sortTokens(initialTokens));
  const [announcement, setAnnouncement] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [secret, setSecret] = useState<McpTokenCreated | null>(null);
  const [confirm, setConfirm] = useState<McpTokenView | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeZone: "Asia/Kolkata" }),
    [locale],
  );
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
    [locale],
  );
  const active = tokens.filter((token) => token.status === "active").length;

  /** Localised failure; on 401 / pending temporary password it also leaves the page. */
  function fail(result: ApiFailure): string {
    const message = mcpFailureMessage(result, m);
    if (result.error === "unauthenticated") window.location.assign(buildLoginHref(PAGE_PATH, locale));
    else if (result.known === "passwordChangeRequired") window.location.assign(buildChangePasswordHref(locale, PAGE_PATH));
    return message;
  }

  async function refresh() {
    setRefreshing(true);
    const result = await callApi<McpTokenView[]>(API_PATH);
    setRefreshing(false);
    if (result.ok) {
      setTokens(sortTokens(result.data));
      setPageError(null);
    } else setPageError(fail(result));
  }

  async function revoke() {
    const token = confirm;
    if (!token || revoking) return;
    setRevoking(true);
    setAnnouncement("");
    const result = await callApi<McpTokenView>(`${API_PATH}/${encodeURIComponent(token.id)}`, { method: "DELETE" });
    setRevoking(false);
    setConfirm(null);
    if (result.ok) {
      setTokens((current) => current.map((item) => (item.id === result.data.id ? result.data : item)));
      setPageError(null);
      setAnnouncement(format(t.announce.revoked, { name: token.name }));
    } else {
      setPageError(fail(result));
    }
    // The revoke button is gone now; put focus somewhere predictable.
    listHeadingRef.current?.focus();
  }

  const formatDate = (iso: string | null, withTime = false) =>
    iso ? (withTime ? dateTimeFormat : dateFormat).format(new Date(iso)) : null;

  return (
    <div className="grid min-w-0 gap-6">
      <CreateTokenForm
        m={m}
        onCreated={(created) => {
          setSecret(created);
          setTokens((current) => sortTokens([created.record, ...current.filter((item) => item.id !== created.record.id)]));
          setPageError(null);
          setAnnouncement(format(t.announce.created, { name: created.record.name }));
        }}
        onFailure={fail}
      />

      <section
        aria-labelledby={`${ids}-list`}
        className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft md:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${ids}-list`} ref={listHeadingRef} tabIndex={-1} className="text-lg font-extrabold text-navy outline-none">
              {t.list.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{format(t.list.count, { total: tokens.length, active })}</p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing || revoking}>
            <RefreshCw aria-hidden="true" className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} />
            {refreshing ? t.list.refreshing : t.list.refresh}
          </Button>
        </div>

        {pageError && (
          <Notice variant="error" role="alert" className="mb-4">
            {pageError}
          </Notice>
        )}
        <div role="status" className={cn(announcement ? "mb-4" : "sr-only")}>
          {announcement && <Notice variant="success">{announcement}</Notice>}
        </div>

        {tokens.length === 0 ? (
          <EmptyState title={t.list.emptyTitle} description={t.list.emptyBody} />
        ) : (
          <TokenTable
            tokens={tokens}
            t={t}
            formatDate={formatDate}
            disabled={revoking}
            onRevoke={(token) => setConfirm(token)}
          />
        )}
      </section>

      <RevokeDialog
        token={confirm}
        t={t.revoke}
        busy={revoking}
        onCancel={() => {
          if (!revoking) setConfirm(null);
        }}
        onConfirm={revoke}
      />

      <SecretDialog
        created={secret}
        t={t}
        expires={secret ? formatDate(secret.record.expiresAt) : null}
        onDone={() => setSecret(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

type FieldErrors = { name?: string; scopes?: string; expiresInDays?: string };

function CreateTokenForm({
  m,
  onCreated,
  onFailure,
}: {
  m: McpTokenManagerMessages;
  onCreated: (created: McpTokenCreated) => void;
  onFailure: (result: ApiFailure) => string;
}) {
  const t = m.mcp;
  const id = useId();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpScopeChoice>("read");
  const [expiry, setExpiry] = useState<number>(MCP_EXPIRY_DAYS.default);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const readRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLSelectElement>(null);

  function focusFirst(next: FieldErrors) {
    if (next.name) nameRef.current?.focus();
    else if (next.scopes) readRef.current?.focus();
    else if (next.expiresInDays) expiryRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const clean = normaliseTokenName(name);
    const issue = tokenNameIssue(clean);
    const next: FieldErrors = issue ? { name: t.errors[issue] } : {};
    setErrors(next);
    setFormError(null);
    if (next.name) return focusFirst(next);

    setPending(true);
    const result = await callApi<McpTokenCreated>(API_PATH, { body: { name: clean, scopes: scope, expiresInDays: expiry } });
    setPending(false);
    if (result.ok) {
      setName("");
      setScope("read");
      setExpiry(MCP_EXPIRY_DAYS.default);
      onCreated(result.data);
      return;
    }
    if (result.error === "validation" && Object.keys(result.fieldErrors).length) {
      const fields: FieldErrors = {};
      if ("name" in result.fieldErrors) fields.name = t.errors.nameLength;
      if ("scopes" in result.fieldErrors) fields.scopes = t.errors.scopeInvalid;
      if ("expiresInDays" in result.fieldErrors) fields.expiresInDays = t.errors.expiryInvalid;
      if (fields.name || fields.scopes || fields.expiresInDays) {
        setErrors(fields);
        focusFirst(fields);
        return;
      }
    }
    setFormError(onFailure(result));
  }

  const write = scope === "read write";

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {t.create.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.create.description}</p>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-busy={pending || undefined}
        className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-bold text-navy">
            {t.create.name}
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={120}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy(`${id}-name`, true, Boolean(errors.name))}
            className={cn(inputClasses, errors.name ? "border-danger" : "border-[#b9cbe0]")}
          />
          <p id={`${id}-name-hint`} className="text-xs text-muted">
            {t.create.nameHint}
          </p>
          {errors.name && (
            <p id={`${id}-name-error`} className="text-sm font-semibold text-danger">
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-expiry`} className="text-sm font-bold text-navy">
            {t.create.expiry}
          </label>
          <select
            ref={expiryRef}
            id={`${id}-expiry`}
            name="expiresInDays"
            value={expiry}
            onChange={(event) => setExpiry(Number(event.target.value))}
            aria-invalid={errors.expiresInDays ? true : undefined}
            aria-describedby={describedBy(`${id}-expiry`, true, Boolean(errors.expiresInDays))}
            className={cn(inputClasses, errors.expiresInDays ? "border-danger" : "border-[#b9cbe0]")}
          >
            {MCP_EXPIRY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {expiryLabel(days, t.create)}
              </option>
            ))}
          </select>
          <p id={`${id}-expiry-hint`} className="text-xs text-muted">
            {t.create.expiryHint}
          </p>
          {errors.expiresInDays && (
            <p id={`${id}-expiry-error`} className="text-sm font-semibold text-danger">
              {errors.expiresInDays}
            </p>
          )}
        </div>

        <fieldset
          className="min-w-0 lg:col-span-2"
          aria-describedby={errors.scopes ? `${id}-scope-error` : undefined}
          aria-invalid={errors.scopes ? true : undefined}
        >
          <legend className="text-sm font-bold text-navy">{t.create.scope}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ScopeOption
              id={`${id}-scope-read`}
              inputRef={readRef}
              checked={!write}
              onSelect={() => setScope("read")}
              label={t.create.scopeRead}
              hint={t.create.scopeReadHint}
            />
            <ScopeOption
              id={`${id}-scope-write`}
              checked={write}
              onSelect={() => setScope("read write")}
              label={t.create.scopeWrite}
              hint={t.create.scopeWriteHint}
              warning
            />
          </div>
          {errors.scopes && (
            <p id={`${id}-scope-error`} className="mt-1.5 text-sm font-semibold text-danger">
              {errors.scopes}
            </p>
          )}
          {write && (
            <div role="note" className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>{t.create.writeWarning}</p>
            </div>
          )}
        </fieldset>

        <div className="min-w-0 lg:col-span-2">
          {formError && (
            <Notice variant="error" role="alert" className="mb-3">
              {formError}
            </Notice>
          )}
          <Button type="submit" variant="dark" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <KeyRound aria-hidden="true" className="size-4" />
            )}
            {pending ? t.create.creating : t.create.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ScopeOption({
  id,
  inputRef,
  checked,
  onSelect,
  label,
  hint,
  warning = false,
}: {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors",
        checked ? (warning ? "border-[#d9b64a] bg-gold-soft" : "border-blue bg-[#eef5ff]") : "border-line bg-white hover:border-[#b9cbe0]",
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="radio"
        name="scopes"
        checked={checked}
        onChange={onSelect}
        aria-describedby={`${id}-hint`}
        className="mt-1 size-4 shrink-0 accent-navy"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-bold text-navy">
          {warning && <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-[#8b5b00]" />}
          {label}
        </span>
        <span id={`${id}-hint`} className="mt-0.5 block text-sm text-muted">
          {hint}
        </span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Token table (a real table on wide screens; stacked rows on small ones)
// ---------------------------------------------------------------------------

function TokenTable({
  tokens,
  t,
  formatDate,
  disabled,
  onRevoke,
}: {
  tokens: McpTokenView[];
  t: McpTokenManagerMessages["mcp"];
  formatDate: (iso: string | null, withTime?: boolean) => string | null;
  disabled: boolean;
  onRevoke: (token: McpTokenView) => void;
}) {
  const c = t.list.columns;
  // Explicit roles keep table semantics when the CSS display changes (stacked layout below xl).
  const cell = "flex min-w-0 flex-wrap items-baseline gap-x-2 py-1 xl:table-cell xl:px-3 xl:py-3 xl:align-top";
  const label = "w-28 shrink-0 text-xs font-bold text-[#354b66] xl:hidden";
  return (
    <table role="table" className="block w-full text-sm xl:table xl:table-fixed xl:border-collapse">
      <caption className="sr-only">{t.list.caption}</caption>
      <thead role="rowgroup" className="sr-only xl:not-sr-only xl:table-header-group">
        <tr role="row" className="border-b border-line text-left text-xs font-bold text-[#354b66]">
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[22%]">{c.name}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[13%]">{c.access}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[13%]">{c.status}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[14%]">{c.createdBy}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[13%]">{c.expires}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[14%]">{c.lastUsed}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[11%]">{c.actions}</th>
        </tr>
      </thead>
      <tbody role="rowgroup" className="grid gap-3 xl:table-row-group">
        {tokens.map((token) => {
          const created = formatDate(token.createdAt);
          const revokedOn = formatDate(token.revokedAt);
          return (
            <tr
              key={token.id}
              role="row"
              className={cn(
                "block rounded-control border border-line p-3 xl:table-row xl:rounded-none xl:border-0 xl:border-b xl:p-0",
                token.status === "active" ? "bg-white" : "bg-[#f8f9fb]",
              )}
            >
              <th role="rowheader" scope="row" className={cn(cell, "text-left font-normal")}>
                <span aria-hidden="true" className={label}>
                  {c.name}
                </span>
                <span className="min-w-0">
                  <span className="block break-words font-bold text-navy">{token.name}</span>
                  {created && (
                    <span className="block text-xs text-muted" suppressHydrationWarning>
                      {c.created}: {created}
                    </span>
                  )}
                </span>
              </th>
              <td role="cell" className={cell}>
                <span aria-hidden="true" className={label}>
                  {c.access}
                </span>
                <Badge variant={hasWriteScope(token.scopes) ? "warning" : "info"}>{scopeLabel(token.scopes, t.scopes)}</Badge>
              </td>
              <td role="cell" className={cell}>
                <span aria-hidden="true" className={label}>
                  {c.status}
                </span>
                <span className="min-w-0">
                  <Badge variant={STATUS_BADGE[token.status]}>{t.status[token.status]}</Badge>
                  {revokedOn && (
                    <span className="mt-1 block text-xs text-muted" suppressHydrationWarning>
                      {format(t.list.revokedOn, { date: revokedOn })}
                    </span>
                  )}
                  {token.status === "creator_inactive" && (
                    <span className="mt-1 block text-xs text-muted">{t.list.creatorInactiveNote}</span>
                  )}
                </span>
              </td>
              <td role="cell" className={cell}>
                <span aria-hidden="true" className={label}>
                  {c.createdBy}
                </span>
                <span className="min-w-0 break-words">{token.createdByName ?? t.list.unknownUser}</span>
              </td>
              <td role="cell" className={cell}>
                <span aria-hidden="true" className={label}>
                  {c.expires}
                </span>
                <span suppressHydrationWarning>{formatDate(token.expiresAt) ?? t.list.noExpiry}</span>
              </td>
              <td role="cell" className={cell}>
                <span aria-hidden="true" className={label}>
                  {c.lastUsed}
                </span>
                <span suppressHydrationWarning>{formatDate(token.lastUsedAt, true) ?? t.list.never}</span>
              </td>
              <td role="cell" className={cn(cell, "pt-2 xl:pt-3")}>
                <span aria-hidden="true" className={label}>
                  {c.actions}
                </span>
                {token.status === "revoked" ? (
                  <span className="text-muted">{t.list.noActions}</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onRevoke(token)}
                    aria-label={format(t.list.revokeLabel, { name: token.name })}
                  >
                    <Ban aria-hidden="true" className="size-4 text-danger" />
                    {t.list.revoke}
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function RevokeDialog({
  token,
  t,
  busy,
  onCancel,
  onConfirm,
}: {
  token: McpTokenView | null;
  t: McpT["revoke"];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <McpDialog open={token !== null} titleId={`${id}-title`} descriptionId={`${id}-body`} onClose={onCancel} initialFocus={cancelRef}>
      {token && (
        <div className="p-5 md:p-6">
          <h2 id={`${id}-title`} className="break-words text-lg font-extrabold text-navy">
            {format(t.title, { name: token.name })}
          </h2>
          <p id={`${id}-body`} className="mt-2 text-muted">
            {t.body}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={busy}>
              {t.cancel}
            </Button>
            <Button variant="dark" onClick={onConfirm} disabled={busy}>
              {busy ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Ban aria-hidden="true" className="size-4" />
              )}
              {busy ? t.revoking : t.confirm}
            </Button>
          </div>
        </div>
      )}
    </McpDialog>
  );
}

function SecretDialog({
  created,
  t,
  expires,
  onDone,
}: {
  created: McpTokenCreated | null;
  t: McpTokenManagerMessages["mcp"];
  expires: string | null;
  onDone: () => void;
}) {
  const id = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  return (
    <McpDialog open={created !== null} titleId={`${id}-title`} descriptionId={`${id}-warning`} onClose={onDone} initialFocus={copyRef}>
      {created && <SecretContent key={created.record.id} id={id} created={created} t={t} expires={expires} copyRef={copyRef} onDone={onDone} />}
    </McpDialog>
  );
}

type CopyState = { target: "token" | "command"; state: "copied" | "failed" } | null;

function SecretContent({
  id,
  created,
  t,
  expires,
  copyRef,
  onDone,
}: {
  id: string;
  created: McpTokenCreated;
  t: McpTokenManagerMessages["mcp"];
  expires: string | null;
  copyRef: Ref<HTMLButtonElement>;
  onDone: () => void;
}) {
  const s = t.secret;
  const [copy, setCopy] = useState<CopyState>(null);
  const tokenRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLElement>(null);
  const command = claudeCodeCommand(created.mcpUrl, created.token);

  async function copyText(target: "token" | "command") {
    const text = target === "token" ? created.token : command;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopy({ target, state: "copied" });
    } catch {
      setCopy({ target, state: "failed" });
      const element = (target === "token" ? tokenRef : commandRef).current;
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  const status = copy ? (copy.state === "copied" ? s.copied : s.copyFailed) : "";
  const codeClasses =
    "block select-all whitespace-pre-wrap break-all rounded-control border border-line bg-[#f4f7fb] px-3 py-2 font-mono text-navy";

  return (
    <div className="p-5 md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {s.title}
      </h2>
      <div id={`${id}-warning`} className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{s.warning}</p>
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-bold text-[#354b66]">{s.name}</dt>
          <dd className="break-words text-ink">{created.record.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{s.access}</dt>
          <dd className="text-ink">{scopeLabel(created.record.scopes, t.scopes)}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{s.expires}</dt>
          <dd className="text-ink" suppressHydrationWarning>
            {expires ?? t.list.noExpiry}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p id={`${id}-token-label`} className="text-xs font-bold text-[#354b66]">
          {s.token}
        </p>
        <code
          ref={tokenRef}
          aria-labelledby={`${id}-token-label`}
          lang="en"
          translate="no"
          className={cn(codeClasses, "mt-1 text-base font-bold")}
        >
          {created.token}
        </code>
        <Button ref={copyRef} variant="outline" className="mt-2" onClick={() => copyText("token")}>
          <Copy aria-hidden="true" className="size-4" />
          {s.copyToken}
        </Button>
      </div>

      {command && (
        <div className="mt-4">
          <p id={`${id}-command-label`} className="text-xs font-bold text-[#354b66]">
            {s.command}
          </p>
          <p id={`${id}-command-hint`} className="text-xs text-muted">
            {s.commandHint}
          </p>
          <code
            ref={commandRef}
            aria-labelledby={`${id}-command-label`}
            aria-describedby={`${id}-command-hint`}
            lang="en"
            translate="no"
            className={cn(codeClasses, "mt-1 text-xs leading-relaxed")}
          >
            {command}
          </code>
          <Button variant="outline" className="mt-2" onClick={() => copyText("command")}>
            <Copy aria-hidden="true" className="size-4" />
            {s.copyCommand}
          </Button>
        </div>
      )}

      <p role="status" className="mt-3 min-h-5 text-sm font-semibold">
        {status && <span className={copy?.state === "copied" ? "text-success" : "text-danger"}>{status}</span>}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="dark" onClick={onDone}>
          {s.done}
        </Button>
      </div>
    </div>
  );
}
