import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Content admin",
  description: "Preview of staff content management. No content management system is connected yet.",
};

export default function AdminContentPage() {
  return (
    <PortalGate area="admin" path="/admin/content">
      <PortalPageHeader
        area="admin"
        title="Content"
        description="Programs, FAQs and resource articles will be edited here once a content system is connected."
      />
      <PortalPanel id="admin-content-library" title="Content library">
        <NotConnected
          title="No content management connected"
          system="a content management system (CMS) with a draft → review → publish workflow"
        >
          Site content currently comes from placeholder files in the codebase and is marked DEMO on the website until
          Aspire verifies it.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
