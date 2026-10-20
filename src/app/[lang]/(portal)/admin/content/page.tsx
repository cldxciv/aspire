import type { Metadata } from "next";
import { AdminSection } from "@/components/portal/AdminViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.content.metaTitle, description: t.admin.content.metaDescription };
}

export default async function AdminContentPage() {
  const t = await getMessages("portal");
  return (
    <PortalGate area="admin" path="/admin/content">
      {(access) => <AdminSection section="content" preview={access.kind === "preview"} t={t} />}
    </PortalGate>
  );
}
