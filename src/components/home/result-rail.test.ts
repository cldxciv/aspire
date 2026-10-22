import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startAutoplay, stepRail } from "@/components/ui/carousel-env";
import { AUTOPLAY_MS, autoplayDelay } from "@/components/ui/carousel-utils";
import { messagesFor } from "@/i18n/messages";
import { ResultRail, type ResultCardView, type ResultRailMessages } from "./ResultRail";

const card = (n: number): ResultCardView => ({
  exam: "JEE Advanced",
  outcome: `AIR ${n}`,
  year: 2025,
  name: null,
  destination: null,
  placeholder: true,
});

function messages(locale: "en" | "hi"): ResultRailMessages {
  const t = messagesFor(locale, "home").results;
  const common = messagesFor(locale, "common");
  return {
    nameWithheld: t.nameWithheld,
    yearPrefix: t.yearPrefix,
    position: t.position,
    positionPrefix: t.positionPrefix,
    previous: t.previous,
    next: t.next,
    demo: common.labels.demo,
    pause: common.carousel.pause,
    play: common.carousel.play,
  };
}

const render = (cards: ResultCardView[], locale: "en" | "hi" = "en", autoPlay?: boolean) =>
  renderToStaticMarkup(createElement(ResultRail, { cards, label: "Results", messages: messages(locale), autoPlay }));

describe("ResultRail autoplay (server markup)", () => {
  it("autoplays by default but renders the static rail before hydration: polite status, no pause / play button", () => {
    const html = render([card(1), card(2), card(3), card(4)]);
    // Previous / next as before; the pause / play button is client-only (it cannot work before hydration).
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).not.toContain("data-carousel-toggle");
    expect(html).not.toContain(messages("en").pause);
    // Nothing rotates before hydration, so the status is announced politely (never "off" in SSR).
    expect(html).toContain('<p aria-live="polite"');
    expect(html).not.toContain('aria-live="off"');
    expect(html).toContain("1 of 4");
    // Default autoplay renders exactly what an explicit autoPlay renders.
    expect(render([card(1), card(2), card(3), card(4)], "en", true)).toBe(html);
  });

  it("has no controls at all for a single card", () => {
    const html = render([card(1)]);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-live");
  });

  it("renders the Hindi rail the same way", () => {
    const html = render([card(1), card(2), card(3)], "hi");
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('<p aria-live="polite"');
    expect(html).toContain(`aria-label="${messages("hi").next}"`);
  });
});

describe("ResultRail autoplay step (client)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The home rail at `@sm`: 4 cards of 280 px with 20 px gaps and 4 px padding in a 580 px list
   * (two cards in view). `scrollTo` jumps like the browser (clamped to the last scroll position)
   * but never fires a scroll event, so `update()` never runs and the stored index stays stale.
   */
  function homeRail() {
    const calls: number[] = [];
    const list = {
      scrollLeft: 0,
      clientWidth: 580,
      scrollWidth: 1188,
      scrollTo({ left = 0 }: ScrollToOptions) {
        calls.push(left);
        list.scrollLeft = Math.min(Math.max(left, 0), list.scrollWidth - list.clientWidth);
      },
    };
    const items = [0, 1, 2, 3].map((i) => ({ offsetLeft: 4 + i * 300 }) as unknown as HTMLElement);
    return { list, calls, items, el: list as unknown as HTMLElement };
  }

  it("moves one card every 5 s from the live scroll position and wraps at the end, with no scroll events", () => {
    vi.useFakeTimers();
    const rail = homeRail();
    // The rail's own wiring: useAutoplay(rotate, autoplayDelay(intervalMs), () => stepRail(list, cards, …)).
    const stop = startAutoplay(autoplayDelay(), () => stepRail(rail.el, rail.items, false));
    vi.advanceTimersByTime(AUTOPLAY_MS - 1);
    expect(rail.calls).toEqual([]);
    vi.advanceTimersByTime(1 + AUTOPLAY_MS * 4);
    // Card 2, card 3, card 4 (clamped: the last two cards in view), then back to the first card.
    expect(rail.calls).toEqual([300, 600, 900, 0, 300]);
    expect(rail.list.scrollLeft).toBe(300);
    stop();
  });
});
