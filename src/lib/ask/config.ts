import "server-only";

/**
 * Ask Aspire server configuration (D-035; names documented in .env.example and
 * docs/ask-aspire.md). Read per call so tests and deployments see the current environment.
 * The API key never leaves the server: it is not logged, returned or sent to the browser.
 */

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Default model: Claude Opus 5.5, the current default Claude model, vision-capable
 * ($4 / $20 per million input / output tokens). For lower cost set ASK_ASPIRE_MODEL to
 * `claude-sonnet-5-5` ($2 / $10) or `claude-haiku-5-5` ($0.10 / $0.50), checking answer
 * quality on real JEE / NEET questions first (docs/ask-aspire.md → Costs).
 */
export const DEFAULT_ASK_MODEL = "claude-opus-5-5";
/** Output cap per answer, including the model's (hidden) reasoning tokens. */
export const DEFAULT_ASK_MAX_TOKENS = 8000;
export const MIN_ASK_MAX_TOKENS = 1024;
export const MAX_ASK_MAX_TOKENS = 32000;
export const DEFAULT_GUEST_DAILY = 5;
export const DEFAULT_STUDENT_DAILY = 30;
/** Circuit breaker for the whole site per day (all guests + accounts), bounds the daily bill. */
export const DEFAULT_GLOBAL_DAILY = 500;
const MAX_DAILY = 10_000;

export interface AskConfig {
  /** True when ANTHROPIC_API_KEY is set. */
  configured: boolean;
  apiKey: string | null;
  /** Needed only for API keys that are not scoped to a workspace (sent as `anthropic-workspace-id`). */
  workspaceId: string | null;
  model: string;
  maxTokens: number;
  guestDaily: number;
  studentDaily: number;
  globalDaily: number;
}

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Model ids are plain `[a-z0-9.-]`; anything else falls back to the default. */
function modelId(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  return /^[a-z0-9][a-z0-9.-]{2,63}$/i.test(value) ? value : DEFAULT_ASK_MODEL;
}

/** Workspace ids are plain `wrkspc_…` tokens; anything else is ignored. */
function workspaceIdOf(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return /^[A-Za-z0-9_-]{4,128}$/.test(value) ? value : null;
}

export function getAskConfig(env: Env = process.env): AskConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || null;
  return {
    configured: apiKey !== null,
    apiKey,
    workspaceId: workspaceIdOf(env.ANTHROPIC_WORKSPACE_ID),
    model: modelId(env.ASK_ASPIRE_MODEL),
    maxTokens: intInRange(env.ASK_ASPIRE_MAX_TOKENS, DEFAULT_ASK_MAX_TOKENS, MIN_ASK_MAX_TOKENS, MAX_ASK_MAX_TOKENS),
    // 0 is allowed and switches that group off.
    guestDaily: intInRange(env.ASK_ASPIRE_GUEST_DAILY, DEFAULT_GUEST_DAILY, 0, MAX_DAILY),
    studentDaily: intInRange(env.ASK_ASPIRE_STUDENT_DAILY, DEFAULT_STUDENT_DAILY, 0, MAX_DAILY),
    globalDaily: intInRange(env.ASK_ASPIRE_GLOBAL_DAILY, DEFAULT_GLOBAL_DAILY, 0, 1_000_000),
  };
}

/**
 * `output_config.effort` is supported by the current models (Opus 5.5 / Sonnet 5.5 / Haiku 5.5
 * and the 4.6+ family) but rejected by older ones; omit it there so an older model id still works.
 */
export function supportsEffort(model: string): boolean {
  return !/^claude-(?:[23]|instant|haiku-4|sonnet-4-5|sonnet-4(?:$|-[01]|-20)|opus-4(?:$|-[01]|-20))/i.test(model);
}
