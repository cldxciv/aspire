/**
 * Meta Lead Ads — the shapes LR-META's API and screens exchange (docs/lead-routing-plan.md §18,
 * §21). CLIENT-SAFE: types and constants only. The settings documents themselves (`MetaConfig`,
 * `MetaStatus`) and the secret state live in the frozen `lead-ops-types.ts`.
 */
import type {
  MetaAction,
  MetaConfig,
  MetaInboxStatus,
  MetaInboxVia,
  MetaPauseReason,
  MetaSecretName,
  MetaSecretState,
  MetaStatus,
  SettingEnvelope,
} from "../lead-ops-types";

/** Permissions Meta lists for reading leads with their ad data, plus webhooks (§7 step 4, §9). */
export const META_REQUIRED_SCOPES = [
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "ads_management",
] as const;

/** Secrets a super admin types in (the page token is derived by `check`; the verify token is generated). */
export const META_TYPED_SECRETS = ["app_secret", "access_token"] as const;
export type MetaTypedSecret = (typeof META_TYPED_SECRETS)[number];

/** A token expiring within this many days shows a warning (§7 step 5). */
export const META_TOKEN_WARN_DAYS = 14;
/** Test mode lasts at most this long (§18.7, A14). */
export const META_TEST_MODE_HOURS = 24;
/** Bounds of the silence alert (hours; 0 = off). */
export const META_SILENCE_HOURS_MAX = 720;

/** What the integration needs before ids can be fetched (all derived on the server; no secrets). */
export interface MetaReadiness {
  /** INTEGRATIONS_SECRET is set and usable. */
  keyConfigured: boolean;
  appId: boolean;
  appSecret: boolean;
  accessToken: boolean;
  pageId: boolean;
  enabled: boolean;
  /** Everything above: new ids are fetched, not held. */
  ready: boolean;
}

/** GET /api/crm/integrations/meta — what everyone allowed sees (admins and area heads: status only). */
export interface MetaStatusView {
  readiness: MetaReadiness;
  status: MetaStatus;
  counts: Record<MetaInboxStatus, number>;
  /** Hours without a Meta lead while enabled (alert threshold passed), else null. */
  silentHours: number | null;
  paused: MetaPauseReason | null;
  /** The webhook address to paste into Meta. */
  callbackUrl: string;
  /** The site address differs from the one Meta verified (repeat step 3). */
  siteUrlChanged: boolean;
  /** The token expires within META_TOKEN_WARN_DAYS. */
  tokenExpiresSoon: boolean;
  testMode: { active: boolean; until: string | null };
}

/** Extra facts for super admins only (never a secret's value, except the verify token they paste into Meta). */
export interface MetaAdminView {
  config: SettingEnvelope<MetaConfig>;
  secrets: Record<MetaSecretName, MetaSecretState>;
  /** Shown to super admins only (§6): they paste it into Meta's webhook form. Null = not created yet. */
  verifyToken: string | null;
  key: { keyId: string | null; previousKeyId: string | null; weak: boolean };
  /** Some envelopes are still sealed with the previous key (offer `reseal`). */
  needsReseal: boolean;
}

export interface MetaIntegrationView extends MetaStatusView {
  /** Present for super admins only. */
  admin?: MetaAdminView;
}

/** GET /api/crm/integrations/meta/inbox item (ids and fixed codes only, never answers). */
export interface MetaInboxItem {
  leadgenId: string;
  status: MetaInboxStatus;
  via: MetaInboxVia;
  attempts: number;
  /** Fixed code (`invalid_phone`, `graph_190`, …). */
  lastError: string | null;
  formId: string | null;
  leadId: string | null;
  receivedAt: string;
  processedAt: string | null;
  nextAttemptAt: string;
}

export interface MetaInboxPage {
  items: MetaInboxItem[];
  counts: Record<MetaInboxStatus, number>;
}

/** One line of "Check connection" (§7 step 7). `code` is a fixed reason the screen explains. */
export interface MetaCheckLine {
  key: "app" | "token" | "expiry" | "scopes" | "page" | "subscribed";
  ok: boolean;
  code: string | null;
  missingScopes?: string[];
  tokenType?: string | null;
  expiresAt?: string | null;
}

/** POST /api/crm/integrations/meta/actions answer. */
export interface MetaActionResult {
  action: MetaAction;
  ok: boolean;
  /** Fixed reason when `ok` is false (`no_token`, `graph_190`, …). */
  code: string | null;
  checks?: MetaCheckLine[];
  /** process_now / retry_failed / sync_leads. */
  processed?: { imported: number; duplicates: number; failed: number; retried: number; paused: MetaPauseReason | null };
  enqueued?: number;
  retried?: number;
  forms?: number;
  resealed?: number;
  /** regenerate_verify_token: the new token (super admins only). */
  verifyToken?: string;
  testMode?: { active: boolean; until: string | null };
}

/** PUT /api/crm/integrations/meta/secrets answer. */
export interface MetaSecretsAnswer {
  secrets: Record<MetaSecretName, MetaSecretState>;
}
