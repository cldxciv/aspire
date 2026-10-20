import { ArrowRight, Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { ButtonLink, Card, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { ImageAsset, PhoneNumber } from "@/lib/types";
import { mailtoHref, telHref } from "./contact-links";

export type CampusDesk = {
  slug: string;
  name: string;
  address?: string;
  phone?: PhoneNumber;
  email?: string;
  hours?: string;
  demo: boolean;
  /** Labelled stock photo of a generic study scene (D-030) — never captioned as the campus; no landscapes or result cards (D-031). */
  photo?: ImageAsset;
};

// Compact link: the negative margin keeps rows tight while the padding keeps a ≥44px tap target.
const DESK_LINK_CLASS = "-my-2.5 inline-block py-2.5 [overflow-wrap:anywhere] hover:underline";

function DeskRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue" />
      <div className="min-w-0">
        <dt className="sr-only">{label}</dt>
        <dd className="break-words text-navy">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Per-campus admissions desks: address, phone (`tel:`), email (`mailto:`) and hours, each linking to its centre.
 * Desks with a `photo` show it on top of the card with the visible `photoLabel` (the page adds a note
 * that these are stock photos, not Aspire's campuses); then the grid stays at two columns so the
 * photos keep a useful size.
 */
export function CampusDesks({
  desks,
  locale,
  labels,
  demoLabel,
  photoLabel,
}: {
  desks: CampusDesk[];
  locale: Locale;
  labels: Messages<"contact">["desks"];
  /** DEMO badge label (localised), shown on desks marked `demo`. */
  demoLabel: string;
  /** Visible label on the desk photos ("Illustrative stock photo"). */
  photoLabel?: string;
}) {
  const withPhotos = desks.some((desk) => desk.photo);
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", !withPhotos && "xl:grid-cols-4")}>
      {desks.map((desk) => {
        const tel = desk.phone ? telHref(desk.phone.tel) : null;
        const mail = desk.email ? mailtoHref(desk.email) : null;
        return (
          <li key={desk.slug}>
            <Card className="flex h-full flex-col">
              {desk.photo && (
                <div className="relative aspect-16/10 bg-surface">
                  <Image
                    src={desk.photo.src}
                    alt={desk.photo.alt}
                    fill
                    sizes="(min-width: 1200px) 580px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                  {photoLabel && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {photoLabel}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-extrabold leading-snug text-navy">{desk.name}</h3>
                {desk.demo && <DemoBadge label={demoLabel} className="mt-2 self-start" />}
                <dl className="mt-4 flex-1 space-y-3 text-sm">
                  {desk.address && (
                    <DeskRow icon={MapPin} label={labels.address}>
                      <address className="not-italic">{desk.address}</address>
                    </DeskRow>
                  )}
                  {desk.phone && (
                    <DeskRow icon={Phone} label={labels.phone}>
                      {tel ? (
                        <a href={tel} className={DESK_LINK_CLASS}>
                          {desk.phone.display}
                        </a>
                      ) : (
                        desk.phone.display
                      )}
                    </DeskRow>
                  )}
                  {desk.email && (
                    <DeskRow icon={Mail} label={labels.email}>
                      {mail ? (
                        <a href={mail} className={DESK_LINK_CLASS}>
                          {desk.email}
                        </a>
                      ) : (
                        desk.email
                      )}
                    </DeskRow>
                  )}
                  {desk.hours && (
                    <DeskRow icon={Clock} label={labels.hours}>
                      <span className="text-muted">{desk.hours}</span>
                    </DeskRow>
                  )}
                </dl>
                <ButtonLink
                  href={localePath(`/centres#${desk.slug}`, locale)}
                  variant="outline"
                  className="mt-4 self-start"
                >
                  {labels.campusDetails}
                  <span className="sr-only">{format(labels.campusDetailsFor, { name: desk.name })}</span>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
