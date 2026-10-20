import { CircleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatNodes } from "./format-nodes";

/**
 * Internal form primitives for EnquiryForm (mockup `.field`). Every control:
 * - has a visible <label>,
 * - exposes required state via aria-required (the form uses noValidate so zod drives validation),
 * - links hint + error text via aria-describedby and sets aria-invalid when in error.
 *
 * Localisation: visible strings are props with English defaults (`optionalLabel`, the consent
 * `text` / `linkText` / `privacyHref`, the honeypot `label`); the forms pass `forms` messages.
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
  /** Suffix after an optional field's label (default "(optional)"). */
  optionalLabel?: string;
};

/**
 * Optional "inset" layout (home hero form, D-021a): one bordered box per field with an optional
 * decorative leading icon, the small label drawn inside the box above the value, and the
 * placeholder below it. The label is still a real `<label htmlFor>` (it only sits on top of the
 * control visually, with pointer events passing through to it); hint and error stay below the box.
 * Without `inset`, every field renders exactly as before.
 */
type InsetProps = {
  inset?: boolean;
  /** Decorative (aria-hidden) icon at the start of an inset field. */
  icon?: LucideIcon;
};

/**
 * Inset control: 54px box; the label occupies the top padding. A native select draws its text
 * ~4px further in than an input, so it gets 4px less start padding to line up with its label.
 */
function insetControlClasses(invalid: boolean, hasIcon: boolean, extra?: string, isSelect = false) {
  return cn(
    "block w-full min-h-[54px] rounded-control border pb-1.5 pr-3 pt-[22px] text-[15px] leading-6 text-ink transition-colors",
    "placeholder:text-muted focus:border-blue",
    invalid ? "border-danger bg-danger-soft/40" : "border-[#d8e2ef] bg-white",
    hasIcon ? (isSelect ? "pl-10" : "pl-11") : isSelect ? "pl-2.5" : "pl-3.5",
    extra,
  );
}

const DEFAULT_OPTIONAL_LABEL = "(optional)";

function RequiredMark({ required, optionalLabel = DEFAULT_OPTIONAL_LABEL }: { required?: boolean; optionalLabel?: string }) {
  return required ? (
    <span aria-hidden="true" className="text-danger">
      {" "}
      *
    </span>
  ) : (
    <span className="font-normal text-muted"> {optionalLabel}</span>
  );
}

function InsetShell({
  id,
  label,
  required,
  hint,
  error,
  className,
  optionalLabel,
  icon: Icon,
  iconAtTop = false,
  children,
}: Omit<FieldBaseProps, "name"> & { icon?: LucideIcon; iconAtTop?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="relative">
        {children}
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute top-[7px] text-xs font-semibold leading-4 text-[#354b66]",
            Icon ? "left-11" : "left-3.5",
          )}
        >
          {label}
          <RequiredMark required={required} optionalLabel={optionalLabel} />
        </label>
        {Icon && (
          <Icon
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn(
              "pointer-events-none absolute left-3.5 size-5 text-muted",
              iconAtTop ? "top-4" : "top-1/2 -translate-y-1/2",
            )}
          />
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  className,
  optionalLabel = DEFAULT_OPTIONAL_LABEL,
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
          <span className="font-semibold text-muted"> {optionalLabel}</span>
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
  optionalLabel,
  inset = false,
  icon,
  ...inputProps
}: FieldBaseProps & InsetProps & Omit<ComponentProps<"input">, "id" | "name" | "required" | "className">) {
  const input = (
    <input
      id={id}
      name={name}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={inset ? insetControlClasses(Boolean(error), Boolean(icon)) : controlClasses(Boolean(error))}
      {...inputProps}
    />
  );
  const shell = { id, label, required, hint, error, className, optionalLabel };
  return inset ? (
    <InsetShell {...shell} icon={icon}>
      {input}
    </InsetShell>
  ) : (
    <FieldShell {...shell}>{input}</FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

/** An <optgroup>. Option labels must still make sense alone (a closed select shows only the option). */
export type SelectOptionGroup = { label: string; options: readonly SelectOption[] };

export function SelectField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  optionalLabel,
  options = [],
  groups,
  placeholder,
  defaultValue,
  inset = false,
  icon,
}: FieldBaseProps &
  InsetProps & {
    options?: readonly SelectOption[];
    /** Grouped options, rendered as <optgroup>s after any ungrouped `options`. */
    groups?: readonly SelectOptionGroup[];
    /** Renders an empty first option (value ""). Omit when a real option is the default. */
    placeholder?: string;
    defaultValue?: string;
  }) {
  const select = (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={
        inset
          ? // While the empty placeholder option is selected, show it in the muted placeholder colour.
            insetControlClasses(
              Boolean(error),
              Boolean(icon),
              "has-[option[value='']:checked]:text-muted [&_option]:text-ink",
              true,
            )
          : controlClasses(Boolean(error))
      }
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {groups?.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
  const shell = { id, label, required, hint, error, className, optionalLabel };
  return inset ? (
    <InsetShell {...shell} icon={icon}>
      {select}
    </InsetShell>
  ) : (
    <FieldShell {...shell}>{select}</FieldShell>
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
  optionalLabel,
  inset = false,
  icon,
  ...textareaProps
}: FieldBaseProps & InsetProps & Omit<ComponentProps<"textarea">, "id" | "name" | "required" | "className">) {
  const textarea = (
    <textarea
      id={id}
      name={name}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={
        // Inset: `rows` sets the height (no 7rem minimum).
        inset
          ? insetControlClasses(Boolean(error), Boolean(icon), "resize-y")
          : cn(controlClasses(Boolean(error)), "min-h-28 resize-y")
      }
      {...textareaProps}
    />
  );
  const shell = { id, label, required, hint, error, className, optionalLabel };
  return inset ? (
    <InsetShell {...shell} icon={icon} iconAtTop>
      {textarea}
    </InsetShell>
  ) : (
    <FieldShell {...shell}>{textarea}</FieldShell>
  );
}

/**
 * Required consent checkbox. The label links to the privacy notice.
 * `large` renders a 24px box (hero form touch target); the default stays 20px.
 */
export function ConsentField({
  id,
  error,
  className,
  large = false,
  text = "I agree to be contacted by Aspire about this enquiry and have read the {link}.",
  linkText = "privacy notice",
  privacyHref = "/privacy",
}: {
  id: string;
  error?: string;
  className?: string;
  large?: boolean;
  /** Consent sentence with a `{link}` placeholder for the privacy-notice link. */
  text?: string;
  linkText?: string;
  /** Locale-aware privacy URL (`localePath("/privacy", locale)`). */
  privacyHref?: string;
}) {
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
          className={cn(large ? "size-6" : "mt-0.5 size-5", "shrink-0 cursor-pointer accent-navy")}
        />
        <label htmlFor={id} className="cursor-pointer text-[13px] leading-snug text-[#354b66]">
          {formatNodes(text, {
            link: (
              <Link href={privacyHref} className="font-bold text-blue underline underline-offset-2 hover:text-navy">
                {linkText}
              </Link>
            ),
          })}
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
export function HoneypotField({ id, label = "Leave this field empty" }: { id: string; label?: string }) {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={id}>{label}</label>
      <input id={id} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
