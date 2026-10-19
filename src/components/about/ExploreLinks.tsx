import { ArrowRight } from "lucide-react";
import { AspireImage, ButtonLink, Card } from "@/components/ui";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";

type ExploreLink = { href: string; title: string; description: string; cta: string; icon: AspireAsset };

// Neutral descriptions of what each page is for — no claims about what it currently lists.
const LINKS: ExploreLink[] = [
  {
    href: "/faculty",
    title: "Faculty",
    description: "Profiles of the teaching team: subjects, academic background and home campus.",
    cta: "Meet the faculty",
    icon: aspireAssets.iconExpertFaculty,
  },
  {
    href: "/hostels",
    title: "Hostels",
    description: "Residential life for students who board: supervision, facilities and the daily routine.",
    cta: "Explore hostels",
    icon: aspireAssets.iconPersonalized,
  },
  {
    href: "/centres",
    title: "Campuses",
    description: "Where Aspire teaches, with addresses, opening hours and the programs at each campus.",
    cta: "Find a campus",
    icon: aspireAssets.iconLearningCentres,
  },
];

/** Links from About to the faculty, hostel and campus pages. */
export function ExploreLinks() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {LINKS.map((link) => (
        <li key={link.href}>
          <Card tint="blue" className="flex h-full flex-col p-5">
            <AspireImage asset={link.icon} className="w-14" rounded />
            <h3 className="mt-3 text-lg font-extrabold text-navy">{link.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{link.description}</p>
            <ButtonLink href={link.href} variant="outline" className="mt-4 self-start">
              {link.cta} <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </Card>
        </li>
      ))}
    </ul>
  );
}
