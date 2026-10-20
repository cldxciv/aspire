"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/i18n/client";
import type { ApiFailure } from "@/lib/auth/client-api";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { crmFailureMessage, sendCrm, type CrmRequest } from "./api";
import type { CrmMessages } from "./format";

/**
 * Client plumbing shared by the CRM islands: a native modal dialog and a hook that sends one
 * CRM request, localises failures, leaves the page on 401 / pending temporary password, and
 * refreshes the server-rendered data after a successful write.
 */

/**
 * Native modal `<dialog>`: focus trap, Esc to close (→ `onClose`), inert background. No `confirm()`.
 * `drawer`: full-height panel on the right (the "Add enquiry" form); full width on phones.
 */
export function CrmDialog({
  open,
  titleId,
  onClose,
  children,
  wide = false,
  drawer = false,
}: {
  open: boolean;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
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
      returnFocus.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-surface="light"
      className={
        drawer
          ? "my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-full overflow-y-auto border-l border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60 sm:w-[min(100vw,34rem)]"
          : "m-auto max-h-[90vh] overflow-y-auto rounded-card border border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60 " +
            (wide ? "w-[min(94vw,44rem)]" : "w-[min(92vw,32rem)]")
      }
    >
      {open && children}
    </dialog>
  );
}

export type ActionState = { pending: boolean; error: string | null; status: string };

/**
 * `run(request, successMessage)` → the response data, or null on failure (error set, already
 * localised). `pagePath` is the LOCALE-FREE path to come back to after signing in again.
 */
export function useCrmAction(t: Pick<CrmMessages, "errors">, pagePath: string, { refresh = true }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const locale = useLocale();
  const [state, setState] = useState<ActionState>({ pending: false, error: null, status: "" });

  const fail = useCallback(
    (result: ApiFailure) => {
      const message = crmFailureMessage(result, t);
      if (result.error === "unauthenticated") window.location.assign(buildLoginHref(pagePath, locale));
      else if (result.known === "passwordChangeRequired") window.location.assign(buildChangePasswordHref(locale, pagePath));
      return message;
    },
    [locale, pagePath, t],
  );

  const run = useCallback(
    async <T,>(
      request: CrmRequest,
      successMessage?: string,
      /** Return a message to show instead of the generic one (e.g. a field-specific 422). */
      onFailure?: (result: ApiFailure) => string | null,
    ): Promise<T | null> => {
      setState({ pending: true, error: null, status: "" });
      const result = await sendCrm<T>(request);
      if (!result.ok) {
        setState({ pending: false, error: onFailure?.(result) ?? fail(result), status: "" });
        return null;
      }
      setState({ pending: false, error: null, status: successMessage ?? "" });
      if (refresh) router.refresh();
      return result.data;
    },
    [fail, refresh, router],
  );

  const reset = useCallback(() => setState({ pending: false, error: null, status: "" }), []);
  return { ...state, run, reset, setError: (error: string | null) => setState((s) => ({ ...s, error })) };
}

/** Polite live region for success messages + an assertive one for errors. */
export function ActionFeedback({ status, error, className }: { status: string; error: string | null; className?: string }) {
  return (
    <div className={className}>
      <p role="status" className="text-sm font-semibold text-success">
        {status}
      </p>
      <p role="alert" className="text-sm font-semibold text-danger">
        {error ?? ""}
      </p>
    </div>
  );
}

export const fieldClasses =
  "min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-[15px] text-ink placeholder:text-[#8a99ad] " +
  "disabled:cursor-not-allowed disabled:bg-[#f4f7fb]";

export const labelClasses = "text-sm font-bold text-navy";
