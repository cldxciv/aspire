"use client";

import { useSyncExternalStore } from "react";

import {
  classifyDevice,
  EARLY_INSTALLED_GLOBAL,
  EARLY_PROMPT_GLOBAL,
  INSTALL_MEMORY_KEY,
  INSTALLED_DAYS,
  isHandheld,
  parseInstallMemory,
  serializeInstallMemory,
  type DeviceInfo,
} from "./install-platform";

/**
 * The ONE place on the site that listens for the browser's install events (`beforeinstallprompt`,
 * `appinstalled`). The "Get the Rancho app" bar (every public page) and the /rancho desktop card
 * both read this store, so the prompt is captured once and either of them can show it.
 *
 * Chrome fires `beforeinstallprompt` once per page load, sometimes before this module has loaded,
 * so an inline script at the top of every public page (./EarlyInstallCapture) catches it first and
 * this store adopts it on load, then keeps listening itself. `preventDefault()` keeps Chrome's own
 * mini-infobar away; we show our own UI instead and call `prompt()` only when the visitor taps
 * Install.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export interface InstallSnapshot {
  /** The browser handed us its install prompt and it hasn't been used yet. */
  canPrompt: boolean;
  /** `appinstalled` fired in this tab. */
  installed: boolean;
}

const SERVER_SNAPSHOT: InstallSnapshot = { canPrompt: false, installed: false };

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let started = false;

function update(next: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

type EarlyCaptureWindow = Window & {
  [EARLY_PROMPT_GLOBAL]?: BeforeInstallPromptEvent | null;
  [EARLY_INSTALLED_GLOBAL]?: boolean;
};

/**
 * Starts listening (idempotent; a no-op on the server). Runs on module load in the browser. First
 * adopts whatever the inline early-capture script (./EarlyInstallCapture) caught before this module
 * loaded, so a prompt Chrome fired during page load is never lost.
 */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const early = window as EarlyCaptureWindow;
  if (early[EARLY_INSTALLED_GLOBAL]) {
    rememberInstallChoice(INSTALLED_DAYS);
    snapshot = { canPrompt: false, installed: true };
  } else if (early[EARLY_PROMPT_GLOBAL]) {
    deferred = early[EARLY_PROMPT_GLOBAL];
    snapshot = { ...snapshot, canPrompt: true };
  }
  early[EARLY_PROMPT_GLOBAL] = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    early[EARLY_PROMPT_GLOBAL] = null; // the early script's listener ran first; this store owns it now
    deferred = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    rememberInstallChoice(INSTALLED_DAYS);
    update({ canPrompt: false, installed: true });
  });
}

startInstallCapture();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current install state; re-renders when the prompt arrives, is used, or the app installs. */
export function useInstallState(): InstallSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
}

/**
 * Shows the browser's install dialog. Resolves "unavailable" when there is no captured prompt
 * (the caller then explains the browser's menu instead). A prompt can only be used once.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  update({ canPrompt: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}

/** Running as the installed app (any app-like display mode, or iOS home-screen mode). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const modes = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"];
  try {
    if (modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) return true;
  } catch {
    // matchMedia unavailable: fall through
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Primary pointer is coarse (touch). */
export function hasCoarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

let device: DeviceInfo | null = null;

/** This browser's device info (the user agent doesn't change, so it is worked out once). */
export function currentDevice(): DeviceInfo {
  device ??= classifyDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  return device;
}

/** Whether this is a phone/tablet right now (re-checked on resize). */
export function currentlyHandheld(): boolean {
  return isHandheld(currentDevice(), hasCoarsePointer(), window.innerWidth);
}

function subscribeResize(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

const noopSubscribe = () => () => {};

/** Phone/tablet (true), desktop (false), or null before hydration. */
export function useHandheld(): boolean | null {
  return useSyncExternalStore(subscribeResize, currentlyHandheld, () => null);
}

/** Running as the installed app (false before hydration). */
export function useStandalone(): boolean {
  return useSyncExternalStore(noopSubscribe, isStandaloneDisplay, () => false);
}

/** Remembers on this device to keep the bar away for `days` (storage may be unavailable). */
export function rememberInstallChoice(days: number): void {
  try {
    window.localStorage.setItem(INSTALL_MEMORY_KEY, serializeInstallMemory(Date.now(), days));
  } catch {
    // storage blocked (private mode, in-app browsers): the bar just comes back next visit
  }
}

/** Epoch ms until which the bar stays hidden on this device, or null. */
export function readInstallMemory(): number | null {
  try {
    return parseInstallMemory(window.localStorage.getItem(INSTALL_MEMORY_KEY)).hiddenUntil;
  } catch {
    return null;
  }
}
