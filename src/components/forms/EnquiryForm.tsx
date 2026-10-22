"use client";

import { Info, LoaderCircle, Send } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import enForms from "@/i18n/messages/en/forms";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { PROGRAM_INTEREST_OPTIONS, enquirySchema } from "@/lib/contracts/enquiry";
import { captureVisitAttribution, collectEnquiryContext, toolArrivalFrom } from "./enquiry-context";
import {
  FIELD_ORDER,
  buildPayload,
  districtOptions,
  needsDistrict,
  pickErrors,
  type FieldErrors,
  type FieldName,
  type Intent,
} from "./enquiry-payload";
import { localizeFieldErrors } from "./field-errors";
import { ConsentField, HoneypotField, SelectField, TextAreaField, TextField } from "./fields";
import { formatNodes } from "./format-nodes";
import { FormStatus, type FormState } from "./FormStatus";
import { classOptions, programOptions, topicOptions } from "./option-labels";
import { submitEnquiry } from "./submit-enquiry";
import { useLocationSearch } from "./use-location-search";

/**
 * Enquiry form (contract: src/lib/contracts/enquiry.ts, D-008).
 *
 * - Lead capture (D-039): the consent sentence carries its version (hidden `consentVersion`), and
 *   the submit adds attribution `context` (page, locale, utm_* of the visit's landing link, the
 *   external referrer host, the tool CTA `?from=` — see enquiry-context.ts). When the visitor came
 *   from the predictor's CTA, a note says that its exam and score band are added.
 * - Validates on the client with the shared `enquirySchema`, then POSTs JSON to /api/enquiries.
 * - Renders the server's answer honestly: only `received` is reported as a successful enquiry;
 *   `not_configured` says plainly that nothing was sent and keeps the entered data.
 * - Renders only the form (fields, consent, submit, status) — the caller supplies any card chrome.
 *
 * ── Localisation API (M4, D-028) ────────────────────────────────────────────────────────────
 *   // server page (admissions / contact)
 *   const [locale, tForms] = await Promise.all([getLocale(), getMessages("forms")]);
 *   const centres = await getCentres(undefined, locale);
 *   const centreOptions = centres.map((c) => ({
 *     value: c.slug,
 *     label: isPlaceholder(c) ? format(tForms.shared.centreUnverified, { name: c.name }) : c.name,
 *   }));
 *   <EnquiryForm variant="admissions" centreOptions={centreOptions} messages={tForms} />
 *   <EnquiryForm variant="contact" messages={tForms} />
 *
 * - `messages`: the `forms` namespace (`EnquiryFormMessages` = `Pick<Messages<"forms">, "shared" |
 *   "enquiry">`; passing the whole `getMessages("forms")` object is fine). Optional only for
 *   backwards compatibility — without it the form renders English, so ALWAYS pass it.
 * - Links (privacy notice, contact page) use `useLocale()` + `localePath()` internally.
 * - Field errors: the contract's English zod messages are mapped per field onto
 *   `forms.shared.errors` (field-errors.ts). Server outcomes are shown with `forms.shared.status`
 *   copy chosen by outcome kind, never the server's English `message`.
 * - Option values always come from the contract; only their labels are localised.
 * - Lead routing (§13.8): an optional district select, on the contact form always and on the
 *   admissions form while no centre (or "Not sure yet") is chosen. It routes the enquiry to that
 *   district's team.
 * - Unchanged: `variant`, `centreOptions`, `defaultProgram`, `className`.
 */

export type EnquiryFormVariant = "quick" | "admissions" | "contact";

/** The parts of the `forms` namespace this form reads. */
export type EnquiryFormMessages = Pick<Messages<"forms">, "shared" | "enquiry">;

export interface EnquiryFormProps {
  variant: EnquiryFormVariant;
  /** Options for the preferred-centre select (admissions variant). Pass visible centres from getCentres(). */
  centreOptions?: { value: string; label: string }[];
  /** Pre-selects a program, e.g. from a program detail page ("jee" | "neet" | "foundation" | "integrated"). */
  defaultProgram?: string;
  className?: string;
  /** Localised copy: `await getMessages("forms")`. Defaults to English (backwards compatibility only). */
  messages?: EnquiryFormMessages;
}

const MESSAGE_MAX = 1000;

export function EnquiryForm({ variant, centreOptions, defaultProgram, className, messages = enForms }: EnquiryFormProps) {
  const locale = useLocale();
  const { shared, enquiry: t } = messages;
  const intentOptions: { value: Intent; label: string }[] = [
    { value: "enquiry", label: t.intentEnquiry },
    { value: "scholarship", label: t.intentScholarship },
  ];
  const notSureCentre = { value: "not-sure", label: shared.notSureCentre };
  const optional = shared.optionalSuffix;

  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const clearOnHide = useRef(false);

  const [intent, setIntent] = useState<Intent>("enquiry");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>({ kind: "idle" });
  // Mirrors the (uncontrolled) centre select: the district select shows while no centre is chosen.
  const [centreChoice, setCentreChoice] = useState("not-sure");

  // Visit attribution (utm_*, referrer) is recorded when the form mounts; harmless if a layout did it already.
  useEffect(() => {
    captureVisitAttribution();
  }, []);
  // The tool CTA in the URL, read after hydration ("" on the server) — only for the visible note.
  const arrival = toolArrivalFrom(useLocationSearch());
  const showPredictorNote = arrival?.tool === "predictor" && Boolean(arrival.exam || arrival.band);

  const order = FIELD_ORDER[variant];
  const hasCentreField = variant === "admissions" && (centreOptions?.length ?? 0) > 0;
  const showDistrict = variant === "contact" || (variant === "admissions" && (!hasCentreField || needsDistrict(centreChoice)));
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
      setErrors(localizeFieldErrors(next, shared.errors));
      setState({ kind: "invalid", count: Object.keys(next).length, origin });
    });
    const first = order.find((field) => next[field]);
    if (first) focusField(first);
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target as { name?: string; value?: string };
    if (target.name === "preferredCentre") setCentreChoice(target.value ?? "");
    const name = target.name as FieldName | undefined;
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
    const payload = buildPayload(variant, new FormData(form), intent, hasCentreField, collectEnquiryContext(locale));

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
        setCentreChoice("not-sure");
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
          <legend className="sr-only">{t.intentLegend}</legend>
          <div className="flex gap-1 rounded-[9px] bg-surface p-1">
            {intentOptions.map((option) => (
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
            <p className="mt-2 text-xs text-muted">{t.scholarshipNote}</p>
          )}
        </fieldset>
      )}

      <p className="mb-3 text-xs text-muted">
        {formatNodes(shared.requiredNote, { star: <span className="text-danger">*</span> })}
      </p>

      <div className={grid}>
        {variant === "quick" && (
          <>
            <TextField
              id={fieldId("name")}
              name="name"
              label={t.labels.studentName}
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
            />
            <SelectField
              id={fieldId("currentClass")}
              name="currentClass"
              label={t.labels.currentClass}
              required
              placeholder={t.placeholders.selectClass}
              options={classOptions(shared.options)}
              error={errors.currentClass}
            />
            <SelectField
              id={fieldId("programInterest")}
              name="programInterest"
              label={t.labels.interestedProgram}
              required
              placeholder={t.placeholders.selectProgram}
              options={programOptions(shared.options)}
              defaultValue={programDefault}
              error={errors.programInterest}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label={t.labels.phone}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint={t.hints.quickPhone}
              error={errors.phone}
            />
          </>
        )}

        {variant === "admissions" && (
          <>
            <TextField
              id={fieldId("name")}
              name="name"
              label={t.labels.studentName}
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
              className={wide}
            />
            <SelectField
              id={fieldId("currentClass")}
              name="currentClass"
              label={t.labels.currentClass}
              required
              placeholder={t.placeholders.selectClass}
              options={classOptions(shared.options)}
              error={errors.currentClass}
            />
            <SelectField
              id={fieldId("programInterest")}
              name="programInterest"
              label={t.labels.program}
              required
              placeholder={t.placeholders.selectProgram}
              options={programOptions(shared.options)}
              defaultValue={programDefault}
              error={errors.programInterest}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label={t.labels.studentOrParentPhone}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint={t.hints.phone}
              error={errors.phone}
            />
            <TextField
              id={fieldId("email")}
              name="email"
              label={t.labels.email}
              optionalLabel={optional}
              type="email"
              autoComplete="email"
              maxLength={254}
              error={errors.email}
            />
            {hasCentreField && (
              <SelectField
                id={fieldId("preferredCentre")}
                name="preferredCentre"
                label={t.labels.preferredCentre}
                optionalLabel={optional}
                options={[notSureCentre, ...(centreOptions ?? [])]}
                defaultValue={notSureCentre.value}
                hint={t.hints.centre}
                error={errors.preferredCentre}
                className={wide}
              />
            )}
            {showDistrict && (
              <SelectField
                id={fieldId("district")}
                name="district"
                label={shared.district.label}
                optionalLabel={optional}
                placeholder={shared.district.placeholder}
                options={districtOptions(locale, shared.district.outsideHp)}
                hint={shared.district.hint}
                error={errors.district}
                className={wide}
              />
            )}
            <TextAreaField
              id={fieldId("message")}
              name="message"
              label={t.labels.message}
              optionalLabel={optional}
              rows={4}
              maxLength={MESSAGE_MAX}
              hint={format(t.hints.admissionsMessage, { max: MESSAGE_MAX })}
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
              label={t.labels.yourName}
              required
              autoComplete="name"
              maxLength={80}
              error={errors.name}
            />
            <TextField
              id={fieldId("phone")}
              name="phone"
              label={t.labels.phone}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              hint={t.hints.phone}
              error={errors.phone}
            />
            <TextField
              id={fieldId("email")}
              name="email"
              label={t.labels.email}
              optionalLabel={optional}
              type="email"
              autoComplete="email"
              maxLength={254}
              error={errors.email}
            />
            <SelectField
              id={fieldId("topic")}
              name="topic"
              label={t.labels.topic}
              required
              placeholder={t.placeholders.selectTopic}
              options={topicOptions(shared.options)}
              error={errors.topic}
            />
            {showDistrict && (
              <SelectField
                id={fieldId("district")}
                name="district"
                label={shared.district.label}
                optionalLabel={optional}
                placeholder={shared.district.placeholder}
                options={districtOptions(locale, shared.district.outsideHp)}
                hint={shared.district.hint}
                error={errors.district}
                className={wide}
              />
            )}
            <TextAreaField
              id={fieldId("message")}
              name="message"
              label={t.labels.message}
              optionalLabel={optional}
              rows={5}
              maxLength={MESSAGE_MAX}
              hint={format(t.hints.contactMessage, { max: MESSAGE_MAX })}
              error={errors.message}
              className={wide}
            />
          </>
        )}

        {showPredictorNote && (
          <p className={cn("flex items-start gap-2 rounded-lg bg-blue-soft p-3 text-[13px] leading-snug text-navy", wide)}>
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t.fromPredictor}</span>
          </p>
        )}

        <ConsentField
          id={fieldId("consent")}
          error={errors.consent}
          className={wide}
          text={shared.consent}
          linkText={shared.consentLink}
          privacyHref={localePath("/privacy", locale)}
        />
      </div>

      <HoneypotField id={fieldId("website")} label={shared.honeypotLabel} />

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
            {shared.sending}
          </>
        ) : (
          <>
            {variant === "quick" && intent === "scholarship" ? t.submitScholarship : t.submit}
            <Send aria-hidden="true" className="size-4" />
          </>
        )}
      </Button>
      <p className={cn("mt-2 text-xs text-muted", variant !== "contact" && "text-center")}>
        {t.referenceNote}
      </p>

      <FormStatus
        state={state}
        onContactPage={variant === "contact"}
        messages={shared}
        contactHref={localePath("/contact", locale)}
      />
    </form>
  );
}
