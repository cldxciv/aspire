import type { Metadata } from "next";
import { AdminSection } from "@/components/portal/AdminViews";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.results.metaTitle, description: t.admin.results.metaDescription };
}

export default async function AdminResultsPage() {
  const t = await getMessages("portal");
  return (
    <PortalGate area="admin" path="/admin/results">
      {(access) => <AdminSection section="results" preview={access.kind === "preview"} t={t} />}
    </PortalGate>
  );
}
