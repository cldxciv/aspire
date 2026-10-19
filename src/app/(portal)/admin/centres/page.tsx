import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Centres admin",
  description: "Preview of staff centre management. No centre records source is connected yet.",
};

export default function AdminCentresPage() {
  return (
    <PortalGate area="admin" path="/admin/centres">
      <PortalPageHeader
        area="admin"
        title="Centres"
        description="Verified centre details for the public directory will be managed here."
      />
      <PortalPanel id="admin-centres-directory" title="Centre directory">
        <NotConnected
          title="No centre records connected"
          system="a centre records source (CMS or operations database) with verified addresses and contact details"
        >
          Centre addresses, phone numbers and opening hours stay hidden on the public site until Aspire verifies them.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
