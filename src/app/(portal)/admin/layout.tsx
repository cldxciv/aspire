import { PortalShell } from "@/components/portal/PortalShell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <PortalShell area="admin">{children}</PortalShell>;
}
