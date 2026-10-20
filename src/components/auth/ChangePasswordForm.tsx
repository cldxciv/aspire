"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { callApi, clientPasswordIssue, retryAfterMinutes, type ApiFailure, type KnownApiMessage } from "@/lib/auth/client-api";
import { buildLoginHref, localizedPostLoginPath } from "@/lib/auth/paths";
import type { Role } from "@/lib/auth/roles";
import { ErrorSummary, type ErrorSummaryItem } from "./ErrorSummary";
import { PasswordField } from "./fields";
import { useHydrated } from "./use-hydrated";

export type ChangePasswordMessages = {
  form: Messages<"auth">["changePassword"];
  passwordToggle: Messages<"auth">["passwordToggle"];
  rateLimitedOne: string;
  rateLimitedMany: string;
  network: string;
  blocked: string;
  server: string;
};

type Field = "currentPassword" | "newPassword" | "confirmPassword";
type FieldErrors = Partial<Record<Field, string>>;

const POLICY_KEYS: Partial<Record<KnownApiMessage, keyof Messages<"auth">["changePassword"]["errors"]>> = {
  passwordTooShort: "tooShort",
  passwordTooLong: "tooLong",
  passwordSameAsLoginId: "sameAsLoginId",
  samePassword: "samePassword",
};

/** Client-side checks (the server re-checks everything). */
export function validatePasswordChange(
  values: { currentPassword: string; newPassword: string; confirmPassword: string },
  loginId: string | undefined,
  t: Messages<"auth">["changePassword"]["errors"],
): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.currentPassword) errors.currentPassword = t.currentRequired;
  if (!values.newPassword) {
    errors.newPassword = t.newRequired;
  } else {
    const issue = clientPasswordIssue(values.newPassword, loginId);
    if (issue === "passwordTooShort") errors.newPassword = t.tooShort;
    else if (issue === "passwordTooLong") errors.newPassword = t.tooLong;
    else if (issue === "passwordSameAsLoginId") errors.newPassword = t.sameAsLoginId;
    else if (values.newPassword.normalize("NFKC") === values.currentPassword.normalize("NFKC")) {
      errors.newPassword = t.samePassword;
    }
  }
  if (!values.confirmPassword) errors.confirmPassword = t.confirmRequired;
  else if (values.newPassword && values.confirmPassword !== values.newPassword) errors.confirmPassword = t.mismatch;
  return errors;
}

/** Localised field errors / summary lines for a failed `POST /api/auth/change-password`. */
export function changePasswordFailure(
  failure: ApiFailure,
  m: ChangePasswordMessages,
): { fields: FieldErrors; lines: string[] } {
  const t = m.form.errors;
  if (failure.error === "validation") {
    const fields: FieldErrors = {};
    if ("currentPassword" in failure.fieldErrors) fields.currentPassword = t.wrongCurrent;
    if ("newPassword" in failure.fieldErrors) {
      const known = failure.fieldErrors.newPassword;
      const key = known ? POLICY_KEYS[known] : undefined;
      fields.newPassword = key ? t[key] : t.newInvalid;
    }
    return Object.keys(fields).length ? { fields, lines: [] } : { fields, lines: [t.newInvalid] };
  }
  if (failure.error === "rate_limited") {
    const minutes = retryAfterMinutes(failure.retryAfterSeconds);
    return { fields: {}, lines: [minutes === 1 ? m.rateLimitedOne : format(m.rateLimitedMany, { minutes })] };
  }
  if (failure.error === "unauthenticated") return { fields: {}, lines: [t.sessionExpired] };
  if (failure.error === "network") return { fields: {}, lines: [m.network] };
  if (failure.error === "forbidden") return { fields: {}, lines: [m.blocked] };
  return { fields: {}, lines: [m.server] };
}

/**
 * Change-password form for every role (D-029), including accounts that must replace an
 * admin-issued temporary password. `POST /api/auth/change-password`; on success the user goes
 * to their portal (the sanitised `next` in their own area, else the portal home) in the
 * current locale. Every password value is cleared from state after a server response.
 */
export function ChangePasswordForm({
  messages: m,
  role,
  loginId,
  next,
}: {
  messages: ChangePasswordMessages;
  role: Role;
  loginId?: string;
  /** Sanitised, locale-free portal path (or null). */
  next: string | null;
}) {
  const t = m.form;
  const locale = useLocale();
  const hydrated = useHydrated();
  const id = useId();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [focusRequest, setFocusRequest] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusRequest > 0) summaryRef.current?.focus();
  }, [focusRequest]);

  const fieldId = (field: Field) => `${id}-${field}`;
  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;

    const errors = validatePasswordChange(values, loginId, t.errors);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      setFocusRequest((n) => n + 1);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setStatus("pending");
    const result = await callApi<{ passwordChanged: boolean }>("/api/auth/change-password", {
      body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
    });
    setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });

    if (result.ok) {
      setStatus("success");
      window.location.assign(localizedPostLoginPath(role, next, locale));
      return;
    }

    const failure = changePasswordFailure(result, m);
    setStatus("idle");
    setFieldErrors(failure.fields);
    setFormError(failure.lines.length ? failure.lines : null);
    setFocusRequest((n) => n + 1);
    if (result.error === "unauthenticated") window.location.assign(buildLoginHref(next, locale));
  }

  const order: Field[] = ["currentPassword", "newPassword", "confirmPassword"];
  const summaryItems: ErrorSummaryItem[] = [
    ...(formError ?? []).map((text) => ({ text })),
    ...order.flatMap((field) => (fieldErrors[field] ? [{ text: fieldErrors[field]!, fieldId: fieldId(field) }] : [])),
  ];
  const busy = status !== "idle";

  return (
    <form noValidate method="post" onSubmit={onSubmit} aria-busy={busy || undefined} className="flex flex-col gap-4">
      {summaryItems.length > 0 && (
        <ErrorSummary title={t.errorSummaryTitle} items={summaryItems} summaryRef={summaryRef} />
      )}

      {/* Lets password managers attach the new password to the right account. */}
      {loginId && (
        <input type="text" name="username" autoComplete="username" value={loginId} readOnly hidden aria-hidden="true" />
      )}

      <PasswordField
        id={fieldId("currentPassword")}
        name="current-password"
        label={t.current}
        hint={t.currentHint}
        error={fieldErrors.currentPassword}
        toggle={m.passwordToggle}
        value={values.currentPassword}
        onChange={set("currentPassword")}
        autoComplete="current-password"
        required
        aria-required="true"
      />
      <PasswordField
        id={fieldId("newPassword")}
        name="new-password"
        label={t.new}
        hint={t.newHint}
        error={fieldErrors.newPassword}
        toggle={m.passwordToggle}
        value={values.newPassword}
        onChange={set("newPassword")}
        autoComplete="new-password"
        required
        aria-required="true"
      />
      <PasswordField
        id={fieldId("confirmPassword")}
        name="confirm-password"
        label={t.confirm}
        error={fieldErrors.confirmPassword}
        toggle={m.passwordToggle}
        value={values.confirmPassword}
        onChange={set("confirmPassword")}
        autoComplete="new-password"
        required
        aria-required="true"
      />

      <button type="submit" disabled={!hydrated || busy} className={buttonClasses({ variant: "dark", className: "w-full sm:w-auto" })}>
        {busy ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <KeyRound aria-hidden="true" className="size-4" />
        )}
        {busy ? t.submitting : t.submit}
      </button>

      <p role="status" className="min-h-5 text-sm font-semibold text-success">
        {status === "success" ? t.success : ""}
      </p>
    </form>
  );
}
