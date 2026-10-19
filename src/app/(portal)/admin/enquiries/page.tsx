import type { Metadata } from "next";
import { DemoEnquiriesTable } from "@/components/portal/DemoEnquiriesTable";
import { NotConnected, PortalPageHeader, PortalPanel } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";

export const metadata: Metadata = {
  title: "Enquiries admin",
  description: "Preview of the staff enquiry list. No enquiry store is connected; the table shown is a local demo.",
};

export default function AdminEnquiriesPage() {
  return (
    <PortalGate area="admin" path="/admin/enquiries">
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            title="Enquiries"
            description="Enquiries submitted through the website will be listed here once an enquiry store is connected."
          />

          <PortalPanel id="admin-enquiries-live" title="Live enquiries" className="mb-6">
            <NotConnected
              title="No enquiry store connected"
              system="an enquiry store or CRM with staff permissions and audit logging"
            >
              This website does not store enquiries, so none can be listed here yet.
            </NotConnected>
          </PortalPanel>

          {/* The local demo exists only in preview mode — never alongside a real session. */}
          {access.kind === "preview" && (
            <PortalPanel
              id="admin-enquiries-demo"
              title="Table layout demo"
              description="For reviewing the interface only. Rows are fictional and changes stay in this browser tab."
            >
              <DemoEnquiriesTable />
            </PortalPanel>
          )}
        </>
      )}
    </PortalGate>
  );
}
