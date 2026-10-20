import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { localePath } from "@/i18n/paths";

/**
 * Old address: the admin Content, Centres and Results pages were merged into "What's on the
 * website" (`/admin/website`), which this address redirects to (in the same language).
 */
export default async function AdminContentRedirect() {
  redirect(localePath("/admin/website", await getLocale()));
}
