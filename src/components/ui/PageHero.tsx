import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "./Layout";

export type Crumb = { label: string; href?: string };

/** Interior-page hero with breadcrumbs (Home is prepended automatically). Renders the page's only <h1>. */
export function PageHero({
  title,
  lead,
  crumbs = [],
  children,
}: {
  title: string;
  lead?: ReactNode;
  /** Trail after Home; the last item is the current page and should omit href. */
  crumbs?: Crumb[];
  children?: ReactNode;
}) {
  const trail: Crumb[] = [{ label: "Home", href: "/" }, ...crumbs];
  return (
    <div className="bg-linear-to-r from-navy to-[#1b5b9b] py-9 text-white md:py-12">
      <Container>
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-[#b9d3f3]">
          <ol className="flex flex-wrap items-center gap-1.5">
            {trail.map((crumb, i) => {
              const last = i === trail.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="hover:text-white hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                  )}
                  {!last && <span aria-hidden="true">/</span>}
                </li>
              );
            })}
          </ol>
        </nav>
        <h1 className="text-[clamp(2rem,4.5vw,2.625rem)] font-extrabold leading-tight tracking-tight">{title}</h1>
        {lead && <div className="mt-2.5 max-w-3xl text-[#dbe8f7]">{lead}</div>}
        {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
      </Container>
    </div>
  );
}
