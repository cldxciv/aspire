import Image from "next/image";
import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";

/**
 * Sign-in / account page layout (D-030): copy and a white form card on the left, a licensed
 * stock photo filling the right half on `lg+` (stacked under the card on smaller screens),
 * with a visible label and an optional navy note over the photo. Renders the page's only <h1>.
 * Never pass a person photo when the card can show a real name (signed-in panels do).
 */
export function AuthSplit({
  eyebrow,
  title,
  lead,
  notice,
  image,
  imageLabel,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  /** Shown between the lead and the card (e.g. "sign in to continue"). */
  notice?: ReactNode;
  image: ImageAsset;
  imageLabel: string;
  /** Short note shown over (lg) or under (mobile) the photo. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface">
      <Container className="grid gap-8 py-8 md:py-12 lg:grid-cols-2 lg:gap-12 lg:py-14">
        <div className="min-w-0">
          {eyebrow && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{eyebrow}</p>}
          <h1 className="font-serif text-[clamp(2rem,4.5vw,2.75rem)] font-semibold leading-tight text-navy">{title}</h1>
          {lead && <p className="mt-2.5 max-w-xl text-muted">{lead}</p>}
          {notice && <div className="mt-4 max-w-xl">{notice}</div>}
          <div data-surface="light" className="mt-6 rounded-card border border-line bg-white p-5 shadow-card md:p-7">
            {children}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:relative lg:block lg:min-h-[32rem]">
          <figure className="relative m-0 aspect-16/10 overflow-hidden rounded-card bg-navy shadow-card lg:absolute lg:inset-0 lg:aspect-auto">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              preload
              sizes="(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw"
              className="object-cover"
            />
            <figcaption className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {imageLabel}
            </figcaption>
          </figure>
          {aside && (
            <div
              data-surface="dark"
              className="rounded-card bg-navy p-5 text-white shadow-card lg:absolute lg:inset-x-4 lg:bottom-4 lg:bg-navy/90 lg:backdrop-blur-sm"
            >
              {aside}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
