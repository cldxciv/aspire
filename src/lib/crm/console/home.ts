import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { PORTAL_HOME } from "@/lib/auth/paths";
import type { Session } from "@/lib/auth/roles";
import { resolveQbViewer } from "@/lib/qb/access";

import { resolveCrmViewer } from "../access";

/**
 * Role homes for `/crm/home` (docs/admin-phase-1b-plan.md §5.A, D-078; owner: 1B-CORE; Phase 2
 * adds the front desk → `/crm/desk` here): where a signed-in console user lands. LOCALE-FREE paths.
 */

export const CONSOLE_HOME_PATH = "/crm/home";

export type ConsoleHome = { kind: "signed_out" } | { kind: "change_password" } | { kind: "home"; path: string };

/**
 * - CRM admin (core admin, super admin or not) → `/admin`;
 * - manager (area head) → `/crm/dashboard`; counsellor → `/crm/today`;
 * - staff with an active question-bank membership and no CRM membership → `/admin/questions`;
 * - other staff without a CRM membership → `/crm` (its "ask an admin" panel);
 * - students and parents → their own portal; signed out → the login page (`next=/crm/home`);
 *   a pending temporary password → the change-password page first.
 */
export function consoleHomeFor(session: Session | null, db: DatabaseSync): ConsoleHome {
  if (!session) return { kind: "signed_out" };
  if (session.mustChangePassword === true) return { kind: "change_password" };
  if (session.role === "admin") return { kind: "home", path: PORTAL_HOME.admin };
  if (session.role !== "staff") return { kind: "home", path: PORTAL_HOME[session.role] };
  const viewer = resolveCrmViewer(session, db);
  if (viewer?.role === "manager") return { kind: "home", path: "/crm/dashboard" };
  if (viewer?.role === "counsellor") return { kind: "home", path: "/crm/today" };
  if (resolveQbViewer(session, db)) return { kind: "home", path: "/admin/questions" };
  return { kind: "home", path: "/crm" };
}
