import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Student progress",
  description: "Preview of the student progress area. No test or attendance data is connected yet.",
};

export default function StudentProgressPage() {
  return (
    <PortalGate area="student" path="/student/progress">
      <PortalPageHeader
        area="student"
        title="Progress"
        description="Test scores and attendance will appear here once the source systems are connected."
      />
      <PortalPanel id="student-progress-results" title="Test results and attendance">
        <NotConnected title="No academic data" system="Aspire's test & assessment platform and attendance records">
          Scores, ranks and attendance are shown only after integration and verification. Nothing here is estimated or
          sample data.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
