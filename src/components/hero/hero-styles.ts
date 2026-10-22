/**
 * Class names shared by the hero kit's server pieces and its client islands (client-safe, no
 * React). Colours are the site tokens (D-026): navy panel, gold accent, #b9d3f3 / #dbe8f7 copy
 * (both ≥ 4.5:1 on navy and on the ridge art's colours).
 */

/**
 * Column layouts of a rich hero (copy + aside). Copy beside the aside from `md` (tablet: about
 * 55 / 45, so a portrait tablet never gets a strip of copy beside a large card), then:
 * - `split` (A · proof, E · centre finder): 50 / 50 from `lg`.
 * - `editorial` (B · Himalayan editorial, D · program picker): about 62 / 38 from `lg`.
 * - `wide` (C · results ribbon): headline left, a short aside (one call to action) at the end of
 *   the row from `lg`, under the copy before that.
 */
export type HeroLayout = "split" | "editorial" | "wide";

export const HERO_GRID: Record<HeroLayout, string> = {
  split: "grid items-center gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-cols-2 lg:gap-12",
  editorial:
    "grid items-center gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-14",
  wide: "grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10",
};

/** Vertical placement of the aside in its grid cell. */
export type HeroAsideAlign = "center" | "start" | "end";

export const HERO_ASIDE_ALIGN: Record<HeroAsideAlign, string> = {
  center: "self-center",
  start: "self-start md:mt-4 lg:mt-8",
  end: "self-end",
};

/** Calls to action on the navy panel: 48 px tall (≥ 44 px targets), gold primary, outlined secondary. */
export const HERO_ACTION = {
  primary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-gold px-5 py-3 text-[15px] font-bold text-navy " +
    "shadow-[0_5px_14px_rgb(245_185_0/0.18)] transition hover:bg-gold-2 hover:-translate-y-px motion-reduce:hover:translate-y-0",
  secondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-white/55 px-5 py-3 text-[15px] " +
    "font-semibold text-white transition hover:border-white hover:bg-white/10",
  /** On a white card inside the panel (data-surface="light"). */
  dark:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-navy px-4 py-3 text-[15px] font-bold text-white " +
    "transition hover:bg-navy-2",
  outline:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-navy px-4 py-3 text-[15px] " +
    "font-bold text-navy transition hover:bg-blue-soft",
  /** Plain text link on a white card, still a 44 px target. */
  link: "inline-flex min-h-11 items-center justify-center gap-1.5 px-2 text-sm font-semibold text-blue hover:underline",
} as const;

export type HeroActionVariant = keyof typeof HERO_ACTION;

/** Toggle chip / year pill on the navy panel (aria-pressed carries the state; the look follows it). */
export const HERO_CHIP =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border-[1.5px] px-4 text-sm transition " +
  "aria-pressed:border-gold aria-pressed:bg-gold aria-pressed:font-bold aria-pressed:text-navy " +
  "aria-[pressed=false]:border-white/35 aria-[pressed=false]:font-semibold aria-[pressed=false]:text-white " +
  "aria-[pressed=false]:hover:border-white/70 aria-[pressed=false]:hover:bg-white/10";

/** Round 44 px control on the navy panel (pause / play, previous / next). */
export const HERO_ROUND_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-white/35 text-white transition " +
  "hover:border-white hover:bg-white/10 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

/** Facts strip / proof stats: equal columns with hairline dividers (A, D). */
export const HERO_DIVIDED_ROW =
  "grid border-t border-white/15 pt-4 [&>*+*]:border-l [&>*+*]:border-white/15 [&>*+*]:pl-3 sm:[&>*+*]:pl-4 [&>*]:pr-3 sm:[&>*]:pr-4 [&>*:last-child]:pr-0";

/** Grid columns for 1–3 equal cells (the strip never stretches one fact across the row). */
export function dividedCols(count: number): string {
  return count >= 3 ? "grid-cols-3" : count === 2 ? "grid-cols-2" : "grid-cols-1 max-w-xs";
}
