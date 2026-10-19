import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Student timetable",
  description: "Preview of the student timetable. No batch schedule is connected yet.",
};

export default function StudentTimetablePage() {
  return (
    <PortalGate area="student" path="/student/timetable">
      <PortalPageHeader
        area="student"
        title="Timetable"
        description="Your batch schedule will appear here once Aspire connects it."
      />
      <PortalPanel id="student-timetable-week" title="This week">
        <NotConnected title="No timetable connected" system="Aspire's batch timetable / scheduling system">
          Only schedules verified by Aspire for your batch will be shown. Until then, please confirm class times with
          your centre.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
