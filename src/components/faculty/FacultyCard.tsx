import { BriefcaseBusiness, ChevronDown, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Pill } from "@/components/home/Pill";
import { Badge, DemoBadge } from "@/components/ui";
import type { FacultyMember } from "@/lib/types";
import { InitialsAvatar } from "./InitialsAvatar";

/** "Er." + "Raman Sharma" → "Er. Raman Sharma". */
export function facultyDisplayName(member: Pick<FacultyMember, "honorific" | "name">): string {
  return [member.honorific, member.name].filter(Boolean).join(" ");
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="mt-0.5 shrink-0 text-blue">
        <Icon aria-hidden="true" className="size-4" />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Faculty profile card. No photo: an initials avatar stands beside the name
 * (D-019). Credentials, experience, campus, summary, expertise and the full bio
 * render only when present. Placeholder profiles carry a DEMO badge.
 * The article's id is the faculty slug so /faculty#<slug> links scroll to it.
 */
export function FacultyCard({ member, centreName }: { member: FacultyMember; centreName?: string }) {
  const name = facultyDisplayName(member);
  const headingId = `faculty-${member.slug}-name`;
  const expertise = member.expertise ?? [];
  const teaches = member.teaches ?? [];
  const bio = member.bio ?? [];

  return (
    <article
      id={member.slug}
      aria-labelledby={headingId}
      className="flex h-full scroll-mt-28 flex-col rounded-card border border-line bg-white p-5 shadow-soft"
    >
      <div className="flex items-start gap-4">
        <InitialsAvatar name={member.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{member.subject}</Badge>
            {member.status === "placeholder" && <DemoBadge label="Demo" />}
          </div>
          <h3 id={headingId} className="mt-1.5 text-lg font-bold leading-snug text-navy">
            {name}
          </h3>
          <p className="text-sm text-muted">{member.role}</p>
        </div>
      </div>

      {(member.credentials || member.experience || (member.centreSlug && centreName)) && (
        <dl className="mt-4 space-y-1.5 text-sm text-ink">
          {member.credentials && (
            <Fact icon={GraduationCap} label="Credentials">
              {member.credentials}
            </Fact>
          )}
          {member.experience && (
            <Fact icon={BriefcaseBusiness} label="Experience">
              {member.experience} experience
            </Fact>
          )}
          {member.centreSlug && centreName && (
            <Fact icon={MapPin} label="Campus">
              <Link href={`/centres#${member.centreSlug}`} className="font-semibold text-navy hover:underline">
                {centreName}
              </Link>
            </Fact>
          )}
        </dl>
      )}

      {member.summary && <p className="mt-3 text-sm text-ink">{member.summary}</p>}

      {expertise.length > 0 && (
        <div className="mt-3">
          <p className="sr-only">Areas of expertise</p>
          <ul className="flex flex-wrap gap-1.5">
            {expertise.map((area) => (
              <li key={area}>
                <Pill>{area}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teaches.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          <span className="font-bold text-[#354b66]">Teaches:</span> {teaches.join(" · ")}
        </p>
      )}

      {bio.length > 0 && (
        <details className="group mt-auto pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-blue hover:underline [&::-webkit-details-marker]:hidden">
            Read full profile<span className="sr-only"> of {name}</span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-2 text-sm text-ink">
            {bio.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
