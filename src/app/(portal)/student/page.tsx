import { BookOpen, CalendarDays, LifeBuoy, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { PortalPageHeader, PortalPanel, QuickLinks, StatTiles } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Student portal",
  description: "Preview of the Aspire student portal. No student accounts or academic records are connected yet.",
};

export default function StudentOverviewPage() {
  return (
    <PortalGate area="student" path="/student">
      <PortalPageHeader
        area="student"
        title="Welcome to your learning space"
        description="A preview of the student dashboard layout. No student account, course or academic record is connected."
      />

      <StatTiles
        area="student"
        label="Your summary"
        tiles={[
          { label: "My program", value: "Not connected", note: "Shown once enrolment records are linked" },
          { label: "Upcoming activity", value: "—", note: "Awaiting live schedule" },
          { label: "Progress", value: "—", note: "No academic data" },
        ]}
      />

      <PortalPanel
        id="student-quick-links"
        title="Quick links"
        description="Each area stays empty until the system behind it is connected."
      >
        <QuickLinks
          area="student"
          links={[
            {
              title: "Timetable",
              description: "Your verified batch schedule, once connected.",
              href: "/student/timetable",
              icon: CalendarDays,
            },
            {
              title: "Resources",
              description: "Notes and study material authorised for your batch.",
              href: "/student/resources",
              icon: BookOpen,
            },
            {
              title: "Progress",
              description: "Test results appear only after the test system is integrated.",
              href: "/student/progress",
              icon: TrendingUp,
            },
            {
              title: "Contact Aspire",
              description: "Questions about classes or enrolment go to the Aspire team.",
              href: "/contact",
              icon: LifeBuoy,
            },
          ]}
        />
      </PortalPanel>

      <Notice className="mt-6" title="Not a live learning system">
        This preview has no sign-in, grades, attendance or course access. Nothing shown here is about a real student.
      </Notice>
    </PortalGate>
  );
}
