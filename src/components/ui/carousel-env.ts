/**
 * Client hooks and DOM helpers shared by every auto-moving component: `ImageCarousel`, the home
 * `ResultRail` and `ResultCardMarquee`'s frame. The decisions themselves (play / pause, delay,
 * scroll behaviour, next index, what a settled scroll means) are pure functions in
 * `./carousel-utils`.
 *
 * Every store has a server snapshot, so the hydrating render matches the server markup: not
 * hydrated, no reduced motion, page visible, in view. Nothing rotates before hydration.
 */
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from "react";
import { nearestIndex, railEdges, railNextIndex, scrollBehaviorFor } from "./carousel-utils";

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
 * Whether any part of the element is on screen (true until the observer reports, and always true
 * without IntersectionObserver). Used to pause rotation only while it is scrolled fully out of
 * view, where nobody can see the slides or the pause / play toggle.
 */
export function useInView(ref: RefObject<Element | null>, enabled = true): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === "undefined") return;
    // The last entry of a batch is the newest state of the one observed element.
    const observer = new IntersectionObserver((entries) =>
      setInView(entries[entries.length - 1]?.isIntersecting ?? true),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
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
 * APG carousel pattern: whether focus landing on `target` (from an `onFocus` on the carousel)
 * presses Pause for the visitor, so the toggle then shows "Play" and rotation resumes only on Play
 * (no hidden pause behind a "Pause" label). Keyboard focus only (a click or tap that focuses a
 * button or a photo must not pause), and never focus on the pause / play toggle itself, so
 * pressing Play from the keyboard visibly resumes.
 */
export function isPausingFocus(target: EventTarget | null): boolean {
  return target instanceof Element && !isToggle(target) && isKeyboardFocus(target);
}

/**
 * Whether a focus event is only the browser giving focus back to the element that had it when the
 * window or tab lost focus (no `relatedTarget` on the blur or on the focus): not the visitor moving
 * focus. `lastBlurred` is the target of the last blur that had no `relatedTarget`.
 */
export function isFocusRestore(
  event: { target: EventTarget | null; relatedTarget: EventTarget | null },
  lastBlurred: EventTarget | null,
): boolean {
  return event.relatedTarget === null && event.target !== null && event.target === lastBlurred;
}

/**
 * `onFocus` / `onBlur` for a carousel's root: `pause()` when keyboard focus lands on a slide or a
 * control (`isPausingFocus`). Focus restored when the window or tab regains it never pauses
 * (`isFocusRestore`): a clicked photo becomes `:focus-visible` after any key (PageDown), and
 * switching tabs and back must not then press Pause.
 */
export function useFocusPause(pause: () => void) {
  const lastBlurred = useRef<EventTarget | null>(null);
  return {
    onBlur(event: ReactFocusEvent) {
      lastBlurred.current = event.relatedTarget === null ? event.target : null;
    },
    onFocus(event: ReactFocusEvent) {
      const restored = isFocusRestore(event, lastBlurred.current);
      lastBlurred.current = null;
      if (!restored && isPausingFocus(event.target)) pause();
    },
  };
}

/**
 * Calls `onStep` every `delay` ms until the returned function stops it. A plain interval that
 * re-arms itself: a step whose scroll never happens, or never reports back, cannot stop autoplay.
 */
export function startAutoplay(delay: number, onStep: () => void): () => void {
  const id = setInterval(onStep, delay);
  return () => clearInterval(id);
}

/**
 * Autoplay timer: `onStep` every `delay` ms while `active` (`startAutoplay`). A new `restartKey`
 * (a manual move) restarts the full interval. `onStep` always sees the latest props and state, so
 * the timer never waits for a re-render or a scroll event to arm the next step.
 */
export function useAutoplay(active: boolean, delay: number, onStep: () => void, restartKey: unknown = 0): void {
  const step = useEffectEvent(onStep);
  useEffect(() => {
    if (!active) return;
    return startAutoplay(delay, () => step());
  }, [active, delay, restartKey]);
}

/** Quiet time after the last scroll event that counts as "at rest" where `scrollend` is missing. */
export const SETTLE_MS = 150;

/** Keys that scroll a focused sideways scroller (up / down / page keys scroll the page instead). */
const SIDEWAYS_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * Whether an input event on a sideways scroller is the visitor moving it: a sideways wheel or
 * trackpad swipe (or Shift + wheel), or a sideways key. An up / down wheel, a page-scroll key or a
 * click never is, so none of them can make a later programmatic step look like a swipe.
 */
export function isSidewaysInput(event: { type: string; key?: string; deltaX?: number; shiftKey?: boolean }): boolean {
  if (event.type === "wheel") return (event.deltaX ?? 0) !== 0 || event.shiftKey === true;
  if (event.type === "keydown") return SIDEWAYS_KEYS.has(event.key ?? "");
  return false;
}

/**
 * Calls `onSettle(userGesture)` when a scroller comes to rest: on `scrollend`, or `SETTLE_MS` after
 * the last scroll event in browsers without it. `userGesture` is true when the visitor moved it
 * since the last rest (a sideways finger drag, a scroll while a finger, pen or mouse button is down
 * on it, a pen press the browser took over to pan it, a sideways wheel / trackpad swipe or a
 * sideways key: `isSidewaysInput`), false for a programmatic `scrollTo` (a tap, a click or an up /
 * down wheel over it does not count). A scroll made before the listener existed (a swipe before
 * hydration) is reported at once as the visitor's. `onPress` runs on every pointer press on the
 * scroller (the carousels restart their interval there, so no step lands in the middle of a swipe).
 * Nothing here stops autoplay: the timer runs whether or not a scroll ever settles.
 */
export function useScrollSettle(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSettle: (userGesture: boolean) => void,
  onPress?: () => void,
): void {
  const settle = useEffectEvent(onSettle);
  const press = useEffectEvent(() => onPress?.());
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const native = "onscrollend" in window;
    let gesture = false;
    let touching = false;
    // The mouse or pen pointer held down on the scroller (fingers are tracked by the touch events).
    let held: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      // Without scrollend, a pause mid-swipe is not the end: wait for the finger to lift.
      // (scrollend itself only fires once the finger is up.)
      if (touching && !native) return;
      const user = gesture;
      gesture = false;
      settle(user);
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, SETTLE_MS);
    };
    const onScroll = () => {
      // Dragged by a finger or a pen, or by a mouse on the scrollbar.
      if (touching || held !== null) gesture = true;
      if (!native) later();
    };
    const onInput = (event: WheelEvent | KeyboardEvent) => {
      if (isSidewaysInput(event)) gesture = true;
    };
    let startX = 0;
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touching = true;
      startX = event.touches[0]?.clientX ?? 0;
      startY = event.touches[0]?.clientY ?? 0;
    };
    // A sideways drag is a swipe even when the browser only starts scrolling after the lift (a
    // quick flick); a tap or an up / down drag (scrolling the page) is not.
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      if (dx > 2 && dx > Math.abs(touch.clientY - startY)) gesture = true;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touching = false;
      // Without scrollend, a lift with no further scroll would otherwise never settle.
      if (!native) later();
    };
    const onPointerDown = (event: PointerEvent) => {
      press();
      if (event.pointerType !== "touch") held = event.pointerId;
    };
    // On the window: the button or pen may be released anywhere on the page.
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === held) held = null;
    };
    // A pen press the browser takes over to pan (it fires no touch events): count what follows.
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== held) return;
      held = null;
      gesture = true;
    };
    const passive = { passive: true } as const;
    el.addEventListener("scroll", onScroll, passive);
    el.addEventListener("wheel", onInput, passive);
    el.addEventListener("keydown", onInput);
    el.addEventListener("touchstart", onTouchStart, passive);
    el.addEventListener("touchmove", onTouchMove, passive);
    el.addEventListener("touchend", onTouchEnd, passive);
    el.addEventListener("touchcancel", onTouchEnd, passive);
    el.addEventListener("pointerdown", onPointerDown, passive);
    window.addEventListener("pointerup", onPointerUp, passive);
    window.addEventListener("pointercancel", onPointerCancel, passive);
    if (native) el.addEventListener("scrollend", finish);
    if (Math.abs(el.scrollLeft) > 1) {
      gesture = true;
      finish();
    }
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onInput);
      el.removeEventListener("keydown", onInput);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("scrollend", finish);
    };
  }, [ref, enabled]);
}

/**
 * Scrolls a track of full-width slides to slide `index` (smooth, or an instant jump under reduced
 * motion) unless it is already there (±1 px) or has no width yet.
 */
export function scrollTrackTo(track: HTMLElement, index: number, reducedMotion: boolean): void {
  const width = track.clientWidth;
  if (!(width > 0)) return;
  const left = index * width;
  if (Math.abs(track.scrollLeft - left) <= 1) return;
  track.scrollTo({ left, behavior: scrollBehaviorFor(reducedMotion) });
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

/**
 * One autoplay step of a scroll-snap rail, worked out from where the rail really is right now, so a
 * cancelled or lost scroll never stalls it (the next step simply starts from there). Returns the
 * item it scrolls to, or `null` when nothing can move (one item, or every item already fits).
 */
export function stepRail(scroller: HTMLElement, items: readonly HTMLElement[], reducedMotion: boolean): number | null {
  if (items.length < 2 || scroller.scrollWidth <= scroller.clientWidth + 1) return null;
  const rail = readRail(scroller, items);
  const target = railNextIndex(rail.index, items.length, rail.atEnd);
  scrollRailTo(scroller, items, target, reducedMotion);
  return target;
}
