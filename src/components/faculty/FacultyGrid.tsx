import type { FacultyMember } from "@/lib/types";
import { FacultyCard } from "./FacultyCard";

/** Responsive grid of faculty cards: 1 column on phones, 2 on tablets, 3 on desktop. */
export function FacultyGrid({
  members,
  centreNames,
}: {
  members: FacultyMember[];
  /** Slug → campus name, for the campus line on each card. */
  centreNames: Record<string, string>;
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {members.map((member) => (
        <li key={member.id}>
          <FacultyCard
            member={member}
            centreName={member.centreSlug ? centreNames[member.centreSlug] : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
