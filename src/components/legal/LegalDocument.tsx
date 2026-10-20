import type { ReactNode } from "react";
import { Badge, Notice, StickyMediaLayout } from "@/components/ui";
import type { Messages } from "@/i18n/messages/types";
import type { ImageAsset } from "@/lib/types";
import { richText } from "./rich-text";

export type LegalSectionContent = {
  /** Anchor id, e.g. "what-we-collect". */
  id: string;
  title: string;
  body: ReactNode;
};

/** Inline marker for anything Aspire and its legal counsel still have to decide ("To be confirmed", localised). */
export function ToBeConfirmed({ label }: { label: string }) {
  return (
    <Badge variant="warning" className="align-middle">
      {label}
    </Badge>
  );
}

/**
 * Draft legal page body: a prominent draft banner, an "On this page" index and numbered
 * sections in one column, beside a sticky column of calm stock photos on large screens
 * (`StickyMediaLayout`, D-030), so about half of the reading viewport stays visual while the
 * text scrolls. Below `sm` the photos are left out (the page hero already has one), so the
 * draft banner stays near the top. Copy must not name a legal entity, address or
 * jurisdiction until Aspire supplies approved text.
 */
export function LegalDocument({
  sections,
  messages,
  image,
  secondaryImage,
  imageLabel,
}: {
  sections: LegalSectionContent[];
  /** The shared `legal` strings: draft banner, index heading and the "To be confirmed" label. */
  messages: Pick<Messages<"legal">, "draft" | "toc" | "tbc">;
  /** Abstract stock photos (pass them through `localizeImage`); decorative in the sticky column. */
  image: ImageAsset;
  secondaryImage?: ImageAsset;
  imageLabel: string;
}) {
  return (
    <StickyMediaLayout
      image={image}
      secondaryImage={secondaryImage}
      imageLabel={imageLabel}
      className="max-sm:[&>aside]:hidden"
    >
      <Notice variant="warning" title={messages.draft.title}>
        {richText(messages.draft.body, { tbc: messages.tbc })}
      </Notice>

      <nav aria-labelledby="legal-toc-heading" className="mt-8 rounded-card border border-line bg-surface p-5">
        <h2 id="legal-toc-heading" className="text-sm font-extrabold uppercase tracking-wide text-navy">
          {messages.toc}
        </h2>
        <ol className="mt-2 grid list-decimal gap-x-8 pl-5 text-sm sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-flex min-h-11 items-center text-blue hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-9">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
            <h2 id={`${section.id}-heading`} className="text-xl font-extrabold leading-snug tracking-tight text-navy">
              {index + 1}. {section.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </StickyMediaLayout>
  );
}
