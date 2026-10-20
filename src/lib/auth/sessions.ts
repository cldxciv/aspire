import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getDb, withTransaction } from "@/lib/db/connection";
import { listLinkedStudents } from "@/lib/db/links";
import {
  deleteExpiredSessions,
  deleteSession,
  deleteUserSessions,
  findSessionByTokenHash,
  insertSession,
  touchSession,
  trimUserSessions,
} from "@/lib/db/sessions";
import { findUserById, type UserRecord } from "@/lib/db/users";

import { isValidSession, type Session } from "./roles";

/**
 * Server-side sessions (D-029). The browser holds a random 32-byte token (base64url)
 * in the `aspire_session` cookie; the database stores only its SHA-256. A session is
 * valid for 7 days after the last activity (activity is recorded at most once an hour)
 * and never longer than 30 days after sign-in.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
export const MAX_SESSIONS_PER_USER = 10;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const USER_AGENT_MAX = 120;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap shape check before any database work (43 base64url characters). */
export function isWellFormedSessionToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** First 120 printable characters of the User-Agent, for the "active sessions" view. */
export function shortUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, USER_AGENT_MAX);
  return clean.length > 0 ? clean : null;
}

/** The `Session` handed to guards and pages; parents get their (enabled) linked learners. */
export function buildSession(user: UserRecord, linkedStudentIds?: readonly string[]): Session {
  const session: Session = {
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    loginId: user.loginId,
    mustChangePassword: user.mustChangePassword,
  };
  if (user.role === "parent") session.linkedStudentIds = [...(linkedStudentIds ?? [])];
  return session;
}

export interface NewSession {
  token: string;
  tokenHash: string;
  expiresAt: number;
}

/**
 * Creates a session for a user who has just proven their identity. Also prunes expired
 * sessions and keeps at most 10 per user (oldest dropped).
 */
export function createSession(userId: string, options: { userAgent?: string | null; now?: number } = {}): NewSession {
  const now = options.now ?? Date.now();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = now + SESSION_TTL_MS;
  const db = getDb();
  withTransaction(db, () => {
    deleteExpiredSessions(db, now);
    insertSession(db, { tokenHash, userId, now, expiresAt, userAgent: shortUserAgent(options.userAgent) });
    trimUserSessions(db, userId, MAX_SESSIONS_PER_USER);
  });
  return { token, tokenHash, expiresAt };
}

export interface ResolvedSession {
  session: Session;
  user: UserRecord;
  tokenHash: string;
  expiresAt: number;
  /** True when this lookup extended the expiry (the cookie should be re-issued). */
  refreshed: boolean;
}

/**
 * Validates a session token: well-formed, known, not expired, account still enabled.
 * Anything else → `null` (and a dead row is deleted). Throws only on database errors;
 * callers treat that as signed out.
 */
export function resolveSessionToken(token: unknown, now: number = Date.now()): ResolvedSession | null {
  if (!isWellFormedSessionToken(token)) return null;
  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const record = findSessionByTokenHash(db, tokenHash);
  if (!record) return null;
  if (record.expiresAt <= now) {
    deleteSession(db, tokenHash);
    return null;
  }
  const user = findUserById(db, record.userId);
  if (!user || user.disabled) {
    deleteSession(db, tokenHash);
    return null;
  }

  let expiresAt = record.expiresAt;
  let refreshed = false;
  if (now - record.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    expiresAt = Math.min(now + SESSION_TTL_MS, record.createdAt + SESSION_ABSOLUTE_MAX_MS);
    touchSession(db, tokenHash, now, expiresAt);
    refreshed = true;
    if (expiresAt <= now) return null;
  }

  const linked = user.role === "parent" ? listLinkedStudents(db, user.id).map((student) => student.id) : undefined;
  const session = buildSession(user, linked);
  if (!isValidSession(session)) return null;
  return { session, user, tokenHash, expiresAt, refreshed };
}

/** Deletes the session behind a token (sign-out). Returns true when one existed. */
export function revokeSessionToken(token: unknown): boolean {
  if (!isWellFormedSessionToken(token)) return false;
  return deleteSession(getDb(), hashSessionToken(token));
}

/** Deletes all of a user's sessions, optionally keeping the current one. */
export function revokeUserSessions(userId: string, options: { exceptTokenHash?: string } = {}): number {
  return deleteUserSessions(getDb(), userId, options);
}
