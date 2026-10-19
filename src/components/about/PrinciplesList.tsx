import type { ApproachPoint } from "@/lib/types";

/** Teaching principles ("what we value") as an ordered list of gold-edged notes (mockup `.milestone`). */
export function PrinciplesList({ principles }: { principles: ApproachPoint[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {principles.map((principle, index) => (
        <li
          key={principle.title}
          className="rounded-r-control border-l-[3px] border-gold bg-white px-4 py-3.5 shadow-soft"
        >
          <h3 className="flex items-baseline gap-2 font-extrabold text-navy">
            <span aria-hidden="true" className="text-sm text-blue">
              {String(index + 1).padStart(2, "0")}
            </span>
            {principle.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{principle.description}</p>
        </li>
      ))}
    </ol>
  );
}
