import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/lib/auth/roles";

/**
 * Rancho as the installable app: the web app manifest, the icon route, the /rancho app home
 * (en + hi: chat, localised tool links, sign-in card), the /tools card, the footer link and the
 * ranchoApp messages. The install bar's rules are unit-tested in ./install-platform.test.ts.
 */

const sessionState = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth/page-session", () => ({ getPageSession: async () => sessionState.session }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { NextRequest } = await import("next/server");
const { default: manifest } = await import("@/app/manifest");
const iconRoute = await import("@/app/api/rancho/icon/route");
const { default: RanchoAppPage, generateMetadata } = await import("@/app/[lang]/(site)/rancho/page");
const { metadata: siteMetadata } = await import("@/app/[lang]/(site)/layout");
const { default: ToolsPage } = await import("@/app/[lang]/(site)/tools/page");
const { RanchoAccountCard, RanchoAccountFallback } = await import("./RanchoAccountCard");
const { SiteFooter } = await import("@/components/layout/SiteFooter");
const { SiteHeader } = await import("@/components/layout/SiteHeader");
const { LocaleProvider } = await import("@/i18n/client");
const { messagesFor } = await import("@/i18n/messages");
const { setTestLang, withTestLang } = await import("@/test/root-params-stub");
const { ranchoIconSvg } = await import("./rancho-icon");

type Lang = "en" | "hi";

afterEach(() => {
  setTestLang("en");
  sessionState.session = null;
  vi.unstubAllEnvs();
});

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

function withLocale(lang: Lang, node: ReactNode) {
  return createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, node);
}

describe("web app manifest", () => {
  it("installs Rancho, starting at /rancho", () => {
    const m = manifest();
    expect(m).toMatchObject({
      id: "/rancho",
      name: "Rancho — Aspire IIT & Medical",
      short_name: "Rancho",
      start_url: "/rancho",
      scope: "/",
      display: "standalone",
      theme_color: "#0b2d5b",
      background_color: "#f8fafc",
    });
    expect(m.description).toMatch(/AI doubt solver/);
    expect(m.description).toMatch(/predictor/);
    expect(JSON.stringify(m)).not.toMatch(/Study Planner"|planner\/icon/);
  });

  it("has 192/512 icons and a maskable 512 from the Rancho icon route", () => {
    const icons = manifest().icons ?? [];
    expect(icons).toEqual([
      { src: "/api/rancho/icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/rancho/icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/rancho/icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });

  it("has shortcuts for a doubt, the tools and Hindi", () => {
    const urls = (manifest().shortcuts ?? []).map((s) => s.url);
    expect(urls).toEqual(["/rancho", "/tools/predictor", "/tools/mock-tests", "/tools/planner", "/hi/rancho"]);
    for (const shortcut of manifest().shortcuts ?? []) {
      expect(shortcut.name.trim()).not.toBe("");
      expect(shortcut.icons?.[0]?.src).toBe("/api/rancho/icon?size=192");
    }
    expect(manifest().shortcuts?.at(-1)?.name).toMatch(/[ऀ-ॿ]/);
  });

  it("the (site) layout gives iOS the 180px icon and the name Rancho", () => {
    expect(siteMetadata.icons).toEqual({ apple: [{ url: "/api/rancho/icon?size=180", sizes: "180x180", type: "image/png" }] });
    expect(siteMetadata.appleWebApp).toMatchObject({ capable: true, title: "Rancho" });
  });
});

describe("/api/rancho/icon", () => {
  async function png(query: string) {
    const response = await iconRoute.GET(new NextRequest(`http://localhost/api/rancho/icon?${query}`));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { response, bytes, width: view.getUint32(16), height: view.getUint32(20) };
  }

  it.each([
    ["size=180", 180],
    ["size=192", 192],
    ["size=512", 512],
    ["size=512&maskable=1", 512],
    ["size=9999", 192],
    ["", 192],
  ])("%s → a %dpx PNG with cache headers", async (query, size) => {
    const { response, bytes, width, height } = await png(query);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(String.fromCharCode(...bytes.slice(1, 4))).toBe("PNG");
    expect([width, height]).toEqual([size, size]);
  });

  it("draws Rancho on a navy disc with a gold ring; maskable and apple icons are full-bleed", () => {
    const any = ranchoIconSvg("any");
    expect(any).toContain("#f4c44e"); // gold ring
    expect(any).toContain("#0b2d5b"); // navy
    expect(any).toContain("#7f9bad"); // blue-grey eyes
    expect(any).not.toContain('<rect width="100" height="100"');
    for (const variant of ["maskable", "apple"] as const) expect(ranchoIconSvg(variant)).toContain('<rect width="100" height="100" fill="#0b2d5b"/>');
    // Maskable: the disc (radius 50 × 0.78 = 39) stays inside the 40 % safe-zone radius.
    expect(ranchoIconSvg("maskable")).toContain("scale(0.78)");
    expect(any).not.toMatch(/<text|<script|href="http/);
  });
});

describe("/rancho app home", () => {
  async function render(lang: Lang): Promise<string> {
    return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, (await RanchoAppPage()) as ReactNode)));
  }

  it.each(["en", "hi"] as const)("renders in %s: greeting, the Rancho chat, localised tool links, sign-in card", async (lang) => {
    const html = await render(lang);
    const t = messagesFor(lang, "ranchoApp");
    const ask = messagesFor(lang, "ask");
    const prefix = lang === "hi" ? "/hi" : "";
    const text = html.replace(/<[^>]+>/g, " ");

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(escape(t.home.title));
    expect(html).toContain(escape(t.home.aiNote));
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*data-rancho="head"/);
    expect(html).toContain(`>${escape(t.home.mascotLabel)}</title>`);

    // The same chat as /tools/ask (AskAspire, owned by the chat UI): its composer, the AI caveat and
    // the privacy notice in reach. Only these stable pieces are checked here; ask-page.test.ts and
    // the rancho tests cover the chat itself.
    expect(html).toContain(escape(ask.chat.placeholder));
    expect(html).toContain(escape(ask.chat.disclaimer));
    expect(html).toContain(`href="${prefix}/privacy"`);

    // Tool tiles, localised.
    expect(html).toContain(escape(t.tools.title));
    for (const path of ["/tools/predictor", "/tools/mock-tests", "/tools/mock-tests/leaderboard", "/tools/planner", "/tools"]) {
      expect(html).toContain(`href="${prefix}${path}"`);
    }
    for (const key of ["predictor", "mockTests", "planner", "allTools"] as const) expect(html).toContain(escape(t.tools[key].title));

    // The sign-in card is request-time: the static render only has its placeholder (or the
    // signed-out card), never anything about a visitor.
    expect(html).toContain(escape(t.account.title));
    expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);
    // The desktop install card is client-only (nothing until the browser offers a prompt).
    expect(html).not.toContain(escape(t.install.card.title));
  });

  it("has localised metadata with alternates", async () => {
    const en = await generateMetadata();
    expect(en.title).toBe(messagesFor("en", "ranchoApp").meta.title);
    expect(en.alternates?.canonical).toBe("/rancho");
    const hi = await withTestLang("hi", () => generateMetadata());
    expect(hi.title).toBe(messagesFor("hi", "ranchoApp").meta.title);
    expect(hi.alternates?.canonical).toBe("/hi/rancho");
  });
});

describe("Rancho sign-in card", () => {
  const auth = (lang: Lang) => {
    const a = messagesFor(lang, "auth");
    return { roles: a.roles, signOut: a.signOut };
  };

  it.each(["en", "hi"] as const)("signed out (%s): student and parent sign-in links in the page's language", async (lang) => {
    const t = messagesFor(lang, "ranchoApp").account;
    const html = renderToStaticMarkup(withLocale(lang, await RanchoAccountCard({ locale: lang, t, auth: auth(lang) })));
    const prefix = lang === "hi" ? "/hi" : "";
    expect(html).toContain(`href="${prefix}/login?role=student"`);
    expect(html).toContain(`href="${prefix}/login?role=parent"`);
    expect(html).toContain(escape(t.student));
    expect(html).toContain(escape(t.parent));
    expect(html).not.toContain(t.openPortal);
  });

  it("signed in: name, role and a link to the portal; Sign out returns to /rancho", async () => {
    sessionState.session = { userId: "u1", role: "student", displayName: "Asha Test", issuedAt: 1, expiresAt: 2 } as unknown as Session;
    const t = messagesFor("hi", "ranchoApp").account;
    const html = renderToStaticMarkup(withLocale("hi", await RanchoAccountCard({ locale: "hi", t, auth: auth("hi") })));
    expect(html).toContain(escape(t.signedInAs.replace("{name}", "Asha Test")));
    expect(html).toContain(t.roleLine.replace("{role}", messagesFor("hi", "auth").roles.student));
    expect(html).toContain('href="/hi/student"');
    expect(html).toContain(messagesFor("hi", "auth").signOut.label);
    expect(html).not.toContain("/login?role=");
  });

  it("a temporary password goes to the change-password page first", async () => {
    sessionState.session = { userId: "u2", role: "parent", displayName: "P", mustChangePassword: true } as unknown as Session;
    const t = messagesFor("en", "ranchoApp").account;
    const html = renderToStaticMarkup(withLocale("en", await RanchoAccountCard({ locale: "en", t, auth: auth("en") })));
    expect(html).toContain('href="/account/password"');
  });

  it("the placeholder carries no visitor data", () => {
    const t = messagesFor("en", "ranchoApp").account;
    const html = renderToStaticMarkup(createElement(RanchoAccountFallback, { t }));
    expect(html).toContain(escape(t.checking));
    expect(html).toContain('aria-busy="true"');
  });
});

describe("site chrome and the tools hub", () => {
  it.each(["en", "hi"] as const)("footer links to the Rancho app (%s)", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    setTestLang(lang);
    const html = renderToStaticMarkup(await SiteFooter());
    expect(html).toContain(`href="${lang === "hi" ? "/hi/rancho" : "/rancho"}"`);
    expect(html).toContain(messagesFor(lang, "ranchoApp").footerLink);
  });

  it("the install bar is client-only: nothing in the header's static HTML", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = renderToStaticMarkup(await SiteHeader());
    expect(html).not.toContain(messagesFor("en", "ranchoApp").install.bar.title);
    expect(html).toContain('data-surface="dark"');
  });

  it.each(["en", "hi"] as const)("/tools has a Rancho app card linking to /rancho (%s)", async (lang) => {
    const html = await withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, (await ToolsPage()) as ReactNode)));
    const t = messagesFor(lang, "ranchoApp").toolsCard;
    expect(html).toContain(escape(t.title));
    expect(html).toContain(`href="${lang === "hi" ? "/hi/rancho" : "/rancho"}"`);
    expect(html).toContain(`alt="${escape(t.iconLabel)}"`);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("ranchoApp messages", () => {
  function leaves(value: unknown, prefix = ""): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
      }
    } else {
      out.set(prefix, value);
    }
    return out;
  }

  it("Hindi has exactly the English keys, non-empty, with the same placeholders", () => {
    const en = leaves(messagesFor("en", "ranchoApp"));
    const hi = leaves(messagesFor("hi", "ranchoApp"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
  });

  it("keeps Rancho an AI and never a person", () => {
    expect(messagesFor("en", "ranchoApp").home.aiNote).toMatch(/I'm an AI/);
    expect(messagesFor("hi", "ranchoApp").home.aiNote).toMatch(/AI/);
    expect(messagesFor("en", "ranchoApp").home.aiNote).toMatch(/check .* with your teacher/);
  });
});
