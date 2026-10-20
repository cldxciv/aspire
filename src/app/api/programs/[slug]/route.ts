import { getProgram, getProgramSlugs } from "@/lib/data";
import { apiItem, notFoundResponse } from "@/lib/server/http";
import { slugSchema, withoutInternalFields } from "@/lib/server/public-content";

/**
 * GET /api/programs/[slug]
 * Known slugs are prerendered at build time (Cache Components +
 * generateStaticParams; must return ≥1 entry — getProgramSlugs() guarantees
 * it). Unknown slugs render at request time and return 404. Placeholder
 * visibility therefore follows the build-time environment, like the pages.
 */
export function generateStaticParams(): { slug: string }[] {
  return getProgramSlugs().map((slug) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const program = slugSchema.safeParse(slug).success ? await getProgram(slug) : null;
  if (!program) return notFoundResponse("Program not found.");
  return apiItem(withoutInternalFields(program));
}
