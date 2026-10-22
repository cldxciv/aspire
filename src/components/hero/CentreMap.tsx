import { cn } from "@/lib/cn";
import { CENTRE_MAP_SIZE, HIMACHAL_OUTLINE_PATH, mapDistance, type MapPoint } from "./districts";
import type { FinderCentre, FinderDistrict } from "./finder-data";

type Pin = Pick<FinderCentre, "slug" | "shortName"> & { point: MapPoint };

/** Pin labels right of the pin, or left of it near the map's right edge. */
const LABEL_FLIP_X = CENTRE_MAP_SIZE.width - 130;

/**
 * E · illustrative map of the centres: a rough outline of Himachal Pradesh with one pin per
 * centre from the data (the selected one larger and gold) and, when a district is chosen, a small
 * ring at its headquarters with a dashed line to its centre. One `role="img"` with the page's
 * label (which names the centres), plus a visible "Illustrative map, not to scale" caption.
 * Positions are approximate (district headquarters unless a centre has coordinates). Hook-free,
 * server-safe; rendered by the `CentreFinder` island.
 */
export function CentreMap({
  centres,
  selectedSlug,
  district,
  label,
  note,
  className,
}: {
  centres: readonly Pick<FinderCentre, "slug" | "shortName" | "point">[];
  selectedSlug?: string | null;
  district?: Pick<FinderDistrict, "id" | "point"> | null;
  /** Accessible name, e.g. "Illustrative map of Aspire's 4 centres in Himachal Pradesh: Shimla, …". */
  label: string;
  /** Visible caption, e.g. "Illustrative map, not to scale". */
  note: string;
  className?: string;
}) {
  const pins = centres.filter((c): c is Pin => c.point !== null);
  const selected = pins.find((c) => c.slug === selectedSlug);
  // A dashed line from the chosen district to its centre, unless the centre is right there.
  const route =
    district && selected && mapDistance(district.point, selected.point) > 14 ? { from: district.point, to: selected.point } : null;
  return (
    <figure
      data-surface="dark"
      className={cn("m-0 overflow-hidden rounded-[20px] bg-navy-2 ring-1 ring-white/10", className)}
    >
      <svg
        viewBox={`0 0 ${CENTRE_MAP_SIZE.width} ${CENTRE_MAP_SIZE.height}`}
        role="img"
        aria-label={label}
        focusable="false"
        className="mx-auto block h-auto max-h-72 w-full max-w-md sm:max-h-80 md:max-h-none md:max-w-none"
      >
        <path d={HIMACHAL_OUTLINE_PATH} fill="#174a88" stroke="#2c62a6" strokeWidth="2" strokeLinejoin="round" />
        {route && (
          <line
            x1={route.from.x}
            y1={route.from.y}
            x2={route.to.x}
            y2={route.to.y}
            stroke="#f4c44e"
            strokeOpacity="0.75"
            strokeWidth="2.5"
            strokeDasharray="5 6"
            strokeLinecap="round"
          />
        )}
        {district && <circle cx={district.point.x} cy={district.point.y} r="7" fill="none" stroke="#e8f1ff" strokeWidth="2.5" />}
        {pins.map((pin) => {
          const on = pin.slug === selected?.slug;
          const flip = pin.point.x > LABEL_FLIP_X;
          return (
            <g key={pin.slug} data-pin={pin.slug} data-selected={on ? "true" : undefined}>
              <circle cx={pin.point.x} cy={pin.point.y} r={on ? 13 : 9} fill={on ? "#f4c44e" : "#e8f1ff"} stroke="#0b2d5b" strokeWidth="3" />
              <text
                x={flip ? pin.point.x - 19 : pin.point.x + 19}
                y={pin.point.y + 6}
                textAnchor={flip ? "end" : "start"}
                fill="#ffffff"
                fontSize="17"
                fontWeight={on ? 700 : 500}
                fontFamily="inherit"
              >
                {pin.shortName}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="px-4 pb-3 text-xs text-[#b9d3f3]">{note}</figcaption>
    </figure>
  );
}
