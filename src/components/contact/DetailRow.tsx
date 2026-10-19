import type { ReactNode } from "react";

/**
 * Link style for contact values: an inline block with vertical padding gives a ≥44px tap
 * target, and long emails wrap instead of overflowing narrow screens.
 */
export const CONTACT_LINK_CLASS = "inline-block py-2.5 [overflow-wrap:anywhere] hover:underline";

/** One labelled contact detail (icon + <dt>/<dd>); render inside a <dl>. */
export function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-blue-soft text-blue">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="break-words font-semibold text-navy">{children}</dd>
      </div>
    </div>
  );
}
