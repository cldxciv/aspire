import { Clock, Languages, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ContactDetails } from "@/lib/types";
import { mailtoHref, telHref, whatsappHref } from "./contact-links";
import { CONTACT_LINK_CLASS, DetailRow } from "./DetailRow";

/**
 * Central contact details from getContactDetails(): phone (`tel:`), WhatsApp
 * (`https://wa.me/<digits>`, no prefilled text), email (`mailto:`), hours, head-campus
 * address, languages and response times. Values that fail validation render as text.
 */
export function ContactDetailsList({ details, headOfficeName }: { details: ContactDetails; headOfficeName?: string }) {
  const phone = telHref(details.phone.tel);
  const whatsapp = whatsappHref(details.whatsapp);
  const email = mailtoHref(details.email);

  return (
    <>
      <dl className="mt-4 space-y-3">
        <DetailRow icon={<Phone aria-hidden="true" className="size-5" />} label={details.phoneLabel}>
          {phone ? (
            <a href={phone} className={CONTACT_LINK_CLASS}>
              {details.phone.display}
            </a>
          ) : (
            details.phone.display
          )}
        </DetailRow>
        {whatsapp && (
          <DetailRow icon={<MessageCircle aria-hidden="true" className="size-5" />} label="WhatsApp">
            <a href={whatsapp} rel="noopener noreferrer" className={CONTACT_LINK_CLASS}>
              {details.whatsapp.display}
              <span className="sr-only"> (chat on WhatsApp)</span>
            </a>
          </DetailRow>
        )}
        <DetailRow icon={<Mail aria-hidden="true" className="size-5" />} label="Email">
          {email ? (
            <a href={email} className={CONTACT_LINK_CLASS}>
              {details.email}
            </a>
          ) : (
            details.email
          )}
        </DetailRow>
        {details.hours && (
          <DetailRow icon={<Clock aria-hidden="true" className="size-5" />} label="Office hours">
            {details.hours}
          </DetailRow>
        )}
        {details.address && (
          <DetailRow
            icon={<MapPin aria-hidden="true" className="size-5" />}
            label={headOfficeName ? `Head campus · ${headOfficeName}` : "Address"}
          >
            <address className="not-italic">{details.address}</address>
          </DetailRow>
        )}
        {details.languages && (
          <DetailRow icon={<Languages aria-hidden="true" className="size-5" />} label="Languages">
            {details.languages}
          </DetailRow>
        )}
      </dl>

      {details.responseTimes && details.responseTimes.length > 0 && (
        <>
          <h3 className="mt-6 font-extrabold text-navy">Response times</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted marker:text-gold-2">
            {details.responseTimes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
