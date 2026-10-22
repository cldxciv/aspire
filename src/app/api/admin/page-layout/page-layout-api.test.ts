import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Page-layout admin API, preview and exit routes against a fresh in-memory database per test
// (docs/page-layout-plan.md §9, §12.2). The REAL super-admin module is used: `requireSuperAdmin`
// calls `isSuperAdmin` inside the same module, where a module mock would not reach.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
const draft = vi.hoisted(() => ({ isEnabled: false, enable: vi.fn(), disable: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState), draftMode: async () => draft };
});
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: cache.revalidateTag,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { upsertGrant } = await import("@/lib/db/super-admins");
const { AUTH_MESSAGES } = await import("@/lib/auth/messages");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { resetLayoutRateLimitForTests, LAYOUT_WRITE_LIMIT } = await import("@/lib/page-layout/access");
const { movableKeys } = await import("@/lib/page-layout/registry");
const login = await import("@/app/api/auth/login/route");
const pageRoute = await import("./[page]/route");
const previewRoute = await import("./preview/route");
const exitRoute = await import("@/app/api/page-layout/preview/exit/route");

type Browser = InstanceType<typeof TestBrowser>;
type Entry = { key: string; hidden: boolean };

// Synthetic accounts only.
const SUPER = { role: "admin" as const, loginId: "layout.super", password: "layout-super-2026", displayName: "Anu Layout" };
const PLAIN = { role: "admin" as const, loginId: "layout.plain", password: "layout-plain-2026" };
const STUDENT = { role: "student" as const, loginId: "layout.student", password: "layout-student-2026" };
const EVIL = { origin: "https://evil.example" };
const FORM = "application/x-www-form-urlencoded";

let ipCounter = 0;
function browser(): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.18.1.${ipCounter % 250}`);
}

async function signedIn(credentials: { loginId: string; password: string }): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: credentials });
  expect(response.status).toBe(200);
  return b;
}

/** Super admin A (explicit grant), plain admin B (no grant), a student. */
async function setup() {
  const a = await createTestUser(SUPER);
  await createTestUser(PLAIN);
  await createTestUser(STUDENT);
  upsertGrant(getDb(), { userId: a.id, via: "cli", by: null, now: Date.now() });
  return { a: await signedIn(SUPER), b: await signedIn(PLAIN), aId: a.id };
}

const api = {
  get: (b: Browser, page: string) => b.send(pageRoute.GET, `/api/admin/page-layout/${page}`, {}, params({ page })),
  post: (b: Browser, page: string, body: unknown, options = {}) =>
    b.send(pageRoute.POST, `/api/admin/page-layout/${page}`, { body, ...options }, params({ page })),
  preview: (b: Browser, form: string, options = {}) =>
    b.send(previewRoute.POST, "/api/admin/page-layout/preview", { method: "POST", body: form, contentType: FORM, ...options }),
  exit: (b: Browser, form: string, options = {}) =>
    b.send(exitRoute.POST, "/api/page-layout/preview/exit", { method: "POST", body: form, contentType: FORM, ...options }),
};

const home = (): Entry[] => movableKeys("home").map((key) => ({ key, hidden: false }));

async function data(response: Response) {
  return (await response.json()).data as {
    revision: number;
    published: { sections: Entry[]; custom: boolean };
    draft: { sections: Entry[] } | null;
    history: { action: string; actor: string | null }[];
  };
}

async function issues(response: Response): Promise<string[]> {
  expect(response.status).toBe(422);
  return (await response.json()).fieldErrors.sections as string[];
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetLayoutRateLimitForTests();
  draft.enable.mockClear();
  draft.disable.mockClear();
  cache.revalidateTag.mockClear();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("access control", () => {
  it("401 when signed out, on GET and POST", async () => {
    const b = browser();
    for (const response of [await api.get(b, "home"), await api.post(b, "home", { action: "reset", revision: 0 })]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("403 for a student, on GET and POST", async () => {
    await setup();
    const s = await signedIn(STUDENT);
    expect((await api.get(s, "home")).status).toBe(403);
    expect((await api.post(s, "home", { action: "reset", revision: 0 })).status).toBe(403);
  });

  it("403 for a cross-origin POST, even from the super admin", async () => {
    const { a } = await setup();
    expect((await api.post(a, "home", { action: "reset", revision: 0 }, EVIL)).status).toBe(403);
    expect(listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action.startsWith("layout."))).toEqual([]);
  });

  it("404 for an unknown page", async () => {
    const { a } = await setup();
    expect((await api.get(a, "nowhere")).status).toBe(404);
    expect((await api.post(a, "nowhere", { action: "reset", revision: 0 })).status).toBe(404);
  });

  it("a plain admin can read but not write", async () => {
    const { b } = await setup();
    const read = await api.get(b, "home");
    expect(read.status).toBe(200);
    const state = await data(read);
    expect(state.revision).toBe(0);
    expect(state.published.custom).toBe(false);
    expect(state.published.sections).toEqual(home());
    const write = await api.post(b, "home", { action: "save_draft", revision: 0, sections: home() });
    expect(write.status).toBe(403);
    expect((await write.json()).message).toBe(AUTH_MESSAGES.superAdminOnly);
  });
});

describe("validation", () => {
  it("422 with the rule codes", async () => {
    const { a } = await setup();
    // tools followed only by conditional sections (voices, impact, resources)
    const reordered = ["stats", "results", "programs", "why", "centres", "life", "tools", "voices", "impact", "resources"].map(
      (key) => ({ key, hidden: false }),
    );
    expect(await issues(await api.post(a, "home", { action: "save_draft", revision: 0, sections: reordered }))).toEqual([
      "not_last:tools",
    ]);
    expect(
      await issues(await api.post(a, "admissions", { action: "save_draft", revision: 0, sections: [{ key: "enquiry", hidden: true }] })),
    ).toEqual(["cannot_hide:enquiry"]);
    expect(
      await issues(
        await api.post(a, "home", {
          action: "save_draft",
          revision: 0,
          sections: [
            { key: "results", hidden: false },
            { key: "results", hidden: false },
          ],
        }),
      ),
    ).toEqual(["duplicate:results"]);
    const hideAlways = home().map((entry) => ({ ...entry, hidden: ["results", "programs", "tools", "why", "life"].includes(entry.key) }));
    expect(await issues(await api.post(a, "home", { action: "save_draft", revision: 0, sections: hideAlways }))).toEqual([
      "none_visible",
    ]);
    expect(await issues(await api.post(a, "home", { action: "publish", revision: 0 }))).toEqual(["no_draft"]);
    expect(await issues(await api.post(a, "home", { action: "discard_draft", revision: 0 }))).toEqual(["no_draft"]);
  });

  it("rejects a malformed body (strict schema) and a non-JSON body", async () => {
    const { a } = await setup();
    expect((await api.post(a, "home", { action: "publish", revision: 0, extra: 1 })).status).toBe(422);
    expect((await api.post(a, "home", { action: "save_draft", revision: 0, sections: [{ key: "Bad-Key", hidden: false }] })).status).toBe(422);
    expect((await api.post(a, "home", { action: "explode", revision: 0 })).status).toBe(422);
    expect((await api.post(a, "home", "action=reset", { contentType: FORM })).status).toBe(415);
  });

  it("409 on a stale revision", async () => {
    const { a } = await setup();
    const first = await api.post(a, "home", { action: "save_draft", revision: 0, sections: home() });
    expect(first.status).toBe(200);
    expect((await data(first)).revision).toBeGreaterThanOrEqual(1);
    const stale = await api.post(a, "home", { action: "save_draft", revision: 0, sections: home() });
    expect(stale.status).toBe(409);
  });
});

describe("save → publish → reset", () => {
  it("revalidates the page only on publish and reset, and audits every action", async () => {
    const { a, aId } = await setup();
    const moved = home();
    const tools = moved.findIndex((entry) => entry.key === "tools");
    [moved[tools], moved[tools + 1]] = [moved[tools + 1], moved[tools]]; // tools below "why"
    const voices = moved.findIndex((entry) => entry.key === "voices");
    moved[voices] = { key: "voices", hidden: true };

    const saved = await api.post(a, "home", { action: "save_draft", revision: 0, sections: moved });
    expect(saved.status).toBe(200);
    const afterSave = await data(saved);
    expect(afterSave.draft?.sections).toEqual(moved);
    expect(afterSave.published.custom).toBe(false);
    expect(cache.revalidateTag).not.toHaveBeenCalled();

    const published = await api.post(a, "home", { action: "publish", revision: afterSave.revision });
    expect(published.status).toBe(200);
    const afterPublish = await data(published);
    expect(afterPublish.published).toMatchObject({ custom: true, sections: moved });
    expect(afterPublish.draft).toBeNull();
    expect(cache.revalidateTag).toHaveBeenCalledTimes(1);
    expect(cache.revalidateTag).toHaveBeenLastCalledWith("page-layout:home", { expire: 0 });

    const reset = await api.post(a, "home", { action: "reset", revision: afterPublish.revision });
    expect(reset.status).toBe(200);
    const afterReset = await data(reset);
    expect(afterReset.published).toMatchObject({ custom: false, sections: home() });
    expect(afterReset.history.map((item) => item.action)).toEqual(["reset", "publish", "save_draft"]);
    expect(afterReset.history[0].actor).toBe(SUPER.displayName);
    expect(cache.revalidateTag).toHaveBeenCalledTimes(2);
    expect(cache.revalidateTag).toHaveBeenLastCalledWith("page-layout:home", { expire: 0 });

    const audit = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action.startsWith("layout."));
    expect(audit.map((entry) => entry.action)).toEqual(["layout.reset", "layout.publish", "layout.save_draft"]);
    for (const entry of audit) {
      expect(entry.actorId).toBe(aId);
      expect(entry.target).toBe("page-layout:home");
      expect(entry.details.page).toBe("home");
    }
    expect(audit[1].details).toMatchObject({ moved: 1, hidden: 1, shown: 0 });
    expect(typeof audit[1].details.order).toBe("string");
    expect(audit[0].details.order).toBe("default");

    // A discard after a new save: audited, nothing revalidated.
    const again = await api.post(a, "home", { action: "save_draft", revision: afterReset.revision, sections: moved });
    const discarded = await api.post(a, "home", { action: "discard_draft", revision: (await data(again)).revision });
    expect(discarded.status).toBe(200);
    expect((await data(discarded)).draft).toBeNull();
    expect(cache.revalidateTag).toHaveBeenCalledTimes(2);
    expect(listAudit(getDb(), { limit: 1 })[0].action).toBe("layout.discard_draft");
  });

  it(`429 after ${LAYOUT_WRITE_LIMIT.limit} writes`, async () => {
    const { a } = await setup();
    for (let i = 0; i < LAYOUT_WRITE_LIMIT.limit; i += 1) {
      expect((await api.post(a, "home", { action: "discard_draft", revision: 0 })).status).toBe(422);
    }
    const limited = await api.post(a, "home", { action: "discard_draft", revision: 0 });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Reads are not limited.
    expect((await api.get(a, "home")).status).toBe(200);
  });
});

describe("preview (Draft Mode)", () => {
  it("a super admin is sent to the page with Draft Mode on", async () => {
    const { a } = await setup();
    const response = await api.preview(a, "lang=hi&page=about");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/hi/about");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(draft.enable).toHaveBeenCalledTimes(1);
  });

  it("a plain admin goes back to the editor, without Draft Mode", async () => {
    const { b } = await setup();
    const response = await api.preview(b, "lang=hi&page=about");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/hi/admin/page-layout?page=about");
    expect(draft.enable).not.toHaveBeenCalled();
  });

  it("an unknown page goes back to the editor", async () => {
    const { a } = await setup();
    expect((await api.preview(a, "lang=en&page=nowhere")).headers.get("location")).toBe("/admin/page-layout");
    expect((await api.preview(a, "page=%2F%2Fevil.example")).headers.get("location")).toBe("/admin/page-layout");
    expect(draft.enable).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin form", async () => {
    const { a } = await setup();
    const response = await api.preview(a, "lang=en&page=home", EVIL);
    expect(response.status).toBe(403);
    expect(draft.enable).not.toHaveBeenCalled();
  });
});

describe("exit preview (outside the portal API)", () => {
  it("works without a session and returns to the page", async () => {
    const response = await api.exit(browser(), "lang=hi&page=tools");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/hi/tools");
    expect(draft.disable).toHaveBeenCalledTimes(1);
  });

  it("an unknown page goes home; lang=hi without a page goes to /hi", async () => {
    expect((await api.exit(browser(), "page=nowhere")).headers.get("location")).toBe("/");
    expect((await api.exit(browser(), "lang=hi")).headers.get("location")).toBe("/hi");
    expect((await api.exit(browser(), "lang=xx&page=https%3A%2F%2Fevil.example")).headers.get("location")).toBe("/");
  });

  it("refuses a cross-origin form", async () => {
    const response = await api.exit(browser(), "lang=en&page=home", EVIL);
    expect(response.status).toBe(403);
    expect(draft.disable).not.toHaveBeenCalled();
  });
});
