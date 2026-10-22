import type { CSSProperties, ReactNode } from "react";
import { Container, HERO_PANEL } from "@/components/ui/Layout";
import { cn } from "@/lib/cn";
import { HeroBreadcrumbs, type Crumb } from "./HeroBreadcrumbs";
import { HeroRidgeArt } from "./HeroRidgeArt";
import { splitHighlight } from "./hero-text";
import { HERO_ASIDE_ALIGN, HERO_GRID, type HeroAsideAlign, type HeroLayout } from "./hero-styles";

export type HeroArt = "ridges" | "none";

/**
 * The navy hero panel of every rich page hero: full width, rounded bottom corners (`HERO_PANEL`),
 * `data-surface="dark"` (gold focus rings), the 1200 px container with the page gutters, and
 * optionally B's ridge art (`art="ridges"`, which adds the bottom room the art needs). Use it
 * directly around a client island that lays out its own columns (`ProgramPicker`,
 * `CentreFinder`); otherwise use `HeroFrame`. Server component, no client JS.
 */
export function HeroPanel({
  art = "none",
  className,
  children,
}: {
  art?: HeroArt;
  className?: string;
  children: ReactNode;
}) {
  const ridges = art === "ridges";
  return (
    <div
      data-surface="dark"
      data-hero="rich"
      className={cn(
        HERO_PANEL,
        "relative isolate bg-navy pt-8 text-white md:pt-12 lg:pt-14",
        ridges ? "pb-32 sm:pb-36 md:pb-24 lg:pb-20" : "pb-12 md:pb-14 lg:pb-16",
        className,
      )}
    >
      {ridges && <HeroRidgeArt />}
      <Container gutters="section">{children}</Container>
    </div>
  );
}

export type HighlightStyle = "gold" | "underline";

/** Gold hand-drawn stroke (B) drawn under each line of the phrase, so it follows wrapping. */
const UNDERLINE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 330 16' preserveAspectRatio='none'>" +
  "<path d='M4 11C80 3 200 3 326 9' fill='none' stroke='#f4c44e' stroke-width='4' stroke-linecap='round' vector-effect='non-scaling-stroke'/></svg>";

const UNDERLINE_STYLE: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(UNDERLINE_SVG)}")`,
  backgroundSize: "100% 0.3em",
  backgroundPosition: "0 100%",
  backgroundRepeat: "no-repeat",
};

/**
 * Headline size follows the copy column (`HeroCopy` is a size container), not the viewport, so
 * it fits beside an aside on a tablet as well as alone: 34 px on phones and in a tablet column,
 * up to 50 px (A, C, D, E) or 58 px (B). Browsers without container units use the viewport.
 */
const HEADLINE_SIZE = {
  lg: "text-[clamp(2.125rem,4.2vw,3.125rem)] supports-[width:1cqi]:text-[clamp(2.125rem,9cqi,3.125rem)]",
  xl: "text-[clamp(2.125rem,4.6vw,3.625rem)] supports-[width:1cqi]:text-[clamp(2.125rem,10cqi,3.625rem)]",
} as const;

/**
 * The page's only `<h1>`, with an optional phrase set in gold (`highlightStyle="gold"`, A / C / E)
 * or underlined with a gold hand-drawn stroke (`"underline"`, B). The phrase must appear in
 * `title` exactly (it is matched, not inserted); a translation that words it differently simply
 * renders a plain headline.
 */
export function HeroHeadline({
  title,
  highlight,
  highlightStyle = "gold",
  size = "lg",
  id,
  className,
}: {
  title: string;
  highlight?: string;
  highlightStyle?: HighlightStyle;
  size?: keyof typeof HEADLINE_SIZE;
  id?: string;
  className?: string;
}) {
  const parts = splitHighlight(title, highlight);
  return (
    <h1
      id={id}
      className={cn(
        // Devanagari needs more room for its upper and lower marks than Latin.
        "m-0 font-serif leading-[1.1] font-bold tracking-tight text-balance break-words [&:lang(hi)]:leading-[1.25]",
        HEADLINE_SIZE[size],
        className,
      )}
    >
      {parts ? (
        <>
          {parts[0]}
          {highlightStyle === "underline" ? (
            <span className="pb-[0.14em] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]" style={UNDERLINE_STYLE}>
              {parts[1]}
            </span>
          ) : (
            <span className="text-gold">{parts[1]}</span>
          )}
          {parts[2]}
        </>
      ) : (
        title
      )}
    </h1>
  );
}

export type EyebrowStyle = "pill" | "caps";

export type HeroCopyProps = {
  title: string;
  /** Phrase of `title` set in gold or underlined (see `HeroHeadline`). */
  highlight?: string;
  highlightStyle?: HighlightStyle;
  /** `xl` for B's large editorial headline. */
  size?: "lg" | "xl";
  /** Short line above the headline: a cream pill (A) or gold capitals (B). Omit when there is no fact for it. */
  eyebrow?: string;
  eyebrowStyle?: EyebrowStyle;
  lead?: ReactNode;
  /** Calls to action (`HeroAction`s): full width on phones, a row from `sm`. */
  actions?: ReactNode;
  /** Under the actions in the copy column: `ProofStats`, `HeroFactsStrip`, a note … */
  below?: ReactNode;
  crumbs?: Crumb[];
  homeLabel?: string;
  homeHref?: string;
  breadcrumbLabel?: string;
  headingId?: string;
  className?: string;
};

/**
 * The copy column of a rich hero: breadcrumb, eyebrow, headline, lead, actions and an optional
 * block under them. Server component; pass it as the `copy` of a client island or let
 * `HeroFrame` place it.
 */
export function HeroCopy({
  title,
  highlight,
  highlightStyle,
  size = "lg",
  eyebrow,
  eyebrowStyle = "pill",
  lead,
  actions,
  below,
  crumbs,
  homeLabel,
  homeHref,
  breadcrumbLabel,
  headingId,
  className,
}: HeroCopyProps) {
  return (
    <div className={cn("@container flex min-w-0 flex-col gap-4 sm:gap-5", className)}>
      <HeroBreadcrumbs
        crumbs={crumbs}
        homeLabel={homeLabel}
        homeHref={homeHref}
        label={breadcrumbLabel}
        className="text-xs text-[#b9d3f3]"
      />
      {eyebrow?.trim() &&
        (eyebrowStyle === "pill" ? (
          <p className="m-0 self-start rounded-full bg-gold-soft px-3.5 py-1.5 text-[13px] leading-snug font-semibold text-navy">
            {eyebrow}
          </p>
        ) : (
          <p className="m-0 text-xs leading-snug font-semibold tracking-[0.16em] text-gold uppercase sm:text-[13px]">{eyebrow}</p>
        ))}
      <HeroHeadline title={title} highlight={highlight} highlightStyle={highlightStyle} size={size} id={headingId} />
      {lead &&
        (typeof lead === "string" ? (
          <p className="m-0 max-w-xl text-base leading-relaxed text-[#dbe8f7] sm:text-[17px]">{lead}</p>
        ) : (
          <div className="max-w-xl text-base leading-relaxed text-[#dbe8f7] sm:text-[17px]">{lead}</div>
        ))}
      {actions && <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div>}
      {below && <div className="mt-2 min-w-0">{below}</div>}
    </div>
  );
}

export type HeroFrameProps = HeroCopyProps & {
  /** `ridges`: B's mountain art along the bottom. */
  art?: HeroArt;
  /** Column layout when there is an `aside` (see `HERO_GRID`). */
  layout?: HeroLayout;
  /** Right-hand column: `HeroCollage`, `NextBatchCard`, a program card, a photo … */
  aside?: ReactNode;
  /** Default `center` (`end` for the `wide` layout). */
  asideAlign?: HeroAsideAlign;
  /** Full-width row under the columns, e.g. `ResultsRibbon`. */
  footer?: ReactNode;
  panelClassName?: string;
};

/**
 * Rich page hero (A · proof, B · editorial, C · ribbon and the B frame of the other inner pages):
 * `HeroPanel` + `HeroCopy` beside an optional `aside`, and an optional full-width `footer`.
 * Server component: the shell is static (Cache Components); interactive parts are client islands
 * passed in as slots. Without an aside the copy keeps a readable width.
 */
export function HeroFrame({
  art = "none",
  layout = "split",
  aside,
  asideAlign = layout === "wide" ? "end" : "center",
  footer,
  panelClassName,
  ...copy
}: HeroFrameProps) {
  const copyBlock = <HeroCopy {...copy} size={copy.size ?? (art === "ridges" ? "xl" : "lg")} />;
  return (
    <HeroPanel art={art} className={panelClassName}>
      {aside ? (
        <div className={HERO_GRID[layout]}>
          {copyBlock}
          <div className={cn("min-w-0", HERO_ASIDE_ALIGN[asideAlign])}>{aside}</div>
        </div>
      ) : (
        <div className="max-w-3xl">{copyBlock}</div>
      )}
      {footer && <div className="mt-8 min-w-0 md:mt-10">{footer}</div>}
    </HeroPanel>
  );
}
