import type { Metadata } from "next";
import { DemoEnquiriesTable } from "@/components/portal/DemoEnquiriesTable";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("portal");
  return { title: t.admin.enquiries.metaTitle, description: t.admin.enquiries.metaDescription };
}

/**
 * Enquiries are never stored (`GET /api/admin/enquiries` answers 503 `not_configured`), so the
 * live list is an honest "not connected" state. The fictional demo table exists only in preview
 * mode — never alongside a real session.
 */
export default async function AdminEnquiriesPage() {
  const t = await getMessages("portal");
  const e = t.admin.enquiries;
  return (
    <PortalGate area="admin" path="/admin/enquiries">
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            eyebrow={t.areas.admin.label}
            title={e.title}
            description={e.description}
            badge={access.kind === "preview" ? t.blocks.previewBadge : undefined}
          />

          <PortalPanel id="admin-enquiries-live" title={e.liveTitle} className="mb-6">
            <NotConnected title={e.emptyTitle} system={e.system} requiresLabel={t.blocks.requires}>
              {e.body}
            </NotConnected>
          </PortalPanel>

          {access.kind === "preview" && (
            <PortalPanel id="admin-enquiries-demo" title={e.demoTitle} description={e.demoDescription}>
              <DemoEnquiriesTable t={t.demoTable} />
            </PortalPanel>
          )}
        </>
      )}
    </PortalGate>
  );
}
