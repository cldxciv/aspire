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
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pill } from "@/components/home/Pill";
import { EXAM_META } from "@/components/programs/exam-meta";
import { AspireImage, Badge, buttonClasses, DemoBadge } from "@/components/ui";
import type { Centre } from "@/lib/types";
import { CENTRE_IMAGES } from "./centre-images";
import { mailtoHref, safeDirectionsUrl, telHref } from "./contact-links";

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
 * Safe to render from both server and client components.
 */
export function CentreCard({
  centre,
  headProfileHref,
  hostelHref,
}: {
  centre: Centre;
  /** Link to the campus head's faculty profile, when that profile is published. */
  headProfileHref?: string;
  /** Link to this campus's hostel details, when hostel information is published. */
  hostelHref?: string;
}) {
  const placeholder = centre.status === "placeholder";
  const tel = telHref(centre.phone);
  const mailto = mailtoHref(centre.email);
  const directions = safeDirectionsUrl(centre.directionsUrl);
  const image = CENTRE_IMAGES[centre.slug];
  const headingId = `centre-${centre.slug}-name`;

  const hasContact = Boolean(centre.address || tel || mailto || centre.openingHours);
  const head = centre.head;
  const headName = head ? [head.honorific, head.name].filter(Boolean).join(" ") : "";
  const travel = centre.travelTimes ?? [];
  const serves = centre.servesDistricts ?? [];
  const highlights = centre.highlights ?? [];
  const facilities = centre.facilities ?? [];
  const hasNotes = Boolean(head || centre.hostelNote || centre.transportNote || travel.length || serves.length);
  const eyebrow = [centre.label, centre.district].filter(Boolean).join(" · ");

  return (
    <article
      id={centre.slug}
      aria-labelledby={headingId}
      className="scroll-mt-28 rounded-card border border-line bg-white p-5 shadow-soft md:p-6"
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {eyebrow && <p className="text-[11px] font-extrabold uppercase tracking-wide text-blue">{eyebrow}</p>}
              <h3 id={headingId} className="text-xl font-bold leading-snug text-navy">
                {centre.name}
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {centre.isHeadquarters && <Badge>Head campus</Badge>}
              {placeholder && <DemoBadge label="Demo" />}
              {placeholder && <Badge variant="neutral">Details pending verification</Badge>}
            </div>
          </div>
          {centre.summary && <p className="mt-2 text-sm text-ink">{centre.summary}</p>}

          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className={subheading}>Contact</h4>
              {hasContact ? (
                <dl className="mt-2 space-y-2 text-sm text-ink">
                  {centre.address && (
                    <ContactDetail icon={MapPin} label="Address">
                      {centre.address}
                    </ContactDetail>
                  )}
                  {tel && centre.phone && (
                    <ContactDetail icon={Phone} label="Phone">
                      <a href={tel} className="font-semibold text-navy hover:underline">
                        {centre.phone}
                      </a>
                    </ContactDetail>
                  )}
                  {mailto && (
                    <ContactDetail icon={Mail} label="Email">
                      <a href={mailto} className="font-semibold text-navy hover:underline">
                        {centre.email}
                      </a>
                    </ContactDetail>
                  )}
                  {centre.openingHours && (
                    <ContactDetail icon={Clock} label="Opening hours">
                      {centre.openingHours}
                    </ContactDetail>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Centre address, contact and opening hours will appear after verification.
                </p>
              )}
            </div>

            {hasNotes && (
              <div>
                <h4 className={subheading}>Campus notes</h4>
                <dl className="mt-2 space-y-2.5">
                  {head && (
                    <NoteDetail icon={UserRound} label={head.title}>
                      {headProfileHref ? (
                        <Link href={headProfileHref} className="font-semibold text-navy hover:underline">
                          {headName}
                        </Link>
                      ) : (
                        <span className="font-semibold">{headName}</span>
                      )}
                      {head.credentials && <span className="text-muted"> ({head.credentials})</span>}
                    </NoteDetail>
                  )}
                  {centre.hostelNote && (
                    <NoteDetail icon={BedDouble} label="Hostel">
                      {centre.hostelNote}
                    </NoteDetail>
                  )}
                  {centre.transportNote && (
                    <NoteDetail icon={Bus} label="Getting here">
                      {centre.transportNote}
                    </NoteDetail>
                  )}
                  {travel.length > 0 && (
                    <NoteDetail icon={Route} label="Travel times">
                      {travel.join(" · ")}
                    </NoteDetail>
                  )}
                  {serves.length > 0 && (
                    <NoteDetail icon={MapPinned} label="Districts served">
                      {serves.join(", ")}
                    </NoteDetail>
                  )}
                </dl>
              </div>
            )}
          </div>

          {centre.programs.length > 0 && (
            <div className="mt-4">
              <h4 className={subheading}>Programs</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {centre.programs.map((exam) => (
                  <li key={exam}>
                    <Pill>{EXAM_META[exam].label}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {highlights.length > 0 && (
            <div className="mt-4">
              <h4 className={subheading}>Highlights</h4>
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
                Facility details ({facilities.length})
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
                  Call<span className="sr-only"> {centre.name}</span>
                </a>
              )}
              {mailto && (
                <a href={mailto} className={buttonClasses({ variant: "outline" })}>
                  <Mail aria-hidden="true" className="size-4" />
                  Email<span className="sr-only"> {centre.name}</span>
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
                  Directions<span className="sr-only"> to {centre.name} (opens in a new tab)</span>
                </a>
              )}
              {hostelHref && (
                <Link href={hostelHref} className={buttonClasses({ variant: "light" })}>
                  <BedDouble aria-hidden="true" className="size-4" />
                  Hostel details<span className="sr-only"> for {centre.name}</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {image && (
          <figure className="order-first w-44 shrink-0 md:w-48">
            {/* Shown first, but after the heading in DOM order. w-48 = 192px: below every centre asset's maxWidth (≥194px). */}
            <div className="overflow-hidden rounded-control bg-blue-soft">
              <AspireImage asset={image.asset} alt={image.alt} />
            </div>
            <figcaption className="mt-1.5 text-[11px] font-semibold text-muted">Illustrative image</figcaption>
          </figure>
        )}
      </div>
    </article>
  );
}
