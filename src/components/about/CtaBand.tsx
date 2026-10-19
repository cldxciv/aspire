import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import type { AspireAsset } from "@/content/aspire-assets";
import { cn } from "@/lib/cn";
import { Art } from "./Art";

/** Closing call-to-action band (mockup `.cta`): enquiry first, contact second. */
export function CtaBand({
  id = "cta-heading",
  title = "Ready to take your next step?",
  description = "Talk to the academic team and explore the right program for your goals.",
  art,
  className,
}: {
  id?: string;
  title?: string;
  description?: string;
  /** Optional decorative illustration (never a person image — this band sits beside no names, keep it that way). */
  art?: AspireAsset;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:flex-row md:items-center md:justify-between md:p-8",
        className,
      )}
    >
      <div className="flex items-center gap-5">
        {art && <Art asset={art} className="hidden w-28 shrink-0 sm:block" rounded />}
        <div>
          <h2 id={id} className="text-2xl font-extrabold tracking-tight text-navy md:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-muted">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <ButtonLink href="/admissions#enquiry">
          Enquire now <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
        <ButtonLink href="/contact" variant="outline">
          Contact Aspire
        </ButtonLink>
      </div>
    </div>
  );
}
