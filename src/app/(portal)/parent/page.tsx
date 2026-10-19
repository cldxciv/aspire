import { LifeBuoy, Megaphone, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel, QuickLinks, StatTiles } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Parent portal",
  description:
    "Preview of the Aspire parent portal. Parents will only ever see learners linked to their account and authorised by Aspire.",
};

export default function ParentOverviewPage() {
  return (
    <PortalGate area="parent" path="/parent">
      <PortalPageHeader
        area="parent"
        title="Your child's learning journey"
        description="A parent account will show only learners that Aspire has linked to it and authorised you to see. No learner is linked in this preview."
      />

      <StatTiles
        area="parent"
        label="Linked learner summary"
        tiles={[
          { label: "Linked learners", value: "None linked", note: "Aspire links learners after verification" },
          { label: "Attendance", value: "—", note: "No live data" },
          { label: "Progress", value: "—", note: "No live data" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <PortalPanel id="parent-learner-overview" title="Learner overview">
          <NotConnected
            title="No learners linked"
            system="Aspire's student-information system with verified parent–learner links"
          >
            Each link is confirmed by Aspire before any record is shared, and access is checked again on every request.
          </NotConnected>
        </PortalPanel>

        <PortalPanel id="parent-support" title="Parent support">
          <QuickLinks
            area="parent"
            links={[
              {
                title: "Updates",
                description: "Announcements for your linked learners' batches.",
                href: "/parent/updates",
                icon: Megaphone,
              },
              {
                title: "Progress",
                description: "Authorised progress information, once connected.",
                href: "/parent/progress",
                icon: TrendingUp,
              },
              {
                title: "Contact Aspire",
                description: "Ask about schedules, programs or student support.",
                href: "/contact",
                icon: LifeBuoy,
              },
            ]}
          />
        </PortalPanel>
      </div>

      <Notice className="mt-6" title="Access is limited to linked, authorised learners">
        You will never see another family&apos;s records. Fee statements will only be shown from Aspire&apos;s approved
        billing system once it is connected.
      </Notice>
    </PortalGate>
  );
}
