import { ArrowRight, Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, Card, DemoBadge } from "@/components/ui";
import type { PhoneNumber } from "@/lib/types";
import { mailtoHref, telHref } from "./contact-links";

export type CampusDesk = {
  slug: string;
  name: string;
  address?: string;
  phone?: PhoneNumber;
  email?: string;
  hours?: string;
  demo: boolean;
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

/** Per-campus admissions desks: address, phone (`tel:`), email (`mailto:`) and hours, each linking to its centre. */
export function CampusDesks({ desks }: { desks: CampusDesk[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {desks.map((desk) => {
        const tel = desk.phone ? telHref(desk.phone.tel) : null;
        const mail = desk.email ? mailtoHref(desk.email) : null;
        return (
          <li key={desk.slug}>
            <Card className="flex h-full flex-col p-5">
              <h3 className="text-lg font-extrabold leading-snug text-navy">{desk.name}</h3>
              {desk.demo && <DemoBadge className="mt-2 self-start" />}
              <dl className="mt-4 flex-1 space-y-3 text-sm">
                {desk.address && (
                  <DeskRow icon={MapPin} label="Address">
                    <address className="not-italic">{desk.address}</address>
                  </DeskRow>
                )}
                {desk.phone && (
                  <DeskRow icon={Phone} label="Phone">
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
                  <DeskRow icon={Mail} label="Email">
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
                  <DeskRow icon={Clock} label="Hours">
                    <span className="text-muted">{desk.hours}</span>
                  </DeskRow>
                )}
              </dl>
              <ButtonLink href={`/centres#${desk.slug}`} variant="outline" className="mt-4 self-start">
                Campus details <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
