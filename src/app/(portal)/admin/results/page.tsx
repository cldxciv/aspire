import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Results admin",
  description: "Preview of staff results management. No verified results register is connected yet.",
};

export default function AdminResultsPage() {
  return (
    <PortalGate area="admin" path="/admin/results">
      <PortalPageHeader
        area="admin"
        title="Results"
        description="Verified, consented results for the public results archive will be managed here."
      />
      <PortalPanel id="admin-results-register" title="Results register">
        <NotConnected
          title="No results register connected"
          system="a verified results register with source evidence and written consent records"
        >
          Results, ranks and student names are published only with source evidence and consent. None are loaded.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
