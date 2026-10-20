import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/PortalShell";

/** Staff admissions workspace (D-037 – D-042): counsellors, centre managers and admins. */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="staff">{children}</PortalShell>;
}
