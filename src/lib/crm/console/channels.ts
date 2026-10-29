/**
 * The channel classifier: how a family reached Aspire (docs/admin-phase-1b-plan.md §6.6, D-082;
 * owner: 1B-CORE). PURE and client-safe. The first matching rule wins and `CHANNELS` order is the
 * tie-break order. It already knows the Phase 2 sources `scholarship_test` and `paper_form` (no rows
 * before Phase 2).
 *
 * `referrer` is the lead's stored referrer host, or after an erase the kept
 * `crm_lead_attribution.referrer_host` (callers pass `COALESCE(l.referrer, la.referrer_host)`).
 * "host ∈ X" means equal to X or a subdomain of X, with any port stripped.
 */
import { canonicalTool } from "../pure";
import type { Channel } from "./types";

export interface ChannelInput {
  source: string | null;
  tool?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/** AI assistants that pass their address on (a lower bound: many AI visits arrive as Direct). */
export const AI_ASSISTANT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "perplexity.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "copilot.cloud.microsoft",
  "claude.ai",
  "chat.deepseek.com",
  "meta.ai",
  "grok.com",
  "you.com",
  "poe.com",
  "chat.mistral.ai",
] as const;

/** `utm_source` values AI assistants add (compared in lower case). */
export const AI_ASSISTANT_UTM_SOURCES = [
  "chatgpt.com",
  "chatgpt",
  "openai",
  "perplexity",
  "perplexity.ai",
  "gemini",
  "copilot",
  "claude",
  "claude.ai",
] as const;

/** Search engines other than Google (Google search hosts are matched by shape: `google.<tld>`). */
export const SEARCH_ENGINE_HOSTS = ["bing.com", "duckduckgo.com", "search.yahoo.com", "ecosia.org"] as const;

export const MAPS_HOSTS = ["maps.google.com", "maps.app.goo.gl", "g.page"] as const;
export const MAPS_UTM_MEDIUMS = ["gbp", "maps"] as const;
export const MAPS_UTM_SOURCES = ["gbp", "gmb", "google_business_profile"] as const;
export const PAID_UTM_MEDIUMS = ["cpc", "ppc", "paid", "paid_social", "display"] as const;
export const FACEBOOK_UTM_SOURCES = ["facebook", "fb", "instagram", "ig"] as const;
export const FACEBOOK_HOSTS = ["facebook.com", "m.facebook.com", "l.facebook.com", "instagram.com", "l.instagram.com"] as const;
export const WHATSAPP_HOSTS = ["wa.me", "web.whatsapp.com", "api.whatsapp.com"] as const;
export const SOCIAL_HOSTS = ["youtube.com", "t.co", "x.com", "twitter.com", "linkedin.com", "reddit.com", "quora.com"] as const;

const GOOGLE_SEARCH_HOST = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const YANDEX_HOST = /^(?:www\.)?yandex\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

/**
 * A referrer (bare host, `host:port` or an http(s) URL) → its lower-case host without port or a
 * trailing dot; null when empty or unreadable.
 */
export function normalizeHost(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  let host = value.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  } else {
    host = host.split("/")[0].split("?")[0];
  }
  host = host.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
}

/** Whether `host` equals one of `list` or is a subdomain of one (port stripped). */
export function hostMatches(host: string | null | undefined, list: readonly string[]): boolean {
  const clean = normalizeHost(host);
  if (!clean) return false;
  return list.some((entry) => clean === entry || clean.endsWith(`.${entry}`));
}

export function isAiAssistantHost(host: string | null | undefined): boolean {
  return hostMatches(host, AI_ASSISTANT_HOSTS);
}

function lower(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isGoogleSearchHost(host: string | null): boolean {
  return host !== null && GOOGLE_SEARCH_HOST.test(host);
}

function isSearchEngineHost(host: string | null): boolean {
  return isGoogleSearchHost(host) || hostMatches(host, SEARCH_ENGINE_HOSTS) || (host !== null && YANDEX_HOST.test(host));
}

/** Rule 8 on its own: a tagged Google Business Profile visit or a Google Maps referrer. */
export function isMapsSignal(row: ChannelInput): boolean {
  const medium = lower(row.utmMedium);
  const source = lower(row.utmSource);
  const campaign = lower(row.utmCampaign);
  return (
    (MAPS_UTM_MEDIUMS as readonly string[]).includes(medium) ||
    (MAPS_UTM_SOURCES as readonly string[]).includes(source) ||
    campaign.startsWith("gbp") ||
    hostMatches(row.referrer, MAPS_HOSTS)
  );
}

/** Rule 9 on its own: an AI assistant referrer or `utm_source`. */
export function isAiAssistantSignal(row: ChannelInput): boolean {
  return isAiAssistantHost(row.referrer) || (AI_ASSISTANT_UTM_SOURCES as readonly string[]).includes(lower(row.utmSource));
}

/** The channel of one lead (plan §6.6; first matching rule wins). */
export function classifyChannel(row: ChannelInput): Channel {
  const source = lower(row.source);
  const medium = lower(row.utmMedium);
  const utmSource = lower(row.utmSource);
  const campaign = typeof row.utmCampaign === "string" ? row.utmCampaign.trim() : "";
  const ref = normalizeHost(row.referrer);
  const tool = typeof row.tool === "string" && row.tool.trim() ? row.tool.trim() : null;

  // 1–5: where staff or systems say the family came from.
  if (source === "meta_lead_ad" || medium === "lead_ad") return "meta_ads";
  if (source === "scholarship_test") return "scholarship_test";
  if (source === "csv_import") return "imported_list";
  if (source === "paper_form") return "paper_forms";
  if (source === "walk_in") return "walk_in";
  if (source === "phone_call") return "phone_call";
  if (source === "referral") return "referral";
  if (source === "other") return "staff_other";
  // 6–7: the free tools (Rancho by name).
  if (canonicalTool(tool) === "ask") return "rancho";
  if (source === "tool" || tool !== null) return "free_tools";
  // 8–17: website visits by tag and referrer.
  if (isMapsSignal(row)) return "google_maps";
  if (isAiAssistantSignal(row)) return "ai_assistants";
  if ((PAID_UTM_MEDIUMS as readonly string[]).includes(medium)) return "paid_ads";
  if ((FACEBOOK_UTM_SOURCES as readonly string[]).includes(utmSource) || hostMatches(ref, FACEBOOK_HOSTS)) return "facebook_instagram";
  if (isSearchEngineHost(ref)) return "search_engines";
  if (hostMatches(ref, WHATSAPP_HOSTS) || utmSource === "whatsapp") return "whatsapp";
  if (hostMatches(ref, SOCIAL_HOSTS)) return "social";
  if (campaign) return "campaign";
  if (ref) return "other_websites";
  return "direct";
}

/**
 * The tagged website link for a centre's Google Business Profile (O13, D-082), LOCALE-FREE:
 * `/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-<centre>`. Use it only once the
 * production domain is final (decision 17).
 */
export function gbpTaggedPath(centreSlug: string): string {
  const params = new URLSearchParams({ utm_source: "google", utm_medium: "gbp", utm_campaign: `gbp-${centreSlug}` });
  return `/centres?${params.toString()}`;
}
