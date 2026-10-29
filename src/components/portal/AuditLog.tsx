import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { isRole } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { groupAuditRows, type AuditDisplayItem } from "./audit-group";
import { AUDIT_TARGET_NOUNS, auditGroupLabel, auditLabelEntry } from "./audit-labels";
import { PortalPanel } from "./PortalBlocks";

export type AuditRowView = {
  id: number;
  actorId: string | null;
  action: string;
  target: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
  details: Record<string, unknown>;
};

export type AuditUserView = { displayName: string; loginId: string };

export const AUDIT_LIMITS = [50, 100, 200] as const;
export type AuditLimit = (typeof AUDIT_LIMITS)[number];

/** `?limit=` → one of the allowed page sizes (default 50). */
export function parseAuditLimit(raw: unknown): AuditLimit {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (AUDIT_LIMITS as readonly number[]).includes(value) ? (value as AuditLimit) : 50;
}

type AuditMessages = Messages<"portal">["admin"]["audit"];
type ActionKey = keyof AuditMessages["actions"];

const ACTION_KEYS: Readonly<Record<string, ActionKey>> = {
  "auth.login": "authLogin",
  "auth.logout": "authLogout",
  "auth.password_change": "authPasswordChange",
  "admin.user_create": "adminUserCreate",
  "admin.user_disable": "adminUserDisable",
  "admin.user_enable": "adminUserEnable",
  "admin.user_rename": "adminUserRename",
  "admin.password_reset": "adminPasswordReset",
  "admin.link_add": "adminLinkAdd",
  "admin.link_remove": "adminLinkRemove",
  "seed.user_create": "seedUserCreate",
  "seed.password_reset": "seedPasswordReset",
  "seed.link_add": "seedLinkAdd",
  "bootstrap.admin_create": "bootstrapAdminCreate",
  "layout.save_draft": "layoutSaveDraft",
  "layout.discard_draft": "layoutDiscardDraft",
  "layout.publish": "layoutPublish",
  "layout.reset": "layoutReset",
};

/**
 * Words for the grouped lines (English only, like the label registry: decision 5, plan O15).
 */
export const AUDIT_GROUP_TEXT = {
  range: "{label} · {from}–{to}",
  showEntries: "Show each entry ({count})",
  entriesLabel: "Entries in this group",
} as const;

/** The codes the portal messages translate (looked up before the English registry). */
export function translatedAuditActions(): readonly string[] {
  return Object.keys(ACTION_KEYS);
}

/**
 * How an action reads in the log. Lookup order (plan §5.N): the translated portal label, then the
 * English registry (src/components/portal/audit-labels.ts, its sentence built from the details),
 * then the raw code. `english` marks registry text on a page in another language (shown with
 * `lang="en"`); `used` are the detail keys the sentence already says.
 */
export function auditActionText(
  action: string,
  details: Record<string, unknown>,
  t: AuditMessages,
): { text: string; english: boolean; used: readonly string[] } {
  const key = ACTION_KEYS[action];
  if (key) return { text: t.actions[key], english: false, used: [] };
  const entry = auditLabelEntry(action);
  if (!entry) return { text: action, english: false, used: [] };
  let described: string | null = null;
  try {
    described = entry.describe?.(details) ?? null;
  } catch {
    described = null;
  }
  return described ? { text: described, english: true, used: entry.uses ?? [] } : { text: entry.label, english: true, used: [] };
}

/** Localised (or English registry) label for an audit action code; unknown codes are shown as written. */
export function auditActionLabel(action: string, t: AuditMessages, details: Record<string, unknown> = {}): string {
  return auditActionText(action, details, t).text;
}

function userLabel(id: string | null, users: ReadonlyMap<string, AuditUserView>, t: AuditMessages): string {
  if (id === null) return t.system;
  const user = users.get(id);
  return user ? `${user.displayName} (${user.loginId})` : t.unknownUser;
}

/**
 * The target column: an account's name; for other targets (an enquiry, an area, a token …) the
 * registry's noun and the id (ids only, never a family's details); unknown accounts as before.
 */
export function auditTargetLabel(action: string, target: string | null, users: ReadonlyMap<string, AuditUserView>, t: AuditMessages): { text: string; english: boolean } {
  if (target === null) return { text: "—", english: false };
  if (users.has(target)) return { text: userLabel(target, users, t), english: false };
  const kind = auditLabelEntry(action)?.target;
  if (!kind || kind === "account") return { text: t.unknownUser, english: false };
  return { text: `${AUDIT_TARGET_NOUNS[kind]} · ${target}`, english: true };
}

/** Localised, secret-free description of an entry's flat details (keys in `omit` are left out). */
export function auditDetails(
  details: Record<string, unknown>,
  users: ReadonlyMap<string, AuditUserView>,
  t: AuditMessages,
  roles: Messages<"auth">["roles"],
  omit: readonly string[] = [],
): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || typeof value === "object" || omit.includes(key)) continue;
    const text = String(value);
    if (key === "role") lines.push(format(t.details.role, { value: isRole(text) ? roles[text] : text }));
    else if (key === "loginId") lines.push(format(t.details.loginId, { value: text }));
    else if (key === "revokedSessions") lines.push(format(t.details.revokedSessions, { value: text }));
    else if (key === "studentId") lines.push(format(t.details.student, { value: userLabel(text, users, t) }));
    else if (key === "field" && text === "displayName") lines.push(t.details.displayNameChanged);
    // Staff ids (an assignment's from / to, …) read as names when the account is known.
    else if (users.has(text)) lines.push(`${key}: ${userLabel(text, users, t)}`);
    else lines.push(`${key}: ${text}`);
  }
  return lines;
}

function English({ on, children }: { on: boolean; children: string }) {
  return on ? <span lang="en">{children}</span> : <>{children}</>;
}

/**
 * Audit log table for admins (server-rendered, newest first). Names come from the account
 * list; actions read in plain words (translated labels, then the English registry); details are
 * the flat, secret-free facts the services record (never passwords). Repeated "viewed an enquiry"
 * and "AI assistant used a tool" lines by the same person within 30 minutes are shown as one line
 * with every entry listed under it: nothing is hidden or deleted. Times are India time.
 */
export function AuditLog({
  entries,
  users,
  limit,
  locale,
  t,
  roles,
}: {
  entries: readonly AuditRowView[];
  users: ReadonlyMap<string, AuditUserView>;
  limit: AuditLimit;
  locale: Locale;
  t: AuditMessages;
  roles: Messages<"auth">["roles"];
}) {
  const time = new Intl.DateTimeFormat(htmlLang[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const clock = new Intl.DateTimeFormat(htmlLang[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata", numberingSystem: "latn" });
  const english = locale !== "en";
  const items: AuditDisplayItem<AuditRowView>[] = groupAuditRows(entries);

  function renderRow(entry: AuditRowView) {
    const action = auditActionText(entry.action, entry.details, t);
    const target = auditTargetLabel(entry.action, entry.target, users, t);
    const details = auditDetails(entry.details, users, t, roles, action.used);
    return (
      <tr key={entry.id} className="border-t border-line align-top">
        <td className="whitespace-nowrap px-3 py-2.5 text-muted">
          <time dateTime={new Date(entry.createdAt).toISOString()}>{time.format(new Date(entry.createdAt))}</time>
        </td>
        <th scope="row" className="px-3 py-2.5 font-semibold text-navy">
          <English on={english && action.english}>{action.text}</English>
        </th>
        <td className="px-3 py-2.5">{userLabel(entry.actorId, users, t)}</td>
        <td className="break-all px-3 py-2.5">
          <English on={english && target.english}>{target.text}</English>
        </td>
        <td className="px-3 py-2.5 text-muted">
          {details.length ? (
            <ul className="space-y-0.5">
              {details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            "—"
          )}
        </td>
      </tr>
    );
  }

  function renderGroup(item: Extract<AuditDisplayItem<AuditRowView>, { kind: "group" }>) {
    const label = auditGroupLabel(item.action, item.rows.length) ?? auditActionText(item.action, {}, t).text;
    const summary = format(AUDIT_GROUP_TEXT.range, { label, from: clock.format(new Date(item.from)), to: clock.format(new Date(item.to)) });
    const newest = item.rows.reduce((latest, row) => (row.createdAt > latest.createdAt ? row : latest), item.rows[0]);
    return (
      <tr key={`group-${item.rows[0].id}`} className="border-t border-line align-top" data-audit-group={item.rows.length}>
        <td className="whitespace-nowrap px-3 py-2.5 text-muted">
          <time dateTime={new Date(newest.createdAt).toISOString()}>{time.format(new Date(newest.createdAt))}</time>
        </td>
        <th scope="row" className="px-3 py-2.5 font-semibold text-navy">
          <English on={english}>{summary}</English>
        </th>
        <td className="px-3 py-2.5">{userLabel(item.actorId, users, t)}</td>
        <td className="px-3 py-2.5">—</td>
        <td className="px-3 py-2.5 text-muted">
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-control font-semibold text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              <English on={english}>{format(AUDIT_GROUP_TEXT.showEntries, { count: item.rows.length })}</English>
            </summary>
            <ul aria-label={AUDIT_GROUP_TEXT.entriesLabel} lang={english ? "en" : undefined} className="mt-1 space-y-0.5">
              {item.rows.map((row) => {
                const action = auditActionText(row.action, row.details, t);
                const target = auditTargetLabel(row.action, row.target, users, t);
                return (
                  <li key={row.id} className="break-all">
                    <time dateTime={new Date(row.createdAt).toISOString()}>{clock.format(new Date(row.createdAt))}</time>
                    {" · "}
                    {row.target === null ? action.text : target.text}
                  </li>
                );
              })}
            </ul>
          </details>
        </td>
      </tr>
    );
  }

  return (
    <PortalPanel
      id="admin-audit-log"
      title={t.listTitle}
      description={format(t.showing, { count: entries.length })}
      action={
        <nav aria-label={t.limitLabel} className="flex items-center gap-1 text-sm">
          <span className="mr-1 text-muted">{t.limitLabel}:</span>
          {AUDIT_LIMITS.map((value) => (
            <Link
              key={value}
              href={localePath(`/admin/audit?limit=${value}`, locale)}
              aria-current={value === limit ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border px-2 font-bold",
                value === limit ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue",
              )}
            >
              {value}
            </Link>
          ))}
        </nav>
      }
    >
      {entries.length === 0 ? (
        <p className="rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-6 text-center text-muted">
          {t.empty}
        </p>
      ) : (
        // A focusable scroll region (plan §5 layout rules): keyboard users can scroll a wide log sideways.
        <div
          role="region"
          aria-label={t.listTitle}
          tabIndex={0}
          className="overflow-x-auto rounded-control border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.listTitle}</caption>
            <thead>
              <tr className="bg-[#f4f7fb] text-xs text-[#40536b]">
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                  {t.columns.time}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                  {t.columns.action}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                  {t.columns.actor}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                  {t.columns.target}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold">
                  {t.columns.details}
                </th>
              </tr>
            </thead>
            <tbody>{items.map((item) => (item.kind === "row" ? renderRow(item.row) : renderGroup(item)))}</tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}
