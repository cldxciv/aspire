import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink, MediaSplit, Notice, PageHero, Section } from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("auth");
  return {
    title: t.forgot.metaTitle,
    description: t.forgot.metaDescription,
    robots: { index: false, follow: true },
    alternates: await localeAlternates("/forgot-password"),
  };
}

/** Hero carousel: staff help, the identity check, quiet study. None is reused by the body splits. */
const HERO_IMAGES = [
  stockImages.mentoringConversation,
  stockImages.signingForm,
  stockImages.studyThroughWindow,
  stockImages.booksAndNotebook,
] as const;

/**
 * /forgot-password and /hi/forgot-password (D-029). Honest: the site sends no email or SMS,
 * so there is no self-service reset form — Aspire staff reset passwords after checking who the
 * person is, and the account must choose a new password at the next sign-in.
 * The hero is a carousel of labelled stock photos; no photo appears twice on the page.
 */
export default async function ForgotPasswordPage() {
  const [locale, t, common] = await Promise.all([getLocale(), getMessages("auth"), getMessages("common")]);
  const f = t.forgot;
  const loginHref = localePath(LOGIN_PATH, locale);
  const contactHref = localePath("/contact", locale);
  const steps = [
    { title: f.step1Title, body: f.step1Body },
    { title: f.step2Title, body: f.step2Body },
    { title: f.step3Title, body: f.step3Body },
  ];

  return (
    <>
      <PageHero
        title={f.title}
        lead={f.lead}
        homeLabel={common.labels.home}
        homeHref={localePath("/", locale)}
        crumbs={[{ label: t.login.crumb, href: loginHref }, { label: f.crumb }]}
        slides={heroSlides(HERO_IMAGES, common.labels.illustrativeStockPhoto, locale)}
      >
        <ButtonLink href={contactHref}>
          {f.contactCta}
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
        <ButtonLink href={loginHref} variant="light">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {f.backToLogin}
        </ButtonLink>
      </PageHero>

      <Section aria-labelledby="forgot-steps-title">
        <MediaSplit
          image={localizeImage(stockImages.notebookPlanning, locale)}
          imageSide="left"
          imageLabel={common.labels.illustrativeStockPhoto}
        >
          <h2 id="forgot-steps-title" className="text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight text-navy">
            {f.stepsTitle}
          </h2>
          <ol className="mt-5 grid gap-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-extrabold text-gold"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold text-navy">{step.title}</h3>
                  <p className="mt-0.5 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Notice className="mt-6">{f.safetyNote}</Notice>
        </MediaSplit>
      </Section>

      <Section tone="surface" aria-labelledby="forgot-why-title">
        <MediaSplit
          image={localizeImage(stockImages.laptopStudy, locale)}
          imageSide="right"
          imageLabel={common.labels.illustrativeStockPhoto}
        >
          <h2 id="forgot-why-title" className="flex items-center gap-2 text-2xl font-extrabold text-navy">
            <Info aria-hidden="true" className="size-6 shrink-0 text-blue" />
            {f.whyTitle}
          </h2>
          <p className="mt-2 text-muted">{f.whyBody}</p>
          <h3 className="mt-6 text-lg font-bold text-navy">{f.staffTitle}</h3>
          <p className="mt-1 text-muted">{f.staffBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={contactHref}>
              {f.contactCta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
            <ButtonLink href={loginHref} variant="outline">
              {f.backToLogin}
            </ButtonLink>
          </div>
        </MediaSplit>
      </Section>
    </>
  );
}
