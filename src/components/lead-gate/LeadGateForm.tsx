"use client";

import { ArrowRight, Info, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { ConsentField, FieldError, HoneypotField, SelectField, TextField } from "@/components/forms/fields";
import { formatNodes } from "@/components/forms/format-nodes";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { CLASS_OPTIONS } from "@/lib/contracts/enquiry";
import {
  LEAD_GATE_CONSENT_VERSION,
  LEAD_GATE_FIELDS,
  LEAD_GATE_ROLES,
  type LeadGateField,
  type LeadGateRole,
  type LeadGateTool,
  type LeadGateUsageKey,
} from "@/lib/lead-gate/contract";

import {
  buildLeadGatePayload,
  collectLeadGateContext,
  localizeLeadGateErrors,
  pickLeadGateErrors,
  validateLeadGatePayload,
  type LeadGateFieldErrors,
  type LeadGateSummary,
} from "./lead-gate-form-model";
import { leadGateStore, type LeadGateStore } from "./lead-gate-store";
import { useLeadGateState } from "./use-lead-gate";

/**
 * <LeadGateForm>: the one-time contact step before a free tool's result (docs/lead-gate-plan.md §6).
 *
 * - Always its OWN <form> (never nest it inside the tool's form): render it next to / instead of
 *   the result area. Inline, never a modal (inside Rancho's <dialog> it is part of the dialog).
 * - Fields: student's name, parent's/guardian's mobile (WhatsApp), class, "I am the" student /
 *   parent, the consent tick (never pre-ticked; hidden consentVersion), honeypot.
 * - Focus: moves to the heading when the form appears after a user action (`focusOnMount`, default
 *   true; pass false for a gate that appears without a click), and to the first invalid field.
 * - Outcomes: unlocked → the store opens and the host's useLeadGate `onUnlocked` fires; server or
 *   network trouble on a browser-only tool also offers "Show my result without saving"
 *   (fail-open, critique 1.5); optional mode offers "Continue without sharing" with the same weight.
 * - Sample data (store `sample`, from GET /api/lead-gate): an honest line up front, right under the
 *   lead and before any field, says results currently use sample data, that sharing does not unlock
 *   official data, and that Aspire will contact the family (owner decision 21 Oct 2026: gate now,
 *   with that note; TG-3 bait-and-switch). The submit button points to it (aria-describedby). Hosts
 *   never add their own copy of it. If `sample` is still unknown, focusing the form asks again.
 * - Signed-in accounts (owner decision 22 Oct 2026): staff and admins get exactly the visitor's
 *   form. A student or parent account (store `prefill`, from GET /api/lead-gate) gets the name
 *   filled in from the account and its role pre-selected, all editable (a value that arrives after
 *   the form opened fills only fields still empty / unchosen), plus a line saying the details will
 *   be linked to the account. The consent box is never pre-ticked. There is no "sign in instead"
 *   line: signing in no longer skips the step (only an account with a mobile number on file does,
 *   and accounts have none yet).
 * - Copy: the `leadGate` namespace, passed in by the host's server parent (D-028).
 */

export interface LeadGateFormProps {
  tool: LeadGateTool;
  messages: Messages<"leadGate">;
  /** From useLeadGate().formProps. */
  hostId?: string;
  /** From useLeadGate().formProps: the server enforces this tool (no "without saving" path). */
  enforced?: boolean;
  store?: LeadGateStore;
  /** From useLeadGate().formProps: a planner feature (e.g. the homepage "countdown"). */
  usageKey?: LeadGateUsageKey;
  /** Predictor: the exam + band being unlocked (attribution on the lead). */
  summary?: LeadGateSummary;
  variant?: "panel" | "compact";
  headingLevel?: 2 | 3;
  /** Defaults to `messages.submitFor[usageKey]`, else `messages.submit[tool]`. */
  submitLabel?: string;
  focusOnMount?: boolean;
  /** Defaults to the localised /privacy. */
  privacyHref?: string;
  className?: string;
}

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "invalid" }
  | { kind: "error"; reason: "rateLimited" | "phoneCapped" | "server" | "network" | "paused" | "staleConsent" | "rejected" };

export function LeadGateForm({
  tool,
  messages: t,
  hostId,
  enforced = false,
  store = leadGateStore,
  usageKey,
  summary,
  variant = "panel",
  headingLevel = 2,
  submitLabel,
  focusOnMount = true,
  privacyHref,
  className,
}: LeadGateFormProps) {
  const locale = useLocale();
  const gate = useLeadGateState(store);
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const headingId = fieldId("heading");
  const statusId = fieldId("status");
  const sampleId = fieldId("sample");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [errors, setErrors] = useState<LeadGateFieldErrors>({});
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [chosenRole, setChosenRole] = useState<LeadGateRole | null>(null);
  // A signed-in student / parent account: name and role from the account, editable.
  const prefill = gate.prefill;
  const role = chosenRole ?? prefill?.submittedBy ?? null;

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  // The pre-fill arrived after the form opened (uncontrolled fields keep their first defaults):
  // fill only what the person has not typed or chosen yet.
  useEffect(() => {
    const form = formRef.current;
    if (!prefill || !form) return;
    const name = form.querySelector<HTMLInputElement>('input[name="studentName"]');
    if (name && name.value === "" && prefill.studentName) name.value = prefill.studentName;
    const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="submittedBy"]'));
    if (!radios.some((radio) => radio.checked)) {
      const match = radios.find((radio) => radio.value === prefill.submittedBy);
      if (match) match.checked = true;
    }
  }, [prefill]);

  // Opened without a status answer on this page (hint, then the gate 401): fetch `sample` (the store retries a failure).
  useEffect(() => {
    if (gate.sample === null) store.loadSample();
  }, [gate.sample, store]);

  const compact = variant === "compact";
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const submitting = state.kind === "submitting";
  const optional = gate.mode === "optional";
  const sample = gate.sample === true;
  const failedOpen =
    !enforced && state.kind === "error" && (state.reason === "server" || state.reason === "network" || state.reason === "rateLimited" || state.reason === "paused");

  function focusField(field: LeadGateField) {
    const element = formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "center" });
  }

  function showErrors(next: LeadGateFieldErrors) {
    flushSync(() => {
      setErrors(localizeLeadGateErrors(next, t.errors));
      setState({ kind: "invalid" });
    });
    const first = LEAD_GATE_FIELDS.find((field) => next[field]);
    if (first) focusField(first);
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target as { name?: string; value?: string };
    const name = target.name;
    if (name === "submittedBy") {
      const value = target.value ?? "";
      setChosenRole((LEAD_GATE_ROLES as readonly string[]).includes(value) ? (value as LeadGateRole) : null);
    }
    if (name && name in errors) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name as LeadGateField];
        return next;
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const payload = buildLeadGatePayload(new FormData(event.currentTarget), tool, collectLeadGateContext(locale, tool, summary));
    const check = validateLeadGatePayload(payload);
    if (!check.ok) {
      if ("staleConsent" in check) setState({ kind: "error", reason: "staleConsent" });
      else showErrors(check.fieldErrors);
      return;
    }
    inFlight.current = true;
    setErrors({});
    setState({ kind: "submitting" });
    const outcome = await store.submit(payload, hostId ?? null);
    inFlight.current = false;
    switch (outcome.kind) {
      case "unlocked":
        setState({ kind: "idle" });
        return;
      case "validation": {
        const picked = pickLeadGateErrors(outcome.fieldErrors);
        if (Object.keys(picked).length > 0) showErrors(picked);
        else setState({ kind: "error", reason: outcome.fieldErrors.consentVersion ? "staleConsent" : "rejected" });
        return;
      }
      case "rate_limited":
        setState({ kind: "error", reason: outcome.phone ? "phoneCapped" : "rateLimited" });
        return;
      case "paused":
        setState({ kind: "error", reason: "paused" });
        return;
      case "rejected":
        setState({ kind: "error", reason: "rejected" });
        return;
      case "network":
        setState({ kind: "error", reason: "network" });
        return;
      default:
        setState({ kind: "error", reason: "server" });
    }
  }

  const statusText =
    state.kind === "invalid" ? t.status.invalid : state.kind === "error" ? t.status[state.reason] : "";
  const label = submitLabel ?? (tool === "planner" && usageKey ? t.submitFor[usageKey] : t.submit[tool]);
  const prefilledName = prefill?.studentName ?? undefined;
  const classOptions = CLASS_OPTIONS.map((option) => ({ value: option.value, label: t.classOptions[option.value] ?? option.label }));
  const roleError = errors.submittedBy;
  const roleErrorId = fieldId("submittedBy-error");

  return (
    <section
      aria-labelledby={headingId}
      data-lead-gate={tool}
      className={cn(
        "rounded-card border border-[#d8e2ef] bg-white text-ink",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      <Heading id={headingId} ref={headingRef} tabIndex={-1} className={cn("font-bold text-navy outline-none", compact ? "text-base" : "text-lg")}>
        {t.heading}
      </Heading>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.lead}</p>

      {sample && (
        <p id={sampleId} className="mt-3 flex items-start gap-2 rounded-lg bg-gold-soft p-3 text-[13px] leading-snug text-ink">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-navy" />
          <span>{t.sampleData}</span>
        </p>
      )}

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        onChange={handleChange}
        onFocus={gate.sample === null ? () => store.loadSample() : undefined}
        aria-busy={submitting || undefined}
        aria-describedby={statusText ? statusId : undefined}
        className="mt-4 @container"
      >
        <p className="mb-3 text-xs text-muted">{formatNodes(t.requiredNote, { star: <span className="text-danger">*</span> })}</p>
        <div className={cn("grid gap-4", !compact && "@lg:grid-cols-2 @lg:gap-x-3.5")}>
          <TextField
            id={fieldId("studentName")}
            name="studentName"
            label={t.fields.studentName}
            required
            autoComplete="off"
            maxLength={80}
            defaultValue={prefilledName}
            hint={prefilledName ? t.fields.studentNameFromAccount : undefined}
            error={errors.studentName}
          />
          <TextField
            id={fieldId("phone")}
            name="phone"
            label={t.fields.phone}
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={20}
            hint={role === "student" ? t.fields.phoneHintStudent : t.fields.phoneHintParent}
            error={errors.phone}
          />
          <SelectField
            id={fieldId("currentClass")}
            name="currentClass"
            label={t.fields.currentClass}
            required
            placeholder={t.fields.selectClass}
            options={classOptions}
            error={errors.currentClass}
          />
          <fieldset
            role="radiogroup"
            aria-required="true"
            aria-invalid={roleError ? true : undefined}
            aria-describedby={roleError ? roleErrorId : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <legend className="mb-1.5 text-[13px] font-bold text-[#354b66]">
              {t.fields.submittedBy}
              <span aria-hidden="true" className="text-danger">
                {" "}
                *
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {LEAD_GATE_ROLES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-ink",
                    "has-checked:border-navy has-checked:bg-blue-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
                    roleError ? "border-danger" : "border-[#d8e2ef]",
                  )}
                >
                  <input
                    type="radio"
                    name="submittedBy"
                    value={value}
                    defaultChecked={prefill?.submittedBy === value}
                    className="size-4 shrink-0 accent-navy"
                  />
                  {value === "student" ? t.fields.student : t.fields.parent}
                </label>
              ))}
            </div>
            <FieldError id={fieldId("submittedBy")} message={roleError} />
          </fieldset>
          <ConsentField
            id={fieldId("consent")}
            error={errors.consent}
            className={cn(!compact && "@lg:col-span-2")}
            text={t.consent}
            linkText={t.consentLink}
            privacyHref={privacyHref ?? localePath("/privacy", locale)}
            version={LEAD_GATE_CONSENT_VERSION}
          />
        </div>
        <HoneypotField id={fieldId("website")} label={t.honeypotLabel} />

        <p className="mt-3 text-xs leading-relaxed text-muted">{t.smallPrint}</p>
        {prefill && <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.accountNote}</p>}

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          <Button
            type="submit"
            aria-describedby={sample ? sampleId : undefined}
            aria-disabled={submitting || undefined}
            className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70 sm:w-auto"
          >
            {submitting ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                {t.sending}
              </>
            ) : (
              <>
                {label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </>
            )}
          </Button>
          {optional && !submitting && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => store.skip(hostId ?? null)}>
              {t.skip}
            </Button>
          )}
          {failedOpen && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => store.continueWithoutSaving(hostId ?? null)}>
              {t.continueWithoutSaving}
            </Button>
          )}
        </div>

        <p id={statusId} role="status" aria-live="polite" className={cn("text-sm font-semibold text-danger", statusText ? "mt-3" : "sr-only")}>
          {statusText}
        </p>

        <p className="mt-3 text-xs text-muted">{t.remember}</p>
      </form>
    </section>
  );
}
