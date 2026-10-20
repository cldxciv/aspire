import { describe, expect, it } from "vitest";

import {
  chromeIntentUrl,
  classifyDevice,
  DISMISS_DAYS,
  installActionFor,
  isHandheld,
  isInstallBarBlockedPath,
  parseInstallMemory,
  serializeInstallMemory,
  shouldShowDesktopInstallCard,
  shouldShowInstallBar,
  type DeviceInfo,
  type InstallBarInput,
} from "./install-platform";

/** Real-world user agents (versions don't matter, the markers do). */
const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTabletChrome:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.2792.79",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  iosEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15",
  /** iPadOS 13+ asks for desktop sites with a Mac user agent; only touch points give it away. */
  ipadDesktopUa:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  desktopEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.42.84 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; en_IN; 642167342)",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.2.30.97 (iPhone15,3; iOS 17_6; en_IN; en; scale=3.00; 1290x2796; 643522134)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; 2201117PI Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.48.71;]",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/483.0.0.37.106;FBBV/652012853;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  messengerAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/478.0.0.40.109;]",
  linkedinAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [LinkedInApp]/9.30.1823",
  linkedinIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.6815",
} as const;

describe("classifyDevice", () => {
  it.each([
    ["androidChrome", 5, { os: "android", browser: "chrome", formFactor: "phone", inApp: null }],
    ["androidTabletChrome", 5, { os: "android", browser: "chrome", formFactor: "tablet", inApp: null }],
    ["samsung", 5, { os: "android", browser: "samsung", formFactor: "phone", inApp: null }],
    ["androidFirefox", 5, { os: "android", browser: "firefox", formFactor: "phone", inApp: null }],
    ["androidEdge", 5, { os: "android", browser: "edge", formFactor: "phone", inApp: null }],
    ["iosSafari", 5, { os: "ios", browser: "safari", formFactor: "phone", inApp: null }],
    ["iosChrome", 5, { os: "ios", browser: "chrome", formFactor: "phone", inApp: null }],
    ["iosEdge", 5, { os: "ios", browser: "edge", formFactor: "phone", inApp: null }],
    ["ipadDesktopUa", 5, { os: "ios", browser: "safari", formFactor: "tablet", inApp: null }],
    ["ipadDesktopUa", 0, { os: "mac", browser: "safari", formFactor: "desktop", inApp: null }],
    ["desktopChrome", 0, { os: "windows", browser: "chrome", formFactor: "desktop", inApp: null }],
    ["desktopEdge", 0, { os: "windows", browser: "edge", formFactor: "desktop", inApp: null }],
    ["instagramAndroid", 5, { os: "android", formFactor: "phone", inApp: "instagram" }],
    ["instagramIos", 5, { os: "ios", formFactor: "phone", inApp: "instagram" }],
    ["facebookAndroid", 5, { os: "android", formFactor: "phone", inApp: "facebook" }],
    ["facebookIos", 5, { os: "ios", formFactor: "phone", inApp: "facebook" }],
    ["messengerAndroid", 5, { os: "android", formFactor: "phone", inApp: "messenger" }],
    ["linkedinAndroid", 5, { os: "android", formFactor: "phone", inApp: "linkedin" }],
    ["linkedinIos", 5, { os: "ios", formFactor: "phone", inApp: "linkedin" }],
  ] as const)("%s (touch points %d)", (key, touch, expected) => {
    expect(classifyDevice(UA[key], touch)).toMatchObject(expected);
  });

  it("treats an unknown Android WebView and an iOS WebView without Safari as in-app", () => {
    const androidWebView =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
    expect(classifyDevice(androidWebView, 5).inApp).toBe("webview");
    const iosWebView = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
    expect(classifyDevice(iosWebView, 5).inApp).toBe("webview");
    expect(classifyDevice("", 0)).toEqual({ os: "other", browser: "other", formFactor: "desktop", inApp: null });
  });
});

describe("isHandheld", () => {
  const desktop = classifyDevice(UA.desktopChrome, 0);
  it("phones and tablets by user agent, never a desktop with a mouse", () => {
    expect(isHandheld(classifyDevice(UA.androidChrome, 5), true, 412)).toBe(true);
    expect(isHandheld(classifyDevice(UA.ipadDesktopUa, 5), true, 1180)).toBe(true);
    expect(isHandheld(desktop, false, 1440)).toBe(false);
    expect(isHandheld(desktop, false, 500)).toBe(false);
  });

  it("a touch-first screen counts only up to tablet width", () => {
    expect(isHandheld(desktop, true, 900)).toBe(true);
    expect(isHandheld(desktop, true, 1366)).toBe(false);
  });
});

describe("installActionFor", () => {
  const device = (key: keyof typeof UA, touch = 5) => classifyDevice(UA[key], touch);

  it("uses the browser's own prompt whenever one was captured", () => {
    expect(installActionFor(device("androidChrome"), true)).toEqual({ kind: "prompt" });
    expect(installActionFor(device("samsung"), true)).toEqual({ kind: "prompt" });
    expect(installActionFor(device("desktopChrome", 0), true)).toEqual({ kind: "prompt" });
  });

  it("explains the menu on Android browsers without a prompt", () => {
    expect(installActionFor(device("androidChrome"), false)).toEqual({ kind: "menu", browser: "chrome" });
    expect(installActionFor(device("samsung"), false)).toEqual({ kind: "menu", browser: "samsung" });
    expect(installActionFor(device("androidFirefox"), false)).toEqual({ kind: "menu", browser: "firefox" });
    expect(installActionFor(device("androidEdge"), false)).toEqual({ kind: "menu", browser: "edge" });
  });

  it("gives iPhone / iPad the Share → Add to Home Screen steps", () => {
    expect(installActionFor(device("iosSafari"), false)).toEqual({ kind: "ios", browser: "safari" });
    expect(installActionFor(device("iosChrome"), false)).toEqual({ kind: "ios", browser: "chrome" });
    expect(installActionFor(device("iosEdge"), false)).toEqual({ kind: "ios", browser: "edge" });
    expect(installActionFor(device("ipadDesktopUa"), false)).toEqual({ kind: "ios", browser: "safari" });
  });

  it("sends in-app browsers to Chrome / Safari", () => {
    expect(installActionFor(device("instagramAndroid"), false)).toEqual({ kind: "in-app", app: "instagram", os: "android" });
    expect(installActionFor(device("instagramIos"), false)).toEqual({ kind: "in-app", app: "instagram", os: "ios" });
    expect(installActionFor(device("facebookAndroid"), false)).toEqual({ kind: "in-app", app: "facebook", os: "android" });
    expect(installActionFor(device("facebookIos"), false)).toEqual({ kind: "in-app", app: "facebook", os: "ios" });
    expect(installActionFor(device("linkedinAndroid"), false)).toEqual({ kind: "in-app", app: "linkedin", os: "android" });
    expect(installActionFor(device("linkedinIos"), false)).toEqual({ kind: "in-app", app: "linkedin", os: "ios" });
  });

  it("offers nothing on a desktop browser without a prompt", () => {
    expect(installActionFor(device("desktopChrome", 0), false)).toEqual({ kind: "none" });
    expect(installActionFor(device("ipadDesktopUa", 0), false)).toEqual({ kind: "none" });
  });
});

describe("isInstallBarBlockedPath", () => {
  it.each([
    ["/login", true],
    ["/hi/login", true],
    ["/forgot-password", true],
    ["/hi/forgot-password/", true],
    ["/tools/mock-tests/jee-main-sample-1", true],
    ["/hi/tools/mock-tests/neet-sample", true],
    ["/tools/mock-tests", false],
    ["/tools/mock-tests/leaderboard", false],
    ["/tools/mock-tests/verify", false],
    ["/tools/mock-tests/jee-main-sample-1/result", false],
    ["/", false],
    ["/rancho", false],
    ["/hi/rancho", false],
    [null, false],
  ] as const)("%s → %s", (path, blocked) => {
    expect(isInstallBarBlockedPath(path)).toBe(blocked);
  });
});

describe("shouldShowInstallBar", () => {
  const NOW = 1_800_000_000_000;
  const phone: DeviceInfo = classifyDevice(UA.androidChrome, 5);
  const base: InstallBarInput = {
    device: phone,
    coarsePointer: true,
    viewportWidth: 412,
    standalone: false,
    installed: false,
    pathname: "/",
    hiddenUntil: null,
    now: NOW,
    action: installActionFor(phone, true),
  };

  it("shows on a phone that can install", () => {
    expect(shouldShowInstallBar(base)).toBe(true);
    expect(shouldShowInstallBar({ ...base, action: installActionFor(phone, false) })).toBe(true);
    const iphone = classifyDevice(UA.iosSafari, 5);
    expect(shouldShowInstallBar({ ...base, device: iphone, action: installActionFor(iphone, false) })).toBe(true);
    const insta = classifyDevice(UA.instagramIos, 5);
    expect(shouldShowInstallBar({ ...base, device: insta, action: installActionFor(insta, false) })).toBe(true);
  });

  it("never on desktop, even with a prompt", () => {
    const desktop = classifyDevice(UA.desktopChrome, 0);
    expect(
      shouldShowInstallBar({ ...base, device: desktop, coarsePointer: false, viewportWidth: 1440, action: installActionFor(desktop, true) }),
    ).toBe(false);
  });

  it("never in the installed app or after installing", () => {
    expect(shouldShowInstallBar({ ...base, standalone: true })).toBe(false);
    expect(shouldShowInstallBar({ ...base, installed: true })).toBe(false);
  });

  it("not on sign-in pages or during a mock test attempt", () => {
    expect(shouldShowInstallBar({ ...base, pathname: "/hi/login" })).toBe(false);
    expect(shouldShowInstallBar({ ...base, pathname: "/tools/mock-tests/jee-main-sample-1" })).toBe(false);
    expect(shouldShowInstallBar({ ...base, pathname: "/tools/mock-tests/leaderboard" })).toBe(true);
  });

  it("stays hidden for the dismissal window, then comes back", () => {
    const hidden = parseInstallMemory(serializeInstallMemory(NOW, DISMISS_DAYS)).hiddenUntil;
    expect(hidden).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
    expect(shouldShowInstallBar({ ...base, hiddenUntil: hidden })).toBe(false);
    expect(shouldShowInstallBar({ ...base, hiddenUntil: hidden, now: NOW + 8 * 24 * 60 * 60 * 1000 })).toBe(true);
  });

  it("hides when there is nothing to offer", () => {
    expect(shouldShowInstallBar({ ...base, action: { kind: "none" } })).toBe(false);
  });
});

describe("shouldShowDesktopInstallCard", () => {
  const base = { handheld: false, standalone: false, installed: false, canPrompt: true };
  it("only on desktop with a captured prompt, outside the app", () => {
    expect(shouldShowDesktopInstallCard(base)).toBe(true);
    expect(shouldShowDesktopInstallCard({ ...base, handheld: true })).toBe(false);
    expect(shouldShowDesktopInstallCard({ ...base, handheld: null })).toBe(false);
    expect(shouldShowDesktopInstallCard({ ...base, canPrompt: false })).toBe(false);
    expect(shouldShowDesktopInstallCard({ ...base, standalone: true })).toBe(false);
    expect(shouldShowDesktopInstallCard({ ...base, installed: true })).toBe(false);
  });
});

describe("remembered choices and links", () => {
  it("ignores malformed storage", () => {
    for (const raw of [null, "", "{", "[]", '{"hiddenUntil":"soon"}', '{"hiddenUntil":null}']) {
      expect(parseInstallMemory(raw)).toEqual({ hiddenUntil: null });
    }
  });

  it("builds a Chrome intent link for https pages only", () => {
    expect(chromeIntentUrl("https://aspireiit.in/hi/rancho")).toBe(
      "intent://aspireiit.in/hi/rancho#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Faspireiit.in%2Fhi%2Francho;end",
    );
    expect(chromeIntentUrl("http://localhost:3000/rancho")).toBeNull();
    expect(chromeIntentUrl("javascript:alert(1)")).toBeNull();
    expect(chromeIntentUrl("not a url")).toBeNull();
  });
});
