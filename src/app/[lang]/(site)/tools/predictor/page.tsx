import { Database, ListChecks, Percent, ShieldAlert, Sigma } from "lucide-react";
import type { Metadata } from "next";
import { CtaBleedSplit } from "@/components/home/CtaSplit";
import { AspireAdmits } from "@/components/predictor/AspireAdmits";
import { PredictorApp } from "@/components/predictor/PredictorApp";
import { ResultCardMosaic } from "@/components/results/ResultCardMosaic";
import { ButtonLink, DemoBadge, EmptyState, Notice, PageHero, Section, SectionHeading } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { stockImages } from "@/content/images";
import { htmlLang, ogLocale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getResultCards, localizeImage } from "@/lib/data";
import { cardsForInstitutions, getAspireAdmits, topInstitutionKeys, type AdmitExam } from "@/lib/predictor/admits";
import { getPredictorData } from "@/lib/predictor/data";
import { hasSampleData } from "@/lib/predictor/engine";

const PATH = "/tools/predictor";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages("predictor")]);
  return {
    title: t.meta.title,
    description: t.meta.description,
    keywords: t.meta.keywords.split(",").map((keyword) => keyword.trim()),
    alternates: await localeAlternates(PATH),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: ogLocale[locale],
      url: localePath(PATH, locale),
      title: t.meta.title,
      description: t.meta.description,
      images: [{ url: "/api/predictor/card", width: 1200, height: 630, alt: t.hero.title }],
    },
  };
}

/**
 * Rank & college predictor (M6, D-032). The engine runs in the browser on the tables the server
 * allows (sample tables only in development / preview, labelled; production → "coming soon").
 * "Where Aspire students got in" is real data from the results list, counts only, under the
 * rankers' visibility rules, and never connected to the student's score. Every stock photo shows
 * objects only, because result cards with student names can appear on this page.
 */
export default async function PredictorPage() {
  const [locale, t, tc, tTools] = await Promise.all([
    getLocale(),
    getMessages("predictor"),
    getMessages("common"),
    getMessages("tools"),
  ]);
  const data = getPredictorData();
  const sample = hasSampleData(data);
  const admits = await getAspireAdmits();
  const cards = admits ? await getResultCards(undefined, locale) : [];
  const pageUrl = new URL(localePath(PATH, locale), siteConfig.url).toString();
  const stockLabel = tc.labels.illustrativeStockPhoto;

  const mosaics = admits
    ? await Promise.all(
        (["JEE", "NEET"] as AdmitExam[]).map(async (exam) => {
          const examCards = cardsForInstitutions(
            cards.filter((card) => card.exam === exam),
            topInstitutionKeys(admits, exam),
          );
          if (examCards.length === 0) return null;
          const mosaic = await ResultCardMosaic({ locale, cards: examCards, variant: "4x2" });
          return { exam, mosaic };
        }),
      )
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t.meta.appName,
    url: pageUrl,
    description: t.meta.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    inLanguage: htmlLang[locale],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    provider: { "@type": "EducationalOrganization", name: siteConfig.name, url: siteConfig.url },
  };

  const steps = [
    { icon: Percent, title: t.how.step1Title, body: t.how.step1Body },
    { icon: Sigma, title: t.how.step2Title, body: t.how.step2Body },
    { icon: ListChecks, title: t.how.step3Title, body: t.how.step3Body },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD per the Next guide; "<" escaped so no string can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PageHero
        title={t.hero.title}
        lead={<p>{t.hero.lead}</p>}
        crumbs={[{ label: tTools.meta.title, href: localePath("/tools", locale) }, { label: t.hero.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.mathsNotebook, locale)}
        imageLabel={stockLabel}
      />

      <Section tone="surface">
        {data ? (
          <div className="flex flex-col gap-6">
            {sample && (
              <Notice variant="warning" title={t.notices.sampleTitle}>
                {t.notices.sampleBody}
              </Notice>
            )}
            <PredictorApp
              data={data}
              pageUrl={pageUrl}
              messages={{ form: t.form, result: t.result, whatIf: t.whatIf, share: t.share }}
            />
          </div>
        ) : (
          <EmptyState
            title={t.notices.comingSoonTitle}
            description={<p>{t.notices.comingSoonBody}</p>}
            action={<ButtonLink href={localePath("/admissions#enquiry", locale)}>{t.cta.primary}</ButtonLink>}
          />
        )}
      </Section>

      <Section tone="white" aria-labelledby="predictor-how-title">
        <SectionHeading id="predictor-how-title" title={t.how.title} />
        <ol className="grid list-none gap-4 p-0 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-card border border-line bg-surface p-5">
              <step.icon aria-hidden="true" className="size-6 text-blue" />
              <h3 className="mt-3 font-bold text-navy">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-card border border-line p-5">
            <h3 className="flex items-center gap-2 font-bold text-navy">
              <ShieldAlert aria-hidden="true" className="size-5 text-[#8b5b00]" />
              {t.how.limitsTitle}
            </h3>
            <p className="mt-2 text-sm text-muted">{t.how.limitsBody}</p>
          </div>
          <div className="rounded-card border border-line p-5">
            <h3 className="flex items-center gap-2 font-bold text-navy">
              <Database aria-hidden="true" className="size-5 text-blue" />
              {t.how.sourceTitle}
            </h3>
            {data && (
              <p className="mt-2 text-sm text-muted">
                {sample
                  ? t.how.sourceSample
                  : [...new Set([...data.scoreTables, ...data.cutoffTables].map((table) => table.source))].join(" · ")}
              </p>
            )}
            <p className="mt-2 text-sm text-muted">{t.how.noOutcomeLink}</p>
          </div>
        </div>
      </Section>

      {admits && (
        <Section tone="surface" aria-labelledby="predictor-admits-title">
          <SectionHeading
            id="predictor-admits-title"
            title={t.admits.title}
            description={t.admits.lead}
            action={admits.placeholder ? <DemoBadge label={tc.labels.demoPending} /> : undefined}
          />
          <AspireAdmits
            rows={admits.rows.map(({ exam, year, key, institution, count }) => ({ exam, year, key, institution, count }))}
            years={admits.years}
            messages={t.admits}
          />
          {mosaics.map((item) =>
            item ? (
              <div key={item.exam} className="mt-10">
                <h3 className="mb-4 font-serif text-2xl font-bold text-navy">{format(t.admits.cardsTitle, { exam: item.exam })}</h3>
                {item.mosaic}
              </div>
            ) : null,
          )}
        </Section>
      )}

      <CtaBleedSplit
        tone={admits ? "white" : "surface"}
        headingId="predictor-cta-title"
        title={t.cta.title}
        description={t.cta.body}
        primary={{ label: t.cta.primary, href: localePath("/admissions#enquiry", locale) }}
        secondary={{ label: t.cta.secondary, href: localePath("/results", locale) }}
        image={localizeImage(stockImages.signingForm, locale)}
        imageLabel={stockLabel}
      />
    </>
  );
}
