import { PortalShell } from "@/components/portal/PortalShell";

export default function StudentLayout({ children }: LayoutProps<"/[lang]/student">) {
  return <PortalShell area="student">{children}</PortalShell>;
}
