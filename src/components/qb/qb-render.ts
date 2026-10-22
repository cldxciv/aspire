import type { QbFigureRef } from "@/lib/qb/types";

/**
 * Pure helpers behind <RichText> and <QbFigure> (owner: QB-CORE-A; §B12). Client-safe.
 *
 * KaTeX (≈ 270 KB) and its mhchem extension are loaded lazily, once per page, the first time a
 * question with math renders. Until then the raw source shows in a muted span. Print views await
 * `whenKatexReady()` before calling `window.print()`.
 */

/** The browser's KaTeX options: the same `strict` as the server check, but never throwing. */
export const QB_KATEX_RENDER_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: "ignore",
  maxExpand: 1000,
  output: "htmlAndMathml",
} as const;

export interface KatexLike {
  renderToString(tex: string, options: Record<string, unknown>): string;
}

let katexPromise: Promise<KatexLike> | null = null;
let katexLoaded: KatexLike | null = null;

/** Loads KaTeX + mhchem once (dynamic import); later calls share the same promise. */
export function loadKatex(): Promise<KatexLike> {
  if (!katexPromise) {
    katexPromise = import("katex")
      .then(async (module) => {
        await import("katex/contrib/mhchem");
        const katex = ((module as { default?: KatexLike }).default ?? module) as KatexLike;
        katexLoaded = katex;
        return katex;
      })
      .catch((error: unknown) => {
        katexPromise = null;
        throw error;
      });
  }
  return katexPromise;
}

/** KaTeX if it has finished loading, else null (render the fallback). */
export function loadedKatex(): KatexLike | null {
  return katexLoaded;
}

/** Resolves when KaTeX is ready (or after `timeoutMs`, so printing is never blocked for good). */
export function whenKatexReady(timeoutMs = 4000): Promise<boolean> {
  return Promise.race([
    loadKatex().then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

const htmlCache = new Map<string, string>();
const HTML_CACHE_LIMIT = 2000;

/** KaTeX HTML for one math segment (cached). Safe: `trust: false`, errors render as KaTeX's red text. */
export function renderMathHtml(katex: KatexLike, tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}${tex}`;
  const cached = htmlCache.get(key);
  if (cached !== undefined) return cached;
  let html: string;
  try {
    html = katex.renderToString(tex, { ...QB_KATEX_RENDER_OPTIONS, displayMode: display });
  } catch {
    html = "";
  }
  if (htmlCache.size >= HTML_CACHE_LIMIT) htmlCache.clear();
  htmlCache.set(key, html);
  return html;
}

/** The raw source shown until KaTeX loads (and if it fails to). */
export function mathFallbackText(tex: string, display: boolean): string {
  return display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
}

/** Figures of one field, in order (`[[figure:N]]` is the N-th, 1-based). */
export function figuresForSlot(figures: readonly QbFigureRef[] | undefined, slot: QbFigureRef["slot"]): QbFigureRef[] {
  return (figures ?? []).filter((figure) => figure.slot === slot);
}

/** The figure `[[figure:N]]` refers to, or null. */
export function figureAt(figures: readonly QbFigureRef[], index: number): QbFigureRef | null {
  return Number.isInteger(index) && index >= 1 && index <= figures.length ? figures[index - 1] : null;
}

const FIGURE_ID = /^[0-9a-f]{32}$/;

/** Public route (approved versions only) or the staff route (drafts included). */
export function figureUrl(id: string, options: { staff?: boolean } = {}): string | null {
  if (!FIGURE_ID.test(id)) return null;
  return options.staff ? `/api/admin/qb/figures/${id}` : `/api/qb/figures/${id}`;
}

/** Display size: never wider than `maxWidth` (figures are stored at most 700 px wide), aspect kept. */
export function scaledSize(width: number, height: number, maxWidth = 700): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w <= maxWidth) return { width: w, height: h };
  return { width: maxWidth, height: Math.max(1, Math.round((h * maxWidth) / w)) };
}
