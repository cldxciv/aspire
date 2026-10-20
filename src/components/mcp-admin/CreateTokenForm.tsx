"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { describedBy, inputClasses } from "@/components/auth/fields";
import { Button, Notice } from "@/components/ui";
import type { ApiFailure } from "@/lib/auth/client-api";
import { callApi } from "@/lib/auth/client-api";
import { cn } from "@/lib/cn";
import { expiryLabel, type McpTokenManagerMessages } from "./labels";
import { PermissionMatrix } from "./PermissionMatrix";
import { applyPreset, hasAnyPermission, toScopes, type McpServiceView, type PermissionState } from "./permissions";
import {
  MCP_EXPIRY_DAYS,
  MCP_EXPIRY_OPTIONS,
  normaliseTokenName,
  tokenNameIssue,
  type McpTokenCreated,
} from "./token-view";

export const MCP_TOKENS_API = "/api/admin/mcp-tokens";

type FieldErrors = { name?: string; scopes?: string; expiresInDays?: string };

/**
 * Create-token form: name, the per-service permission matrix (starts at "Read only") and expiry.
 * Validates locally first (name rules, at least one permission), then the server re-validates.
 */
export function CreateTokenForm({
  m,
  services,
  onCreated,
  onFailure,
}: {
  m: McpTokenManagerMessages;
  services: readonly McpServiceView[];
  onCreated: (created: McpTokenCreated) => void;
  onFailure: (result: ApiFailure) => string;
}) {
  const t = m.mcp;
  const id = useId();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<PermissionState>(() => applyPreset(services, "readOnly"));
  const [expiry, setExpiry] = useState<number>(MCP_EXPIRY_DAYS.default);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const firstPermissionRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLSelectElement>(null);

  function focusFirst(next: FieldErrors) {
    if (next.name) nameRef.current?.focus();
    else if (next.scopes) firstPermissionRef.current?.focus();
    else if (next.expiresInDays) expiryRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const clean = normaliseTokenName(name);
    const issue = tokenNameIssue(clean);
    const next: FieldErrors = {};
    if (issue) next.name = t.errors[issue];
    if (!hasAnyPermission(services, permissions)) next.scopes = t.errors.permissionsRequired;
    setErrors(next);
    setFormError(null);
    if (next.name || next.scopes) return focusFirst(next);

    setPending(true);
    const result = await callApi<McpTokenCreated>(MCP_TOKENS_API, {
      body: { name: clean, scopes: toScopes(services, permissions), expiresInDays: expiry },
    });
    setPending(false);
    if (result.ok) {
      setName("");
      setPermissions(applyPreset(services, "readOnly"));
      setExpiry(MCP_EXPIRY_DAYS.default);
      onCreated(result.data);
      return;
    }
    if (result.error === "validation" && Object.keys(result.fieldErrors).length) {
      const fields: FieldErrors = {};
      if ("name" in result.fieldErrors) fields.name = t.errors.nameLength;
      if ("scopes" in result.fieldErrors) fields.scopes = t.errors.permissionsInvalid;
      if ("expiresInDays" in result.fieldErrors) fields.expiresInDays = t.errors.expiryInvalid;
      if (fields.name || fields.scopes || fields.expiresInDays) {
        setErrors(fields);
        focusFirst(fields);
        return;
      }
    }
    setFormError(onFailure(result));
  }

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {t.create.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.create.description}</p>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-busy={pending || undefined}
        className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-bold text-navy">
            {t.create.name}
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={120}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy(`${id}-name`, true, Boolean(errors.name))}
            className={cn(inputClasses, errors.name ? "border-danger" : "border-[#b9cbe0]")}
          />
          <p id={`${id}-name-hint`} className="text-xs text-muted">
            {t.create.nameHint}
          </p>
          {errors.name && (
            <p id={`${id}-name-error`} className="text-sm font-semibold text-danger">
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-expiry`} className="text-sm font-bold text-navy">
            {t.create.expiry}
          </label>
          <select
            ref={expiryRef}
            id={`${id}-expiry`}
            name="expiresInDays"
            value={expiry}
            onChange={(event) => setExpiry(Number(event.target.value))}
            aria-invalid={errors.expiresInDays ? true : undefined}
            aria-describedby={describedBy(`${id}-expiry`, true, Boolean(errors.expiresInDays))}
            className={cn(inputClasses, errors.expiresInDays ? "border-danger" : "border-[#b9cbe0]")}
          >
            {MCP_EXPIRY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {expiryLabel(days, t.create)}
              </option>
            ))}
          </select>
          <p id={`${id}-expiry-hint`} className="text-xs text-muted">
            {t.create.expiryHint}
          </p>
          {errors.expiresInDays && (
            <p id={`${id}-expiry-error`} className="text-sm font-semibold text-danger">
              {errors.expiresInDays}
            </p>
          )}
        </div>

        <div className="min-w-0 lg:col-span-2">
          <PermissionMatrix
            services={services}
            state={permissions}
            onChange={(next) => {
              setPermissions(next);
              if (errors.scopes && hasAnyPermission(services, next)) setErrors({ ...errors, scopes: undefined });
            }}
            m={t}
            error={errors.scopes}
            firstInputRef={firstPermissionRef}
          />
        </div>

        <div className="min-w-0 lg:col-span-2">
          {formError && (
            <Notice variant="error" role="alert" className="mb-3">
              {formError}
            </Notice>
          )}
          <Button type="submit" variant="dark" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <KeyRound aria-hidden="true" className="size-4" />
            )}
            {pending ? t.create.creating : t.create.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}
