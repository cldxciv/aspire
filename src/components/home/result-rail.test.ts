import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
