"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/i18n/client";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";
import { fieldErrorLines, isPasswordChangeRequired, qbCall, qbFailureMessage, type QbFailure, type QbMessages, type QbRequest } from "./api";

/**
 * Client plumbing for the question-bank admin islands: a hook that sends one request, localises
 * failures (with the server's field messages as details), leaves the page on 401 / a pending
 * temporary password; a loader hook; and small form controls with the console's field styles.
 */

export const fieldClasses =
  "min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink placeholder:text-[#8a99ad] " +
  "disabled:cursor-not-allowed disabled:bg-[#f4f7fb]";
export const labelClasses = "text-sm font-bold text-navy";
export const smallButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-line bg-white px-3 py-2 text-sm font-bold text-navy hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-60";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-[#123a73] disabled:cursor-not-allowed disabled:opacity-60";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-[#e7b4b4] bg-white px-3 py-2 text-sm font-bold text-[#a61b1b] hover:bg-[#fff4f4] disabled:cursor-not-allowed disabled:opacity-60";

export type QbActionState = { pending: boolean; error: string | null; details: string[]; status: string };

const IDLE: QbActionState = { pending: false, error: null, details: [], status: "" };

/** `run(request, successMessage)` → data, or null on failure (error localised, details kept). */
export function useQbAction(t: Pick<QbMessages, "errors">, pagePath: string) {
  const locale = useLocale();
  const [state, setState] = useState<QbActionState>(IDLE);

  const fail = useCallback(
    (result: QbFailure) => {
      if (result.status === 401) window.location.assign(buildLoginHref(pagePath, locale));
      else if (isPasswordChangeRequired(result)) window.location.assign(buildChangePasswordHref(locale, pagePath));
      setState({ pending: false, error: qbFailureMessage(result, t), details: fieldErrorLines(result), status: "" });
    },
    [locale, pagePath, t],
  );

  const run = useCallback(
    async <T,>(request: QbRequest, successMessage?: string): Promise<T | null> => {
      setState({ pending: true, error: null, details: [], status: "" });
      const result = await qbCall<T>(request);
      if (!result.ok) {
        fail(result);
        return null;
      }
      setState({ pending: false, error: null, details: [], status: successMessage ?? "" });
      return result.data;
    },
    [fail],
  );

  const reset = useCallback(() => setState(IDLE), []);
  return { ...state, run, reset, fail, setError: (error: string | null) => setState((s) => ({ ...s, error, details: [] })) };
}

/** Loads `request` on mount and whenever `key` changes; `reload()` fetches again. */
export function useQbData<T>(request: QbRequest | null, t: Pick<QbMessages, "errors">, pagePath: string) {
  const locale = useLocale();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(request !== null);
  const [tick, setTick] = useState(0);
  const key = request ? `${request.method} ${request.path}` : null;
  const latest = useRef(0);

  useEffect(() => {
    if (key === null || request === null) return;
    const id = ++latest.current;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await qbCall<T>(request);
      if (cancelled || id !== latest.current) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        if (result.status === 401) window.location.assign(buildLoginHref(pagePath, locale));
        else if (isPasswordChangeRequired(result)) window.location.assign(buildChangePasswordHref(locale, pagePath));
        setError(qbFailureMessage(result, t));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // `request` is described completely by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, locale, pagePath, t]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, setData, error, loading, reload };
}

/** Polite status + assertive error, with the server's field details in a disclosure. */
export function QbFeedback({ state, detailsLabel, className }: { state: Pick<QbActionState, "status" | "error" | "details">; detailsLabel: string; className?: string }) {
  return (
    <div className={className}>
      <p role="status" className="text-sm font-semibold text-success">
        {state.status}
      </p>
      <div role="alert" className="text-sm font-semibold text-danger">
        {state.error ?? ""}
        {state.error && state.details.length > 0 && (
          <details className="mt-1 font-normal text-[#7a2020]">
            <summary className="cursor-pointer">{detailsLabel}</summary>
            <ul className="mt-1 list-disc pl-5" lang="en">
              {state.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/** Native modal `<dialog>` (focus trap, Esc closes, inert background). No `confirm()`. */
export function QbDialog({ open, titleId, onClose, children, wide = false }: { open: boolean; titleId: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      restoreFocus(returnFocus.current);
    }
  }, [open]);
  // Most dialogs are unmounted by their parent while still open (`{dialog === "x" && <… open />}`):
  // close it and hand focus back to the control that opened it instead of leaving it on <body>.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (!dialog?.open) return;
      dialog.close();
      restoreFocus(returnFocus.current);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-surface="light"
      className={cn(
        "m-auto max-h-[90vh] overflow-y-auto rounded-card border border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60",
        wide ? "w-[min(96vw,60rem)]" : "w-[min(92vw,34rem)]",
      )}
    >
      {open && <div className="p-5 md:p-6">{children}</div>}
    </dialog>
  );
}

function restoreFocus(target: HTMLElement | null): void {
  if (target?.isConnected) target.focus();
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  type = "text",
  disabled,
  maxLength,
  placeholder,
  lang,
  inputMode,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: "text" | "number" | "url" | "date" | "search";
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  lang?: string;
  inputMode?: "decimal" | "numeric" | "text" | "url";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        lang={lang}
        inputMode={inputMode}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClasses}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  rows = 4,
  disabled,
  maxLength = 8000,
  lang,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
  lang?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        lang={lang}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClasses, "font-mono text-sm leading-relaxed")}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField<V extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
  invalid = false,
  className,
}: {
  id: string;
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Help text under the field; shown as an error when `invalid`. */
  hint?: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value as V)}
        className={cn(fieldClasses, "aria-invalid:border-danger")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className={invalid ? "text-xs font-semibold text-danger" : "text-xs text-muted"}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function CheckboxField({ id, label, checked, onChange, disabled, className }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-h-11 items-start gap-2", className)}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-4 shrink-0 accent-navy" />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
