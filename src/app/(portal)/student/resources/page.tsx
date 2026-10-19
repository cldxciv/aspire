import type { Metadata } from "next";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Student resources",
  description: "Preview of the student study-material area. No learning-resource library is connected yet.",
};

export default function StudentResourcesPage() {
  return (
    <PortalGate area="student" path="/student/resources">
      <PortalPageHeader
        area="student"
        title="Study material"
        description="Notes, practice sets and recordings authorised for your batch will be listed here."
      />
      <PortalPanel id="student-resources-library" title="Your library">
        <NotConnected
          title="No study material connected"
          system="a learning-resource library (LMS) with per-batch access control"
          action={
            <ButtonLink href="/resources" variant="outline">
              Browse public resources
            </ButtonLink>
          }
        >
          Public articles and guides remain available on the main website.
        </NotConnected>
      </PortalPanel>
    </PortalGate>
  );
}
