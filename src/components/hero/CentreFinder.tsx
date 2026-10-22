"use client";

import { ArrowRight, MessageCircle, Navigation, Phone } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { DemoBadge } from "@/components/ui/Feedback";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { CentreMap } from "./CentreMap";
import type { DistrictId } from "./districts";
import { defaultDistrictId, type FinderCentre, type FinderDistrict } from "./finder-data";
import { HERO_ACTION, HERO_GRID } from "./hero-styles";

/** Which actions the centre card offers, in this order (each only when the centre has the data). */
export type FinderAction = "page" | "call" | "whatsapp" | "directions";

/** Strings from the page's messages (centres / contact) and `common`, in the page locale. */
export type FinderLabels = {
  /** Select label, e.g. "Your district". */
  district: string;
  /** Card heading, "{district}" filled in, e.g. "Aspire centre for {district}". */
  centreFor: string;
  /** Map's accessible name; "{count}" and "{names}" filled in. */
  mapLabel: string;
  /** Visible map caption, e.g. "Illustrative map, not to scale". */
  mapNote: string;
  /** Badge for the head campus, e.g. "Head campus". */
  headCampus: string;
  /** Centre page link, e.g. "View centre". */
  page: string;
  call: string;
  whatsapp: string;
  directions: string;
  /** `common.labels.opensInNewTab`. */
  opensInNewTab: string;
  /** `common.labels.demo`. */
  demo: string;
  /** Heading of the list shown without JavaScript, e.g. "Our centres". */
  listTitle: string;
};

const SMALL_ACTION = cn(HERO_ACTION.secondary, "min-h-11 px-3.5 py-2 text-sm");
const PRIMARY_ACTION = cn(HERO_ACTION.primary, "min-h-11 px-4 py-2 text-sm");

function CentreActions({
  centre,
  actions,
  t,
}: {
  centre: FinderCentre;
  actions: readonly FinderAction[];
  t: FinderLabels;
}) {
  type ActionItem = { action: FinderAction; href: string; label: string; Icon: typeof Phone; external: boolean };
  const items = actions.flatMap((action): ActionItem[] => {
    switch (action) {
      case "page":
        return centre.pageHref ? [{ action, href: centre.pageHref, label: t.page, Icon: ArrowRight, external: false }] : [];
      case "call":
        return centre.phone ? [{ action, href: centre.phone.href, label: t.call, Icon: Phone, external: false }] : [];
      case "whatsapp":
        return centre.whatsappHref ? [{ action, href: centre.whatsappHref, label: t.whatsapp, Icon: MessageCircle, external: true }] : [];
      case "directions":
        return centre.directionsHref ? [{ action, href: centre.directionsHref, label: t.directions, Icon: Navigation, external: true }] : [];
    }
  });
  if (items.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2.5">
      {items.map(({ action, href, label, Icon, external }, i) => {
        const className = i === 0 ? PRIMARY_ACTION : SMALL_ACTION;
        const body = (
          <>
            {label}
            <span className="sr-only">: {centre.name}</span>
            {external && <span className="sr-only"> {t.opensInNewTab}</span>}
            <Icon aria-hidden="true" className="size-4" />
          </>
        );
        return action === "page" ? (
          <Link key={action} href={href} className={className}>
            {body}
          </Link>
        ) : (
          <a key={action} href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {body}
          </a>
        );
      })}
    </div>
  );
}

function CentreDetails({ centre, t }: { centre: FinderCentre; t: FinderLabels }) {
  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="m-0 font-serif text-2xl leading-tight font-bold break-words">{centre.name}</p>
        {centre.isHeadquarters && (
          <span className="rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-[#6b4e00]">{t.headCampus}</span>
        )}
        {centre.placeholder && <DemoBadge label={t.demo} />}
      </div>
      {(centre.address || centre.phone) && (
        <p className="m-0 mt-1.5 text-[13px] leading-snug break-words text-[#dbe8f7]">
          {[centre.address, centre.phone?.display].filter(Boolean).join(" · ")}
        </p>
      )}
    </>
  );
}

/**
 * E · centre finder (client island) for the Centres list, each centre page and Contact, inside
 * `HeroPanel`: the page's `HeroCopy`, then a labelled select of Himachal's 12 districts and the
 * card of that district's centre (name, address, phone, actions), beside an illustrative map with
 * a pin per centre.
 *
 * - Data only from `finderCentres()` / `finderDistricts()`: the centre for a district is the one
 *   whose desk serves it in the data (else the one in it, else the closest on the map); an absent
 *   phone, address or link means no such line or button. `actions` picks the buttons (Centres:
 *   page + call; Contact: call, WhatsApp, directions); the first is gold.
 * - Server render: `defaultDistrict` (via `defaultDistrictId()`) is selected, so the card and the
 *   map are in the HTML before any JavaScript. Without JavaScript the select and card are hidden
 *   and every centre is listed with its details instead.
 * - A change is announced politely; the select keeps focus. 48 px select, 44 px buttons.
 * - No centres (production while the records are placeholders): the copy alone, with `fallback`
 *   beside it when given.
 */
export function CentreFinder({
  copy,
  centres,
  districts,
  defaultDistrict,
  labels: t,
  actions = ["page", "call"],
  fallback,
  className,
}: {
  /** The page's `HeroCopy` (server-rendered). */
  copy: ReactNode;
  centres: readonly FinderCentre[];
  districts: readonly FinderDistrict[];
  /**
   * District selected in the server render: an id ("mandi") or a name ("Mandi", "मंडी"), e.g. a
   * centre page's own district. Else the head campus's district, else the first with a centre.
   */
  defaultDistrict?: string;
  labels: FinderLabels;
  actions?: readonly FinderAction[];
  fallback?: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const selectId = `${baseId}-district`;
  const cardId = `${baseId}-card`;
  const [districtId, setDistrictId] = useState<DistrictId | undefined>(() => defaultDistrictId(districts, centres, defaultDistrict));
  const [changed, setChanged] = useState(false);

  if (centres.length === 0 || districts.length === 0) {
    return (
      <div className={cn(fallback ? HERO_GRID.split : "max-w-3xl", className)}>
        {copy}
        {fallback && <div className="min-w-0">{fallback}</div>}
      </div>
    );
  }

  const district = districts.find((d) => d.id === districtId) ?? null;
  const centre = centres.find((c) => c.slug === district?.centreSlug) ?? null;
  const mapLabel = format(t.mapLabel, { count: centres.length, names: centres.map((c) => c.shortName).join(", ") });

  return (
    <div className={cn(HERO_GRID.split, className)}>
      <div className="flex min-w-0 flex-col gap-5">
        {copy}

        <div className="flex max-w-xl flex-col gap-4 noscript:hidden">
          <div className="flex flex-col gap-2">
            <label htmlFor={selectId} className="text-[13px] font-semibold text-[#dbe8f7]">
              {t.district}
            </label>
            <select
              id={selectId}
              value={districtId ?? ""}
              aria-controls={cardId}
              onChange={(event) => {
                setDistrictId(event.target.value as DistrictId);
                setChanged(true);
              }}
              className="min-h-12 w-full max-w-xs rounded-control border-0 bg-white px-3.5 text-[15px] text-ink"
            >
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div id={cardId} className={cn("rounded-2xl border border-white/15 bg-navy-2 p-4 sm:p-5", !(district && centre) && "hidden")}>
            {district && centre && (
              <>
                <p className="m-0 text-xs text-[#b9d3f3]">{format(t.centreFor, { district: district.name })}</p>
                <CentreDetails centre={centre} t={t} />
                <CentreActions centre={centre} actions={actions} t={t} />
              </>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            {changed && district && centre ? `${format(t.centreFor, { district: district.name })}: ${centre.name}` : ""}
          </p>
        </div>

        {/* Without JavaScript: every centre with its details instead of the select. */}
        <div className="hidden noscript:block">
          <p className="m-0 text-[13px] font-semibold text-[#dbe8f7]">{t.listTitle}</p>
          <ul className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2">
            {centres.map((c) => (
              <li key={c.slug} className="rounded-2xl border border-white/15 bg-navy-2 p-4">
                <CentreDetails centre={c} t={t} />
                <CentreActions centre={c} actions={actions} t={t} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="min-w-0">
        <CentreMap
          centres={centres}
          selectedSlug={centre?.slug}
          district={district}
          label={mapLabel}
          note={t.mapNote}
        />
      </div>
    </div>
  );
}
