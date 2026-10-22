"use client";

import { CalendarRange, Gauge, Timer } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { RANCHO_MOTION_ONCE } from "@/components/ask/RanchoMediaPanel";
import { RanchoMascot } from "@/components/rancho/RanchoMascot";
import { homeToolPanelId, homeToolTabId, tabTargetIndex, type HomeToolKey } from "./home-tools";
import { HI_SMALL } from "./HomeToolsPanel";

/** Renders a tile's icon. Decorative: the wrapping disc is `aria-hidden`. */
type TabIcon = () => ReactNode;

const LUCIDE_CLASS = "size-[1.15rem]";

const ICONS: Record<HomeToolKey, TabIcon> = {
  predictor: () => <Gauge className={LUCIDE_CLASS} strokeWidth={1.9} />,
  mockTests: () => <Timer className={LUCIDE_CLASS} strokeWidth={1.9} />,
  // Rancho, Aspire's snow leopard mascot, marks the doubt solver; it fills the disc so it reads as
  // a face, not a smudge. No title: decorative.
  ask: () => <RanchoMascot variant="head" className="size-6 md:size-7" />,
  planner: () => <CalendarRange className={LUCIDE_CLASS} strokeWidth={1.9} />,
};

const TILE_LAYOUT =
  "flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-[12px] px-1 py-2 text-center transition-colors " +
  "sm:min-h-[4.5rem] sm:px-2 " +
  "md:items-start md:justify-start md:gap-2 md:p-3 md:text-left " +
  // Top-aligned from `lg` too (items-start from `md`), so labels line up when one tagline wraps and the others do not.
  "lg:min-h-[4.75rem] lg:flex-row lg:gap-3 lg:px-3.5";
// Forced colours drop backgrounds and rings: a system-colour border marks every tile, a thicker
// Highlight one the selected tile (author system colours are kept in that mode).
const TILE_SELECTED = `${TILE_LAYOUT} bg-navy text-white shadow-soft forced-colors:border-[3px] forced-colors:border-[color:Highlight]`;
const TILE_IDLE = `${TILE_LAYOUT} bg-[#f5f9ff] text-navy ring-1 ring-[#d3e2f5] hover:bg-white hover:ring-blue forced-colors:border forced-colors:border-[color:CanvasText]`;

const DISC_LAYOUT = `grid size-8 shrink-0 place-items-center rounded-full transition-colors md:size-9 lg:size-10 ${RANCHO_MOTION_ONCE}`;
const DISC_SELECTED = `${DISC_LAYOUT} bg-gold text-navy`;
const DISC_IDLE = `${DISC_LAYOUT} bg-white text-blue ring-1 ring-[#d3e2f5]`;

// Balanced, so a two-line tagline never leaves one word on its second line.
const DESC_LAYOUT = `hidden text-xs leading-snug text-balance md:block ${HI_SMALL}`;
// #d3e1f3 on navy: about 10.9:1; muted on #f5f9ff: about 5.2:1.
const DESC_SELECTED = `${DESC_LAYOUT} text-[#d3e1f3]`;
const DESC_IDLE = `${DESC_LAYOUT} text-muted`;

const PANEL_ACTIVE =
  "col-start-1 row-start-1 grid min-w-0 rounded-control opacity-100 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:starting:opacity-0";
// The cap stops a tall panel (an open contact form) from stretching the other tabs from `md`. Per
// breakpoint it stays just above the tallest panel in its default state (en and hi, measured 22 Oct
// 2026), so tabs never jump in that state: 768–1023 at most 646px (42rem = 672; the predictor at
// 768 with the gate's up-front note), from 1024 at most 451px (30rem = 480; the predictor at 1024).
const PANEL_INACTIVE =
  "col-start-1 row-start-1 grid min-w-0 rounded-control max-md:hidden md:invisible md:opacity-0 md:max-h-[42rem] md:overflow-hidden lg:max-h-[30rem]";

export interface HomeToolTab {
  key: HomeToolKey;
  /** Full tool name: the tab's accessible name at every width. */
  label: string;
  /** Phone label (a noun, below `sm`); visual only. */
  short: string;
  /** One-line description under the label from `md`; the tab's description (aria-describedby). */
  tagline: string;
  /** Server-rendered (or server-composed client) panel content. */
  panel: ReactNode;
}

/**
 * The tools picker: a row of four tiles across the top of the card, as WAI-ARIA tabs (APG,
 * automatic activation): roving tabindex, arrow keys (both pairs), Home / End, wrap-around. The
 * server orders the tiles (working tools first) and the first one is selected in the server HTML,
 * so a working tool shows without JavaScript.
 *
 * From `md` every panel shares one grid cell (inactive ones `invisible`, which also hides them
 * from assistive tech and the tab order), so the card keeps the tallest panel's height and nothing
 * below jumps when tabs change; inactive panels are capped (PANEL_INACTIVE) so an open contact
 * form in one tool never stretches the others. On phones inactive panels are `display: none`
 * (each tab keeps its natural height; the strip sits above, so nothing above it moves).
 */
export function HomeToolsTabs({ label, tabs }: { label: string; tabs: HomeToolTab[] }) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
    <>
      {/* White strip, tinted tiles: a tinted tray would merge into the section on the surface tone. 6px gaps leave room for the 5px focus ring. */}
      <div className="border-b border-line p-1.5 sm:p-2 md:p-3">
        <div
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="grid grid-cols-4 gap-1.5 md:gap-2"
        >
          {tabs.map((tab, index) => {
            const renderIcon = ICONS[tab.key];
            const active = index === selected;
            const descId = `${homeToolTabId(tab.key)}-desc`;
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
                aria-describedby={descId}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(index)}
                className={active ? TILE_SELECTED : TILE_IDLE}
              >
                <span aria-hidden="true" className={active ? DISC_SELECTED : DISC_IDLE}>
                  {renderIcon()}
                </span>
                <span className="flex min-w-0 flex-col md:gap-0.5">
                  <span aria-hidden="true" className="text-xs leading-tight font-bold text-balance sm:hidden [&:lang(hi)]:text-[13px]">
                    {tab.short}
                  </span>
                  {/* The full label is the accessible name at every width (label-in-name in en and hi). */}
                  <span className="text-[13px] leading-snug font-bold max-sm:sr-only md:text-sm">{tab.label}</span>
                  <span id={descId} aria-hidden="true" className={active ? DESC_SELECTED : DESC_IDLE}>
                    {tab.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 p-4 sm:p-6 lg:p-8">
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
              // Fade in the newly selected panel only (from display:none on phones, from opacity-0 from md).
              className={active ? PANEL_ACTIVE : PANEL_INACTIVE}
            >
              {tab.panel}
            </div>
          );
        })}
      </div>
    </>
  );
}
