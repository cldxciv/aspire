import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";

export const metadata: Metadata = { title: "Page not found" };

/** notFound() inside (site) pages — header, <main> and footer come from the (site) layout. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
