import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "info" | "demo" | "success" | "warning" | "neutral";

const badgeVariants: Record<BadgeVariant, string> = {
  info: "bg-blue-soft text-[#0755b5]",
  demo: "border border-dashed border-[#d9b64a] bg-gold-soft text-[#7a5600]",
  success: "bg-success-soft text-[#14744d]",
  warning: "bg-[#fff3d2] text-[#8b5b00]",
  neutral: "bg-surface text-muted",
};

/** Small uppercase label/tag. Status is conveyed by text, not colour alone. */
export function Badge({
  variant = "info",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Required on every placeholder record rendered in the UI (D-005). */
export function DemoBadge({ label = "Demo · pending verification", className }: { label?: string; className?: string }) {
  return (
    <Badge variant="demo" className={className}>
      {label}
    </Badge>
  );
}

export type NoticeVariant = "info" | "warning" | "success" | "error";

const noticeStyles: Record<NoticeVariant, { box: string; Icon: typeof Info }> = {
  info: { box: "border-[#d7e7fb] bg-[#eef5ff] text-[#315475]", Icon: Info },
  warning: { box: "border-[#f2dfa0] bg-gold-soft text-[#5c4a12]", Icon: AlertTriangle },
  success: { box: "border-[#bfe5cf] bg-success-soft text-[#0f5a3c]", Icon: CheckCircle2 },
  error: { box: "border-[#f5c2bd] bg-danger-soft text-danger", Icon: XCircle },
};

/**
 * Inline message panel. For dynamic status (form results) pass role="status" or
 * role="alert" so screen readers announce it.
 */
export function Notice({
  variant = "info",
  title,
  role,
  className,
  children,
}: {
  variant?: NoticeVariant;
  title?: string;
  role?: "status" | "alert" | "note";
  className?: string;
  children: ReactNode;
}) {
  const { box, Icon } = noticeStyles[variant];
  return (
    <div role={role ?? "note"} className={cn("flex gap-3 rounded-control border p-3 text-sm", box, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-bold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Honest empty state for lists with no verified records. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-control border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-6 text-center", className)}>
      <p className="font-bold text-navy">{title}</p>
      {description && <div className="mx-auto mt-1 max-w-prose text-sm text-muted">{description}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Stand-in for a photo that has not been supplied/approved yet. Clearly labelled
 * so it is never mistaken for final imagery. Track required assets in docs/content-verification.md.
 */
export function ImagePlaceholder({
  label,
  className,
  tone = "light",
}: {
  /** What the real image should show, e.g. "Classroom with faculty teaching". */
  label: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      role="img"
      aria-label={`Image placeholder: ${label}`}
      className={cn(
        "flex aspect-4/3 items-end overflow-hidden rounded-card border border-dashed p-3",
        tone === "light"
          ? "border-[#cbd8e7] bg-linear-to-br from-[#e9f3ff] to-[#f9fcff] text-muted"
          : "border-white/30 bg-white/10 text-white/80",
        className,
      )}
    >
      <span className="text-xs font-semibold">Photo needed · {label}</span>
    </div>
  );
}
