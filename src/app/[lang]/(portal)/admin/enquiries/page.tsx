import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { localePath } from "@/i18n/paths";
import { CRM_HOME } from "@/lib/auth/paths";

/**
 * Old address of the admin "Enquiries" page. Every website and tool enquiry is stored as a CRM
 * lead (ENQUIRY_STORE=crm, D-039), so the Enquiries inbox (`/crm`) is the one enquiry list; this
 * address redirects there (in the same language). `/crm` checks access itself.
 */
export default async function AdminEnquiriesRedirect() {
  redirect(localePath(CRM_HOME, await getLocale()));
}
