import "server-only";

import katex from "katex";
import "katex/contrib/mhchem";

import { parseRichText, type RichInline } from "./rich-text";
import type { QbQuestionContent } from "./types";

/**
 * Server-side math check (owner: QB-CORE-A; §B12). Compiles every math segment with KaTeX and mhchem,
 * using the SAME settings as the browser (`strict: "ignore"`, so `\ce{H2O}` and Devanagari inside
 * `\text{}` pass) but `throwOnError: true`, and reports what fails. A question with a failing
 * segment gets the blocking flag `math_error`.
 */

/** KaTeX options shared with `<RichText>` (the browser adds `throwOnError: false`). */
export const QB_KATEX_CHECK_OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: "ignore",
  maxExpand: 1000,
  output: "htmlAndMathml",
} as const;

export interface MathProblem {
  field: string;
  tex: string;
  message: string;
}

/** Null when `tex` compiles; otherwise KaTeX's message (trimmed). */
export function checkTex(tex: string, display = false): string | null {
  try {
    katex.renderToString(tex, { ...QB_KATEX_CHECK_OPTIONS, displayMode: display });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, " ").slice(0, 300);
  }
}

function collectMath(text: string): { tex: string; display: boolean }[] {
  const found: { tex: string; display: boolean }[] = [];
  const add = (inline: RichInline[]) => {
    for (const piece of inline) if (piece.kind === "math") found.push({ tex: piece.tex, display: piece.display });
  };
  for (const segment of parseRichText(text)) {
    if (segment.kind === "table") {
      if (segment.header) segment.header.forEach(add);
      segment.rows.forEach((row) => row.forEach(add));
    } else add([segment]);
  }
  return found;
}

/** Math problems in one stored field. */
export function mathProblemsIn(text: string, field = "text"): MathProblem[] {
  const problems: MathProblem[] = [];
  for (const { tex, display } of collectMath(text)) {
    const message = checkTex(tex, display);
    if (message) problems.push({ field, tex, message });
  }
  return problems;
}

/** Math problems in every field of a question (stem, options and solution, both languages). */
export function contentMathProblems(content: Pick<QbQuestionContent, "stem" | "options" | "solution">): MathProblem[] {
  const problems: MathProblem[] = [];
  for (const lang of ["en", "hi"] as const) {
    problems.push(...mathProblemsIn(content.stem[lang], `stem.${lang}`));
    content.options.forEach((option, i) => problems.push(...mathProblemsIn(option[lang], `options.${i}.${lang}`)));
    problems.push(...mathProblemsIn(content.solution[lang], `solution.${lang}`));
  }
  return problems;
}
