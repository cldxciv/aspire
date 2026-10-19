import { ArrowRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { CampusDesks, type CampusDesk } from "@/components/contact/CampusDesks";
import { ContactDetailsList } from "@/components/contact/ContactDetailsList";
import { mailtoHref, telHref } from "@/components/contact/contact-links";
import { CONTACT_LINK_CLASS, DetailRow } from "@/components/contact/DetailRow";
import { SocialLinks } from "@/components/contact/SocialLinks";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import {
  AspireImage,
  ButtonLink,
  Card,
  DemoBadge,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { siteConfig } from "@/config/site";
import { aspireAssets } from "@/content/aspire-assets";
import { getCentres, getContactDetails, getInstituteProfile, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the Aspire IIT & Medical team with questions about programs, admissions, scholarships or centres.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  // getContactDetails() is null in production until Aspire verifies the details (D-005 / D-020).
  const [details, centres, profile] = await Promise.all([getContactDetails(), getCentres(), getInstituteProfile()]);

  const centreBySlug = new Map(centres.map((centre) => [centre.slug, centre]));
  const headOffice = details?.headOfficeCentreSlug ? centreBySlug.get(details.headOfficeCentreSlug) : undefined;
  const desks: CampusDesk[] = (details?.campusContacts ?? []).map((contact) => {
    const centre = centreBySlug.get(contact.centreSlug);
    return {
      slug: contact.centreSlug,
      name: contact.name,
      address: centre?.address,
      phone: contact.phone,
      email: contact.email,
      hours: contact.hours,
      demo: (details !== null && isPlaceholder(details)) || (centre !== undefined && isPlaceholder(centre)),
    };
  });

  return (
    <>
      <PageHero
        title="Talk to the Aspire team"
        lead="Ask about programs, admissions, scholarships or the nearest centre."
        crumbs={[{ label: "Contact" }]}
      />

      <Section>
        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="p-5 md:p-7">
            <h2 className="text-2xl font-extrabold tracking-tight text-navy">Send an enquiry</h2>
            <p className="mb-5 mt-1.5 text-sm text-muted">
              Tell us what you&apos;d like to know and how to reach you.
            </p>
            <EnquiryForm variant="contact" />
          </Card>

          <Card className="p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-navy">Contact details</h2>
              {details && isPlaceholder(details) && <DemoBadge />}
            </div>
            {details ? <ContactDetailsList details={details} headOfficeName={headOffice?.name} /> : <SiteContactFallback />}

            {profile && <SocialLinks links={profile.socialLinks} demo={isPlaceholder(profile)} />}

            <h3 className="mt-7 text-lg font-extrabold text-navy">Need help choosing a program?</h3>
            <p className="mt-1 text-sm text-muted">
              Request a counselling session to discuss the student&apos;s academic goals and the options available.
            </p>
            <ButtonLink href="/admissions#enquiry" variant="dark" className="mt-4">
              Book counselling <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>

            <h3 className="mt-7 text-lg font-extrabold text-navy">Looking for a centre?</h3>
            <p className="mt-1 text-sm text-muted">Browse the centre directory for locations and available programs.</p>
            <ButtonLink href="/centres" variant="outline" className="mt-4">
              Explore centres <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>

            {/* Decorative Himachal landscape strip (mockup contact panel): conveys no information, so alt is
                empty. Capped at the asset's maxWidth by AspireImage. Not a centre image. */}
            <AspireImage asset={aspireAssets.himachalLandscape} alt="" rounded className="mx-auto mt-7 block" />
          </Card>
        </div>
      </Section>

      {desks.length > 0 && (
        <Section tone="surface" id="campus-desks" aria-labelledby="campus-desks-heading" className="scroll-mt-24">
          <SectionHeading
            id="campus-desks-heading"
            eyebrow="Campuses"
            title="Campus admissions desks"
            description="Call, email or visit the campus closest to you."
          />
          <CampusDesks desks={desks} />
        </Section>
      )}
    </>
  );
}

/**
 * Shown when no contact details are publishable: verified siteConfig fields (all null today),
 * otherwise the notice that official details will be added after verification.
 */
function SiteContactFallback() {
  const { phone, email, address, hours } = siteConfig.contact;
  const phoneLink = phone ? telHref(phone) : null;
  const emailLink = email ? mailtoHref(email) : null;

  if (!phone && !email && !address && !hours) {
    return (
      <Notice variant="info" className="mt-4">
        Aspire&apos;s official phone number, email, address and office hours will be added here once they have been
        verified. Until then, you can use the enquiry form — it will tell you clearly whether your enquiry was sent.
      </Notice>
    );
  }

  return (
    <dl className="mt-4 space-y-3">
      {phone && (
        <DetailRow icon={<Phone aria-hidden="true" className="size-5" />} label="Phone">
          {phoneLink ? (
            <a href={phoneLink} className={CONTACT_LINK_CLASS}>
              {phone}
            </a>
          ) : (
            phone
          )}
        </DetailRow>
      )}
      {email && (
        <DetailRow icon={<Mail aria-hidden="true" className="size-5" />} label="Email">
          {emailLink ? (
            <a href={emailLink} className={CONTACT_LINK_CLASS}>
              {email}
            </a>
          ) : (
            email
          )}
        </DetailRow>
      )}
      {address && (
        <DetailRow icon={<MapPin aria-hidden="true" className="size-5" />} label="Address">
          <address className="not-italic">{address}</address>
        </DetailRow>
      )}
      {hours && (
        <DetailRow icon={<Clock aria-hidden="true" className="size-5" />} label="Office hours">
          {hours}
        </DetailRow>
      )}
    </dl>
  );
}
