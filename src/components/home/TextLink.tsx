import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Mockup `.textlink`: bold blue link with a trailing arrow. Min 44px tall for touch. */
export function TextLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-blue hover:underline",
        className,
      )}
      {...props}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
