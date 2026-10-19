import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Learner progress",
  description:
    "Preview of learner progress for parents. Only learners linked to a parent account and authorised by Aspire will ever be shown.",
};

export default function ParentProgressPage() {
  return (
    <PortalGate area="parent" path="/parent/progress">
      <PortalPageHeader
        area="parent"
        title="Learner progress"
        description="Progress for each learner linked to your account and authorised by Aspire."
      />
      <PortalPanel id="parent-progress-learners" title="Linked learners">
        <NotConnected
          title="No progress data"
          system="Aspire's student-information and assessment systems, plus verified parent–learner links"
        >
          You will only ever see progress for learners linked to your account. Requests for any other learner are
          refused by the server.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
