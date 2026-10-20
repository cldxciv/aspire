import type { Metadata } from "next";
import { LegalDocument, ToBeConfirmed, type LegalSectionContent } from "@/components/legal/LegalDocument";
import { PageHero, Section } from "@/components/ui";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("legal");
  return {
    title: t.terms.meta.title,
    description: t.terms.meta.description,
    alternates: await localeAlternates("/terms"),
  };
}

export default async function TermsPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("legal"), getMessages("common")]);

  // Neutral skeleton only (see the `legal.terms.sections` messages): each section says what it
  // will cover and stays "To be confirmed" until Aspire and its legal counsel supply approved text.
  const sections: LegalSectionContent[] = Object.entries(t.terms.sections).map(([id, { title, covers }]) => ({
    id,
    title,
    body: (
      <p>
        <span className="text-muted">{covers}</span> <ToBeConfirmed label={t.tbc} />
      </p>
    ),
  }));

  return (
    <>
      <PageHero
        title={t.terms.hero.title}
        lead={t.terms.hero.lead}
        crumbs={[{ label: t.terms.hero.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.signingForm, locale)}
        imageLabel={tc.labels.illustrativeStockPhoto}
      />
      <Section>
        <LegalDocument
          sections={sections}
          messages={t}
          image={localizeImage(stockImages.notebookPlanning, locale)}
          secondaryImage={localizeImage(stockImages.deskLampEvening, locale)}
          imageLabel={tc.labels.illustrativeStockPhoto}
        />
      </Section>
    </>
  );
}
