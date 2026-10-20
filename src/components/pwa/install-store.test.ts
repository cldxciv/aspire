import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EARLY_INSTALL_CAPTURE_SCRIPT,
  EARLY_INSTALLED_GLOBAL,
  EARLY_PROMPT_GLOBAL,
  INSTALL_MEMORY_KEY,
  INSTALLED_DAYS,
  parseInstallMemory,
} from "./install-platform";

/**
 * The install prompt is never lost to a race with the bundles: the inline early-capture script
 * catches `beforeinstallprompt` during HTML parsing, and ./install-store adopts it when it loads.
 * Tests run in plain Node, so a small EventTarget stands in for `window`.
 */

type FakeWindow = EventTarget & Record<string, unknown> & { localStorage: Storage };

function fakeWindow(): FakeWindow {
  const store = new Map<string, string>();
  const win = new EventTarget() as FakeWindow;
  win.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  } as Storage;
  return win;
}

function fakePromptEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

/** Runs the inline script against `win`, as the browser would at the top of the page. */
function runEarlyScript(win: FakeWindow) {
  new Function("window", EARLY_INSTALL_CAPTURE_SCRIPT)(win);
}

async function loadStore(win: FakeWindow) {
  vi.resetModules();
  vi.stubGlobal("window", win);
  return import("./install-store");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("early install-prompt capture", () => {
  it("the inline script catches the prompt (and stops Chrome's mini-infobar) before any bundle runs", () => {
    const win = fakeWindow();
    runEarlyScript(win);
    const event = fakePromptEvent("accepted");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(win[EARLY_PROMPT_GLOBAL]).toBe(event);
  });

  it("the store adopts a prompt caught before it loaded, and Install uses it once", async () => {
    const win = fakeWindow();
    runEarlyScript(win);
    const event = fakePromptEvent("accepted");
    win.dispatchEvent(event);

    const store = await loadStore(win);
    expect(win[EARLY_PROMPT_GLOBAL]).toBeNull();
    await expect(store.promptInstall()).resolves.toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await expect(store.promptInstall()).resolves.toBe("unavailable");
  });

  it("the store still catches a prompt that arrives after it loaded", async () => {
    const win = fakeWindow();
    runEarlyScript(win);
    const store = await loadStore(win);
    await expect(store.promptInstall()).resolves.toBe("unavailable");

    const event = fakePromptEvent("dismissed");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(win[EARLY_PROMPT_GLOBAL]).toBeNull(); // the store holds it, not the page global
    await expect(store.promptInstall()).resolves.toBe("dismissed");
  });

  it("an install that happened before the store loaded drops the prompt and keeps the bar away", async () => {
    const win = fakeWindow();
    runEarlyScript(win);
    win.dispatchEvent(fakePromptEvent("accepted"));
    win.dispatchEvent(new Event("appinstalled"));
    expect(win[EARLY_INSTALLED_GLOBAL]).toBe(true);

    const before = Date.now();
    const store = await loadStore(win);
    await expect(store.promptInstall()).resolves.toBe("unavailable");
    const { hiddenUntil } = parseInstallMemory(win.localStorage.getItem(INSTALL_MEMORY_KEY));
    expect(hiddenUntil).toBeGreaterThanOrEqual(before + (INSTALLED_DAYS - 1) * 24 * 60 * 60 * 1000);
  });

  it("works without the inline script too (pages outside the public site)", async () => {
    const win = fakeWindow();
    const store = await loadStore(win);
    const event = fakePromptEvent("accepted");
    win.dispatchEvent(event);
    await expect(store.promptInstall()).resolves.toBe("accepted");
  });

  it("the script is in the server HTML only", async () => {
    const { EarlyInstallCapture } = await import("./EarlyInstallCapture");
    const html = renderToStaticMarkup(createElement(EarlyInstallCapture));
    expect(html).toBe(`<script>${EARLY_INSTALL_CAPTURE_SCRIPT}</script>`);
    expect(EARLY_INSTALL_CAPTURE_SCRIPT).not.toMatch(/<\/?script|=>|\b(const|let)\b/);
  });
});
