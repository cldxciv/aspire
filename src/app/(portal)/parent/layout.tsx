import { PortalShell } from "@/components/portal/PortalShell";

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return <PortalShell area="parent">{children}</PortalShell>;
}
