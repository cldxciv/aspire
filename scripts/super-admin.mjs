#!/usr/bin/env node
/**
 * Super admins from the server (D-044; docs/lead-routing-plan.md §11). Commands:
 *
 *   npm run auth:super-admin -- list                      (also runs the one-time bootstrap rule)
 *   npm run auth:super-admin -- grant <login id>          (an enabled ADMIN account)
 *   npm run auth:super-admin -- revoke <login id>         (refused for the last super admin)
 *   npm run auth:super-admin -- reset-password <login id> (admin accounts only; recovery when the
 *                                                          only super admin forgot their password)
 *
 * On the VPS: `docker compose exec app node --conditions=react-server
 *   --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/super-admin.mjs list`.
 *
 * `reset-password` prints a temporary password ONCE (never logged or written to a file), forces a
 * new password at the next sign-in and signs the account out everywhere. Every change is audited
 * with actor null and `{ via: "cli" }`. Database: AUTH_DB_PATH (default .data/aspire.sqlite). Run
 * through the npm script: it passes `--conditions=react-server` so the `server-only` markers resolve.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { normalizeLoginId } from "../src/lib/auth/identifiers.ts";
import { generateTemporaryPassword, hashPassword } from "../src/lib/auth/password.ts";
import { deleteAttempts } from "../src/lib/db/attempts.ts";
import { recordAudit } from "../src/lib/db/audit.ts";
import { openDatabase, resolveDbPath, withTransaction } from "../src/lib/db/connection.ts";
import { deleteUserSessions } from "../src/lib/db/sessions.ts";
import {
  bootstrapSingleAdmin,
  countEffectiveSuperAdmins,
  findGrant,
  isEffectiveSuperAdminRow,
  listActiveGrants,
  revokeGrant,
  SUPER_ADMIN_AUDIT_ACTIONS,
  upsertGrant,
} from "../src/lib/db/super-admins.ts";
import { findUserByLoginId, setUserPassword } from "../src/lib/db/users.ts";

const USAGE = "Usage: npm run auth:super-admin -- list | grant <login id> | revoke <login id> | reset-password <login id>";

/** Same key hashing as src/lib/auth/throttle.ts (scope "login"), to lift a sign-in lockout. */
function loginKeyHash(loginId) {
  return createHash("sha256").update(`login:${loginId}`).digest("hex");
}

function describe(grant) {
  const when = new Date(grant.grantedAt).toISOString().slice(0, 10);
  const how = grant.via === "bootstrap" ? "set automatically" : grant.via === "cli" ? "granted on the server" : `granted by ${grant.grantedByName ?? "an admin"}`;
  const state = grant.role === "admin" && !grant.disabled ? "" : " (not effective: account disabled or not an admin)";
  return `  ${grant.loginId}  ${grant.displayName}  ${how} on ${when}${state}`;
}

/**
 * Runs one command against `db`. Returns `{ code, lines, temporaryPassword? }` (exit code 0 / 1);
 * nothing is printed here, so tests can call it directly.
 */
export async function runSuperAdminCli(db, args, now = Date.now()) {
  const [command, rawLoginId] = args;
  if (command === "list") {
    const bootstrapped = bootstrapSingleAdmin(db, now);
    const grants = listActiveGrants(db);
    const lines = [];
    if (bootstrapped) lines.push("The only admin account was made super admin automatically.");
    if (grants.length === 0 || countEffectiveSuperAdmins(db) === 0) {
      lines.push("No super admin yet. Run: npm run auth:super-admin -- grant <login id>");
    }
    if (grants.length > 0) lines.push("Super admins:", ...grants.map(describe));
    return { code: 0, lines };
  }
  if (!["grant", "revoke", "reset-password"].includes(command ?? "") || !rawLoginId) return { code: 1, lines: [USAGE] };
  const loginId = normalizeLoginId(rawLoginId);
  const user = findUserByLoginId(db, loginId);
  if (!user) return { code: 1, lines: [`No account with login id "${loginId}". Nothing was changed.`] };

  if (command === "grant") {
    if (user.role !== "admin" || user.disabled) return { code: 1, lines: ["Only an enabled admin account can be a super admin. Nothing was changed."] };
    const changed = withTransaction(db, () => {
      const granted = upsertGrant(db, { userId: user.id, via: "cli", by: null, now });
      if (granted) recordAudit(db, { actorId: null, action: SUPER_ADMIN_AUDIT_ACTIONS.grant, target: user.id, details: { via: "cli" }, now });
      return granted;
    });
    return { code: 0, lines: [changed ? `"${loginId}" is now a super admin.` : `"${loginId}" was already a super admin.`] };
  }

  if (command === "revoke") {
    const result = withTransaction(db, () => {
      const grant = findGrant(db, user.id);
      if (!grant || grant.revokedAt !== null) return "none";
      if (isEffectiveSuperAdminRow(db, user.id) && countEffectiveSuperAdmins(db) <= 1) return "last";
      revokeGrant(db, user.id, null, now);
      recordAudit(db, { actorId: null, action: SUPER_ADMIN_AUDIT_ACTIONS.revoke, target: user.id, details: { via: "cli" }, now });
      return "revoked";
    });
    if (result === "last") return { code: 1, lines: ["This is the last super admin: grant another admin first. Nothing was changed."] };
    return { code: 0, lines: [result === "revoked" ? `"${loginId}" is no longer a super admin.` : `"${loginId}" was not a super admin.`] };
  }

  // reset-password: admin accounts only (staff and families are reset in the admin console).
  if (user.role !== "admin") return { code: 1, lines: ["reset-password only works on admin accounts. Nothing was changed."] };
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const revokedSessions = withTransaction(db, () => {
    setUserPassword(db, user.id, passwordHash, true, now);
    const revoked = deleteUserSessions(db, user.id);
    deleteAttempts(db, "login", loginKeyHash(user.loginId));
    recordAudit(db, { actorId: null, action: SUPER_ADMIN_AUDIT_ACTIONS.cliPasswordReset, target: user.id, details: { via: "cli", revokedSessions: revoked }, now });
    return revoked;
  });
  return {
    code: 0,
    temporaryPassword,
    lines: [
      `Temporary password for "${loginId}" (shown once; they must change it at the next sign-in):`,
      `  ${temporaryPassword}`,
      `Signed out of ${revokedSessions} session(s).`,
    ],
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const db = openDatabase(resolveDbPath());
  try {
    const result = await runSuperAdminCli(db, process.argv.slice(2));
    for (const line of result.lines) (result.code === 0 ? console.log : console.error)(line);
    process.exitCode = result.code;
  } finally {
    db.close();
  }
}
