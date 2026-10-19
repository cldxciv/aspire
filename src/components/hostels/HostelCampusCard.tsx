import { ArrowRight, Phone } from "lucide-react";
import Link from "next/link";
import { telHref } from "@/components/centres/contact-links";
import { Badge, DemoBadge } from "@/components/ui";
import type { CampusHostel } from "@/lib/types";

/**
 * Hostel options at one campus: the campus note, the warden desk (tel:) and each
 * residential block with availability stated in words (not colour alone).
 * Fields render only when present. The article's id is `hostel-<centre slug>`
 * so centre cards can link to /hostels#hostel-<slug>.
 */
export function HostelCampusCard({
  campus,
  centreName,
  placeholder,
}: {
  campus: CampusHostel;
  centreName: string;
  placeholder: boolean;
}) {
  const tel = telHref(campus.wardenPhone);
  const headingId = `hostel-${campus.centreSlug}-name`;

  return (
    <article
      id={`hostel-${campus.centreSlug}`}
      aria-labelledby={headingId}
      className="flex h-full scroll-mt-28 flex-col rounded-card border border-line bg-white p-5 shadow-soft md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-lg font-bold leading-snug text-navy">
            {centreName}
          </h3>
          <p className="text-sm font-semibold text-blue">{campus.note}</p>
        </div>
        {placeholder && <DemoBadge label="Demo" />}
      </div>

      {campus.blocks.length > 0 && (
        <ul className="mt-4 space-y-3">
          {campus.blocks.map((block) => {
            const details = [
              { label: "Distance", value: block.distance },
              { label: "Rooms", value: block.rooms },
              { label: "Supervision", value: block.supervision },
              { label: "Capacity", value: block.capacity },
            ].filter((d): d is { label: string; value: string } => Boolean(d.value?.trim()));
            return (
              <li key={block.name} className="rounded-control border border-line bg-surface p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-navy">{block.name}</p>
                  <Badge variant={block.available ? "success" : "neutral"}>
                    {block.available ? "Available" : "Not available"}
                  </Badge>
                </div>
                {details.length > 0 && (
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                    {details.map((detail) => (
                      <div key={detail.label} className="contents">
                        <dt className="font-semibold text-muted">{detail.label}</dt>
                        <dd className="mb-1 text-ink sm:mb-0">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
        {tel && campus.wardenPhone && (
          <a href={tel} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-navy hover:underline">
            <Phone aria-hidden="true" className="size-4 text-blue" />
            Warden desk: {campus.wardenPhone}
          </a>
        )}
        <Link
          href={`/centres#${campus.centreSlug}`}
          className="inline-flex min-h-11 items-center gap-1 font-bold text-blue hover:underline"
        >
          Campus details<span className="sr-only"> for {centreName}</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
