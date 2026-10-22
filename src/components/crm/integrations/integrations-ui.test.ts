import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/crm/settings/integrations",
}));

import enCrm from "@/i18n/messages/en/crm";
import enMeta from "@/i18n/messages/en/crm-meta";
import hiCrm from "@/i18n/messages/hi/crm";
import hiMeta from "@/i18n/messages/hi/crm-meta";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { DEFAULT_META_CONFIG, DEFAULT_META_STATUS, META_INBOX_STATUSES, type MetaInboxStatus, type MetaSecretName, type MetaSecretState } from "@/lib/crm/lead-ops-types";
import { META_REQUIRED_SCOPES, type MetaInboxItem, type MetaIntegrationView } from "@/lib/crm/meta/types";
import { ConnectionStatus } from "./ConnectionStatus";
import { FailedLeadsList } from "./FailedLeadsList";
import { MetaIntegrationPage } from "./MetaIntegrationPage";
import { actionSummary, checklistStates, cleanMetaId, cleanQuestionKey, codeText, fieldMapRows, inboxErrorText, secretStateText } from "./model";

// Integrations → Meta Lead Ads screen (LR-META): rendered to static markup in English and Hindi.
// Synthetic values only; the "secrets" below are placeholders that must never appear in markup.
const LOCALES: Locale[] = ["en", "hi"];
const CRM = { en: enCrm, hi: hiCrm } as const;
const SECRET_LIKE = ["0123456789abcdef0123456789abcdef", "EAAsyntheticSystemUserTokenForTestsOnly0123456789"];
const VERIFY = "verify-token-synthetic-0123456789-abcdefghij";

function inLocale(locale: Locale, element: ReactElement): string {
  const Provider = LocaleProvider as (props: { locale: Locale; children?: ReactNode }) => ReactNode;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`, ...value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`))];
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([key, item]) => keyPaths(item, prefix ? `${prefix}.${key}` : key));
  return [prefix];
}

function leaves(value: unknown, prefix = ""): [string, string][] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${prefix}[${index}]`));
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([key, item]) => leaves(item, prefix ? `${prefix}.${key}` : key));
  return typeof value === "string" ? [[prefix, value]] : [];
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const counts = (patch: Partial<Record<MetaInboxStatus, number>> = {}) =>
  ({ ...Object.fromEntries(META_INBOX_STATUSES.map((status) => [status, 0])), ...patch }) as Record<MetaInboxStatus, number>;

const secretState = (set: boolean, keyOk: MetaSecretState["keyOk"] = "current"): MetaSecretState => ({ set, updatedAt: set ? "2026-10-22T04:30:00.000Z" : null, updatedBy: null, keyOk: set ? keyOk : false });

function view(options: { admin?: boolean; ready?: boolean; status?: Partial<typeof DEFAULT_META_STATUS> } = {}): MetaIntegrationView {
  const ready = options.ready ?? false;
  const base: MetaIntegrationView = {
    readiness: { keyConfigured: true, appId: ready, appSecret: ready, accessToken: ready, pageId: ready, enabled: ready, ready },
    status: { ...DEFAULT_META_STATUS, ...(options.status ?? {}) },
    counts: counts({ pending: 2, failed: 1 }),
    silentHours: null,
    paused: null,
    callbackUrl: "https://aspire.thechunkmedia.com/api/integrations/meta/webhook",
    siteUrlChanged: false,
    tokenExpiresSoon: false,
    testMode: { active: false, until: null },
  };
  if (!options.admin) return base;
  const secrets = { app_secret: secretState(ready), access_token: secretState(ready), page_token: secretState(false), verify_token: secretState(true) } as Record<MetaSecretName, MetaSecretState>;
  return {
    ...base,
    admin: {
      config: {
        key: "meta_config",
        version: 3,
        updatedAt: null,
        updatedBy: null,
        isDefault: false,
        value: {
          ...DEFAULT_META_CONFIG,
          enabled: ready,
          appId: "1234567890123",
          pageId: "112233445566778",
          fieldMap: { full_name: "contactName", "which_district_do_you_live_in?": "district" },
          forms: [{ id: "998877665544332", name: "NEET Kangra Oct", status: "ACTIVE", defaults: { centreSlug: "dharamshala" }, consentCheckboxKey: null }],
        },
      },
      secrets,
      verifyToken: VERIFY,
      key: { keyId: "abcd1234", previousKeyId: null, weak: false },
      needsReseal: false,
    },
  };
}

const inboxItems: MetaInboxItem[] = [
  {
    leadgenId: "12345678901234567",
    status: "failed",
    via: "webhook",
    attempts: 1,
    lastError: "invalid_phone",
    formId: "998877665544332",
    leadId: null,
    receivedAt: "2026-10-22T04:30:00.000Z",
    processedAt: "2026-10-22T04:31:00.000Z",
    nextAttemptAt: "2026-10-22T04:30:00.000Z",
  },
];

function page(locale: Locale, v: MetaIntegrationView) {
  return inLocale(
    locale,
    createElement(MetaIntegrationPage, {
      view: v,
      inbox: v.admin ? inboxItems : null,
      locale,
      programs: [{ value: "neet", label: "NEET" }],
      centres: [{ value: "dharamshala", label: "Dharamshala" }],
      t: CRM[locale],
    }),
  );
}

describe("messages (en / hi)", () => {
  it("Hindi has exactly the English keys (and list lengths) and the same placeholders", () => {
    expect(keyPaths(hiMeta)).toEqual(keyPaths(enMeta));
    const hi = new Map(leaves(hiMeta));
    for (const [path, english] of leaves(enMeta)) {
      expect(placeholders(hi.get(path) ?? ""), path).toEqual(placeholders(english));
      expect((hi.get(path) ?? "").trim().length, path).toBeGreaterThan(0);
    }
  });
  it("is the nested `metaAds` namespace of crm, and never suggests a third-party automation service", () => {
    expect(enCrm.metaAds).toBe(enMeta);
    expect(hiCrm.metaAds).toBe(hiMeta);
    for (const messages of [enMeta, hiMeta]) {
      const mentions = leaves(messages).filter(([, text]) => /zapier|make\.com|\bmake\b,/i.test(text));
      expect(mentions.map(([path]) => path)).toEqual(["direct"]);
    }
  });
});

describe("live checklist ticks", () => {
  it("starts with only the server key; steps Meta must prove stay 'check yourself'", () => {
    const states = checklistStates(view({ admin: true }));
    expect(states.step0).toBe("done");
    expect(states.steps).toMatchObject({ s1: "todo", s2: "todo", s3: "todo", s5: "todo", s6: "manual", s9: "manual", s12: "todo", s13: "manual" });
  });
  it("ticks what the CRM has seen: handshake, token check, subscription, a lead read, a test, forms with consent keys", () => {
    const v = view({
      admin: true,
      ready: true,
      status: {
        lastVerifyAt: "2026-10-22T04:00:00.000Z",
        lastImportAt: "2026-10-22T05:00:00.000Z",
        lastTestAt: "2026-10-22T04:40:00.000Z",
        pageSubscribed: true,
        tokenInfo: { type: "SYSTEM_USER", expiresAt: null, scopes: [...META_REQUIRED_SCOPES], checkedAt: "2026-10-22T04:10:00.000Z" },
      },
    });
    if (v.admin) v.admin.config.value.forms = v.admin.config.value.forms.map((form) => ({ ...form, consentCheckboxKey: "consent_contact" }));
    const states = checklistStates(v);
    expect(Object.entries(states.steps).filter(([, state]) => state !== "done").map(([step]) => step)).toEqual(["s13"]);
    // Status-only viewers cannot see the forms: step 12 stays "check yourself".
    expect(checklistStates(view({ ready: true })).steps.s12).toBe("manual");
  });
});

describe("the page", () => {
  it.each(LOCALES)("super admin (%s): write-only secret fields, the paste-into-Meta values, forms, mapping, test leads, failed ids", (locale) => {
    const html = page(locale, view({ admin: true }));
    const m = CRM[locale].metaAds;
    for (const secret of SECRET_LIKE) expect(html).not.toContain(secret);
    expect(html).toContain(m.credentials.heading);
    expect(html).toContain("https://aspire.thechunkmedia.com/api/integrations/meta/webhook");
    // The verify token is for super admins (they paste it into Meta), masked until "Show".
    expect(html).toMatch(new RegExp(`type="password"[^>]*value="${VERIFY}"`));
    const secretInputs = html.match(/<input[^>]*placeholder="[^"]*"[^>]*>/g) ?? [];
    expect(secretInputs.length).toBe(2);
    for (const input of secretInputs) {
      expect(input).toContain('type="password"');
      expect(input).toMatch(/autocomplete="off"/i);
      expect(input).toContain('value=""');
    }
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain(m.forms.heading);
    expect(html).toContain(m.forms.noConsentKey.split('"')[0]); // (the quoted part is HTML-escaped)
    expect(html).toContain(m.fieldMap.heading);
    expect(html).toContain("which_district_do_you_live_in?");
    expect(html).toContain(m.testLeads.heading);
    expect(html).toContain(m.inbox.errors.invalid_phone);
    expect(html).toContain(`>${m.actions.check}</button>`);
    expect(html).toContain(m.checklist.heading);
    // "step 6b" (pause text, step 6) resolves to sub-steps on the page.
    expect(html).toContain(m.checklist.steps.s6.more.title);
    for (const item of m.checklist.steps.s6.more.items) expect(html).toContain(item.split(/['"]/)[0]); // (quotes are HTML-escaped)
    // Wide tables scroll with the keyboard at phone width (WCAG 2.1.1).
    expect(html).toMatch(/role="region" aria-labelledby="meta-inbox-heading" tabindex="0"/);
  });

  it.each(LOCALES)("admin / area head (%s): status only — no credentials, no verify token, no actions", (locale) => {
    const html = page(locale, view());
    const m = CRM[locale].metaAds;
    expect(html).toContain(m.statusOnly);
    expect(html).toContain(m.status.heading);
    expect(html).not.toContain(VERIFY);
    expect(html).not.toContain(m.credentials.heading);
    expect(html).not.toContain(`>${m.actions.check}</button>`);
    expect(html).not.toContain(m.inbox.heading);
    expect(html).toContain(m.csvLink);
  });

  it("explains a pause, silence, a changed site address and an expiring token", () => {
    const v = view({
      ready: true,
      status: { verifiedSiteUrl: "https://old.example", tokenInfo: { type: "SYSTEM_USER", expiresAt: "2026-10-30T00:00:00.000Z", scopes: [], checkedAt: "2026-10-22T00:00:00.000Z" } },
    });
    const html = inLocale("en", createElement(ConnectionStatus, { view: { ...v, paused: "auth", silentHours: 52, siteUrlChanged: true, tokenExpiresSoon: true }, locale: "en", m: enMeta }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(enMeta.status.paused.auth);
    expect(html).toContain("No Meta leads for 52 hours");
    expect(html).toContain("https://old.example");
    expect(html).toContain("The token expires on");
    for (const status of META_INBOX_STATUSES) expect(html).toContain(enMeta.status.counts[status]);
  });

  it("links a failed id's CRM lead in the page's language", () => {
    const html = inLocale("hi", createElement(FailedLeadsList, { items: [{ ...inboxItems[0], status: "imported", lastError: null, leadId: "lead-1" }], locale: "hi", m: hiMeta }));
    expect(html).toContain('href="/hi/crm/leads/lead-1"');
    expect(html).toContain(hiMeta.inbox.openLead);
  });
});

describe("model helpers", () => {
  it("turn fixed codes into sentences, with a safe fallback", () => {
    expect(codeText("no_page_id", enMeta)).toBe(enMeta.actions.codes.no_page_id);
    expect(codeText("graph_613", enMeta)).toBe("Meta answered with code graph_613.");
    expect(codeText("fallback", hiMeta)).toBe("Meta ने कोड fallback के साथ जवाब दिया।");
    expect(inboxErrorText("erased_family", hiMeta)).toBe(hiMeta.inbox.errors.erased_family);
    expect(inboxErrorText("graph_1_2", enMeta)).toBe("Code graph_1_2");
    expect(inboxErrorText(null, enMeta)).toBe("");
  });
  it("summarise action results", () => {
    expect(actionSummary({ action: "process_now", ok: true, code: null, processed: { imported: 3, duplicates: 0, failed: 1, retried: 2, paused: null } }, enMeta)).toBe(
      "Done: 3 added, 1 failed, 2 to try again later.",
    );
    expect(actionSummary({ action: "subscribe_page", ok: false, code: "no_page_id" }, enMeta)).toBe(`That did not work: ${enMeta.actions.codes.no_page_id}`);
    expect(actionSummary({ action: "check", ok: false, code: null, checks: [{ key: "page", ok: false, code: "graph_200" }] }, enMeta)).toBe(enMeta.actions.done.checkProblems);
    expect(actionSummary({ action: "test_mode", ok: true, code: null, testMode: { active: true, until: null } }, hiMeta)).toBe(hiMeta.testLeads.turnedOn);
  });
  it("describe a secret's state without its value", () => {
    expect(secretStateText(secretState(false), enMeta, "en")).toBe(enMeta.credentials.stateNotSet);
    expect(secretStateText(secretState(true, "previous"), enMeta, "en")).toBe(enMeta.credentials.statePrevious);
    expect(secretStateText(secretState(true, false), enMeta, "en")).toBe(enMeta.credentials.stateBroken);
    expect(secretStateText(secretState(true), enMeta, "en")).toMatch(/^Saved /);
  });
  it("clean typed ids and question keys", () => {
    expect(cleanMetaId(" 1234567890123 ")).toBe("1234567890123");
    expect(cleanMetaId("")).toBe("");
    expect(cleanMetaId("12ab")).toBeNull();
    expect(cleanQuestionKey("  which_city? ")).toBe("which_city?");
    expect(cleanQuestionKey(" ")).toBeNull();
    expect(fieldMapRows({ b: "answer", a: "phone" }).map((row) => row.question)).toEqual(["a", "b"]);
  });
});
