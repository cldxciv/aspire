#!/usr/bin/env node
/**
 * Creates an admin account. This is how the FIRST admin is created on a new server
 * (production included); after that, admins manage accounts through /api/admin/users.
 *
 *   npm run auth:create-admin -- --login-id <id> --name "<display name>"
 *
 * The password is typed at a hidden prompt (twice). For non-interactive use set
 * AUTH_ADMIN_PASSWORD in the environment for that one command; the admin then has to
 * change it at first sign-in. The password is never printed, logged or written to a file.
 * `--login-id` / `--name` may also come from AUTH_ADMIN_LOGIN_ID / AUTH_ADMIN_NAME.
 *
 * Database: AUTH_DB_PATH (default .data/aspire.sqlite). Run through the npm script: it
 * passes `--conditions=react-server` so the `server-only` markers in src/lib resolve.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import {
  isValidDisplayName,
  isValidLoginId,
  LOGIN_ID_RULES,
  normalizeDisplayName,
  normalizeLoginId,
} from "../src/lib/auth/identifiers.ts";
import { checkPasswordPolicy, hashPassword, PASSWORD_POLICY_MESSAGES } from "../src/lib/auth/password.ts";
import { recordAudit } from "../src/lib/db/audit.ts";
import { openDatabase, resolveDbPath, withTransaction } from "../src/lib/db/connection.ts";
import { findUserByLoginId, insertUser } from "../src/lib/db/users.ts";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

/** Reads a line without echoing it (TTY only). */
function promptHidden(question) {
  return new Promise((resolvePrompt) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolvePrompt(answer);
    });
    muted = true;
  });
}

const loginId = normalizeLoginId(argValue("--login-id") ?? process.env.AUTH_ADMIN_LOGIN_ID ?? "");
const displayName = normalizeDisplayName(argValue("--name") ?? process.env.AUTH_ADMIN_NAME ?? "");
if (!isValidLoginId(loginId)) fail(`Pass --login-id: ${LOGIN_ID_RULES}`);
if (!isValidDisplayName(displayName)) fail('Pass --name "<display name>" (1–100 characters).');

let password = process.env.AUTH_ADMIN_PASSWORD;
const fromEnvironment = typeof password === "string" && password.length > 0;
if (!fromEnvironment) {
  if (!process.stdin.isTTY) fail("No terminal to prompt for a password: set AUTH_ADMIN_PASSWORD for this command instead.");
  password = await promptHidden("New admin password: ");
  const confirmation = await promptHidden("Repeat the password: ");
  if (password !== confirmation) fail("The passwords did not match. Nothing was changed.");
}
const issue = checkPasswordPolicy(password, loginId);
if (issue) fail(`${PASSWORD_POLICY_MESSAGES[issue]} Nothing was changed.`);

const db = openDatabase(resolveDbPath());
if (findUserByLoginId(db, loginId)) {
  db.close();
  fail(`An account with login id "${loginId}" already exists. Nothing was changed.`);
}
const passwordHash = await hashPassword(password);
const now = Date.now();
withTransaction(db, () => {
  const user = insertUser(db, {
    role: "admin",
    displayName,
    loginId,
    passwordHash,
    // A password that passed through the environment must be replaced at first sign-in.
    mustChangePassword: fromEnvironment,
    now,
  });
  recordAudit(db, {
    actorId: null,
    action: "bootstrap.admin_create",
    target: user.id,
    details: { role: "admin", loginId, fromEnvironment },
    now,
  });
});
db.close();

console.log(
  `Admin account "${loginId}" created.` +
    (fromEnvironment ? " The password from AUTH_ADMIN_PASSWORD must be changed at first sign-in." : ""),
);
