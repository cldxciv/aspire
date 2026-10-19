import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

/** "P. K. Thakur" → "PT", "Saransh" → "S". Letters only; honorifics are not part of `name`. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

const sizes = {
  sm: "size-9 text-xs",
  md: "size-12 text-sm",
  lg: "size-16 text-lg",
} as const;

/**
 * Initials avatar for people shown by name (faculty, results). Never a photo:
 * person images must not appear beside real names (D-019). Decorative — the
 * name is always rendered as text next to it. Without a name (consent not
 * given), a neutral person icon is shown instead of initials.
 */
export function InitialsAvatar({
  name,
  size = "md",
  className,
}: {
  name?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const text = name ? initialsOf(name) : "";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-full bg-blue-soft font-extrabold tracking-wide text-[#0755b5] ring-1 ring-[#cfe0f7]",
        sizes[size],
        className,
      )}
    >
      {text || <UserRound className="size-1/2" />}
    </span>
  );
}
