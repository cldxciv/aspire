import { getCentre, getCentres, STATIC_PARAM_FALLBACK } from "@/lib/data";
import { apiItem, notFoundResponse } from "@/lib/server/http";
import { slugSchema } from "@/lib/server/public-content";

/**
 * GET /api/centres/[slug]
 * Visible centres are prerendered at build time. generateStaticParams must
 * return ≥1 entry under Cache Components, so the STATIC_PARAM_FALLBACK
 * sentinel (which resolves to a 404) is used when no centre is visible.
 * Unknown slugs render at request time and return 404.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = (await getCentres()).map((centre) => centre.slug);
  return (slugs.length > 0 ? slugs : [STATIC_PARAM_FALLBACK]).map((slug) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const centre = slugSchema.safeParse(slug).success ? await getCentre(slug) : null;
  if (!centre) return notFoundResponse("Centre not found.");
  return apiItem(centre);
}
