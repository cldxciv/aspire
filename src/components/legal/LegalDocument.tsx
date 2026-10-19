import type { ReactNode } from "react";
import { Badge, Notice } from "@/components/ui";

export type LegalSectionContent = {
  /** Anchor id, e.g. "what-we-collect". */
  id: string;
  title: string;
  body: ReactNode;
};

/** Inline marker for anything Aspire and its legal counsel still have to decide. */
export function ToBeConfirmed({ children = "To be confirmed" }: { children?: ReactNode }) {
  return (
    <Badge variant="warning" className="align-middle">
      {children}
    </Badge>
  );
}

/**
 * Draft legal page body: a prominent draft banner, an "On this page" index and
 * numbered sections. Copy must not name a legal entity, address or jurisdiction
 * until Aspire supplies approved text.
 */
export function LegalDocument({ sections, intro }: { sections: LegalSectionContent[]; intro?: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Notice variant="warning" title="Draft — pending review by Aspire and legal counsel">
        This page is a working draft. It has not been approved and will change before the website is published.
        Items marked &ldquo;To be confirmed&rdquo; are still open.
      </Notice>

      {intro && <div className="mt-6 text-muted">{intro}</div>}

      <nav aria-labelledby="legal-toc-heading" className="mt-6 rounded-card border border-line bg-surface p-5">
        <h2 id="legal-toc-heading" className="text-sm font-extrabold uppercase tracking-wide text-navy">
          On this page
        </h2>
        <ol className="mt-2 grid list-decimal gap-x-6 pl-5 text-sm sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-flex min-h-11 items-center text-blue hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-9">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
            <h2 id={`${section.id}-heading`} className="text-xl font-extrabold tracking-tight text-navy">
              {index + 1}. {section.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
