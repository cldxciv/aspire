import Image from "next/image";
import { AspireImage, DemoBadge, Section, type SectionTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { canShowStudentName, localizeImage, type WithQuoteLang } from "@/lib/data";
import type { Testimonial, TestimonialRelation } from "@/lib/types";

/**
 * Rank, score or marks claims ("AIR 142", "scored 355/360", "22 marks") in the quote, headline or context.
 * Note (Wave 2 review M-4): every imported testimonial carries some outcome wording ("cleared",
 * "crack NEET", college names), so a stricter filter would leave none. Accepted for preview only:
 * all are DEMO-labelled, hidden in production, and shared previews sit behind the D-027 gate.
 * The patterns are English: pick on the English records (see TestimonialsSection's `match`).
 */
const RANK_OR_SCORE = /\b(AIR|ranks?|ranked|ranking|scor\w*|marks|percentile)\b|\d+\s*\/\s*\d+/i;

function hasRankOrScoreClaim(t: Testimonial): boolean {
  return RANK_OR_SCORE.test([t.quote, t.headline, t.context].filter(Boolean).join(" "));
}

/** Takes up to `count` from `pool`, alternating parent / student voices where possible. */
function alternate(pool: Testimonial[], count: number, start: TestimonialRelation): Testimonial[] {
  const parents = pool.filter((t) => t.relation === "parent");
  const students = pool.filter((t) => t.relation === "student");
  const picked: Testimonial[] = [];
  let want = start;
  while (picked.length < count && (parents.length > 0 || students.length > 0)) {
    const next = want === "parent" ? (parents.shift() ?? students.shift()) : (students.shift() ?? parents.shift());
    if (!next) break;
    picked.push(next);
    want = next.relation === "parent" ? "student" : "parent";
  }
  return picked;
}

/**
 * Server-side pick for the home page: written quotes only (video titles are not quotes),
 * records failing canShowStudentName() dropped (quotes and context lines can name a
 * student). Only quotes without rank / score claims are used (fewer than `count` if needed). Within each tier, parent and student voices alternate.
 */
export function pickHomeTestimonials(list: Testimonial[], count = 3): Testimonial[] {
  // Quotes that name a faculty member are not shown (faculty info removed, owner 2026-10-20).
  const written = list.filter((t) => !t.isVideo && canShowStudentName(t) && !(t.facultySlugs?.length));
  const picked = alternate(
    written.filter((t) => !hasRankOrScoreClaim(t)),
    count,
    "parent",
  );
  // No claim-bearing fallback: show fewer cards rather than rank / score claims.
  return picked;
}

/**
 * One quote card: decorative quote mark, quote, author and relation / context. No person images (D-019).
 * Quotes and headlines are the person's own (English) words: `lang={quoteLang}` on Hindi pages.
 */
function QuoteCard({
  testimonial,
  relationLabel,
  demoLabel,
}: {
  testimonial: WithQuoteLang<Testimonial>;
  relationLabel: string;
  demoLabel: string;
}) {
  const quoteLang = testimonial.quoteLang;
  return (
    <figure className="flex h-full flex-col rounded-card border border-line bg-white p-6 shadow-soft md:p-7">
      <div className="flex items-start justify-between gap-3">
        <AspireImage asset={aspireAssets.quoteIcon} className="w-12 shrink-0" />
        {testimonial.status === "placeholder" && <DemoBadge label={demoLabel} />}
      </div>
      {testimonial.headline && (
        <p lang={quoteLang} className="mt-4 font-serif text-lg font-semibold leading-snug text-navy">
          {testimonial.headline}
        </p>
      )}
      <blockquote lang={quoteLang} className="mt-4 flex-1 text-[15px] leading-relaxed text-[#43556d]">
        <p>&ldquo;{testimonial.quote}&rdquo;</p>
      </blockquote>
      <figcaption className="mt-6 border-t border-line pt-4 text-sm">
        <span className="block font-bold text-navy">{testimonial.author}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {relationLabel}
          {testimonial.context ? ` · ${testimonial.context}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * "Voices from families" (plan §4.9): intro (with a labelled object still-life photo from
 * `lg`, never a person) beside three written quotes picked on the server. Placeholder quotes carry DEMO badges. There is no "view all" link (no route).
 * Returns null when nothing can be shown (production today). The pick runs on `match`
 * (the English records: the claim filter is English) and shows the same ids from `testimonials`.
 */
export function TestimonialsSection({
  testimonials,
  locale,
  match,
  tone = "white",
}: {
  /** Testimonials in the page's language (`quoteLang` set on Hindi records). */
  testimonials: WithQuoteLang<Testimonial>[];
  locale: Locale;
  /** The same records in English, for the claim filter. Defaults to `testimonials`. */
  match?: Testimonial[];
  tone?: SectionTone;
}) {
  const ids = pickHomeTestimonials(match ?? testimonials, 3).map((t) => t.id);
  const picked = ids.flatMap((id) => testimonials.filter((t) => t.id === id));
  if (picked.length === 0) return null;
  const hasPlaceholders = picked.some((t) => t.status === "placeholder");
  const t = messagesFor(locale, "home").voices;
  const { labels } = messagesFor(locale, "common");
  const demoLabel = labels.demo;
  const relation: Record<TestimonialRelation, string> = { parent: t.parent, student: t.student };
  // An object still life (no people: the cards name people, D-019), desktop only (D-030).
  const photo = localizeImage(stockImages.deskLampEvening, locale);

  return (
    <Section tone={tone} aria-labelledby="home-voices-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-12 xl:gap-16">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{t.eyebrow}</p>
          <h2
            id="home-voices-title"
            className="mt-2 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight text-navy [&:lang(hi)]:leading-snug"
          >
            {t.title}
          </h2>
          <p className="mt-4 max-w-prose leading-relaxed text-muted">{t.lead}</p>
          {hasPlaceholders && <p className="mt-4 text-sm text-muted">{t.demoNote}</p>}
          <figure className="relative m-0 mt-8 hidden aspect-3/4 overflow-hidden rounded-card bg-surface shadow-soft lg:block">
            <Image src={photo.src} alt={photo.alt} fill sizes="300px" className="object-cover" />
            <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {labels.illustrativeStockPhoto}
            </span>
          </figure>
        </div>
        {/* Two columns until there is room for three readable quote cards (and never a third, empty column). */}
        <ul className={cn("grid gap-5 sm:grid-cols-2 md:gap-6 lg:self-center", picked.length >= 3 && "xl:grid-cols-3")}>
          {picked.map((testimonial) => (
            <li key={testimonial.id}>
              <QuoteCard testimonial={testimonial} relationLabel={relation[testimonial.relation]} demoLabel={demoLabel} />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
