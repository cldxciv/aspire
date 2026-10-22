import { Lock, PencilLine } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CrmMessages } from "../format";
import { SuperAdminBadge } from "../SuperAdminBadge";

/**
 * The line every CRM settings page shows under its title (docs/lead-routing-plan.md §11): a super
 * admin reads "You can change these settings" with the gold chip; everyone else "Read-only: only a
 * super admin can change this". The server enforces the same rule on every write.
 */
export function ReadOnlyNotice({
  canEdit,
  t,
  className,
}: {
  canEdit: boolean;
  t: Pick<CrmMessages, "superAdmin">;
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "mb-5 flex flex-wrap items-center gap-2 rounded-control border px-3 py-2 text-sm font-semibold",
        canEdit ? "border-[#e3c46a] bg-[#fffbeb] text-[#5c4a12]" : "border-line bg-[#f4f7fb] text-[#354b66]",
        className,
      )}
    >
      {canEdit ? (
        <>
          <SuperAdminBadge label={t.superAdmin.badge} />
          <PencilLine aria-hidden="true" className="size-4" />
          {t.superAdmin.canEdit}
        </>
      ) : (
        <>
          <Lock aria-hidden="true" className="size-4" />
          {t.superAdmin.readOnly}
        </>
      )}
    </p>
  );
}
