import "server-only";

import { z } from "zod";

import {
  adminCreateUser,
  adminGetUser,
  adminListUsers,
  adminSetParentLink,
  adminUpdateUser,
  type PublicUser,
} from "@/lib/auth/accounts";
import { DISPLAY_NAME_MAX_LENGTH, LOGIN_ID_RULES } from "@/lib/auth/identifiers";
import type { Session } from "@/lib/auth/roles";

import { compact, limitSchema, offsetSchema, pageSummary, paginate, recordIdSchema } from "./common";
import { defineTool, fail, READ_ONLY, type ToolContext } from "./types";

/**
 * Account tools. Reads reuse the admin account service (src/lib/auth/accounts.ts), whose public
 * shape never contains password hashes. Writes go through the same service functions as the
 * admin API (same validation, same `admin.*` audit rows, actor = the admin who created the token)
 * and add an `mcp.<tool>` audit row. Admin accounts can never be created, disabled or changed via
 * MCP, and there is no password-reset tool.
 */

/** What an agent sees of an account. An explicit whitelist: new internal fields never leak. */
export interface McpAccount {
  id: string;
  role: PublicUser["role"];
  displayName: string;
  loginId: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toMcpAccount(user: PublicUser): McpAccount {
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    loginId: user.loginId,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** The admin account functions take a Session; MCP acts as the token's creator. */
function actorOf(ctx: ToolContext): Session {
  return { userId: ctx.caller.createdBy, role: "admin" };
}

const roleFilter = z.enum(["student", "parent", "admin"]);

export const listAccounts = defineTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "Lists portal accounts (students, parents, admins) of the Aspire website, sorted admins → parents → students, then by name. " +
    "Filters: role, status (active = not disabled), and search (case-insensitive substring of display name or login ID). " +
    "Returns id, role, displayName, loginId, disabled, mustChangePassword (true = the user still has an admin-issued temporary password), createdAt, updatedAt. " +
    "Paginated: limit 1–100 (default 25) and offset; follow nextOffset for more. Students are often minors: use the data only for the admin task at hand.",
  scope: "read",
  inputSchema: z.object({
    role: roleFilter.optional().describe("Only this role."),
    status: z.enum(["active", "disabled", "all"]).default("all").describe("active, disabled or all (default)."),
    search: z.string().trim().max(64).optional().describe("Substring of display name or login ID (case-insensitive)."),
    limit: limitSchema,
    offset: offsetSchema,
  }),
  annotations: READ_ONLY,
  run(args) {
    const needle = args.search?.toLowerCase();
    const matches = adminListUsers(args.role ? { role: args.role } : {})
      .filter((user) => args.status === "all" || (args.status === "disabled") === user.disabled)
      .filter(
        (user) =>
          !needle || user.displayName.toLowerCase().includes(needle) || user.loginId.toLowerCase().includes(needle),
      )
      .map(toMcpAccount);
    const page = paginate(matches, args.offset, args.limit);
    return {
      ok: true,
      summary: pageSummary(page, "accounts"),
      data: { total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset, accounts: page.items },
    };
  },
});

export const getAccount = defineTool({
  name: "get_account",
  title: "Get account",
  description:
    "Gets one portal account by id, plus its parent↔student links: for a parent, the linked students; for a student, the linked parents " +
    "(each with id, displayName, loginId, disabled). Never returns passwords or hashes. Use list_accounts to find ids.",
  scope: "read",
  inputSchema: z.object({ id: recordIdSchema.describe("Account id (from list_accounts).") }),
  annotations: READ_ONLY,
  run(args) {
    const user = adminGetUser(args.id);
    if (!user) return fail("not_found", "No account has this id. Use list_accounts to find the right id.");
    const linkedIds = user.role === "parent" ? (user.linkedStudentIds ?? []) : (user.linkedParentIds ?? []);
    const linked = linkedIds
      .map((id) => adminGetUser(id))
      .filter((other): other is PublicUser => other !== null)
      .map((other) => ({ id: other.id, displayName: other.displayName, loginId: other.loginId, disabled: other.disabled }));
    const account = toMcpAccount(user);
    const data: Record<string, unknown> = { account };
    if (user.role === "parent") data.linkedStudents = linked;
    if (user.role === "student") data.linkedParents = linked;
    const links =
      user.role === "parent"
        ? `, ${linked.length} linked student(s)`
        : user.role === "student"
          ? `, ${linked.length} linked parent(s)`
          : "";
    return {
      ok: true,
      summary: `${account.role} "${account.displayName}" (${account.loginId}), ${account.disabled ? "disabled" : "active"}${links}.`,
      data,
    };
  },
});

const CREATE_ERRORS: Record<string, string> = {
  invalid_login_id: `Invalid login ID. ${LOGIN_ID_RULES}`,
  invalid_display_name: `Invalid display name: 1–${DISPLAY_NAME_MAX_LENGTH} characters, no control characters.`,
  login_id_taken: "This login ID is already used by another account. Choose a different one.",
};

export const createAccount = defineTool({
  name: "create_account",
  title: "Create student or parent account",
  description:
    "WRITE (needs a 'read write' token). Creates a STUDENT or PARENT portal account (never admins). " +
    `loginId: ${LOGIN_ID_RULES} Stored lower-case; must be unused. displayName: 1–${DISPLAY_NAME_MAX_LENGTH} characters. ` +
    "Returns the new account and a ONE-TIME temporary password: it is shown only in this response, is not stored anywhere in clear and cannot be retrieved again. " +
    "Hand it to the admin exactly once (do not write it to files, logs or other tools); the user must change it at first sign-in. " +
    "To link a parent to a student afterwards use link_parent_student. Audited.",
  scope: "write",
  inputSchema: z.object({
    role: z.enum(["student", "parent"]).describe("student or parent (admin accounts cannot be created via MCP)."),
    loginId: z.string().trim().min(1).max(200).describe(LOGIN_ID_RULES),
    displayName: z.string().trim().min(1).max(200).describe("Name shown in the portal, e.g. the student's full name."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async run(args, ctx) {
    const result = await adminCreateUser(actorOf(ctx), args, ctx.now);
    if (!result.ok) return fail(result.error, CREATE_ERRORS[result.error] ?? "The account could not be created.");
    const account = toMcpAccount(result.user);
    return {
      ok: true,
      summary:
        `Created ${account.role} account "${account.displayName}" (login ID ${account.loginId}). ` +
        "The temporary password below is shown ONCE; give it to the admin and do not store it.",
      data: { account, temporaryPassword: result.temporaryPassword, mustChangePasswordAtFirstSignIn: true },
      audit: { target: account.id, details: { role: account.role } },
    };
  },
});

const LINK_ERRORS: Record<string, string> = {
  parent_not_found: "No account has the given parentId.",
  student_not_found: "No account has the given studentId.",
  not_a_parent: "parentId is not a parent account.",
  not_a_student: "studentId is not a student account.",
};

function linkTool(linked: boolean) {
  return defineTool({
    name: linked ? "link_parent_student" : "unlink_parent_student",
    title: linked ? "Link parent to student" : "Unlink parent from student",
    description: linked
      ? "WRITE (needs a 'read write' token). Links a parent account to a student account so the parent can see that learner in the parent portal. " +
        "parentId must be a parent account and studentId a student account (ids from list_accounts). Idempotent: linking twice changes nothing. Audited."
      : "WRITE (needs a 'read write' token). Removes the link between a parent account and a student account; the parent immediately loses access to that learner in the parent portal. " +
        "Idempotent: unlinking a pair that is not linked changes nothing. Audited.",
    scope: "write",
    inputSchema: z.object({
      parentId: recordIdSchema.describe("Parent account id."),
      studentId: recordIdSchema.describe("Student account id."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: !linked, idempotentHint: true, openWorldHint: false },
    run(args, ctx) {
      const result = adminSetParentLink(actorOf(ctx), args.parentId, args.studentId, linked, ctx.now);
      if (!result.ok) return fail(result.error, LINK_ERRORS[result.error] ?? "The link could not be changed.");
      const verb = linked ? "linked to" : "unlinked from";
      return {
        ok: true,
        summary: result.changed
          ? `Parent ${args.parentId} ${verb} student ${args.studentId}.`
          : `No change: parent ${args.parentId} was already ${linked ? "linked to" : "not linked to"} student ${args.studentId}.`,
        data: { parentId: args.parentId, studentId: args.studentId, linked, changed: result.changed },
        audit: result.changed ? { target: args.parentId, details: { studentId: args.studentId } } : undefined,
      };
    },
  });
}

export const linkParentStudent = linkTool(true);
export const unlinkParentStudent = linkTool(false);

export const setAccountDisabled = defineTool({
  name: "set_account_disabled",
  title: "Disable or enable a student/parent account",
  description:
    "WRITE (needs a 'read write' token). Disables (disabled: true) or re-enables (disabled: false) a STUDENT or PARENT account. " +
    "Disabling signs the user out everywhere immediately and blocks sign-in; a disabled student also disappears from linked parents' portals. " +
    "Admin accounts cannot be changed via MCP (use the admin portal). Idempotent. Audited.",
  scope: "write",
  inputSchema: z.object({
    userId: recordIdSchema.describe("Student or parent account id."),
    disabled: z.boolean().describe("true = disable, false = enable."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  run(args, ctx) {
    const target = adminGetUser(args.userId);
    if (!target) return fail("not_found", "No account has this id. Use list_accounts to find the right id.");
    if (target.role === "admin") {
      return fail("forbidden", "Admin accounts cannot be disabled or enabled via MCP. An admin must use the admin portal.");
    }
    const result = adminUpdateUser(actorOf(ctx), args.userId, { disabled: args.disabled }, ctx.now);
    if (!result.ok) {
      return fail(result.error, result.error === "not_found" ? "No account has this id." : "The account could not be changed.");
    }
    const changed = target.disabled !== args.disabled;
    const account = toMcpAccount(result.user);
    return {
      ok: true,
      summary: changed
        ? `${account.role} "${account.displayName}" is now ${account.disabled ? "disabled" : "enabled"}${account.disabled ? ` (${result.revokedSessions} session(s) signed out)` : ""}.`
        : `No change: ${account.role} "${account.displayName}" was already ${account.disabled ? "disabled" : "enabled"}.`,
      data: compact({ account, changed, signedOutSessions: account.disabled && changed ? result.revokedSessions : undefined }),
      audit: changed ? { target: account.id, details: { role: account.role, disabled: account.disabled } } : undefined,
    };
  },
});
