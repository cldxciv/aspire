import { aspireAssets } from "@/content/aspire-assets";
import type { InstituteProfile } from "@/lib/types";
import { Art } from "./Art";

type FounderMessageContent = NonNullable<InstituteProfile["founderMessage"]>;

/** Founder's message as a quotation. Decorative quote mark only — no person image beside a real name. */
export function FounderMessage({ message }: { message: FounderMessageContent }) {
  return (
    <figure className="rounded-card border border-line bg-linear-to-br from-[#f1f7ff] to-white p-6 shadow-soft md:p-9">
      <Art asset={aspireAssets.quoteIcon} className="block w-12" />
      <blockquote className="mt-3 max-w-3xl">
        <p className="text-xl font-extrabold leading-snug text-navy md:text-2xl">{message.headline}</p>
        {message.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mt-3 text-muted">
            {paragraph}
          </p>
        ))}
      </blockquote>
      <figcaption className="mt-5 border-t border-line pt-4 text-sm font-bold text-navy">
        {message.attribution}
      </figcaption>
    </figure>
  );
}
