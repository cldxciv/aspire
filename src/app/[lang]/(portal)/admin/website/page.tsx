import type { Metadata } from "next";
import { WebsiteStatusView } from "@/components/portal/ConsoleViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getWebsiteInventory } from "@/components/portal/website-inventory";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.website.metaTitle, description: t.admin.website.metaDescription };
}

/**
 * "What's on the website" (replaces the old Content, Centres and Results pages, which redirect
 * here): counts of what the public site shows right now, read through `src/lib/data.ts` after the
 * access check. The counts describe public pages only (no personal details), so the data-free
 * preview shows them too.
 */
export default async function AdminWebsitePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("portal")]);
  return (
    <PortalGate area="admin" path="/admin/website">
      {(access) => <WebsiteStatus preview={access.kind === "preview"} locale={locale} t={t} />}
    </PortalGate>
  );
}

async function WebsiteStatus({ preview, locale, t }: { preview: boolean; locale: Locale; t: Messages<"portal"> }) {
  return <WebsiteStatusView inventory={await getWebsiteInventory()} preview={preview} locale={locale} t={t} />;
}
