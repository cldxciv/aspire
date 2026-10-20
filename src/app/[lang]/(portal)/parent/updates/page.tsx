import type { Metadata } from "next";
import { ParentUpdates } from "@/components/portal/ParentViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.parent.updatesPage.metaTitle, description: t.parent.updatesPage.metaDescription };
}

export default async function ParentUpdatesPage() {
  const t = await getMessages("portal");
  return (
    <PortalGate area="parent" path="/parent/updates">
      {(access) => <ParentUpdates preview={access.kind === "preview"} t={t} />}
    </PortalGate>
  );
}
