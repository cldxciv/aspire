import { stripLocale } from "@/i18n/paths";

/**
 * Pure helpers behind the "Get the Rancho app" install prompt (client-safe, no DOM access, so
 * they are unit-tested with real user-agent strings): which device and browser this is, whether
 * the bar may show, and what "Install" does there.
 *
 * - Phones and tablets only: a mobile/tablet user agent (iPadOS reports a Mac, so a Mac with touch
 *   points counts as an iPad), or a coarse pointer on a small/medium viewport. Never on desktop
 *   (the /rancho page has its own desktop install card).
 * - "Install" uses the browser's own prompt when Chrome/Edge/Samsung Internet handed us one
 *   (`beforeinstallprompt`), otherwise it explains the browser's menu steps; iOS gets the
 *   Share → Add to Home Screen steps; in-app browsers (Instagram, Facebook, …) can't install apps,
 *   so they get "open in Chrome/Safari" with a copy-link button.
 */

export type DeviceOs = "android" | "ios" | "windows" | "mac" | "chromeos" | "linux" | "other";
export type DeviceBrowser = "chrome" | "edge" | "samsung" | "firefox" | "opera" | "safari" | "other";
export type FormFactor = "phone" | "tablet" | "desktop";

/** Built-in browsers of social / messaging apps that cannot install web apps. */
export type InAppBrowser =
  | "instagram"
  | "facebook"
  | "messenger"
  | "linkedin"
  | "snapchat"
  | "x"
  | "line"
  | "tiktok"
  | "pinterest"
  | "google"
  | "webview";

export interface DeviceInfo {
  os: DeviceOs;
  browser: DeviceBrowser;
  formFactor: FormFactor;
  /** The app whose built-in browser this is, or null in a normal browser. */
  inApp: InAppBrowser | null;
}

/** Order matters: Messenger before Facebook (its UA carries both markers). */
const IN_APP: readonly [InAppBrowser, RegExp][] = [
  ["instagram", /\bInstagram\b/i],
  ["messenger", /FBAN\/Messenger|FB_IAB\/MESSENGER|FB_IAB\/Orca-Android|MessengerForiOS|MessengerLite/i],
  ["facebook", /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A/i],
  ["linkedin", /LinkedInApp/i],
  ["snapchat", /Snapchat/i],
  ["x", /\bTwitter\b|TwitterAndroid/i],
  ["line", /\bLine\/\d/],
  ["tiktok", /musical_ly|BytedanceWebview|TikTok/i],
  ["pinterest", /\bPinterest\b/i],
  ["google", /\bGSA\/\d/],
];

/** Classifies a user agent. `maxTouchPoints` (navigator.maxTouchPoints) unmasks iPads that report a Mac. */
export function classifyDevice(userAgent: string, maxTouchPoints = 0): DeviceInfo {
  const ua = userAgent || "";
  let os: DeviceOs = "other";
  let formFactor: FormFactor = "desktop";

  if (/iPhone|iPod/.test(ua)) {
    os = "ios";
    formFactor = "phone";
  } else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) {
    os = "ios";
    formFactor = "tablet";
  } else if (/Android/i.test(ua)) {
    os = "android";
    formFactor = /Mobile/i.test(ua) ? "phone" : "tablet";
  } else if (/CrOS/.test(ua)) {
    os = "chromeos";
  } else if (/Windows/.test(ua)) {
    os = "windows";
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    os = "mac";
  } else if (/Linux/.test(ua)) {
    os = "linux";
  }
  if (os === "other" && /Mobi/i.test(ua)) formFactor = "phone";

  let browser: DeviceBrowser = "other";
  if (/EdgA\/|EdgiOS\/|Edg\//.test(ua)) browser = "edge";
  else if (/SamsungBrowser\//.test(ua)) browser = "samsung";
  else if (/OPR\/|OPiOS\/|OPT\//.test(ua)) browser = "opera";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "firefox";
  else if (/CriOS\/|Chrome\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua) && (os === "ios" || os === "mac")) browser = "safari";

  let inApp: InAppBrowser | null = null;
  for (const [app, pattern] of IN_APP) {
    if (pattern.test(ua)) {
      inApp = app;
      break;
    }
  }
  // Any other Android WebView ("; wv)") is an app's built-in browser too.
  if (!inApp && os === "android" && /;\s*wv\)/.test(ua)) inApp = "webview";
  // An iOS WebView has no "Safari/" token (Safari and the other iOS browsers all send one).
  if (!inApp && os === "ios" && !/Safari\//.test(ua) && /AppleWebKit/.test(ua)) inApp = "webview";

  return { os, browser, formFactor, inApp };
}

/** Widest viewport (CSS px) that still counts as a phone/tablet when the pointer is coarse. */
export const HANDHELD_MAX_WIDTH = 1024;

/** A phone or tablet: by user agent, or a touch-first screen that isn't desktop-wide. */
export function isHandheld(device: DeviceInfo, coarsePointer: boolean, viewportWidth: number): boolean {
  if (device.formFactor !== "desktop") return true;
  return coarsePointer && viewportWidth > 0 && viewportWidth <= HANDHELD_MAX_WIDTH;
}

/** What "Install" does on this device. */
export type InstallAction =
  /** The browser's own install dialog (a captured `beforeinstallprompt`). */
  | { kind: "prompt" }
  /** Android browser without a captured prompt: explain its menu. */
  | { kind: "menu"; browser: "chrome" | "edge" | "samsung" | "firefox" | "opera" | "other" }
  /** iPhone / iPad: Share → Add to Home Screen. */
  | { kind: "ios"; browser: "safari" | "chrome" | "edge" | "firefox" | "other" }
  /** An app's built-in browser: open the page in Chrome / Safari first. */
  | { kind: "in-app"; app: InAppBrowser; os: "android" | "ios" | "other" }
  /** Nothing we can offer (e.g. desktop Firefox): the bar / card stays hidden. */
  | { kind: "none" };

export function installActionFor(device: DeviceInfo, canPrompt: boolean): InstallAction {
  if (canPrompt) return { kind: "prompt" };
  if (device.inApp) {
    return { kind: "in-app", app: device.inApp, os: device.os === "android" || device.os === "ios" ? device.os : "other" };
  }
  if (device.os === "ios") {
    const browser = device.browser === "safari" || device.browser === "chrome" || device.browser === "edge" || device.browser === "firefox" ? device.browser : "other";
    return { kind: "ios", browser };
  }
  if (device.os === "android") {
    return { kind: "menu", browser: device.browser === "safari" ? "other" : device.browser };
  }
  return { kind: "none" };
}

/**
 * Pages where the bar never shows: sign-in and password help (keep those calm), and a mock test
 * attempt (`/tools/mock-tests/<id>`; the leaderboard and verify pages are fine). Locale-aware.
 */
export function isInstallBarBlockedPath(pathname: string | null | undefined): boolean {
  const path = stripLocale(pathname || "/").replace(/\/+$/, "") || "/";
  if (/^\/(login|forgot-password)(\/|$)/.test(path)) return true;
  return /^\/tools\/mock-tests\/(?!leaderboard$|verify$)[^/]+$/.test(path);
}

export interface InstallBarInput {
  device: DeviceInfo;
  coarsePointer: boolean;
  viewportWidth: number;
  /** Running as an installed app (display-mode standalone / minimal-ui, navigator.standalone). */
  standalone: boolean;
  /** `appinstalled` fired in this tab. */
  installed: boolean;
  pathname: string | null;
  /** Epoch ms until which the bar stays hidden (× or an install), or null. */
  hiddenUntil: number | null;
  now: number;
  action: InstallAction;
}

export function shouldShowInstallBar(input: InstallBarInput): boolean {
  if (!isHandheld(input.device, input.coarsePointer, input.viewportWidth)) return false;
  if (input.standalone || input.installed) return false;
  if (isInstallBarBlockedPath(input.pathname)) return false;
  if (input.hiddenUntil !== null && input.hiddenUntil > input.now) return false;
  return input.action.kind !== "none";
}

/**
 * The /rancho desktop card: a desktop (not a phone/tablet; `null` = not known yet) browser that
 * handed us its install prompt, outside the installed app.
 */
export function shouldShowDesktopInstallCard(input: {
  handheld: boolean | null;
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
}): boolean {
  return input.handheld === false && !input.standalone && !input.installed && input.canPrompt;
}

/**
 * Element id of the install bar (./InstallBar). It hangs over the top of the page under the sticky
 * header, so code that scrolls something into view below the header can measure it too.
 */
export const INSTALL_BAR_ID = "rancho-install-bar";

/* ---------- early capture (before any bundle runs) ---------- */

/** Where the inline early-capture script parks a `beforeinstallprompt` until ./install-store loads. */
export const EARLY_PROMPT_GLOBAL = "__ranchoInstallPrompt";
/** Set by the early-capture script when `appinstalled` fired before ./install-store loaded. */
export const EARLY_INSTALLED_GLOBAL = "__ranchoInstalled";

/**
 * Inline script rendered at the top of every public page (components/pwa/EarlyInstallCapture). Chrome
 * fires `beforeinstallprompt` once per page load and can do so before the JS bundles have run; this
 * catches it while the HTML is still being parsed (keeping Chrome's own mini-infobar away) and parks
 * it for ./install-store, which adopts it when it loads. Plain ES5, no dependencies.
 */
export const EARLY_INSTALL_CAPTURE_SCRIPT =
  `(function(w){` +
  `w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.${EARLY_PROMPT_GLOBAL}=e});` +
  `w.addEventListener("appinstalled",function(){w.${EARLY_PROMPT_GLOBAL}=null;w.${EARLY_INSTALLED_GLOBAL}=true})` +
  `})(window)`;

/* ---------- remembered choices (localStorage, per device) ---------- */

export const INSTALL_MEMORY_KEY = "aspire.rancho.install.v1";
const DAY_MS = 24 * 60 * 60 * 1000;
/** × hides the bar for a week. */
export const DISMISS_DAYS = 7;
/** After an install the bar stays away (in the browser) for 90 days. */
export const INSTALLED_DAYS = 90;

/** Reads the stored value; anything malformed counts as "nothing remembered". */
export function parseInstallMemory(raw: string | null): { hiddenUntil: number | null } {
  if (!raw) return { hiddenUntil: null };
  try {
    const value: unknown = JSON.parse(raw);
    const until = value && typeof value === "object" ? (value as { hiddenUntil?: unknown }).hiddenUntil : undefined;
    return { hiddenUntil: typeof until === "number" && Number.isFinite(until) ? until : null };
  } catch {
    return { hiddenUntil: null };
  }
}

export function serializeInstallMemory(now: number, days: number): string {
  return JSON.stringify({ hiddenUntil: now + days * DAY_MS });
}

/**
 * Android intent link that opens `url` (https only) in Chrome, falling back to the same URL in
 * the default browser when Chrome isn't installed. Null for anything that isn't https.
 */
export function chromeIntentUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const target = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return `intent://${target}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(parsed.href)};end`;
}
