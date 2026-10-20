"use client";

import { Ban, Copy, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState, type Ref } from "react";
import { Badge, Button, EmptyState, Notice, type BadgeVariant } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { callApi, type ApiFailure } from "@/lib/auth/client-api";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";
import { CreateTokenForm, MCP_TOKENS_API } from "./CreateTokenForm";
import { McpDialog } from "./McpDialog";
import { mcpFailureMessage, permissionSummaryLines, type McpTokenManagerMessages } from "./labels";
import { PermissionBadges, PermissionList } from "./PermissionBadges";
import { MCP_SERVICE_VIEWS, type McpServiceView } from "./permissions";
import { claudeCodeCommand, sortTokens, type McpTokenCreated, type McpTokenStatus, type McpTokenView } from "./token-view";

export type { McpTokenManagerMessages } from "./labels";
export { expiryLabel, mcpFailureMessage } from "./labels";

type McpT = Messages<"mcp">;
type M = McpTokenManagerMessages["mcp"];

const PAGE_PATH = "/admin/mcp";

const STATUS_BADGE: Record<McpTokenStatus, BadgeVariant> = {
  active: "success",
  expired: "warning",
  revoked: "neutral",
  creator_inactive: "warning",
};

/**
 * Admin management of MCP access tokens on top of `/api/admin/mcp-tokens/**`: create with
 * per-service permissions (the plaintext token is shown ONCE in a dialog with its permissions and a
 * ready-to-paste Claude Code command, then dropped from memory), list with status and permission
 * badges, and revoke after an in-page confirmation. The server re-checks the admin role on every
 * call and audits each change.
 */
export function McpTokenManager({
  initialTokens,
  messages: m,
  services = MCP_SERVICE_VIEWS,
}: {
  initialTokens: McpTokenView[];
  messages: McpTokenManagerMessages;
  services?: readonly McpServiceView[];
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
    const result = await callApi<McpTokenView[]>(MCP_TOKENS_API);
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
    const result = await callApi<McpTokenView>(`${MCP_TOKENS_API}/${encodeURIComponent(token.id)}`, { method: "DELETE" });
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
        services={services}
        onCreated={(created) => {
          setSecret(created);
          setTokens((current) => sortTokens([created.record, ...current.filter((item) => item.id !== created.record.id)]));
          setPageError(null);
          setAnnouncement(format(t.announce.created, { name: created.record.name }));
        }}
        onFailure={fail}
      />

      <section aria-labelledby={`${ids}-list`} className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
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
            services={services}
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
        services={services}
        t={t}
        expires={secret ? formatDate(secret.record.expiresAt) : null}
        onDone={() => setSecret(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token table (a real table on wide screens; stacked rows on small ones)
// ---------------------------------------------------------------------------

function TokenTable({
  tokens,
  services,
  t,
  formatDate,
  disabled,
  onRevoke,
}: {
  tokens: McpTokenView[];
  services: readonly McpServiceView[];
  t: M;
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
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[19%]">{c.name}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[24%]">{c.access}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[12%]">{c.status}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[12%]">{c.createdBy}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[11%]">{c.expires}</th>
          <th role="columnheader" scope="col" className="px-3 py-2 xl:w-[11%]">{c.lastUsed}</th>
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
                <PermissionBadges services={services} summary={token.scopeSummary} m={t} />
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
  services,
  t,
  expires,
  onDone,
}: {
  created: McpTokenCreated | null;
  services: readonly McpServiceView[];
  t: M;
  expires: string | null;
  onDone: () => void;
}) {
  const id = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  return (
    <McpDialog open={created !== null} titleId={`${id}-title`} descriptionId={`${id}-warning`} onClose={onDone} initialFocus={copyRef}>
      {created && (
        <SecretContent
          key={created.record.id}
          id={id}
          created={created}
          services={services}
          t={t}
          expires={expires}
          copyRef={copyRef}
          onDone={onDone}
        />
      )}
    </McpDialog>
  );
}

type CopyState = { target: "token" | "command"; state: "copied" | "failed" } | null;

function SecretContent({
  id,
  created,
  services,
  t,
  expires,
  copyRef,
  onDone,
}: {
  id: string;
  created: McpTokenCreated;
  services: readonly McpServiceView[];
  t: M;
  expires: string | null;
  copyRef: Ref<HTMLButtonElement>;
  onDone: () => void;
}) {
  const s = t.secret;
  const [copy, setCopy] = useState<CopyState>(null);
  const tokenRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLElement>(null);
  const command = claudeCodeCommand(created.mcpUrl, created.token);
  const lines = permissionSummaryLines(services, created.record.scopeSummary, t.create, t.services);

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

      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-bold text-[#354b66]">{s.name}</dt>
          <dd className="break-words text-ink">{created.record.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{s.expires}</dt>
          <dd className="text-ink" suppressHydrationWarning>
            {expires ?? t.list.noExpiry}
          </dd>
        </div>
      </dl>

      <section aria-labelledby={`${id}-permissions`} className="mt-4 rounded-control border border-line p-3">
        <h3 id={`${id}-permissions`} className="text-xs font-bold text-[#354b66]">
          {s.permissions}
        </h3>
        {lines ? (
          <p className="mt-1 text-sm text-ink">
            <span className="block">{lines.read}</span>
            <span className="block font-semibold">{lines.write}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">{t.list.noPermissions}</p>
        )}
        <PermissionList services={services} summary={created.record.scopeSummary} m={t} className="mt-2" />
      </section>

      <div className="mt-4">
        <p id={`${id}-token-label`} className="text-xs font-bold text-[#354b66]">
          {s.token}
        </p>
        <code ref={tokenRef} aria-labelledby={`${id}-token-label`} lang="en" translate="no" className={cn(codeClasses, "mt-1 text-base font-bold")}>
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
