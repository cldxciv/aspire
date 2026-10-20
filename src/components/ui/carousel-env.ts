/**
 * Client hooks and DOM helpers shared by every auto-moving component: `ImageCarousel`, the home
 * `ResultRail` and `ResultCardMarquee`'s frame. The decisions themselves (play / pause, delay,
 * scroll behaviour, next index) are pure functions in `./carousel-utils`.
 *
 * Every store has a server snapshot, so the hydrating render matches the server markup: not
 * hydrated, no reduced motion, page visible, in view. Nothing rotates before hydration.
 */
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { nearestIndex, railEdges, scrollBehaviorFor } from "./carousel-utils";

const noopSubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

/** `false` on the server and during hydration, `true` afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, getTrue, getFalse);
}

let reducedMq: MediaQueryList | undefined;
const rmq = (): MediaQueryList | undefined =>
  (reducedMq ??= window.matchMedia?.("(prefers-reduced-motion: reduce)"));

function subscribeReducedMotion(onChange: () => void) {
  const mq = rmq();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}
const getReducedMotion = () => rmq()?.matches ?? false;

/** Live `prefers-reduced-motion: reduce` (false on the server and during hydration). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getFalse);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getPageHidden = () => document.visibilityState === "hidden";

/** Whether the tab is hidden (false on the server and during hydration). */
export function usePageHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, getPageHidden, getFalse);
}

/**
 * Whether at least `threshold` of the element is on screen (true until the observer reports, and
 * always true without IntersectionObserver). Used to pause rotation while scrolled out of view.
 */
export function useInView(ref: RefObject<Element | null>, enabled = true, threshold = 0.25): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === "undefined") return;
    // The last entry of a batch is the newest state of the one observed element.
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[entries.length - 1]?.isIntersecting ?? true),
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled, threshold]);
  return inView;
}

/** Keyboard focus only: a click or tap also focuses a button, but must not pause rotation. */
export function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** The pause / play control carries `data-carousel-toggle`; focus on it never pauses (APG). */
export const isToggle = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && el.hasAttribute("data-carousel-toggle");

/**
 * Hover and keyboard-focus pausing (APG carousel pattern). Spread `pointerHandlers` on the element
 * whose hover pauses rotation and `focusHandlers` on the element whose keyboard focus does. Real
 * mouse hover only (a tap fires compatibility mouse events without a matching leave), keyboard
 * focus only (a click must not pause), and never focus on the pause / play toggle itself, so that
 * pressing Play from the keyboard visibly resumes. Call `noteKey(event.target)` from a keydown
 * handler: a key pressed on a click-focused control is keyboard use too.
 */
export function useInteractionPause() {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  return {
    hovered,
    focusWithin,
    noteKey: (target: EventTarget | null) => {
      if (!isToggle(target)) setFocusWithin(true);
    },
    pointerHandlers: {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") setHovered(true);
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") setHovered(false);
      },
    },
    focusHandlers: {
      onFocus: (event: FocusEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        setFocusWithin(!isToggle(target) && isKeyboardFocus(target));
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      },
    },
  };
}

/**
 * Where a horizontal scroll-snap rail is: the item nearest the scroll position and whether it is
 * at either end. `items` are the snap points (the rail's cards), in order.
 */
export function readRail(scroller: HTMLElement, items: readonly HTMLElement[]) {
  const origin = items[0]?.offsetLeft ?? 0;
  return {
    index: nearestIndex(
      items.map((item) => item.offsetLeft - origin),
      scroller.scrollLeft,
    ),
    ...railEdges(scroller.scrollLeft, scroller.clientWidth, scroller.scrollWidth),
  };
}

/** Scrolls the rail so item `index` sits at its start: smooth, or an instant jump under reduced motion. */
export function scrollRailTo(
  scroller: HTMLElement,
  items: readonly HTMLElement[],
  index: number,
  reducedMotion: boolean,
): void {
  const target = items[index];
  if (!target || !items[0]) return;
  scroller.scrollTo({ left: target.offsetLeft - items[0].offsetLeft, behavior: scrollBehaviorFor(reducedMotion) });
}
