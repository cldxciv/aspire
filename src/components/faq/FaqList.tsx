import { ChevronDown } from "lucide-react";
import { DemoBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Faq } from "@/lib/types";

/**
 * FAQ accordion built on native <details>/<summary>: keyboard-operable and
 * announced as expandable without extra script. Placeholder answers carry a DemoBadge.
 */
export function FaqList({ faqs, className }: { faqs: Faq[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-soft", className)}>
      {faqs.map((faq) => (
        <details key={faq.id} className="group">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4",
              "font-bold text-navy hover:bg-[#f8fbff] [&::-webkit-details-marker]:hidden",
            )}
          >
            <span className="flex flex-col items-start gap-1.5">
              <span>{faq.question}</span>
              {faq.status === "placeholder" && <DemoBadge />}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-blue transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="px-5 pb-5 text-sm text-muted">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
