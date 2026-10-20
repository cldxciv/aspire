import { ArrowRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { CampusDesks, type CampusDesk } from "@/components/contact/CampusDesks";
import { ContactDetailsList } from "@/components/contact/ContactDetailsList";
import { mailtoHref, telHref } from "@/components/contact/contact-links";
import { CONTACT_LINK_CLASS, DetailRow } from "@/components/contact/DetailRow";
import { SocialLinks } from "@/components/contact/SocialLinks";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import { ButtonLink, Card, DemoBadge, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { stockImages, type StockImageKey } from "@/content/images";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getContactDetails, getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";

/**
 * Landscape of the district each campus desk is in (D-030), captioned as the region only —
 * never as the campus or office (same mapping as the hostels page).
 */
const REGION_PHOTOS: Record<string, StockImageKey> = {
  shimla: "shimlaPanorama",
  hamirpur: "hamirpurHills",
  dharamshala: "dhauladharTriund",
  kullu: "kulluValley",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("contact");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/contact"),
  };
}

export default async function ContactPage() {
  const [locale, t, tc, tForms] = await Promise.all([
    getLocale(),
    getMessages("contact"),
    getMessages("common"),
    getMessages("forms"),
  ]);
  // getContactDetails() is null in production until Aspire verifies the details (D-005 / D-020).
  const [details, centres, profile] = await Promise.all([
    getContactDetails(locale),
    getCentres(undefined, locale),
    getInstituteProfile(locale),
  ]);
  const photoLabel = tc.labels.illustrativeStockPhoto;

  const centreBySlug = new Map(centres.map((centre) => [centre.slug, centre]));
  const headOffice = details?.headOfficeCentreSlug ? centreBySlug.get(details.headOfficeCentreSlug) : undefined;
  const desks: CampusDesk[] = (details?.campusContacts ?? []).map((contact) => {
    const centre = centreBySlug.get(contact.centreSlug);
    const regionKey = REGION_PHOTOS[contact.centreSlug];
    return {
      slug: contact.centreSlug,
      name: contact.name,
      address: centre?.address,
      phone: contact.phone,
      email: contact.email,
      hours: contact.hours,
      demo: (details !== null && isPlaceholder(details)) || (centre !== undefined && isPlaceholder(centre)),
      region:
        regionKey && centre
          ? {
              image: localizeImage(stockImages[regionKey], locale),
              caption: format(t.desks.regionCaption, { district: centre.district }),
            }
          : undefined,
    };
  });

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={t.hero.lead}
        crumbs={[{ label: t.hero.crumb }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.hillRoadBarot, locale)}
        imageLabel={photoLabel}
      />

      {/* D-030: the form beside a tall photo (after the form on small screens, so the form stays near the top). */}
      <Section>
        <FillMediaSplit
          image={localizeImage(stockImages.laptopStudy, locale)}
          imageSide="right"
          imageLabel={photoLabel}
          imageFirstOnMobile={false}
        >
          <Card className="p-5 md:p-7">
            <h2 className="text-2xl font-extrabold leading-snug tracking-tight text-navy">{t.form.title}</h2>
            <p className="mb-5 mt-1.5 text-sm text-muted">{t.form.lead}</p>
            <EnquiryForm variant="contact" messages={tForms} />
          </Card>
        </FillMediaSplit>
      </Section>

      <Section tone="surface">
        <FillMediaSplit
          image={localizeImage(stockImages.mentoringConversation, locale)}
          imageSide="left"
          imageWidth="wide"
          imageLabel={photoLabel}
        >
          <Card className="p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-extrabold leading-snug tracking-tight text-navy">{t.details.title}</h2>
              {details && isPlaceholder(details) && <DemoBadge label={tc.labels.demoPending} />}
            </div>
            {details ? (
              <ContactDetailsList details={details} headOfficeName={headOffice?.name} labels={t.details} />
            ) : (
              <SiteContactFallback labels={t.details} />
            )}

            {profile && (
              <SocialLinks
                links={profile.socialLinks}
                title={t.social.title}
                demoLabel={isPlaceholder(profile) ? tc.labels.demoPending : undefined}
              />
            )}
          </Card>
        </FillMediaSplit>
      </Section>

      <Section aria-labelledby="contact-help-heading">
        <PhotoPanel image={localizeImage(stockImages.tableDiscussion, locale)} imageLabel={photoLabel} minHeight="lg">
          <h2
            id="contact-help-heading"
            className="text-[clamp(1.5rem,2.6vw,1.875rem)] font-extrabold leading-snug tracking-tight text-white"
          >
            {t.help.title}
          </h2>
          <p className="mt-2 text-[#dbe8f7]">{t.help.body}</p>
          <ButtonLink href={localePath("/admissions#enquiry", locale)} className="mt-4">
            {t.help.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>

          <h2 className="mt-9 text-[clamp(1.5rem,2.6vw,1.875rem)] font-extrabold leading-snug tracking-tight text-white">
            {t.centres.title}
          </h2>
          <p className="mt-2 text-[#dbe8f7]">{t.centres.body}</p>
          <ButtonLink href={localePath("/centres", locale)} variant="outline" className="mt-4">
            {t.centres.cta} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </PhotoPanel>
      </Section>

      {desks.length > 0 && (
        <Section tone="surface" id="campus-desks" aria-labelledby="campus-desks-heading" className="scroll-mt-24">
          <SectionHeading
            id="campus-desks-heading"
            eyebrow={t.desks.eyebrow}
            title={t.desks.title}
            description={t.desks.description}
          />
          <CampusDesks
            desks={desks}
            locale={locale}
            labels={t.desks}
            demoLabel={tc.labels.demoPending}
            photoLabel={photoLabel}
          />
          {desks.some((desk) => desk.region) && <p className="mt-4 text-xs text-muted">{t.desks.regionNote}</p>}
        </Section>
      )}
    </>
  );
}

/**
 * Shown when no contact details are publishable: verified siteConfig fields (all null today),
 * otherwise the notice that official details will be added after verification.
 */
function SiteContactFallback({ labels }: { labels: Messages<"contact">["details"] }) {
  const { phone, email, address, hours } = siteConfig.contact;
  const phoneLink = phone ? telHref(phone) : null;
  const emailLink = email ? mailtoHref(email) : null;

  if (!phone && !email && !address && !hours) {
    return (
      <Notice variant="info" className="mt-4">
        {labels.fallback}
      </Notice>
    );
  }

  return (
    <dl className="mt-4 space-y-3">
      {phone && (
        <DetailRow icon={<Phone aria-hidden="true" className="size-5" />} label={labels.phone}>
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
        <DetailRow icon={<Mail aria-hidden="true" className="size-5" />} label={labels.email}>
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
        <DetailRow icon={<MapPin aria-hidden="true" className="size-5" />} label={labels.address}>
          <address className="not-italic">{address}</address>
        </DetailRow>
      )}
      {hours && (
        <DetailRow icon={<Clock aria-hidden="true" className="size-5" />} label={labels.hours}>
          {hours}
        </DetailRow>
      )}
    </dl>
  );
}
