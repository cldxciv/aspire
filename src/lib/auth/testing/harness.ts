/**
 * Test-only helpers for the auth route-handler tests (never imported by app code).
 *
 * Each test file mocks `next/headers` so `cookies()` reads a shared `CookieState`:
 *
 *   const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
 *   vi.mock("next/headers", async () => {
 *     const { cookieStore } = await import("@/lib/auth/testing/harness");
 *     return { cookies: async () => cookieStore(cookieState) };
 *   });
 *
 * A `TestBrowser` keeps its own jar, sends it with every request and absorbs
 * `Set-Cookie` headers from responses, like a real browser would. Databases are
 * in-memory (NODE_ENV=test → `:memory:`); call `resetDatabaseForTests()` between tests.
 */
import { NextRequest } from "next/server";

import { getDb } from "@/lib/db/connection";
import { insertParentLink } from "@/lib/db/links";
import { insertUser, setUserDisabled, type UserRecord } from "@/lib/db/users";

import { AUTH_COOKIE_NAME } from "../config";
import { hashPassword } from "../password";
import type { Role } from "../roles";

/** Creates an account directly in the (test) database. */
export async function createTestUser(input: {
  role: Role;
  loginId: string;
  password: string;
  displayName?: string;
  mustChangePassword?: boolean;
  disabled?: boolean;
}): Promise<UserRecord> {
  const db = getDb();
  const now = Date.now();
  const user = insertUser(db, {
    role: input.role,
    loginId: input.loginId,
    displayName: input.displayName ?? `Test ${input.role} ${input.loginId}`,
    passwordHash: await hashPassword(input.password),
    mustChangePassword: input.mustChangePassword ?? false,
    now,
  });
  if (input.disabled) setUserDisabled(db, user.id, true, now);
  return user;
}

export function linkTestParent(parentId: string, studentId: string): void {
  insertParentLink(getDb(), { parentId, studentId, createdBy: null, now: Date.now() });
}

export const TEST_ORIGIN = "http://localhost:3000";

export interface CookieState {
  jar: Map<string, string>;
}

/** The subset of Next's cookie store our code uses. */
export function cookieStore(state: CookieState) {
  return {
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) as string } : undefined),
    has: (name: string) => state.jar.has(name),
  };
}

export interface RequestOptions {
  method?: string;
  /** JSON-encoded unless a string. */
  body?: unknown;
  /** `null` omits the Origin header. Default: the site's own origin. */
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
}

type Handler<C> = (request: NextRequest, ctx: C) => Promise<Response> | Response;

export class TestBrowser {
  readonly jar = new Map<string, string>();

  constructor(
    private readonly cookieState: CookieState,
    readonly ip: string = "203.0.113.10",
  ) {}

  get sessionToken(): string | undefined {
    return this.jar.get(AUTH_COOKIE_NAME);
  }

  request(path: string, options: RequestOptions = {}): NextRequest {
    const headers = new Headers(options.headers);
    headers.set("x-forwarded-for", this.ip);
    headers.set("user-agent", "vitest-browser/1.0");
    const origin = options.origin === undefined ? TEST_ORIGIN : options.origin;
    if (origin !== null) headers.set("origin", origin);
    let body: string | undefined;
    if (options.body !== undefined) {
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      const contentType = options.contentType === undefined ? "application/json" : options.contentType;
      if (contentType !== null) headers.set("content-type", contentType);
    }
    if (this.jar.size > 0) {
      headers.set(
        "cookie",
        [...this.jar].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    return new NextRequest(`${TEST_ORIGIN}${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers,
      body,
    });
  }

  /** Calls a route handler as this browser: its jar is what `cookies()` sees. */
  async send<C = undefined>(
    handler: Handler<C>,
    path: string,
    options: RequestOptions = {},
    ctx?: C,
  ): Promise<Response> {
    this.cookieState.jar = this.jar;
    const response = await handler(this.request(path, options), ctx as C);
    this.absorb(response);
    return response;
  }

  /** Applies `Set-Cookie` headers (Max-Age=0 or an empty value deletes). */
  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";").map((part) => part.trim());
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute)) || value === "";
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}

/** Route context for dynamic segments. */
export function params<T extends Record<string, string>>(values: T): { params: Promise<T> } {
  return { params: Promise.resolve(values) };
}
