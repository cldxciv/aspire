import { ArrowRight } from "lucide-react";
import { Art } from "@/components/about/Art";
import { ButtonLink, Card, DemoBadge, Notice } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import type { Messages } from "@/i18n/messages/types";
import type { Milestone } from "@/lib/types";

/**
 * Scholarship information taken from the institute profile (its scholarship milestones).
 * Always paired with the reminder that eligibility and amounts are confirmed by Aspire.
 *
 * `surface="dark"` renders the same content without the gold card, for a dark photo panel
 * (`PhotoPanel`, D-030): white text, gold accents and a gold button.
 */
export function ScholarshipPanel({
  headingId,
  items,
  messages,
  demoLabel,
  surface = "card",
}: {
  headingId: string;
  items: Milestone[];
  messages: Messages<"admissions">["scholarships"];
  /** DEMO badge label (localised) for placeholder content; omitted for verified content. */
  demoLabel?: string;
  surface?: "card" | "dark";
}) {
  const dark = surface === "dark";
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id={headingId}
            className={
              dark
                ? "text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-snug tracking-tight text-white"
                : "text-2xl font-extrabold leading-snug tracking-tight text-navy"
            }
          >
            {messages.title}
          </h2>
          {demoLabel && <DemoBadge label={demoLabel} className="mt-2" />}
        </div>
        {!dark && <Art asset={aspireAssets.medalAchievement} className="block w-24 shrink-0" rounded />}
      </div>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={`${item.year}-${item.title}`}>
            <span className={dark ? "text-sm font-extrabold text-gold" : "text-sm font-extrabold text-blue"}>
              {item.year}
            </span>
            <h3 className={dark ? "font-extrabold leading-snug text-white" : "font-extrabold leading-snug text-navy"}>
              {item.title}
            </h3>
            <p className={dark ? "mt-1 text-sm text-[#dbe8f7]" : "mt-1 text-sm text-muted"}>{item.description}</p>
          </li>
        ))}
      </ul>
      <Notice variant="warning" className="mt-5">
        {messages.notice}
      </Notice>
      <ButtonLink href="#enquiry" variant={dark ? "primary" : "dark"} className="mt-5">
        {messages.ask} <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </>
  );

  return dark ? (
    content
  ) : (
    <Card tint="gold" className="p-5 md:p-7">
      {content}
    </Card>
  );
}
