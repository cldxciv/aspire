import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { ButtonLink, Card } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { localizeImage } from "@/lib/data";
import type { ImageAsset } from "@/lib/types";

type ExploreLink = {
  href: string;
  title: string;
  description: string;
  cta: string;
  image: ImageAsset;
};

/**
 * Links from About to the hostel and campus pages (faculty pages were removed 2026-10-20), each
 * with a labelled stock photo (D-030). The photos are generic (an evening study desk, a hill road):
 * decorative here and never presented as an Aspire hostel or campus.
 */
export function ExploreLinks({
  messages,
  locale,
  photoLabel,
}: {
  messages: Messages<"about">["explore"];
  locale: Locale;
  /** Visible label on each photo ("Illustrative stock photo"). */
  photoLabel: string;
}) {
  // Neutral descriptions of what each page is for — no claims about what it currently lists.
  const links: ExploreLink[] = [
    {
      href: "/hostels",
      ...messages.hostels,
      image: localizeImage(stockImages.deskLampEvening, locale),
    },
    {
      href: "/centres",
      ...messages.centres,
      image: localizeImage(stockImages.hillRoadBarot, locale),
    },
  ];

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <Card tint="blue" className="flex h-full flex-col">
            <div className="relative aspect-16/10 bg-surface">
              <Image
                src={link.image.src}
                alt=""
                fill
                sizes="(min-width: 1200px) 580px, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
              <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                {photoLabel}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-lg font-extrabold text-navy">{link.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{link.description}</p>
              <ButtonLink href={localePath(link.href, locale)} variant="outline" className="mt-4 self-start">
                {link.cta} <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
