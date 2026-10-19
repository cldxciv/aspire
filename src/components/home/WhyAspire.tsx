import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AspireImage, DemoBadge, Section, SectionHeading, type SectionTone } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import type { InstituteProfile } from "@/lib/types";

/**
 * Feature icons (crop: "top-square", max 96px) assigned to approach points in order.
 * The source lists five points: micro-batches, resident mentorship, doubt clinic,
 * parent updates, faculty hours. Extra points reuse the list from the start.
 */
const APPROACH_ICONS = [
  aspireAssets.iconPersonalized,
  aspireAssets.iconMentorship,
  aspireAssets.iconExpertFaculty,
  aspireAssets.iconStudentSupport,
  aspireAssets.iconLearningCentres,
];

/**
 * "Why Aspire" — the institute profile's approach points with the Aspire feature icons.
 * Rendered only when getInstituteProfile() returns a profile with approach points; the
 * whole profile is one record, so the section carries one DEMO badge while it is a placeholder.
 */
export function WhyAspire({ profile, tone = "surface" }: { profile: InstituteProfile; tone?: SectionTone }) {
  const placeholder = profile.status === "placeholder";

  return (
    <Section tone={tone} aria-labelledby="home-approach-title">
      <SectionHeading
        id="home-approach-title"
        eyebrow="Why Aspire"
        title="How learning works at Aspire"
        description={
          <>
            {profile.mission.title}
            {placeholder && (
              <>
                {" "}
                <DemoBadge className="align-middle" />
              </>
            )}
          </>
        }
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profile.approach.map((point, index) => (
          <li key={point.title} className="flex gap-4 rounded-card border border-line bg-white p-5 shadow-soft">
            <AspireImage
              asset={APPROACH_ICONS[index % APPROACH_ICONS.length]}
              rounded
              className="w-14 shrink-0"
            />
            <div>
              <h3 className="font-bold leading-snug text-navy">{point.title}</h3>
              <p className="mt-1 text-sm text-muted">{point.description}</p>
            </div>
          </li>
        ))}
        <li className="flex">
          <Link
            href="/about"
            className="flex min-h-11 w-full flex-col justify-center rounded-card border border-dashed border-[#b9cbe0] bg-[#f8fbff] p-5 text-navy transition hover:border-blue hover:bg-[#edf5ff]"
          >
            <span className="font-bold">The story behind the approach</span>
            <span className="mt-1 text-sm text-muted">Read how and why Aspire began.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-blue">
              About Aspire <ArrowRight aria-hidden="true" className="size-4" />
            </span>
          </Link>
        </li>
      </ul>
    </Section>
  );
}
