import type { Metadata } from "next";
import { AdminSection } from "@/components/portal/AdminViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.centres.metaTitle, description: t.admin.centres.metaDescription };
}

export default async function AdminCentresPage() {
  const t = await getMessages("portal");
  return (
    <PortalGate area="admin" path="/admin/centres">
      {(access) => <AdminSection section="centres" preview={access.kind === "preview"} t={t} />}
    </PortalGate>
  );
}
