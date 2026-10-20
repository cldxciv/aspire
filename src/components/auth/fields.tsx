"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import type { Messages } from "@/i18n/messages/types";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";

export const inputClasses =
  "min-h-11 w-full rounded-control border bg-white px-3 py-2 text-[15px] text-ink placeholder:text-[#8a99ad] " +
  "disabled:cursor-not-allowed disabled:bg-[#f4f7fb]";

/** Ids of a field's hint and error, for `aria-describedby`. */
export function describedBy(id: string, hint: boolean, error: boolean): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/**
 * Label, optional hint and error message around one input. The input itself gets
 * `aria-invalid` + `aria-describedby` from the caller (see `describedBy`).
 */
export function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold text-navy">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type TextInputProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function TextField({ id, label, hint, error, className, inputRef, ...input }: TextInputProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        ref={inputRef}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(hint), Boolean(error))}
        className={cn(inputClasses, error ? "border-danger" : "border-[#b9cbe0]")}
        {...input}
      />
    </FieldShell>
  );
}

/**
 * Password input with a show/hide toggle. The value never leaves component state except in
 * the request body the parent form sends; it is never logged or stored.
 */
export function PasswordField({
  id,
  label,
  hint,
  error,
  toggle,
  className,
  inputRef,
  ...input
}: TextInputProps & { toggle: Messages<"auth">["passwordToggle"] }) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(hint), Boolean(error))}
          className={cn(inputClasses, "pr-24", error ? "border-danger" : "border-[#b9cbe0]")}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-controls={id}
          aria-label={format(visible ? toggle.hideField : toggle.showField, { field: label })}
          className="absolute inset-y-1 right-1 inline-flex min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-navy hover:bg-surface"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          <span aria-hidden="true">{visible ? toggle.hide : toggle.show}</span>
        </button>
      </div>
    </FieldShell>
  );
}
