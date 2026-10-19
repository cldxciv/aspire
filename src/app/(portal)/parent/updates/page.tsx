import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Parent updates",
  description: "Preview of parent announcements. No announcements system is connected yet.",
};

export default function ParentUpdatesPage() {
  return (
    <PortalGate area="parent" path="/parent/updates">
      <PortalPageHeader
        area="parent"
        title="Updates"
        description="Announcements relevant to your linked learners will appear here."
      />
      <PortalPanel id="parent-updates-feed" title="Announcements">
        <NotConnected title="No announcements connected" system="Aspire's announcements / messaging system">
          Updates will be limited to the batches and centres of learners linked to your account.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
