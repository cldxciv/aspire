import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, ToBeConfirmed, type LegalSectionContent } from "@/components/legal/LegalDocument";
import { LEGAL_PAGE_PHOTOS, legalHeroSlides } from "@/components/legal/hero-slides";
import { richText } from "@/components/legal/rich-text";
import { PageHero, Section } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("legal");
  return {
    title: t.privacy.meta.title,
    description: t.privacy.meta.description,
    alternates: await localeAlternates("/privacy"),
  };
}

export default async function PrivacyPage() {
  const [locale, t, tc] = await Promise.all([getLocale(), getMessages("legal"), getMessages("common")]);
  const p = t.privacy;
  const { sticky } = LEGAL_PAGE_PHOTOS.privacy;
  const tbc = <ToBeConfirmed label={t.tbc} />;
  const link = (href: string, label: string) => (
    <Link href={localePath(href, locale)} className="text-blue underline">
      {label}
    </Link>
  );

  const sections: LegalSectionContent[] = [
    {
      id: "about",
      title: p.about.title,
      body: (
        <>
          <p>
            {richText(p.about.p1, {
              admissionsLink: link("/admissions", p.about.admissionsLink),
              contactLink: link("/contact", p.about.contactLink),
            })}
          </p>
          <p>{richText(p.about.p2, { siteName: siteConfig.name, tbc })}</p>
        </>
      ),
    },
    {
      id: "what-we-collect",
      title: p.collect.title,
      body: (
        <>
          <p>{p.collect.intro}</p>
          {/* Rows mirror src/lib/contracts/enquiry.ts exactly (D-021, D-021a) — see the `legal` messages. */}
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{p.collect.caption}</caption>
              <thead className="bg-surface text-[#40536b]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {p.collect.columnInformation}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {p.collect.columnForm}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {p.collect.columnRequired}
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.collect.rows.map((row) => (
                  <tr key={row.field} className="border-t border-line">
                    <th scope="row" className="px-3 py-2.5 font-semibold text-ink">
                      {row.field}
                    </th>
                    <td className="px-3 py-2.5 text-muted">{row.forms}</td>
                    <td className="px-3 py-2.5 text-muted">{row.required}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{p.collect.alsoIntro}</p>
          <ul>
            {p.collect.also.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{p.collect.hidden}</p>
        </>
      ),
    },
    {
      id: "why",
      title: p.why.title,
      body: (
        <>
          <p>{p.why.p1}</p>
          <p>{p.why.p2}</p>
          <p>{richText(p.why.p3, { tbc })}</p>
        </>
      ),
    },
    {
      id: "access",
      title: p.access.title,
      body: (
        <>
          <p>{p.access.p1}</p>
          <p>{richText(p.access.p2, { tbc })}</p>
          <p>{p.access.p3}</p>
        </>
      ),
    },
    {
      id: "protecting-the-form",
      title: p.protecting.title,
      body: (
        <>
          <p>{p.protecting.p1}</p>
          <p>{p.protecting.p2}</p>
        </>
      ),
    },
    {
      // Mirrors the account store in src/lib/db/connection.ts (D-029) — see the `legal` messages.
      id: "portal-accounts",
      title: p.portal.title,
      body: (
        <>
          <p>{p.portal.p1}</p>
          <p>{p.portal.intro}</p>
          <ul>
            {p.portal.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{p.portal.p2}</p>
          <p>{p.portal.p3}</p>
          <p>{richText(p.portal.p4, { tbc })}</p>
          <p>{richText(p.portal.p5, { tbc })}</p>
        </>
      ),
    },
    {
      id: "retention",
      title: p.retention.title,
      body: <p>{richText(p.retention.p1, { tbc })}</p>,
    },
    {
      id: "your-rights",
      title: p.rights.title,
      body: (
        <>
          <p>{richText(p.rights.p1, { tbc })}</p>
          <p>{richText(p.rights.p2, { tbc })}</p>
        </>
      ),
    },
    {
      id: "cookies",
      title: p.cookies.title,
      body: (
        <>
          <p>{p.cookies.p1}</p>
          <p>{p.cookies.p2}</p>
        </>
      ),
    },
    {
      id: "changes",
      title: p.changes.title,
      body: <p>{richText(p.changes.p1, { tbc })}</p>,
    },
  ];

  return (
    <>
      <PageHero
        title={p.hero.title}
        lead={p.hero.lead}
        crumbs={[{ label: p.hero.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        slides={legalHeroSlides("privacy", tc.labels.illustrativeStockPhoto, locale)}
        carouselLabels={tc.carousel}
      />
      <Section>
        <LegalDocument
          sections={sections}
          messages={t}
          image={localizeImage(stockImages[sticky[0]], locale)}
          secondaryImage={localizeImage(stockImages[sticky[1]], locale)}
          imageLabel={tc.labels.illustrativeStockPhoto}
        />
      </Section>
    </>
  );
}
