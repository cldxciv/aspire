import { ArrowRight } from "lucide-react";
import type { Centre } from "@/lib/types";

/**
 * District → campus lookup built from each centre's `servesDistricts`, so a family
 * in e.g. Mandi can see which campus desk handles their district. Renders nothing
 * when no centre lists the districts it serves.
 */
export function DistrictsServed({ centres }: { centres: Centre[] }) {
  const byDistrict = new Map<string, Centre[]>();
  for (const centre of centres) {
    for (const district of centre.servesDistricts ?? []) {
      byDistrict.set(district, [...(byDistrict.get(district) ?? []), centre]);
    }
  }
  const districts = [...byDistrict.keys()].sort((a, b) => a.localeCompare(b));
  if (districts.length === 0) return null;

  return (
    // One column at lg (BleedSplit's half column is ~440px), two again from xl.
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {districts.map((district) => (
        <div
          key={district}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control border border-line bg-white px-5 py-3.5"
        >
          <dt className="font-bold text-navy">{district}</dt>
          <dd className="flex flex-wrap gap-x-3 text-sm">
            {(byDistrict.get(district) ?? []).map((centre) => {
              // The arrow is glued to the last word, so a wrapped name never pushes it to the row edge.
              const words = centre.name.split(" ");
              const last = words.pop();
              return (
                <a
                  key={centre.id}
                  href={`#${centre.slug}`}
                  className="inline-flex min-h-11 items-center font-semibold text-blue hover:underline sm:min-h-6"
                >
                  <span>
                    {words.length > 0 && `${words.join(" ")} `}
                    <span className="whitespace-nowrap">
                      {last}
                      <ArrowRight aria-hidden="true" className="ml-1 inline size-3.5 align-[-0.125em]" />
                    </span>
                  </span>
                </a>
              );
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
