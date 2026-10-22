import Link from "next/link";
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { isRole } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
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

/** Localised label for an audit action code; unknown codes are shown as written. */
export function auditActionLabel(action: string, t: AuditMessages): string {
  const key = ACTION_KEYS[action];
  return key ? t.actions[key] : action;
}

function userLabel(id: string | null, users: ReadonlyMap<string, AuditUserView>, t: AuditMessages): string {
  if (id === null) return t.system;
  const user = users.get(id);
  return user ? `${user.displayName} (${user.loginId})` : t.unknownUser;
}

/** Localised, secret-free description of an entry's flat details. */
export function auditDetails(
  details: Record<string, unknown>,
  users: ReadonlyMap<string, AuditUserView>,
  t: AuditMessages,
  roles: Messages<"auth">["roles"],
): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || typeof value === "object") continue;
    const text = String(value);
    if (key === "role") lines.push(format(t.details.role, { value: isRole(text) ? roles[text] : text }));
    else if (key === "loginId") lines.push(format(t.details.loginId, { value: text }));
    else if (key === "revokedSessions") lines.push(format(t.details.revokedSessions, { value: text }));
    else if (key === "studentId") lines.push(format(t.details.student, { value: userLabel(text, users, t) }));
    else if (key === "field" && text === "displayName") lines.push(t.details.displayNameChanged);
    else lines.push(`${key}: ${text}`);
  }
  return lines;
}

/**
 * Audit log table for admins (server-rendered, newest first). Names come from the account
 * list; details are the flat, secret-free facts the account service records (never passwords).
 * Times are shown in India time so every admin sees the same clock.
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
        <div className="overflow-x-auto rounded-control border border-line">
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
            <tbody>
              {entries.map((entry) => {
                const details = auditDetails(entry.details, users, t, roles);
                return (
                  <tr key={entry.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      <time dateTime={new Date(entry.createdAt).toISOString()}>{time.format(new Date(entry.createdAt))}</time>
                    </td>
                    <th scope="row" className="px-3 py-2.5 font-semibold text-navy">
                      {auditActionLabel(entry.action, t)}
                    </th>
                    <td className="px-3 py-2.5">{userLabel(entry.actorId, users, t)}</td>
                    <td className="px-3 py-2.5">{entry.target ? userLabel(entry.target, users, t) : "—"}</td>
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}
