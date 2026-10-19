import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HostelFeature } from "@/lib/types";

/** Name + optional detail list used for the charter, facilities, girls' residency, room features and menu. */
export function FeatureList({
  features,
  columns = 2,
  className,
}: {
  features: HostelFeature[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  if (features.length === 0) return null;
  return (
    <ul
      className={cn(
        "grid gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {features.map((feature) => (
        <li
          key={feature.name}
          className="flex items-start gap-2.5 rounded-control border border-line bg-white p-3.5 text-sm shadow-soft"
        >
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <span className="min-w-0">
            <span className="block font-bold text-navy">{feature.name}</span>
            {feature.detail && <span className="mt-0.5 block text-muted">{feature.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
