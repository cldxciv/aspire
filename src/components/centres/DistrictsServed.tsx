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
    <dl className="grid gap-2 sm:grid-cols-2">
      {districts.map((district) => (
        <div
          key={district}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border border-line bg-white px-4 py-3"
        >
          <dt className="font-bold text-navy">{district}</dt>
          <dd className="flex flex-wrap gap-x-3 text-sm">
            {(byDistrict.get(district) ?? []).map((centre) => (
              <a
                key={centre.id}
                href={`#${centre.slug}`}
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-blue hover:underline sm:min-h-6"
              >
                {centre.name}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </a>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
