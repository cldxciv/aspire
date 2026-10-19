import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "dark" | "outline" | "light" | "link";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control border border-transparent font-bold transition " +
  "hover:-translate-y-px disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:translate-y-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-gold text-ink shadow-[0_5px_14px_rgb(245_185_0/0.18)] hover:bg-gold-2",
  dark: "bg-navy text-white hover:bg-navy-2",
  outline: "border-[#b9cbe0] bg-white text-navy hover:border-blue",
  light: "bg-[#edf4ff] text-navy hover:bg-blue-soft",
  link: "px-0! min-h-0! text-blue hover:underline hover:translate-y-0",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 py-2.5 text-sm",
  sm: "min-h-9 px-3 py-2 text-xs",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize };

/** Navigation styled as a button. Use for CTAs that go somewhere. */
export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

/** Action button. Defaults to type="button" so it never submits a form by accident. */
export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
