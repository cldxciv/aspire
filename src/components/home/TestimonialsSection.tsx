import { AspireImage, DemoBadge, Section, SectionHeading, type SectionTone } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { canShowStudentName } from "@/lib/data";
import type { Testimonial } from "@/lib/types";
import { Pill } from "./Pill";
import { TextLink } from "./TextLink";

const RELATION_LABEL: Record<Testimonial["relation"], string> = {
  parent: "Parent perspective",
  student: "Student journey",
};

/**
 * Picks `count` testimonials for the home page: written quotes before video titles,
 * alternating parent / student voices, otherwise in source order.
 */
function pickTestimonials(list: Testimonial[], count: number): Testimonial[] {
  const ordered = [...list.filter((t) => !t.isVideo), ...list.filter((t) => t.isVideo)];
  const parents = ordered.filter((t) => t.relation === "parent");
  const students = ordered.filter((t) => t.relation === "student");
  const picked: Testimonial[] = [];
  while (picked.length < count && (parents.length > 0 || students.length > 0)) {
    const next = picked.length % 2 === 0 ? (parents.shift() ?? students.shift()) : (students.shift() ?? parents.shift());
    if (next) picked.push(next);
  }
  return picked;
}

/**
 * One testimonial. No person image (D-019) — only the decorative quote mark. The author,
 * and the context line (which can name a student), render only when canShowStudentName()
 * allows; otherwise the quote is attributed generically.
 */
function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const showName = canShowStudentName(testimonial);
  const { relation } = testimonial;

  return (
    <figure className="flex h-full flex-col rounded-card border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <AspireImage asset={aspireAssets.quoteIcon} className="w-16 shrink-0" />
        <div className="flex flex-wrap justify-end gap-1.5">
          <Pill>{RELATION_LABEL[relation]}</Pill>
          {testimonial.status === "placeholder" && <DemoBadge label="Demo" />}
        </div>
      </div>
      {testimonial.headline && <p className="mt-3 font-bold leading-snug text-navy">{testimonial.headline}</p>}
      <blockquote className="mt-3 flex-1 text-sm text-[#43556d]">
        <p>&ldquo;{testimonial.quote}&rdquo;</p>
      </blockquote>
      {testimonial.isVideo && (
        <p className="mt-2 text-xs text-muted">
          {testimonial.caption ? `${testimonial.caption} ` : ""}(From a video testimonial; text only.)
        </p>
      )}
      <figcaption className="mt-4 border-t border-line pt-3 text-sm">
        {showName ? (
          <>
            <span className="block font-bold text-navy">{testimonial.author}</span>
            {testimonial.context && <span className="block text-xs text-muted">{testimonial.context}</span>}
          </>
        ) : (
          <span className="font-bold text-navy">{relation === "parent" ? "An Aspire parent" : "An Aspire student"}</span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * "What families value" — up to three testimonials from getTestimonials(). Quotes can name
 * students, so records failing canShowStudentName() are dropped entirely (getTestimonials()
 * already applies the same rule). Each placeholder card is DEMO-labelled.
 */
export function TestimonialsSection({
  testimonials,
  tone = "white",
}: {
  testimonials: Testimonial[];
  tone?: SectionTone;
}) {
  const picked = pickTestimonials(testimonials.filter(canShowStudentName), 3);
  if (picked.length === 0) return null;
  const hasPlaceholders = picked.some((t) => t.status === "placeholder");

  return (
    <Section tone={tone} aria-labelledby="home-voices-title">
      <SectionHeading
        id="home-voices-title"
        title="What families value"
        description={
          hasPlaceholders
            ? "Parents and students in their own words. Shown for review — consent and details are pending verification by Aspire."
            : "Parents and students in their own words, published with their consent."
        }
        action={<TextLink href="/about">About Aspire</TextLink>}
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {picked.map((testimonial) => (
          <li key={testimonial.id}>
            <TestimonialCard testimonial={testimonial} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
