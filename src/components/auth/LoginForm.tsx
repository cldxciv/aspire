"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { callApi, retryAfterMinutes, type ApiFailure } from "@/lib/auth/client-api";
import { buildChangePasswordHref, localizedPostLoginPath } from "@/lib/auth/paths";
import { isRole, ROLES, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { ErrorSummary, type ErrorSummaryItem } from "./ErrorSummary";
import { PasswordField, TextField } from "./fields";
import { useHydrated } from "./use-hydrated";

/** Only what the form needs (the page's help and safety copy stays on the server). */
export type LoginFormMessages = Pick<Messages<"auth">, "roles" | "roleHints" | "passwordToggle"> & {
  login: Omit<Messages<"auth">["login"], "help" | "safety" | "metaTitle" | "metaDescription">;
};

type LoginResponse = { role: Role; displayName: string; mustChangePassword: boolean; redirectTo: string };

/** Localised summary lines for a failed `POST /api/auth/login` (never the server's own text). */
export function loginFailureLines(failure: ApiFailure, t: Messages<"auth">["login"]["errors"]): string[] {
  switch (failure.error) {
    case "unauthenticated":
    case "validation":
    case "bad_request":
      // One generic message for every credential failure (D-029: no account enumeration).
      return [t.invalidCredentials, t.checkTab];
    case "rate_limited": {
      const minutes = retryAfterMinutes(failure.retryAfterSeconds);
      return [minutes === 1 ? t.rateLimitedOne : format(t.rateLimitedMany, { minutes })];
    }
    case "network":
      return [t.network];
    case "forbidden":
      return [t.blocked];
    default:
      return [t.server];
  }
}

/**
 * Sign-in form (D-029) with Student / Parent / Admin tabs (ARIA tabs, arrow keys switch).
 * Sends `{ loginId, password, role, next }` to `POST /api/auth/login`; the role only checks
 * the chosen tab, it never grants anything. On success it follows the server's `redirectTo`
 * in the current locale (`/hi/...` for Hindi), or the change-password page for accounts with
 * a temporary password. The password is cleared from state after every attempt.
 */
export function LoginForm({
  messages: t,
  initialRole,
  next,
  forgotHref,
}: {
  messages: LoginFormMessages;
  initialRole: Role;
  /** Sanitised, locale-free portal path (or null). */
  next: string | null;
  forgotHref: string;
}) {
  const locale = useLocale();
  const hydrated = useHydrated();
  const id = useId();
  const [role, setRole] = useState<Role>(initialRole);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ loginId?: string; password?: string }>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [focusRequest, setFocusRequest] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Role, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (focusRequest > 0) summaryRef.current?.focus();
  }, [focusRequest]);

  const ids = {
    tab: (r: Role) => `${id}-tab-${r}`,
    panel: `${id}-panel`,
    loginId: `${id}-login-id`,
    password: `${id}-password`,
  };

  function selectRole(option: Role, focus = false) {
    setRole(option);
    setFormError(null);
    if (focus) tabRefs.current[option]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = ROLES.indexOf(role);
    const last = ROLES.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? ROLES[index === last ? 0 : index + 1]
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? ROLES[index === 0 ? last : index - 1]
          : event.key === "Home"
            ? ROLES[0]
            : event.key === "End"
              ? ROLES[last]
              : null;
    if (!target) return;
    event.preventDefault();
    selectRole(target, true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;

    const errors: { loginId?: string; password?: string } = {};
    if (!loginId.trim()) errors.loginId = t.login.errors.loginIdRequired;
    if (!password) errors.password = t.login.errors.passwordRequired;
    if (errors.loginId || errors.password) {
      setFieldErrors(errors);
      setFormError(null);
      setFocusRequest((n) => n + 1);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setStatus("pending");
    const result = await callApi<LoginResponse>("/api/auth/login", {
      body: { loginId: loginId.trim(), password, role, ...(next ? { next } : {}) },
    });
    setPassword("");

    if (result.ok) {
      setStatus("success");
      const signedInRole = isRole(result.data.role) ? result.data.role : role;
      const target = result.data.mustChangePassword
        ? buildChangePasswordHref(locale, result.data.redirectTo)
        : localizedPostLoginPath(signedInRole, result.data.redirectTo, locale);
      window.location.assign(target);
      return;
    }

    setStatus("idle");
    setFormError(loginFailureLines(result, t.login.errors));
    setFocusRequest((n) => n + 1);
  }

  const summaryItems: ErrorSummaryItem[] = formError
    ? formError.map((text) => ({ text }))
    : [
        ...(fieldErrors.loginId ? [{ text: fieldErrors.loginId, fieldId: ids.loginId }] : []),
        ...(fieldErrors.password ? [{ text: fieldErrors.password, fieldId: ids.password }] : []),
      ];
  const busy = status !== "idle";

  return (
    <div>
      <div role="tablist" aria-label={t.login.tabsLabel} className="grid grid-cols-3 gap-1 rounded-control bg-surface p-1">
        {ROLES.map((option) => {
          const selected = option === role;
          return (
            <button
              key={option}
              ref={(element) => {
                tabRefs.current[option] = element;
              }}
              type="button"
              role="tab"
              id={ids.tab(option)}
              aria-selected={selected}
              aria-controls={ids.panel}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectRole(option)}
              onKeyDown={onTabKeyDown}
              className={cn(
                "min-h-11 rounded-lg px-2 text-sm font-bold transition",
                selected ? "bg-navy text-white shadow-soft" : "text-navy hover:bg-white",
              )}
            >
              {t.roles[option]}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab(role)} className="pt-4">
        <p className="mb-4 text-sm text-muted">{t.roleHints[role]}</p>

        <form noValidate method="post" onSubmit={onSubmit} aria-busy={busy || undefined} className="flex flex-col gap-4">
          {summaryItems.length > 0 && (
            <ErrorSummary title={t.login.errorSummaryTitle} items={summaryItems} summaryRef={summaryRef} />
          )}

          <TextField
            id={ids.loginId}
            name="username"
            label={t.login.loginId}
            hint={t.login.loginIdHint}
            error={fieldErrors.loginId}
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={200}
            required
            aria-required="true"
          />

          <PasswordField
            id={ids.password}
            name="password"
            label={t.login.password}
            error={fieldErrors.password}
            toggle={t.passwordToggle}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            aria-required="true"
          />

          <button
            type="submit"
            disabled={!hydrated || busy}
            className={buttonClasses({ variant: "dark", className: "w-full" })}
          >
            {busy ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <LogIn aria-hidden="true" className="size-4" />
            )}
            {busy ? t.login.submitting : `${t.login.submit} · ${t.roles[role]}`}
          </button>

          <p role="status" className="min-h-5 text-sm font-semibold text-success">
            {status === "success" ? t.login.success : ""}
          </p>

          <p className="-mt-2 text-sm">
            <Link href={forgotHref} className="font-bold text-blue underline-offset-2 hover:underline">
              {t.login.forgotPassword}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
