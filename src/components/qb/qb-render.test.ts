import { describe, expect, it } from "vitest";

import type { QbFigureRef } from "@/lib/qb/types";

import { figureAt, figuresForSlot, figureUrl, loadKatex, mathFallbackText, renderMathHtml, scaledSize, whenKatexReady } from "./qb-render";

const figure = (id: string, slot: QbFigureRef["slot"]): QbFigureRef => ({ id, slot, alt: { en: "Diagram", hi: "चित्र" }, width: 900, height: 450 });

describe("qb render helpers", () => {
  it("builds figure URLs only for figure ids, public or staff", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(figureUrl(id)).toBe(`/api/qb/figures/${id}`);
    expect(figureUrl(id, { staff: true })).toBe(`/api/admin/qb/figures/${id}`);
    expect(figureUrl("../../etc/passwd")).toBeNull();
    expect(figureUrl("0123")).toBeNull();
  });

  it("picks the N-th figure of a slot and keeps the aspect when scaling", () => {
    const figures = [figure("a".repeat(32), "stem"), figure("b".repeat(32), "solution"), figure("c".repeat(32), "stem")];
    const stem = figuresForSlot(figures, "stem");
    expect(stem.map((f) => f.id[0])).toEqual(["a", "c"]);
    expect(figureAt(stem, 2)?.id[0]).toBe("c");
    expect(figureAt(stem, 3)).toBeNull();
    expect(figureAt(stem, 0)).toBeNull();
    expect(scaledSize(900, 450)).toEqual({ width: 700, height: 350 });
    expect(scaledSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it("renders math with KaTeX (mhchem loaded) and shows the source as the fallback", async () => {
    expect(mathFallbackText("x^2", false)).toBe("\\(x^2\\)");
    expect(mathFallbackText("x^2", true)).toBe("\\[x^2\\]");
    const katex = await loadKatex();
    expect(await whenKatexReady()).toBe(true);
    expect(renderMathHtml(katex, "\\ce{H2O}", false)).toContain("katex");
    // trust: false — \href is not turned into a link (KaTeX shows the source as escaped error text).
    const href = renderMathHtml(katex, "\\href{javascript:alert(1)}{x}", false);
    expect(href).not.toMatch(/<a\b|href=/);
    expect(renderMathHtml(katex, "\\frac{1}{", false)).toContain("katex-error");
  });
});
