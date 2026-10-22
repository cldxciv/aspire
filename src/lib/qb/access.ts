import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { Session } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/connection";

import { parseJson } from "./repo/json";
import { forbidden, invalid, notFound, ok, type QbResult } from "./result";
import type { QbCapability, QbRole, QbSubject, QbViewer } from "./types";
import { QB_SUBJECTS } from "./types";

/**
 * Question-bank access (owner: QB-CORE-B; §B6), deny by default:
 * - a core `admin` account → role admin (no membership row needed);
 * - a `staff` account → a viewer only with an ACTIVE `qb_members` row on an enabled account;
 * - everyone else, and any account that must still change a temporary password → null.
 * `crm_staff` is never read or written here: CRM membership and QB membership are separate.
 */

const AUTHOR: readonly QbCapability[] = ["view", "edit_draft", "import_tabular"];
const REVIEWER: readonly QbCapability[] = [
  ...AUTHOR,
  "import_ai",
  "approve",
  "retire",
  "set_labels",
  "merge_duplicates",
  "manage_chapters",
  "key_corrections",
  "edit_blueprint",
];
const ADMIN: readonly QbCapability[] = [...REVIEWER, "publish_blueprint", "confirm_taxonomy", "manage_team", "manage_settings"];

export const QB_ROLE_CAPABILITIES: Readonly<Record<QbRole, readonly QbCapability[]>> = {
  author: AUTHOR,
  reviewer: REVIEWER,
  admin: ADMIN,
};

/** Capabilities that act on a question and so respect the viewer's subject scope. */
const SUBJECT_SCOPED: ReadonlySet<QbCapability> = new Set(["edit_draft", "approve", "retire", "set_labels", "merge_duplicates", "key_corrections"]);

export function roleCan(role: QbRole, capability: QbCapability): boolean {
  return QB_ROLE_CAPABILITIES[role].includes(capability);
}

/** Subject scope: admins and empty scopes cover every subject. */
export function inSubjectScope(viewer: Pick<QbViewer, "role" | "subjects">, subject: QbSubject | null | undefined): boolean {
  if (viewer.role === "admin" || viewer.subjects.length === 0 || !subject) return true;
  if (viewer.subjects.includes(subject)) return true;
  // "biology" in a scope covers both of its blocks.
  return viewer.subjects.includes("biology") && (subject === "botany" || subject === "zoology");
}

/** Whether the viewer may use `capability` (on a question of `subject`, when given). */
export function qbCan(viewer: QbViewer, capability: QbCapability, subject?: QbSubject | null): boolean {
  if (!roleCan(viewer.role, capability)) return false;
  if (subject !== undefined && SUBJECT_SCOPED.has(capability)) return inSubjectScope(viewer, subject);
  return true;
}

export function capabilitiesOf(viewer: Pick<QbViewer, "role">): QbCapability[] {
  return [...QB_ROLE_CAPABILITIES[viewer.role]];
}

interface MemberRow {
  userId: string;
  role: "author" | "reviewer";
  subjects: QbSubject[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
  displayName: string;
  loginId: string;
  userRole: string;
  disabled: boolean;
}

function cleanSubjects(raw: unknown): QbSubject[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.filter((s): s is QbSubject => typeof s === "string" && (QB_SUBJECTS as readonly string[]).includes(s));
}

function mapMember(row: Record<string, unknown>): MemberRow {
  return {
    userId: String(row.user_id),
    role: row.qb_role === "reviewer" ? "reviewer" : "author",
    subjects: cleanSubjects(parseJson<unknown>(row.subjects, [])),
    active: Number(row.active) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    displayName: String(row.display_name ?? ""),
    loginId: String(row.login_id ?? ""),
    userRole: String(row.role ?? ""),
    disabled: Number(row.disabled) === 1,
  };
}

const MEMBER_SELECT = `SELECT m.user_id, m.qb_role, m.subjects, m.active, m.created_at, m.updated_at,
  u.display_name, u.login_id, u.role, u.disabled
  FROM qb_members m JOIN users u ON u.id = m.user_id`;

export function findMember(db: DatabaseSync, userId: string): MemberRow | null {
  const row = db.prepare(`${MEMBER_SELECT} WHERE m.user_id = ?`).get(userId);
  return row ? mapMember(row) : null;
}

/** The QB viewer behind a verified session, or null (see the module comment). */
export function resolveQbViewer(session: Session | null | undefined, db: DatabaseSync = getDb()): QbViewer | null {
  if (!session || session.mustChangePassword === true) return null;
  if (session.role === "admin") {
    return { userId: session.userId, displayName: session.displayName ?? "Admin", role: "admin", subjects: [] };
  }
  if (session.role !== "staff") return null;
  const member = findMember(db, session.userId);
  if (!member || !member.active || member.disabled || member.userRole !== "staff") return null;
  return { userId: member.userId, displayName: member.displayName, role: member.role, subjects: [...member.subjects] };
}

// ---------------------------------------------------------------------------------------------
// Team (manage_team)

export interface QbMemberView {
  userId: string;
  displayName: string;
  loginId: string;
  qbRole: "author" | "reviewer";
  subjects: QbSubject[];
  active: boolean;
  disabled: boolean;
  updatedAt: number;
}

export interface QbTeamView {
  members: QbMemberView[];
  /** Staff accounts without a membership yet. */
  candidates: { userId: string; displayName: string; loginId: string }[];
}

export interface QbMemberInput {
  qbRole: "author" | "reviewer";
  subjects: QbSubject[];
  active: boolean;
}

function memberView(row: MemberRow): QbMemberView {
  return {
    userId: row.userId,
    displayName: row.displayName,
    loginId: row.loginId,
    qbRole: row.role,
    subjects: row.subjects,
    active: row.active,
    disabled: row.disabled,
    updatedAt: row.updatedAt,
  };
}

export function listMembers(viewer: QbViewer, db: DatabaseSync = getDb()): QbResult<QbTeamView> {
  if (!qbCan(viewer, "manage_team")) return forbidden();
  const members = db
    .prepare(`${MEMBER_SELECT} ORDER BY u.display_name`)
    .all()
    .map((row) => memberView(mapMember(row)));
  const candidates = db
    .prepare(
      `SELECT id, display_name, login_id FROM users
        WHERE role = 'staff' AND id NOT IN (SELECT user_id FROM qb_members) ORDER BY display_name`,
    )
    .all()
    .map((row) => ({ userId: String(row.id), displayName: String(row.display_name), loginId: String(row.login_id) }));
  return ok({ members, candidates });
}

/** Creates or changes a staff account's QB membership (admin only; audited by the route). */
export function upsertMember(
  viewer: QbViewer,
  userId: string,
  input: QbMemberInput,
  now: number,
  db: DatabaseSync = getDb(),
): QbResult<QbMemberView> {
  if (!qbCan(viewer, "manage_team")) return forbidden();
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!user) return notFound("No such user.");
  if (user.role !== "staff") return invalid("Only staff accounts can join the question bank team (admins already have full access).");
  const subjects = cleanSubjects(input.subjects);
  db.prepare(
    `INSERT INTO qb_members (user_id, qb_role, subjects, active, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET qb_role = excluded.qb_role, subjects = excluded.subjects,
       active = excluded.active, updated_at = excluded.updated_at`,
  ).run(userId, input.qbRole, JSON.stringify(subjects), input.active ? 1 : 0, now, now, viewer.userId);
  const member = findMember(db, userId);
  return member ? ok(memberView(member)) : notFound("No such user.");
}
