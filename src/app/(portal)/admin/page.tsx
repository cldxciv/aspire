import { FileText, Inbox, MapPin, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { PortalPageHeader, PortalPanel, QuickLinks, StatTiles } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Staff admin",
  description: "Preview of the Aspire staff admin dashboard. No enquiries, applications or metrics are loaded.",
};

export default function AdminOverviewPage() {
  return (
    <PortalGate area="admin" path="/admin">
      <PortalPageHeader
        area="admin"
        title="Admissions overview"
        description="Operations dashboard for authorised Aspire staff. No enquiries, applications or metrics are loaded in this preview."
      />

      <StatTiles
        area="admin"
        label="Admissions metrics"
        tiles={[
          { label: "New enquiries" },
          { label: "Applications in review" },
          { label: "Follow-ups due" },
        ]}
      />

      <PortalPanel id="admin-areas" title="Admin areas">
        <QuickLinks
          area="admin"
          links={[
            {
              title: "Enquiries",
              description: "Website enquiries, once an enquiry store is connected.",
              href: "/admin/enquiries",
              icon: Inbox,
            },
            {
              title: "Content",
              description: "Programs, FAQs and articles, once a CMS is connected.",
              href: "/admin/content",
              icon: FileText,
            },
            {
              title: "Centres",
              description: "Verified centre details for the public directory.",
              href: "/admin/centres",
              icon: MapPin,
            },
            {
              title: "Results",
              description: "Verified, consented results only.",
              href: "/admin/results",
              icon: Trophy,
            },
          ]}
        />
      </PortalPanel>

      <Notice variant="warning" className="mt-6" title="Required before go-live">
        A connected identity provider, role-based permissions, audit logs for every change, server-side validation and
        integration testing. None of these exist yet, so nothing here can view or change real records.
      </Notice>
    </PortalGate>
  );
}
