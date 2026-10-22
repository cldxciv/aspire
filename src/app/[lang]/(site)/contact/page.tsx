import { ArrowRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { FillMediaSplit } from "@/components/about/FillMediaSplit";
import { PhotoPanel } from "@/components/about/PhotoPanel";
import { finderLabels } from "@/components/centres/finder-labels";
import { CampusDesks, type CampusDesk } from "@/components/contact/CampusDesks";
import { ContactDetailsList } from "@/components/contact/ContactDetailsList";
import { mailtoHref, telHref } from "@/components/contact/contact-links";
import {
  CONTACT_DESK_PHOTOS,
  CONTACT_DETAILS_PHOTO,
  CONTACT_FORM_PHOTO,
  CONTACT_HELP_PHOTO,
  CONTACT_HERO_KEYS,
} from "@/components/contact/contact-photos";
import { CONTACT_LINK_CLASS, DetailRow } from "@/components/contact/DetailRow";
import { SocialLinks } from "@/components/contact/SocialLinks";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import {
  CentreFinder,
  HeroAction,
  HeroCollage,
  HeroCopy,
  HeroPanel,
  finderCentres,
  finderDistricts,
  type FinderAction,
} from "@/components/hero";
import { layoutPreviewBanner } from "@/components/page-layout/preview-banner";
import { PageLayoutFrame, type LayoutSlots } from "@/components/page-layout/render";
import { ButtonLink, Card, DemoBadge, Notice, Section, SectionHeading } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { stockImages } from "@/content/images";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getCentres, getContactDetails, getInstituteProfile, isPlaceholder, localizeImage } from "@/lib/data";
import { getPageLayout } from "@/lib/page-layout/loader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("contact");
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: await localeAlternates("/contact"),
  };
}

/** The hero finder's buttons on /contact: reach the chosen district's centre (each only when the data has it). */
const FINDER_ACTIONS: readonly FinderAction[] = ["call", "whatsapp", "directions"];

/**
 * Contact. Hero (E · centre finder, 2026-10-22 hero redesign): choose a district to see the centre
 * that serves it, with Call (the campus desk's number from the contact details), WhatsApp (the
 * institute's chat link) and Directions (when the centre record has a link), beside an
 * illustrative map. Without publishable centres (production today) the hero is the headline, a
 * "Send an enquiry" link to the form below and two labelled stock photos (D-030, never a
 * landscape or a result card, D-031).
 * Page layout (docs/page-layout-plan.md): the sections after the hero follow the published layout
 * (`getPageLayout("contact")`, editable by a super admin; no closing band, and the enquiry form
 * that links point to can't be hidden). Each section is a slot; tones alternate over the sections
 * that render (PageLayoutFrame) and the form's and details' photos switch sides with the tone (D8),
 * so the default layout looks exactly as before.
 */
export default async function ContactPage() {
  const [locale, t, tc, tForms, tCentres, layout] = await Promise.all([
    getLocale(),
    getMessages("contact"),
    getMessages("common"),
    getMessages("forms"),
    getMessages("centres"),
    getPageLayout("contact"),
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
  const desks: CampusDesk[] = (details?.campusContacts ?? []).map((contact, index) => {
    const centre = centreBySlug.get(contact.centreSlug);
    const photoKey = CONTACT_DESK_PHOTOS[index];
    return {
      slug: contact.centreSlug,
      name: contact.name,
      address: centre?.address,
      phone: contact.phone,
      email: contact.email,
      hours: contact.hours,
      demo: (details !== null && isPlaceholder(details)) || (centre !== undefined && isPlaceholder(centre)),
      photo: photoKey ? localizeImage(stockImages[photoKey], locale) : undefined,
    };
  });

  // Hero finder: each centre with its campus desk's phone (contact details) and the institute's WhatsApp.
  const deskPhone = new Map((details?.campusContacts ?? []).map((desk) => [desk.centreSlug, desk.phone?.display]));
  const finderSource = centres.map((centre) => ({ ...centre, phone: deskPhone.get(centre.slug) ?? centre.phone }));
  const hasCentres = centres.length > 0;

  // One slot per section, rendered in layout order. The campus desks slot is null exactly when the
  // section would render nothing (no verified desks), so it never takes a tone.
  const slots: LayoutSlots<"contact"> = {
    // D-030: the form beside a tall photo from lg (after the form below lg, so the form stays near the top
    // and keeps its full width on tablets).
    form: ({ tone, side }) => (
      <Section tone={tone} id="contact-form" className="scroll-mt-24">
        <FillMediaSplit
          image={localizeImage(stockImages[CONTACT_FORM_PHOTO], locale)}
          imageSide={side}
          imageLabel={photoLabel}
          imageFirstOnMobile={false}
          splitFrom="lg"
        >
          <Card className="p-5 md:p-7">
            <h2 className="text-2xl font-extrabold leading-snug tracking-tight text-navy">{t.form.title}</h2>
            <p className="mb-5 mt-1.5 text-sm text-muted">{t.form.lead}</p>
            <EnquiryForm variant="contact" messages={tForms} />
          </Card>
        </FillMediaSplit>
      </Section>
    ),

    details: ({ tone, side }) => (
      <Section tone={tone}>
        <FillMediaSplit
          image={localizeImage(stockImages[CONTACT_DETAILS_PHOTO], locale)}
          imageSide={side}
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
    ),

    help: ({ tone }) => (
      <Section tone={tone} aria-labelledby="contact-help-heading">
        <PhotoPanel image={localizeImage(stockImages[CONTACT_HELP_PHOTO], locale)} imageLabel={photoLabel} minHeight="lg">
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
    ),

    desks:
      desks.length > 0
        ? ({ tone }) => (
            <Section tone={tone} id="campus-desks" aria-labelledby="campus-desks-heading" className="scroll-mt-24">
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
              {desks.some((desk) => desk.photo) && <p className="mt-4 text-xs text-muted">{t.desks.photoNote}</p>}
            </Section>
          )
        : null,
  };

  return (
    <PageLayoutFrame
      layout={layout}
      banner={await layoutPreviewBanner(layout)}
      hero={
        <HeroPanel>
          <CentreFinder
            copy={
              <HeroCopy
                title={t.hero.title}
                highlight={t.hero.highlight}
                lead={hasCentres ? t.hero.finderLead : t.hero.lead}
                crumbs={[{ label: t.hero.crumb }]}
                homeLabel={tc.labels.home}
                homeHref={localePath("/", locale)}
                actions={hasCentres ? undefined : <HeroAction href="#contact-form">{t.form.title}</HeroAction>}
              />
            }
            centres={finderCentres(finderSource, { whatsapp: details?.whatsapp ?? null })}
            districts={finderDistricts(centres, locale)}
            labels={finderLabels(tCentres, tc)}
            actions={FINDER_ACTIONS}
            fallback={
              <HeroCollage
                photos={CONTACT_HERO_KEYS.map((key) => ({ image: localizeImage(stockImages[key], locale), label: photoLabel }))}
                resultBadge=""
                demoLabel={tc.labels.demo}
              />
            }
          />
        </HeroPanel>
      }
      slots={slots}
    />
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
