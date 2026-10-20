import { ExternalLink } from "lucide-react";
import { buttonClasses, DemoBadge } from "@/components/ui";
import type { SocialLink } from "@/lib/types";
import { socialHref } from "./contact-links";

/**
 * Social profiles as plain outbound links: no embeds, widgets or tracking parameters,
 * and `rel="noreferrer"` so no referrer is sent. Links that fail validation are skipped.
 */
export function SocialLinks({
  links,
  title,
  demoLabel,
}: {
  links: SocialLink[];
  title: string;
  /** DEMO badge label (localised) for placeholder links; omitted for verified content. */
  demoLabel?: string;
}) {
  const items = links.flatMap((link) => {
    const href = socialHref(link.url);
    return href ? [{ ...link, href }] : [];
  });
  if (items.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold text-navy">{title}</h3>
        {demoLabel && <DemoBadge label={demoLabel} />}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((link) => (
          <li key={link.platform}>
            <a href={link.href} rel="noopener noreferrer" className={buttonClasses({ variant: "light" })}>
              {link.label}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
