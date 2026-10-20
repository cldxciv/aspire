import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("common");
  return { title: t.notFound.metaTitle };
}

/** notFound() inside (site) pages — header, <main> and footer come from the (site) layout. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
