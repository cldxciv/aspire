"use client";

import { XCircle } from "lucide-react";
import { useId, type Ref } from "react";

export type ErrorSummaryItem = { text: string; /** Input id to link to, for field errors. */ fieldId?: string };

/**
 * Error summary shown above a form after a failed submit (GOV.UK pattern): a focusable
 * `role="alert"` panel the form moves focus to, listing each problem; field errors link to
 * (and focus) their input.
 */
export function ErrorSummary({
  title,
  items,
  summaryRef,
}: {
  title: string;
  items: ErrorSummaryItem[];
  summaryRef?: Ref<HTMLDivElement>;
}) {
  const titleId = useId();
  if (items.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      data-surface="light"
      className="flex gap-3 rounded-control border border-[#f5c2bd] bg-danger-soft p-4 text-sm text-danger"
    >
      <XCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <h2 id={titleId} className="font-bold">
          {title}
        </h2>
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={`${item.fieldId ?? ""}-${item.text}`}>
              {item.fieldId ? (
                <a
                  href={`#${item.fieldId}`}
                  className="font-semibold underline underline-offset-2"
                  onClick={(event) => {
                    const field = document.getElementById(item.fieldId!);
                    if (!field) return;
                    event.preventDefault();
                    field.focus();
                  }}
                >
                  {item.text}
                </a>
              ) : (
                item.text
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
