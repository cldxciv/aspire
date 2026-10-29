"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * "Copy link" for a centre's tagged website link: copies with the Clipboard API and says so in a
 * polite live region (or, when copying is blocked, asks the person to select the link). ≥ 44 px.
 * The accessible name starts with the visible text (WCAG 2.5.3) plus a visually hidden centre
 * name, e.g. "Copy link: Shimla".
 */
export function CopyLinkButton({
  value,
  centre,
  t,
}: {
  value: string;
  /** The centre's name, appended for screen readers only. */
  centre: string;
  t: { copy: string; copied: string; copyFailed: string };
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm font-bold text-navy hover:border-blue"
      >
        {state === "copied" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
        {t.copy}
        <span className="sr-only">{`: ${centre}`}</span>
      </button>
      <span role="status" className={state === "failed" ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-success"}>
        {state === "copied" ? t.copied : state === "failed" ? t.copyFailed : ""}
      </span>
    </span>
  );
}
