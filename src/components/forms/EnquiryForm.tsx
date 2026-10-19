"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CLASS_OPTIONS,
  CONTACT_TOPIC_OPTIONS,
  PROGRAM_INTEREST_OPTIONS,
  enquirySchema,
} from "@/lib/contracts/enquiry";
import { FIELD_ORDER, buildPayload, pickErrors, type FieldErrors, type FieldName, type Intent } from "./enquiry-payload";
import { ConsentField, HoneypotField, SelectField, TextAreaField, TextField } from "./fields";
import { FormStatus, type FormState } from "./FormStatus";
import { submitEnquiry } from "./submit-enquiry";

/**
 * Enquiry form (contract: src/lib/contracts/enquiry.ts, D-008).
 *
 * - Validates on the client with the shared `enquirySchema`, then POSTs JSON to /api/enquiries.
 * - Renders the server's answer honestly: only `received` is reported as a successful enquiry;
 *   `not_configured` says plainly that nothing was sent and keeps the entered data.
 * - Renders only the form (fields, consent, submit, status) — the caller supplies any card chrome.
 */

export type EnquiryFormVariant = "quick" | "admissions" | "contact";

export interface EnquiryFormProps {
  variant: EnquiryFormVariant;
  /** Options for the preferred-centre select (admissions variant). Pass visible centres from getCentres(). */
  centreOptions?: { value: string; label: string }[];
  /** Pre-selects a program, e.g. from a program detail page ("jee" | "neet" | "foundation" | "integrated"). */
  defaultProgram?: string;
  className?: string;
}

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: "enquiry", label: "Enquiry" },
  { value: "scholarship", label: "Scholarship interest" },
];

const NOT_SURE_CENTRE = { value: "not-sure", label: "Not sure yet" };

const MESSAGE_MAX = 1000;

export function EnquiryForm({ variant, centreOptions, defaultProgram, className }: EnquiryFormProps) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const clearOnHide = useRef(false);

  const [intent, setIntent] = useState<Intent>("enquiry");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const order = FIELD_ORDER[variant];
  const hasCentreField = variant === "admissions" && (centreOptions?.length ?? 0) > 0;
  // Accept option values ("jee") and ExamTrack names ("JEE", "Foundation"); ignore anything else.
  const requestedProgram = defaultProgram?.trim().toLowerCase() ?? "";
  const programDefault = PROGRAM_INTEREST_OPTIONS.some((o) => o.value === requestedProgram) ? requestedProgram : "";
  const submitting = state.kind === "submitting";

  // Routes stay mounted (hidden) after navigation. Clear a stale success message
  // when this form is hidden, so returning to the page shows a fresh form.
  useLayoutEffect(() => {
    return () => {
      if (clearOnHide.current) {
        clearOnHide.current = false;
        setState({ kind: "idle" });
      }
    };
  }, []);

  function focusField(name: FieldName) {
    const element = formRef.current?.elements.namedItem(name);
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
      // Centre it so the sticky header never covers the field (CSS handles reduced motion).
      element.scrollIntoView({ block: "center" });
    }
  }

  function showFieldErrors(next: FieldErrors, origin: "client" | "server") {
    // Commit the errors first so the focused field already carries aria-invalid + its message.
    flushSync(() => {
      setErrors(next);
      setState({ kind: "invalid", count: Object.keys(next).length, origin });
    });
    const first = order.find((field) => next[field]);
    if (first) focusField(first);
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const name = (event.target as { name?: string }).name as FieldName | undefined;
    if (name && errors[name]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return; // no double submit

    const form = event.currentTarget;
    const payload = buildPayload(variant, new FormData(form), intent, hasCentreField);

    const parsed = enquirySchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
      const picked = pickErrors(fieldErrors, order);
      if (Object.keys(picked).length > 0) {
        showFieldErrors(picked, "client");
        return;
      }
      // An error on a field this variant doesn't render (should not happen) — never send invalid data.
      setState({ kind: "rejected" });
      return;
    }

    inFlight.current = true;
    clearOnHide.current = false;
    setErrors({});
    setState({ kind: "submitting" });

    const outcome = await submitEnquiry(payload);
    inFlight.current = false;

    switch (outcome.kind) {
      case "received":
        form.reset();
        setIntent("enquiry");
        clearOnHide.current = true;
        setState(outcome);
        return;
      case "validation": {
        const picked = pickErrors(outcome.fieldErrors, order);
        if (Object.keys(picked).length > 0) showFieldErrors(picked, "server");
        else setState({ kind: "rejected" });
        return;
      }
      default:
        // not_configured, rate_limited, errors: keep everything the user typed.
        setState(outcome);
    }
  }

  // Admissions/contact go two-column when the form itself is ≥32rem wide (container query on the
  // <form>), mirroring the mockup's `.formgrid`. The quick variant is always a single column.
  const grid = variant === "quick" ? "grid gap-4" : "grid gap-4 @lg:grid-cols-2 @lg:gap-x-3.5";
  const wide = variant === "quick" ? undefined : "@lg:col-span-2";

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      onChange={handleChange}
      aria-busy={submitting || undefined}
      data-variant={variant}
      className={cn("relative", variant !== "quick" && "@container", className)}
    >
      {variant === "quick" && (
        <fieldset className="mb-4">
          <legend className="sr-only">What would you like to ask about?</legend>
          <div className="flex gap-1 rounded-[9px] bg-surface p-1">
            {INTENT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-[7px] px-2 py-2 text-center",
                  "text-xs font-bold text-muted transition-colors [&:not(:has(:checked)):hover]:text-navy",
                  "has-checked:bg-navy has-checked:text-white",
                  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
                )}
              >
                {/* Uncontrolled so form.reset() restores "Enquiry"; state mirrors it for copy changes. */}
                <input
                  type="radio"
                  name="intent"
                  value={option.value}
                  defaultChecked={option.value === "enquiry"}
                  onChange={() => setIntent(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
          {intent === "scholarship" && (
            <p className="mt-2 text-xs text-muted">
              Scholarship availability and eligibility are decided by Aspire and confirmed when the team responds.
            </p>
          )}
        </fieldset>
      )}

      <p className="mb-3 text-xs text-muted">
        Fields marked <span className="text-danger">*</span> are required.
      </p>

      <div className={grid}>
        {variant === "quick" && (
          <>
            <TextField
              id={fieldId("name")}
              name="name"
              label="Student name"
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
            />
            <SelectField
              id={fieldId("currentClass")}
              name="currentClass"
              label="Current class"
              required
              placeholder="Select class"
              options={CLASS_OPTIONS}
              error={errors.currentClass}
            />
            <SelectField
              id={fieldId("programInterest")}
              name="programInterest"
              label="Interested program"
              required
              placeholder="Select program"
              options={PROGRAM_INTEREST_OPTIONS}
              defaultValue={programDefault}
              error={errors.programInterest}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label="Phone number"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint="Parent or student mobile number."
              error={errors.phone}
            />
          </>
        )}

        {variant === "admissions" && (
          <>
            <TextField
              id={fieldId("name")}
              name="name"
              label="Student name"
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
              className={wide}
            />
            <SelectField
              id={fieldId("currentClass")}
              name="currentClass"
              label="Current class"
              required
              placeholder="Select class"
              options={CLASS_OPTIONS}
              error={errors.currentClass}
            />
            <SelectField
              id={fieldId("programInterest")}
              name="programInterest"
              label="Program"
              required
              placeholder="Select program"
              options={PROGRAM_INTEREST_OPTIONS}
              defaultValue={programDefault}
              error={errors.programInterest}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label="Student or parent phone"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint="10-digit mobile number."
              error={errors.phone}
            />
            <TextField
              id={fieldId("email")}
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              maxLength={254}
              error={errors.email}
            />
            {hasCentreField && (
              <SelectField
                id={fieldId("preferredCentre")}
                name="preferredCentre"
                label="Preferred district or centre"
                options={[NOT_SURE_CENTRE, ...(centreOptions ?? [])]}
                defaultValue={NOT_SURE_CENTRE.value}
                hint="Centre availability is confirmed by Aspire."
                error={errors.preferredCentre}
                className={wide}
              />
            )}
            <TextAreaField
              id={fieldId("message")}
              name="message"
              label="Message"
              rows={4}
              maxLength={MESSAGE_MAX}
              hint={`Anything the admissions team should know. Up to ${MESSAGE_MAX} characters.`}
              error={errors.message}
              className={wide}
            />
          </>
        )}

        {variant === "contact" && (
          <>
            <TextField
              id={fieldId("name")}
              name="name"
              label="Your name"
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label="Phone number"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint="10-digit mobile number."
              error={errors.phone}
            />
            <TextField
              id={fieldId("email")}
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              maxLength={254}
              error={errors.email}
            />
            <SelectField
              id={fieldId("topic")}
              name="topic"
              label="What can we help with?"
              required
              placeholder="Select a topic"
              options={CONTACT_TOPIC_OPTIONS}
              error={errors.topic}
            />
            <TextAreaField
              id={fieldId("message")}
              name="message"
              label="Message"
              rows={5}
              maxLength={MESSAGE_MAX}
              hint={`Your question or any details that will help us respond. Up to ${MESSAGE_MAX} characters.`}
              error={errors.message}
              className={wide}
            />
          </>
        )}

        <ConsentField id={fieldId("consent")} error={errors.consent} className={wide} />
      </div>

      <HoneypotField id={fieldId("website")} />

      <Button
        type="submit"
        aria-disabled={submitting || undefined}
        className={cn(
          "mt-5 aria-disabled:cursor-wait aria-disabled:opacity-70",
          variant === "contact" ? "w-full sm:w-auto" : "w-full",
        )}
      >
        {submitting ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Sending…
          </>
        ) : (
          <>
            {variant === "quick" && intent === "scholarship" ? "Ask about scholarships" : "Send enquiry"}
            <Send aria-hidden="true" className="size-4" />
          </>
        )}
      </Button>
      <p className={cn("mt-2 text-xs text-muted", variant !== "contact" && "text-center")}>
        A reference number is shown here only once Aspire has received your enquiry.
      </p>

      <FormStatus state={state} onContactPage={variant === "contact"} />
    </form>
  );
}
