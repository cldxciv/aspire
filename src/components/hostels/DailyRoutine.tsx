import type { DailyRoutineItem } from "@/lib/types";

/** Residential day as an ordered timeline (time, label, title, description). */
export function DailyRoutine({ items }: { items: DailyRoutineItem[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="relative space-y-4 border-l-2 border-gold pl-5">
      {items.map((item) => (
        <li key={`${item.time}-${item.title}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-gold ring-2 ring-gold"
          />
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-extrabold text-blue">{item.time}</span>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">{item.label}</span>
          </p>
          <p className="mt-0.5 font-bold text-navy">{item.title}</p>
          <p className="text-sm text-muted">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
