import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The gold "Super admin" chip (D-044; docs/lead-routing-plan.md §11): CRM header, Admin → Users,
 * settings pages. Text, not colour alone; `title` (e.g. "You are a super admin") is also read out.
 * Server-safe.
 */
export function SuperAdminBadge({ label, title, className }: { label: string; title?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#e3c46a] bg-gold-soft px-2 py-0.5 text-xs font-extrabold text-[#6b4a00]",
        className,
      )}
      title={title}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      {label}
      {title && <span className="sr-only">: {title}</span>}
    </span>
  );
}
