"use client";

import { ArrowRight, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { DemoBadge } from "@/components/ui";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";

/**
 * Server-projected view of one centre: only the fields the picker displays. Never pass
 * whole records (no sourceRef, heads, facilities, districts or travel notes).
 */
export interface CentrePickerItem {
  slug: string;
  name: string;
  /** Short visible pin label (first word of `name`); the full name is the accessible name. */
  shortName: string;
  label?: string;
  address?: string;
  phone?: { display: string; href: string };
  /** Pin position in % of the map box, or null when the centre has no pin (listed only). */
  pin: { x: number; y: number } | null;
  /** Server-rendered illustrative image, already carrying its "Illustrative image" label. */
  media?: ReactNode;
  /** Placeholder record: show a DEMO badge. */
  demo: boolean;
  /** Locale-aware link to the centre's directory entry (`/centres#<slug>`). */
  href: string;
}

/** Localised picker copy (from `home.centres` + `common.labels.demo`, picked on the server). */
export type CentrePickerMessages = {
  mapPinsLabel: string;
  mapNotToScale: string;
  listLabel: string;
  /** "Showing {name}" */
  showing: string;
  /** "Call {name}:" */
  callPrefix: string;
  learnMore: string;
  /** "about {name}" */
  learnMoreSuffix: string;
  demo: string;
};

/** Map-pin marker; the selected state also changes size and label style, not just colour. */
function PinMarker({ selected }: { selected: boolean }) {
  return (
    <svg
      viewBox="0 0 24 32"
      aria-hidden="true"
      focusable="false"
      className={cn("h-8 w-6 drop-shadow-sm transition-transform", selected && "scale-125")}
    >
      <path
        d="M12 1C5.9 1 1 5.8 1 11.8 1 20 12 31 12 31s11-11 11-19.2C23 5.8 18.1 1 12 1Z"
        className={selected ? "fill-gold stroke-navy" : "fill-navy stroke-white"}
        strokeWidth="1.5"
      />
      <circle cx="12" cy="11.5" r="4.2" className={selected ? "fill-navy" : "fill-white"} />
    </svg>
  );
}

/**
 * Interactive centre picker: pins over the server-rendered `map`, a visible list of the
 * same choices (the fallback for anyone who can't use the map), and the selected centre's
 * card. Pins and list items are `<button aria-pressed>` naming the centre. With JavaScript
 * off, the initially selected centre's card still renders.
 */
export function CentrePicker({
  centres,
  map,
  initialSlug,
  messages: t,
}: {
  centres: CentrePickerItem[];
  messages: CentrePickerMessages;
  /** Decorative map backdrop (HimachalMap), rendered on the server. */
  map: ReactNode;
  initialSlug?: string;
}) {
  const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? centres[0]?.slug);
  const [announcement, setAnnouncement] = useState("");
  const cardId = useId();
  const selected = centres.find((c) => c.slug === selectedSlug) ?? centres[0];
  if (!selected) return null;

  const select = (centre: CentrePickerItem) => {
    setSelectedSlug(centre.slug);
    setAnnouncement(format(t.showing, { name: centre.name }));
  };
  const pinned = centres.filter((c) => c.pin);

  return (
    // Tablets (md–lg): the map + wrapped pills column is taller than the card, so the card is centred against it.
    <div className="grid gap-8 sm:grid-cols-2 sm:items-start sm:gap-6 md:gap-8 md:max-lg:items-center">
      <div>
        <div className="relative aspect-4/3 w-full">
          {map}
          {pinned.length > 0 && (
            <ul aria-label={t.mapPinsLabel} className="absolute inset-0">
              {pinned.map((centre) => {
                const isSelected = centre.slug === selected.slug;
                return (
                  <li
                    key={centre.slug}
                    className="absolute"
                    style={{ left: `${centre.pin?.x}%`, top: `${centre.pin?.y}%` }}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-controls={cardId}
                      onClick={() => select(centre)}
                      className={cn(
                        "group absolute bottom-0 left-0 flex size-11 -translate-x-1/2 translate-y-1.5 items-center justify-center rounded-full",
                        isSelected ? "z-10" : "z-0",
                      )}
                    >
                      <PinMarker selected={isSelected} />
                      <span className="sr-only">{centre.name}</span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-[calc(100%-6px)] top-1 hidden whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold shadow-soft sm:block",
                          isSelected ? "bg-navy text-white" : "bg-white text-navy group-hover:bg-blue-soft",
                        )}
                      >
                        {centre.shortName}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="absolute bottom-1 right-1 rounded bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
            {t.mapNotToScale}
          </p>
        </div>

        <ul aria-label={t.listLabel} className="mt-5 flex flex-wrap gap-2.5">
          {centres.map((centre) => {
            const isSelected = centre.slug === selected.slug;
            return (
              <li key={centre.slug}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-controls={cardId}
                  onClick={() => select(centre)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition",
                    isSelected
                      ? "border-navy bg-navy text-white"
                      : "border-[#c9d8ea] bg-white text-navy hover:border-blue",
                  )}
                >
                  <MapPin aria-hidden="true" className={cn("size-4", isSelected ? "text-gold" : "text-blue")} />
                  {centre.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div id={cardId} className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        {selected.media}
        <div className={cn("flex flex-wrap items-center gap-2", selected.media ? "mt-5" : undefined)}>
          <h3 className="font-serif text-xl font-semibold leading-snug text-navy">{selected.name}</h3>
          {selected.demo && <DemoBadge label={t.demo} />}
        </div>
        {selected.label && (
          <p className="mt-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-blue">{selected.label}</p>
        )}
        {selected.address && (
          <p className="mt-4 flex gap-2 text-sm leading-relaxed text-muted">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
            <span>{selected.address}</span>
          </p>
        )}
        {selected.phone && (
          <a
            href={selected.phone.href}
            className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-navy hover:text-blue hover:underline"
          >
            <Phone aria-hidden="true" className="size-4 shrink-0 text-blue" />
            <span className="sr-only">{format(t.callPrefix, { name: selected.name })} </span>
            {selected.phone.display}
          </a>
        )}
        <div>
          <Link
            href={selected.href}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-blue hover:underline"
          >
            {t.learnMore}
            <span className="sr-only"> {format(t.learnMoreSuffix, { name: selected.name })}</span>
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
