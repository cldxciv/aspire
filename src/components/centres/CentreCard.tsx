import {
  BedDouble,
  Bus,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  MapPinned,
  Navigation,
  Phone,
  Route,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pill } from "@/components/home/Pill";
import { trackLabel, type TrackLabels } from "@/components/programs/exam-meta";
import { AspireImage, Badge, buttonClasses, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { Centre } from "@/lib/types";
import { centreImage, type RegionPhoto } from "./centre-images";
import { mailtoHref, safeDirectionsUrl, telHref } from "./contact-links";

/** Copy a centre card reads (`centres.card` / `centres.images`, track labels, shared labels). */
export type CentreCardMessages = {
  card: Messages<"centres">["card"];
  images: Messages<"centres">["images"];
  tracks: TrackLabels;
  demo: string;
  illustrativeImage: string;
  /** Visible label on the region stock photo. */
  illustrativeStockPhoto: string;
  opensInNewTab: string;
};

const subheading = "text-sm font-extrabold uppercase tracking-wide text-[#354b66]";

/** Contact row: icon + screen-reader label (the value itself is self-explanatory). */
function ContactDetail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="mt-0.5 shrink-0 text-blue">
        <Icon aria-hidden="true" className="size-4" />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Campus note: visible label above the value. */
function NoteDetail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-bold text-muted">
        <Icon aria-hidden="true" className="size-3.5 text-blue" />
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * Campus profile in the centre directory. Every field renders only when the
 * record has it: address / phone (tel:) / email / hours, campus head, hostel and
 * transport notes, travel times, districts served, highlights and facilities.
 * The building image is an illustration and is always captioned "Illustrative
 * image". Placeholder centres carry a DEMO badge and "Details pending verification".
 * The article's id is the centre slug so /centres#<slug> links scroll to it.
 * With a `region` photo (D-030) the card becomes a 50/50 split from `lg`: a stock landscape of the
 * centre's region (labelled, captioned with the region name — never the centre) beside the details,
 * with the small building illustration moved next to the heading.
 * Safe to render from both server and client components.
 */
export function CentreCard({
  centre,
  hostelHref,
  region,
  photoSide = "left",
  t: messages,
  locale,
}: {
  centre: Centre;
  /** Stock landscape of the centre's region (alt already in the page's language) and its caption. */
  region?: RegionPhoto;
  /** Side of the region photo from `lg` (alternate down the list). */
  photoSide?: "left" | "right";
  /** Link to this campus's hostel details (locale-free path), when hostel information is published. */
  hostelHref?: string;
  t: CentreCardMessages;
  locale: Locale;
}) {
  const t = messages.card;
  const placeholder = centre.status === "placeholder";
  const tel = telHref(centre.phone);
  const mailto = mailtoHref(centre.email);
  const directions = safeDirectionsUrl(centre.directionsUrl);
  const image = centreImage(centre.slug, messages.images);
  const headingId = `centre-${centre.slug}-name`;

  const hasContact = Boolean(centre.address || tel || mailto || centre.openingHours);
  // Campus heads (named faculty) are not shown — owner instruction 2026-10-20.
  const travel = centre.travelTimes ?? [];
  const serves = centre.servesDistricts ?? [];
  const highlights = centre.highlights ?? [];
  const facilities = centre.facilities ?? [];
  const hasNotes = Boolean(centre.hostelNote || centre.transportNote || travel.length || serves.length);
  const eyebrow = [centre.label, centre.district].filter(Boolean).join(" · ");

  return (
    <article
      id={centre.slug}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-card border border-line bg-white shadow-soft",
        region && "lg:grid lg:grid-cols-2",
      )}
    >
      {region && (
        <figure
          className={cn(
            "relative m-0 aspect-16/10 bg-blue-soft lg:aspect-auto lg:min-h-96",
            photoSide === "right" && "lg:order-2",
          )}
        >
          <Image
            src={region.image.src}
            alt={region.image.alt}
            fill
            sizes="(min-width: 1280px) 580px, (min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          <span className="absolute left-3 top-3 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {messages.illustrativeStockPhoto}
          </span>
          <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-navy/85 to-transparent px-4 pb-3 pt-10 text-sm font-semibold text-white">
            {region.caption}
          </figcaption>
        </figure>
      )}
      <div className={cn("@container flex min-w-0 flex-col gap-5 p-5 md:p-6", region ? "" : "md:flex-row")}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {eyebrow && <p className="text-[11px] font-extrabold uppercase tracking-wide text-blue">{eyebrow}</p>}
              <h3 id={headingId} className="text-xl font-bold leading-snug text-navy">
                {centre.name}
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {centre.isHeadquarters && <Badge>{t.headCampus}</Badge>}
              {placeholder && <DemoBadge label={messages.demo} />}
              {placeholder && <Badge variant="neutral">{t.pending}</Badge>}
            </div>
          </div>
          {centre.summary && <p className="mt-2 text-sm text-ink">{centre.summary}</p>}

          <div className={cn("mt-4 grid gap-5", region ? "@lg:grid-cols-2" : "lg:grid-cols-2")}>
            <div>
              <h4 className={subheading}>{t.contact}</h4>
              {hasContact ? (
                <dl className="mt-2 space-y-2 text-sm text-ink">
                  {centre.address && (
                    <ContactDetail icon={MapPin} label={t.address}>
                      {centre.address}
                    </ContactDetail>
                  )}
                  {tel && centre.phone && (
                    <ContactDetail icon={Phone} label={t.phone}>
                      <a href={tel} className="font-semibold text-navy hover:underline">
                        {centre.phone}
                      </a>
                    </ContactDetail>
                  )}
                  {mailto && (
                    <ContactDetail icon={Mail} label={t.email}>
                      <a href={mailto} className="font-semibold text-navy hover:underline">
                        {centre.email}
                      </a>
                    </ContactDetail>
                  )}
                  {centre.openingHours && (
                    <ContactDetail icon={Clock} label={t.hours}>
                      {centre.openingHours}
                    </ContactDetail>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">{t.contactPending}</p>
              )}
            </div>

            {hasNotes && (
              <div>
                <h4 className={subheading}>{t.notes}</h4>
                <dl className="mt-2 space-y-2.5">
                  {centre.hostelNote && (
                    <NoteDetail icon={BedDouble} label={t.hostel}>
                      {centre.hostelNote}
                    </NoteDetail>
                  )}
                  {centre.transportNote && (
                    <NoteDetail icon={Bus} label={t.gettingHere}>
                      {centre.transportNote}
                    </NoteDetail>
                  )}
                  {travel.length > 0 && (
                    <NoteDetail icon={Route} label={t.travelTimes}>
                      {travel.join(" · ")}
                    </NoteDetail>
                  )}
                  {serves.length > 0 && (
                    <NoteDetail icon={MapPinned} label={t.districtsServed}>
                      {serves.join(", ")}
                    </NoteDetail>
                  )}
                </dl>
              </div>
            )}
          </div>

          {centre.programs.length > 0 && (
            <div className="mt-4">
              <h4 className={subheading}>{t.programs}</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {centre.programs.map((exam) => (
                  <li key={exam}>
                    <Pill>{trackLabel(exam, messages.tracks)}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {highlights.length > 0 && (
            <div className="mt-4">
              <h4 className={subheading}>{t.highlights}</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {highlights.map((highlight) => (
                  <li key={highlight}>
                    <Pill>{highlight}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {facilities.length > 0 && (
            <details className="group mt-4 rounded-control border border-line bg-surface">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-bold text-navy [&::-webkit-details-marker]:hidden">
                {format(t.facilities, { count: facilities.length })}
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="grid gap-3 px-4 pb-4 text-sm sm:grid-cols-2">
                {facilities.map((facility) => (
                  <li key={facility.name}>
                    <p className="font-semibold text-navy">{facility.name}</p>
                    <p className="text-muted">{facility.description}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(tel || mailto || directions || hostelHref) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {tel && (
                <a href={tel} className={buttonClasses({ variant: "dark" })}>
                  <Phone aria-hidden="true" className="size-4" />
                  {t.call}
                  <span className="sr-only"> {centre.name}</span>
                </a>
              )}
              {mailto && (
                <a href={mailto} className={buttonClasses({ variant: "outline" })}>
                  <Mail aria-hidden="true" className="size-4" />
                  {t.emailButton}
                  <span className="sr-only"> {centre.name}</span>
                </a>
              )}
              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "outline" })}
                >
                  <Navigation aria-hidden="true" className="size-4" />
                  {t.directions}
                  <span className="sr-only">
                    {" "}
                    {format(t.directionsSuffix, { name: centre.name })} {messages.opensInNewTab}
                  </span>
                </a>
              )}
              {hostelHref && (
                <Link href={localePath(hostelHref, locale)} className={buttonClasses({ variant: "light" })}>
                  <BedDouble aria-hidden="true" className="size-4" />
                  {t.hostelDetails}
                  <span className="sr-only"> {format(t.forName, { name: centre.name })}</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {image && (
          <figure className={cn("order-first shrink-0", region ? "w-32" : "w-44 md:w-48")}>
            {/* Shown first, but after the heading in DOM order. w-48 = 192px: below every centre asset's maxWidth (≥194px). */}
            <div className="overflow-hidden rounded-control bg-blue-soft">
              <AspireImage asset={image.asset} alt={image.alt} />
            </div>
            <figcaption className="mt-1.5 text-[11px] font-semibold text-muted">{messages.illustrativeImage}</figcaption>
          </figure>
        )}
      </div>
    </article>
  );
}
