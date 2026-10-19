import { CircleAlert } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Internal form primitives for EnquiryForm (mockup `.field`). Every control:
 * - has a visible <label>,
 * - exposes required state via aria-required (the form uses noValidate so zod drives validation),
 * - links hint + error text via aria-describedby and sets aria-invalid when in error.
 */

const controlBase =
  "w-full min-h-11 rounded-lg border px-3 py-2.5 text-[15px] text-ink transition-colors " +
  "placeholder:text-[#7b8ba0] focus:border-blue";

function controlClasses(invalid: boolean) {
  // Background lives here (not in controlBase) so the two states never emit competing utilities.
  return cn(controlBase, invalid ? "border-danger bg-danger-soft/40" : "border-[#d8e2ef] bg-white");
}

export function describedBy(id: string, hint?: ReactNode, error?: string) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="flex items-start gap-1 text-xs font-semibold text-danger">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

type FieldBaseProps = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
};

function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: Omit<FieldBaseProps, "name"> & { children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-bold text-[#354b66]">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        ) : (
          <span className="font-semibold text-muted"> (optional)</span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

export function TextField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  ...inputProps
}: FieldBaseProps & Omit<ComponentProps<"input">, "id" | "name" | "required" | "className">) {
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClasses(Boolean(error))}
        {...inputProps}
      />
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  options,
  placeholder,
  defaultValue,
}: FieldBaseProps & {
  options: readonly SelectOption[];
  /** Renders an empty first option (value ""). Omit when a real option is the default. */
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClasses(Boolean(error))}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  ...textareaProps
}: FieldBaseProps & Omit<ComponentProps<"textarea">, "id" | "name" | "required" | "className">) {
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        name={name}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClasses(Boolean(error)), "min-h-28 resize-y")}
        {...textareaProps}
      />
    </FieldShell>
  );
}

/** Required consent checkbox. The label links to the privacy notice. */
export function ConsentField({ id, error, className }: { id: string; error?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-3",
          error ? "border-danger bg-danger-soft/40" : "border-transparent bg-surface",
        )}
      >
        <input
          id={id}
          name="consent"
          type="checkbox"
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-navy"
        />
        <label htmlFor={id} className="cursor-pointer text-[13px] leading-snug text-[#354b66]">
          I agree to be contacted by Aspire about this enquiry and have read the{" "}
          <Link href="/privacy" className="font-bold text-blue underline underline-offset-2 hover:text-navy">
            privacy notice
          </Link>
          .
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        </label>
      </div>
      <FieldError id={id} message={error} />
    </div>
  );
}

/**
 * Spam honeypot. Hidden from sighted users and assistive tech, skipped by keyboard.
 * Real users never fill it; the server silently drops submissions where it is set.
 */
export function HoneypotField({ id }: { id: string }) {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={id}>Leave this field empty</label>
      <input id={id} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
