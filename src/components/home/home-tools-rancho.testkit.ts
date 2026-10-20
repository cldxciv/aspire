import { RANCHO_OPEN_EVENT, type RanchoOpenDetail } from "@/lib/ask/cards";
import { handleAskRanchoClick, RANCHO_LAUNCHER_SELECTOR, type ClickLike } from "./HomeToolsAskRancho";

/**
 * Test helpers for the "Ask Rancho about this" links (tests only; no vitest import so it can be
 * shared by the predictor, mock-test, planner and homepage tests without re-running their suites).
 */

/** A stand-in for the floating launcher button: `aria-expanded` as its `open` state renders it (null = no attribute). */
export interface FakeLauncher extends Pick<Element, "hasAttribute" | "getAttribute"> {
  setAttribute(name: string, value: string): void;
}

export function fakeLauncher(expanded: "true" | "false" | null = "false"): FakeLauncher {
  const attributes = new Map<string, string>();
  if (expanded !== null) attributes.set("aria-expanded", expanded);
  return {
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => void attributes.set(name, value),
  };
}

/** A document with (or without) the floating Rancho launcher. */
export function fakeDocument(launcher: boolean | FakeLauncher): Pick<Document, "querySelector"> {
  const element = launcher === true ? fakeLauncher() : launcher || null;
  return {
    querySelector: (selector: string) => (element && selector === RANCHO_LAUNCHER_SELECTOR ? (element as unknown as Element) : null),
  } as Pick<Document, "querySelector">;
}

export type FakeClick = ClickLike & { prevented: boolean };

export function fakeClick(overrides: Partial<ClickLike> = {}): FakeClick {
  const event: FakeClick = {
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...overrides,
  };
  return event;
}

/**
 * Clicks an "Ask Rancho" link (its click handler) with `window` stubbed by an EventTarget, and
 * returns whether it took over the click and every RANCHO_OPEN_EVENT detail dispatched. A
 * `listening` launcher opens its panel (aria-expanded="true") on the event, as the hydrated
 * RanchoLauncher does; a launcher that is still hydrating does not.
 */
export function clickAskRancho(
  detail: RanchoOpenDetail,
  {
    withLauncher = true,
    launcher = withLauncher ? fakeLauncher() : undefined,
    listening = true,
    event = fakeClick(),
    followLink,
  }: { withLauncher?: boolean; launcher?: FakeLauncher; listening?: boolean; event?: FakeClick; followLink?: () => void } = {},
): { handled: boolean; prevented: boolean; received: RanchoOpenDetail[] } {
  const scope = globalThis as { window?: unknown };
  const had = "window" in scope;
  const previous = scope.window;
  const target = new EventTarget();
  const received: RanchoOpenDetail[] = [];
  target.addEventListener(RANCHO_OPEN_EVENT, (e) => {
    received.push((e as CustomEvent<RanchoOpenDetail>).detail);
    if (listening) launcher?.setAttribute("aria-expanded", "true");
  });
  scope.window = target;
  try {
    const handled = handleAskRanchoClick(event, detail, fakeDocument(launcher ?? false), followLink);
    return { handled, prevented: event.prevented, received };
  } finally {
    if (had) scope.window = previous;
    else delete scope.window;
  }
}
