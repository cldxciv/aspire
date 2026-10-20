import type { Metadata } from "next";
import { ComingView } from "@/components/portal/ConsoleViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.coming.metaTitle, description: t.admin.coming.metaDescription };
}

/** "What's coming": every planned console page and feature by phase (`console-roadmap.ts`). */
export default async function AdminComingPage() {
  const t = await getMessages("portal");
  return (
    <PortalGate area="admin" path="/admin/coming">
      {(access) => <ComingView preview={access.kind === "preview"} t={t} />}
    </PortalGate>
  );
}
