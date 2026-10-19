import { MapPinned } from "lucide-react";

/**
 * Labelled stand-in for a centre map. No third-party map embed (brief / D-010);
 * a map can replace this once verified coordinates and an approved provider exist.
 */
export function MapPanel({ headingId }: { headingId: string }) {
  return (
    <div className="rounded-card border border-line bg-linear-to-br from-[#e9f3ff] to-[#f9fcff] p-5 md:p-6">
      <h2 id={headingId} className="text-lg font-bold text-navy">
        Centre map
      </h2>
      <div
        role="img"
        aria-label="Map placeholder: a map of verified Aspire centres will appear here"
        className="relative mt-3 grid aspect-4/3 place-items-center overflow-hidden rounded-control border border-dashed border-[#cbd8e7] bg-white/70"
      >
        <svg aria-hidden="true" focusable="false" className="absolute inset-0 size-full text-[#d6e4f5]">
          <defs>
            <pattern id="centre-map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#centre-map-grid)" />
        </svg>
        <div className="relative flex flex-col items-center gap-2 px-4 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-blue-soft text-blue">
            <MapPinned aria-hidden="true" className="size-6" />
          </span>
          <span className="text-xs font-semibold text-muted">Map coming after verification</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        A map will be added once centre addresses are verified. Call and Directions buttons appear on a centre&apos;s
        card when confirmed details are available.
      </p>
    </div>
  );
}
