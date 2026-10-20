"use client";

import { CalendarRange, Gauge, Timer } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { RANCHO_MOTION_ONCE } from "@/components/ask/RanchoMediaPanel";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { cn } from "@/lib/cn";
import { homeToolPanelId, homeToolTabId, tabTargetIndex, type HomeToolKey } from "./home-tools";

/** Renders a tab's icon. Decorative: the wrapping span is `aria-hidden`. */
type TabIcon = () => ReactNode;

const LUCIDE_CLASS = "size-[1.15rem]";

const ICONS: Record<HomeToolKey, TabIcon> = {
  predictor: () => <Gauge className={LUCIDE_CLASS} strokeWidth={1.9} />,
  mockTests: () => <Timer className={LUCIDE_CLASS} strokeWidth={1.9} />,
  // Rancho, Aspire's snow leopard mascot, marks the doubt solver. `size-5`: the head fills less of its
  // box than a lucide glyph does, so it reads at the same size as the icons beside it. No title.
  ask: () => <RanchoMascot variant="head" className="size-5" />,
  planner: () => <CalendarRange className={LUCIDE_CLASS} strokeWidth={1.9} />,
};

/** Tailwind `md` (48rem): the tabs become a vertical rail. */
const RAIL_QUERY = "(min-width: 48rem)";

function subscribeRail(onChange: () => void) {
  const query = window.matchMedia(RAIL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isRail = () => window.matchMedia(RAIL_QUERY).matches;
const notRail = () => false;

export interface HomeToolTab {
  key: HomeToolKey;
  label: string;
  /** Server-rendered panel content. */
  panel: ReactNode;
}

/**
 * The widget card's WAI-ARIA tabs (APG, automatic activation): roving tabindex, arrow keys (both
 * pairs: a 2×2 / 4-column grid on phones, a vertical rail from `md`), Home / End, wrap-around.
 * Panels are server-rendered children; the first tab is selected in the server HTML, so the
 * predictor shows without JavaScript. From `md` every panel shares one grid cell (inactive ones
 * `invisible`, which also hides them from assistive tech), so the card keeps the tallest panel's
 * height and nothing below jumps when tabs change. On phones inactive panels are `display: none`.
 */
export function HomeToolsTabs({ label, tabs }: { label: string; tabs: HomeToolTab[] }) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rail = useSyncExternalStore(subscribeRail, isRail, notRail);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Start from the focused tab (not state), so quick repeated key presses never use a stale index.
    const focused = tabRefs.current.findIndex((tab) => tab === event.target);
    // Passing the event's modifier flags leaves Alt / Ctrl / Meta shortcuts to the browser.
    const next = tabTargetIndex(event.key, focused === -1 ? selected : focused, tabs.length, event);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-card bg-white shadow-panel ring-1 ring-navy/5 md:grid md:grid-cols-[minmax(0,12.5rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,11.25rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <div className="border-b border-line bg-surface p-2 sm:p-3 md:border-r md:border-b-0 md:p-4">
        <div
          role="tablist"
          aria-label={label}
          aria-orientation={rail ? "vertical" : "horizontal"}
          onKeyDown={onKeyDown}
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-1 md:gap-2"
        >
          {tabs.map((tab, index) => {
            const renderIcon = ICONS[tab.key];
            const active = index === selected;
            return (
              <button
                key={tab.key}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={homeToolTabId(tab.key)}
                aria-selected={active}
                aria-controls={homeToolPanelId(tab.key)}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(index)}
                className={cn(
                  "flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm font-bold leading-snug transition-colors",
                  "sm:max-md:flex-col sm:max-md:justify-center sm:max-md:gap-1.5 sm:max-md:text-center",
                  active ? "bg-navy text-white shadow-soft" : "text-navy hover:bg-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
                    // Rancho's blink plays once instead of looping (WCAG 2.2.2); lucide icons do not move.
                    RANCHO_MOTION_ONCE,
                    active ? "bg-gold text-navy" : "bg-white text-blue ring-1 ring-[#d3e2f5]",
                  )}
                >
                  {renderIcon()}
                </span>
                <span className="min-w-0">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="@container grid min-w-0 p-5 sm:p-6 md:p-7 lg:p-6 xl:p-8">
        {tabs.map((tab, index) => {
          const active = index === selected;
          return (
            <div
              key={tab.key}
              role="tabpanel"
              id={homeToolPanelId(tab.key)}
              aria-labelledby={homeToolTabId(tab.key)}
              tabIndex={0}
              data-state={active ? "active" : "inactive"}
              className={cn(
                "col-start-1 row-start-1 min-w-0 rounded-control",
                // Fade in the newly selected panel only (from display:none on phones, from opacity-0 from md).
                active ? "opacity-100 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:starting:opacity-0" : "max-md:hidden md:invisible md:opacity-0",
              )}
            >
              {tab.panel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
