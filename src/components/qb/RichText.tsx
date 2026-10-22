"use client";

import "katex/dist/katex.min.css";

import { Fragment, useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";

import { parseRichText, type RichInline } from "@/lib/qb/rich-text";
import type { QbFigureRef } from "@/lib/qb/types";

import { QbFigure } from "./Figure";
import { figureAt, figuresForSlot, loadKatex, loadedKatex, mathFallbackText, renderMathHtml, type KatexLike } from "./qb-render";

/**
 * Question rich text (owner: QB-CORE-A; §B12). Text segments render as escaped React text (with line
 * breaks kept); math goes through KaTeX (`trust: false`, `strict: "ignore"`, mhchem for `\ce{}`),
 * loaded lazily: until it has loaded the raw source shows in a muted span. `[[figure:N]]` renders
 * the N-th figure of `slot`; pipe tables render as tables.
 *
 * The KaTeX stylesheet (with its local fonts) is imported here, so it ships only with pages that
 * render question text.
 */
export function RichText({
  text,
  locale,
  figures,
  slot = "stem",
  staff = false,
  as,
  className,
}: {
  text: string;
  locale: "en" | "hi";
  figures?: readonly QbFigureRef[];
  slot?: QbFigureRef["slot"];
  staff?: boolean;
  as?: ElementType;
  className?: string;
}) {
  const segments = useMemo(() => parseRichText(text), [text]);
  const hasMath = useMemo(
    () =>
      segments.some(
        (s) =>
          s.kind === "math" ||
          (s.kind === "table" && [...(s.header ?? []), ...s.rows.flat()].some((cell) => cell.some((p) => p.kind === "math"))),
      ),
    [segments],
  );
  const katex = useKatex(hasMath);
  const slotFigures = useMemo(() => figuresForSlot(figures, slot), [figures, slot]);
  const Wrapper = as ?? "div";

  const renderInline = (pieces: RichInline[], keyPrefix: string): ReactNode[] =>
    pieces.map((piece, i) => {
      const key = `${keyPrefix}-${i}`;
      if (piece.kind === "text") return <Fragment key={key}>{piece.text}</Fragment>;
      if (piece.kind === "figure") {
        const figure = figureAt(slotFigures, piece.index);
        return figure ? (
          <QbFigure key={key} figure={figure} locale={locale} index={piece.index} staff={staff} />
        ) : (
          <span key={key} className="text-sm text-muted">
            [{locale === "hi" ? "चित्र" : "Figure"} {piece.index}]
          </span>
        );
      }
      if (katex) {
        const html = renderMathHtml(katex, piece.tex, piece.display);
        if (html) {
          return piece.display ? (
            <span key={key} className="my-2 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
          );
        }
      }
      return (
        <span key={key} className={`font-mono text-[0.9em] text-muted${piece.display ? " my-2 block" : ""}`}>
          {mathFallbackText(piece.tex, piece.display)}
        </span>
      );
    });

  return (
    <Wrapper className={`whitespace-pre-line break-words${className ? ` ${className}` : ""}`} data-qb-math={hasMath ? (katex ? "ready" : "pending") : undefined}>
      {segments.map((segment, i) => {
        if (segment.kind !== "table") return <Fragment key={i}>{renderInline([segment], `s${i}`)}</Fragment>;
        return (
          <span key={i} className="my-2 block overflow-x-auto">
            <table className="border-collapse text-sm">
              {segment.header ? (
                <thead>
                  <tr>
                    {segment.header.map((cell, c) => (
                      <th key={c} className="border border-line bg-surface px-2 py-1 text-left font-semibold">
                        {renderInline(cell, `h${i}-${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {segment.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className="border border-line px-2 py-1 align-top">
                        {renderInline(cell, `r${i}-${r}-${c}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </span>
        );
      })}
    </Wrapper>
  );
}

/** KaTeX once it has loaded (shared by every RichText on the page); null before. */
function useKatex(needed: boolean): KatexLike | null {
  const [katex, setKatex] = useState<KatexLike | null>(() => loadedKatex());
  useEffect(() => {
    if (!needed || katex) return;
    let active = true;
    loadKatex().then(
      (loaded) => {
        if (active) setKatex(loaded);
      },
      () => {
        // Stay on the raw-source fallback.
      },
    );
    return () => {
      active = false;
    };
  }, [needed, katex]);
  return katex;
}
