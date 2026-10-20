import { BookOpenCheck, Camera, ListOrdered } from "lucide-react";
import type { Metadata } from "next";
import { AskAspire } from "@/components/ask/AskAspire";
import { ButtonLink, PageHero, Section } from "@/components/ui";
import { stockImages } from "@/content/images";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { localizeImage } from "@/lib/data";

const PATH = "/tools/ask";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("ask");
  return { title: t.meta.title, description: t.meta.description, alternates: await localeAlternates(PATH) };
}

const STEPS = [
  { key: "ask", Icon: Camera },
  { key: "solve", Icon: ListOrdered },
  { key: "revise", Icon: BookOpenCheck },
] as const;

const HONEST_ITEMS = ["ai", "scope", "sources", "exams", "privacy"] as const;

/**
 * Ask Aspire — AI doubt solver (M6, D-035; docs/ask-aspire.md). The page itself is static; the
 * client tool fetches `GET /api/ask` for "connected?" and today's allowance, so without
 * ANTHROPIC_API_KEY it says "Ask Aspire isn't connected yet" and the rest of the page (how it
 * works, honest notes, enquiry link) stays useful.
 */
export default async function AskAspirePage() {
  const [locale, t, tc, tTools] = await Promise.all([
    getLocale(),
    getMessages("ask"),
    getMessages("common"),
    getMessages("tools"),
  ]);
  const enquiryHref = localePath("/admissions#enquiry", locale);

  return (
    <>
      <PageHero
        title={t.hero.title}
        lead={
          <>
            <p>{t.hero.lead}</p>
            <p className="mt-2 text-sm text-[#b9d3f3]">{t.hero.note}</p>
          </>
        }
        crumbs={[{ label: tTools.meta.title, href: localePath("/tools", locale) }, { label: t.hero.title }]}
        homeLabel={tc.labels.home}
        homeHref={localePath("/", locale)}
        image={localizeImage(stockImages.physicsWhiteboard, locale)}
        imageLabel={tc.labels.illustrativeStockPhoto}
      />

      <Section tone="surface">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
          <AskAspire
            messages={t}
            locale={locale}
            links={{
              enquiry: enquiryHref,
              signIn: localePath("/login", locale),
              privacy: localePath("/privacy", locale),
            }}
          />

          <aside className="grid min-w-0 gap-6">
            <section aria-labelledby="ask-how" className="rounded-card border border-line bg-white p-5 shadow-soft">
              <h2 id="ask-how" className="text-lg font-extrabold text-navy">
                {t.how.title}
              </h2>
              <ol className="mt-4 grid gap-4">
                {STEPS.map(({ key, Icon }, index) => (
                  <li key={key} className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-soft text-blue">
                      <Icon aria-hidden="true" className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-navy">
                        <span className="sr-only">{index + 1}. </span>
                        {t.how.steps[key].title}
                      </p>
                      <p className="text-sm text-muted">{t.how.steps[key].body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="ask-honest" className="rounded-card border border-line bg-white p-5 shadow-soft">
              <h2 id="ask-honest" className="text-lg font-extrabold text-navy">
                {t.honest.title}
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted marker:text-blue">
                {HONEST_ITEMS.map((key) => (
                  <li key={key}>{t.honest.items[key]}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="ask-stuck" className="rounded-card border border-[#f2dfa0] bg-gold-soft p-5">
              <h2 id="ask-stuck" className="text-lg font-extrabold text-navy">
                {t.stuck.title}
              </h2>
              <p className="mt-2 text-sm text-[#5c4a12]">{t.stuck.body}</p>
              <ButtonLink href={enquiryHref} className="mt-4">
                {t.stuck.cta}
              </ButtonLink>
            </section>
          </aside>
        </div>
      </Section>
    </>
  );
}
