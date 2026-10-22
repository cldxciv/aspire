import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared building blocks of the homepage tools card (HomeTools). Pure: no "use client", no hooks,
 * so the server panels (mock tests, Ask) and the client tools (predictor, countdown) render the
 * same shell. `cn` does not merge conflicting Tailwind classes, so every conditional style below is
 * an exclusive branch between two full class strings, never "base plus override".
 */

/** Devanagari small print: at least 13px with a 1.6 line height (critique: Hindi small text). */
export const HI_SMALL = "[&:lang(hi)]:text-[13px] [&:lang(hi)]:leading-[1.6]";

const CONTROL_CORE =
  "block min-h-11 w-full min-w-0 rounded-control border py-2 text-[15px] text-ink transition-colors focus:border-blue";
/** Text inputs, date inputs and selects in the widget. */
export const controlClass = `${CONTROL_CORE} border-[#b9cbe0] bg-white px-3`;
/** The same control with its value error showing (aria-invalid). */
export const controlErrorClass = `${CONTROL_CORE} border-danger bg-danger-soft/40 px-3`;
export const labelClass = "mb-1.5 block text-[13px] font-bold text-[#354b66]";

/**
 * Visible edge for an outline Button in this section: the shared outline variant's border colour
 * loses to the base `border-transparent`, so the edge is drawn as an inset ring (box-shadow), which
 * no Button class sets. Add it only on the outline branch.
 */
export const OUTLINE_EDGE = "ring-1 ring-inset ring-[#b9cbe0] hover:ring-blue";

/** A select with the site's chevron; native appearance (and no chevron) in forced colours. The caller renders the <label>. */
export function SelectField({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className={`${CONTROL_CORE} appearance-none border-[#b9cbe0] bg-white pr-10 pl-3 forced-colors:appearance-auto`}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-blue forced-colors:hidden"
      />
    </div>
  );
}

const TAG_BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide [&:lang(hi)]:text-xs [&:lang(hi)]:normal-case [&:lang(hi)]:tracking-normal";
const TAG_TONES = {
  /** Sample data (#7a5600 on #fff7df: 6.21:1). */
  sample: "bg-gold-soft text-[#7a5600] ring-1 ring-[#f2dfa0]",
  /** "AI doubt solver". */
  ai: "bg-blue-soft text-navy ring-1 ring-[#cfe0f7]",
  /** Coming soon / unavailable. */
  neutral: "bg-surface text-[#354b66] ring-1 ring-line",
} as const;

/** Solid honesty or status tag (this section's replacement for the dashed DemoBadge). */
export function SampleTag({ label, tone }: { label: string; tone: keyof typeof TAG_TONES }) {
  return (
    <span className={cn(TAG_BASE, TAG_TONES[tone])}>
      <span>{label}</span>
    </span>
  );
}

/**
 * Panel title row (the tag pinned top-right, never wrapping under the title), the tool's tagline
 * below `md` only (from `md` the selected tile above shows it), and a short lead.
 */
export function PanelHead({ title, tagline, badge, lead }: { title: string; tagline: string; badge?: ReactNode; lead: ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-serif text-[1.375rem] leading-snug font-semibold text-navy sm:text-2xl [&:lang(hi)]:leading-normal">
          {title}
        </h3>
        {badge && <div className="mt-1 shrink-0">{badge}</div>}
      </div>
      <p className="mt-1 text-[13px] leading-snug font-semibold text-blue md:hidden [&:lang(hi)]:text-sm">{tagline}</p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted sm:text-[15px]">{lead}</p>
    </div>
  );
}

const STAGE_TONES = {
  default:
    "relative @container flex min-h-[11rem] flex-1 flex-col justify-center overflow-hidden rounded-[14px] bg-linear-to-br from-[#f5f9ff] to-surface p-4 ring-1 ring-[#d3e2f5] ring-inset sm:p-5 lg:p-6",
  // The RanchoMediaPanel gradient.
  ask: "relative @container flex min-h-[11rem] flex-1 flex-col justify-center overflow-hidden rounded-[14px] bg-linear-to-b from-[#dce9fb] via-blue-soft to-gold-soft p-4 ring-1 ring-[#d3e2f5] ring-inset sm:p-5 lg:p-6",
  // The contact form: no tint and no clipping, so its focus rings show.
  bare: "relative @container flex flex-1 flex-col",
} as const;

/** A short "how it works" / "what it does" block under a stage's preview (fills a tall stage with real content). */
export const STAGE_INFO = "mt-5 border-t border-[#d3e2f5] pt-4";
export const STAGE_INFO_LABEL = "text-[13px] font-bold text-[#354b66]";

/**
 * The tool's visual area. Tinted stages keep every focusable item at least 16px from their edge,
 * so the 5px focus ring (3px outline + 2px offset) is never clipped.
 */
export function ToolStage({ tone, children }: { tone: keyof typeof STAGE_TONES; children: ReactNode }) {
  return <div className={STAGE_TONES[tone]}>{children}</div>;
}

// Rows auto / auto / 1fr: the exits follow the controls (or the head) and any spare height falls
// below them, so a link never sits stranded at the bottom of a tall panel.
const SPLIT = {
  outer:
    "grid gap-5 sm:gap-6 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] md:gap-x-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-8",
  head: "min-w-0 md:col-start-1 md:row-start-1",
  controls: "@container flex min-w-0 flex-col md:col-start-1 md:row-start-2",
  stage: "flex min-w-0 flex-col md:col-start-2 md:row-start-1 md:row-span-3",
  exits: "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 md:col-start-1 md:row-start-3 md:self-start",
  /** No controls (mock tests, a tool that is not available): the exits take the controls' row. */
  exitsNoControls: "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 md:col-start-1 md:row-start-2 md:self-start",
};

/** While the contact form shows: one wide column at `md` (inputs, then recap and form), inputs hidden below `md`. */
const GATED = {
  outer:
    "grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-8",
  head: "min-w-0 lg:col-start-1 lg:row-start-1",
  controls: "@container flex min-w-0 flex-col max-md:hidden lg:col-start-1 lg:row-start-2",
  stage: "flex min-w-0 flex-col lg:col-start-2 lg:row-start-1 lg:row-span-3",
  exits: "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 lg:col-start-1 lg:row-start-3 lg:self-start",
  exitsNoControls: "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 lg:col-start-1 lg:row-start-2 lg:self-start",
};

/**
 * One tool panel: head, controls (inputs or the main action), stage, exits. DOM order is that
 * order, so Tab goes inputs → result or form → exits. From `md` the stage is a right-hand column
 * that spans the panel's height (from `lg` while `gated`); the exits sit right under the controls.
 */
export function ToolPanel({
  head,
  controls,
  stage,
  exits,
  gated = false,
}: {
  head: ReactNode;
  controls?: ReactNode;
  stage: ReactNode;
  exits: ReactNode;
  gated?: boolean;
}) {
  const layout = gated ? GATED : SPLIT;
  return (
    <div className={layout.outer}>
      <div className={layout.head}>{head}</div>
      {controls && <div className={layout.controls}>{controls}</div>}
      <div className={layout.stage}>{stage}</div>
      <div className={controls ? layout.exits : layout.exitsNoControls}>{exits}</div>
    </div>
  );
}
