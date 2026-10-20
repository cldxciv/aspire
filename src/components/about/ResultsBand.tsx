import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, SectionHeading } from "@/components/ui";

/**
 * "Results from previous batches" (D-031): a section heading with a "View results" link above a
 * wide band of result cards. For general sections only — never beside a specific centre, campus or
 * hostel (the data does not say where a student studied).
 *
 * `media` is an awaited standalone `ResultCardMosaic` (`variant="6x2"`, `seeAllHref={null}` since the
 * heading already links to /results) with a non-nature stock `fallbackImage` + `fallbackImageLabel`,
 * so production (no result cards) shows a labelled 3:1 photo instead. The copy must read true in both
 * modes: it says how results are published, never what a particular card or batch achieved.
 */
export function ResultsBand({
  headingId,
  eyebrow,
  title,
  description,
  link,
  media,
}: {
  headingId: string;
  eyebrow: string;
  title: string;
  description: string;
  /** Usually "View results" → the localised /results. */
  link: { label: string; href: string };
  media: ReactNode;
}) {
  return (
    <>
      <SectionHeading
        id={headingId}
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <ButtonLink href={link.href} variant="outline">
            {link.label} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        }
      />
      {media}
    </>
  );
}
