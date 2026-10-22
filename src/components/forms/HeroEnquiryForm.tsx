"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  GraduationCap,
  Info,
  LoaderCircle,
  Lock,
  MapPin,
  MapPinned,
  Phone,
  Send,
  User,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import enForms from "@/i18n/messages/en/forms";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { enquirySchema, validateHeroStep, type HeroFieldName, type HeroStepIndex } from "@/lib/contracts/enquiry";
import { captureVisitAttribution, collectEnquiryContext } from "./enquiry-context";
import { buildHeroPayload, districtOptions, needsDistrict } from "./enquiry-payload";
import { localizeFieldErrors } from "./field-errors";
import { ConsentField, HoneypotField, SelectField, TextAreaField, TextField } from "./fields";
import { formatNodes } from "./format-nodes";
import { DirectContact, FormStatus, type FormState } from "./FormStatus";
import {
  LAST_HERO_STEP,
  firstHeroError,
  heroStepLabel,
  heroSteps,
  nextHeroStep,
  pickHeroErrors,
  previousHeroStep,
  withStepErrors,
  type HeroFieldErrors,
} from "./hero-steps";
import { classExamGroups } from "./option-labels";
import { StepProgress } from "./StepProgress";
import { submitEnquiry } from "./submit-enquiry";

/**
 * Home hero 3-step enquiry form (contract `source: "hero"`, D-021 + D-021a; plan §5).
 *
 * 1 Student Information (name, class / target exam) · 2 Contact Details (parent / guardian
 * name, mobile) · 3 Preferences (centre if any, the district while no centre is chosen (lead
 * routing §13.8), optional message, consent, submit).
 *
 * - All three fieldsets stay mounted; inactive ones get `hidden`, so one FormData holds every
 *   step and values survive Back. No form values are stored in the browser.
 * - One submit handler: on steps 1–2 it is "Next" (Enter too) and validates only that step with
 *   the contract's `validateHeroStep`; on step 3 it validates everything with `enquirySchema`
 *   and POSTs once. No per-step requests, no analytics.
 * - Only `received` is shown as success. `not_configured` says plainly that nothing was sent
 *   and keeps every value; other failures reuse FormStatus copy.
 * - Lead capture (D-039): step 3's consent sentence carries its version (hidden input), and the
 *   final POST adds attribution `context` (enquiry-context.ts). Nothing is added to steps 1–2.
 *
 * Localisation (D-028): pass `messages={await getMessages("forms")}` (or `{ shared, hero }`);
 * English is the default. Field errors are mapped per field to `forms.shared.errors`; links use
 * `useLocale()` + `localePath()`. Centre option labels come localised from the server page
 * (`forms.shared.centreUnverified` for unverified centres).
 */

export type EnquiryDeliveryStatus = "connected" | "not_configured";

/** The parts of the `forms` namespace this form reads. */
export type HeroEnquiryFormMessages = Pick<Messages<"forms">, "shared" | "hero">;

export interface HeroEnquiryFormProps {
  /** Visible centres (value = slug). The centre select is omitted when empty. */
  centreOptions: { value: string; label: string }[];
  /** Whether the server has an enquiry destination. Drives honest copy before submitting. */
  deliveryStatus: EnquiryDeliveryStatus;
  /** id of the card (anchor target, e.g. "home-enquiry"). */
  id?: string;
  /** Card placement classes from the caller. */
  className?: string;
  /** Localised copy: `await getMessages("forms")`. Defaults to English. */
  messages?: HeroEnquiryFormMessages;
}

const MESSAGE_MAX = 1000;
/** The centre select's default ("Not sure yet"). */
const PREFERRED_CENTRE_DEFAULT = "not-sure";
/** 72px sticky site header plus breathing room: content above this line is hidden behind it. */
const STICKY_HEADER_OFFSET = 84;

export function HeroEnquiryForm({
  centreOptions,
  deliveryStatus,
  id,
  className,
  messages = enForms,
}: HeroEnquiryFormProps) {
  const locale = useLocale();
  const { shared, hero: t } = messages;
  const steps = heroSteps(t.steps);
  const notSureCentre = { value: "not-sure", label: shared.notSureCentre };
  const privacyHref = localePath("/privacy", locale);
  const contactHref = localePath("/contact", locale);

  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const titleId = fieldId("title");

  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const clearOnHide = useRef(false);

  const [step, setStep] = useState<HeroStepIndex>(0);
  const [errors, setErrors] = useState<HeroFieldErrors>({});
  const [state, setState] = useState<FormState>({ kind: "idle" });
  // Mirrors the (uncontrolled) centre select: the district select shows while no centre is chosen.
  const [centreChoice, setCentreChoice] = useState(PREFERRED_CENTRE_DEFAULT);

  const hasCentreField = centreOptions.length > 0;
  const showDistrict = !hasCentreField || needsDistrict(centreChoice);
  const notConnected = deliveryStatus === "not_configured";
  const submitting = state.kind === "submitting";
  const received = state.kind === "received" ? state : null;
  const isLastStep = step === LAST_HERO_STEP;

  // Visit attribution (utm_*, referrer) is recorded when the form mounts (home page landings).
  useEffect(() => {
    captureVisitAttribution();
  }, []);

  // Routes stay mounted (hidden) after navigation. Clear a stale success panel when this
  // form is hidden, so returning to the page shows a fresh step 1.
  useLayoutEffect(() => {
    return () => {
      if (clearOnHide.current) {
        clearOnHide.current = false;
        setState({ kind: "idle" });
        setStep(0);
      }
    };
  }, []);

  /** Brings the card's top edge below the sticky header when a step change left it above the viewport (mobile). */
  function revealCardTop() {
    const card = cardRef.current;
    if (!card) return;
    const top = card.getBoundingClientRect().top;
    // `scroll-behavior` on <html> makes this smooth, and instant under reduced motion.
    if (top < STICKY_HEADER_OFFSET) window.scrollBy({ top: top - STICKY_HEADER_OFFSET });
  }

  function focusStepHeading(target: HeroStepIndex) {
    headingRefs.current[target]?.focus({ preventScroll: true });
    revealCardTop();
  }

  function focusField(name: HeroFieldName) {
    const element = formRef.current?.elements.namedItem(name);
    if (!(element instanceof HTMLElement)) return;
    element.focus({ preventScroll: true });
    const rect = element.getBoundingClientRect();
    if (rect.top < STICKY_HEADER_OFFSET || rect.bottom > window.innerHeight) {
      element.scrollIntoView({ block: "center" });
    }
  }

  /** Back: never validates, keeps every value. */
  function goBack() {
    if (inFlight.current || step === 0) return;
    const target = previousHeroStep(step);
    flushSync(() => {
      setStep(target);
      setState({ kind: "idle" });
    });
    focusStepHeading(target);
  }

  /** Shows errors, jumps to the step of the first one and focuses that field. */
  function showErrors(next: HeroFieldErrors, count: number, origin: "client" | "server") {
    const first = firstHeroError(next);
    // Commit first so the focused field already carries aria-invalid + its message.
    flushSync(() => {
      setErrors(localizeFieldErrors(next, shared.errors));
      setState({ kind: "invalid", count, origin });
      if (first) setStep(first.step);
    });
    if (first) focusField(first.field);
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target as { name?: string; value?: string };
    const name = target.name;
    if (name === "preferredCentre") setCentreChoice(target.value ?? "");
    if (!name || !(name in errors)) return;
    const next = { ...errors };
    delete next[name as HeroFieldName];
    setErrors(next);
    if (Object.keys(next).length === 0) {
      setState((current) => (current.kind === "invalid" ? { kind: "idle" } : current));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return; // no double submit

    const form = event.currentTarget;
    const payload = buildHeroPayload(new FormData(form), hasCentreField, isLastStep ? collectEnquiryContext(locale) : undefined);

    // Steps 1–2: "Next" — validate this step only.
    if (!isLastStep) {
      const stepErrors = pickHeroErrors(validateHeroStep(step, payload));
      const count = Object.keys(stepErrors).length;
      if (count > 0) {
        showErrors(withStepErrors(errors, step, stepErrors), count, "client");
        return;
      }
      const target = nextHeroStep(step);
      flushSync(() => {
        setErrors(withStepErrors(errors, step, {}));
        setState({ kind: "idle" });
        setStep(target);
      });
      focusStepHeading(target);
      return;
    }

    // Step 3: validate the whole enquiry, then POST once.
    const parsed = enquirySchema.safeParse(payload);
    if (!parsed.success) {
      const picked = pickHeroErrors(z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>);
      const count = Object.keys(picked).length;
      if (count > 0) showErrors(picked, count, "client");
      // An error on a field no step renders (should not happen) — never send invalid data.
      else setState({ kind: "rejected" });
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
        setCentreChoice(PREFERRED_CENTRE_DEFAULT);
        clearOnHide.current = true;
        flushSync(() => setState(outcome));
        successHeadingRef.current?.focus({ preventScroll: true });
        revealCardTop();
        return;
      case "validation": {
        const picked = pickHeroErrors(outcome.fieldErrors);
        const count = Object.keys(picked).length;
        if (count > 0) showErrors(picked, count, "server");
        else setState({ kind: "rejected" });
        return;
      }
      default:
        // not_configured, rate_limited, errors: stay on step 3, keep everything, don't move focus.
        setState(outcome);
    }
  }

  function startOver() {
    formRef.current?.reset();
    setCentreChoice(PREFERRED_CENTRE_DEFAULT);
    clearOnHide.current = false;
    flushSync(() => {
      setState({ kind: "idle" });
      setErrors({});
      setStep(0);
    });
    focusStepHeading(0);
  }

  /**
   * Each step's fieldset: inactive steps get the `hidden` attribute (never `disabled` or
   * unmounting) so their values stay in FormData. Opacity-only entrance when a step is
   * revealed; none under reduced motion. The legend's h3 is the focus target on step change.
   */
  const stepFieldset = (index: HeroStepIndex, children: ReactNode) => (
    <fieldset
      hidden={index !== step}
      aria-describedby={fieldId(`step-${index}-description`)}
      className="min-w-0 transition-opacity duration-200 motion-safe:starting:opacity-0"
    >
      <legend className="flex w-full items-start justify-between gap-3">
        <h3
          ref={(element) => {
            headingRefs.current[index] = element;
          }}
          tabIndex={-1}
          className="rounded-sm text-base font-bold leading-snug text-navy"
        >
          <span className="block text-xs font-semibold leading-4 text-muted">
            {heroStepLabel(index, t.stepLabel)}
            <span className="sr-only">:</span>
          </span>{" "}
          {steps[index].title}
        </h3>
        {/* The asterisk key for sighted users; controls expose aria-required themselves. */}
        <span aria-hidden="true" className="shrink-0 text-xs leading-4 text-muted">
          <span className="text-danger">*</span> {shared.requiredKey}
        </span>
      </legend>
      <p id={fieldId(`step-${index}-description`)} className="text-[13px] leading-5 text-muted">
        {steps[index].description}
      </p>
      <div className="mt-3 grid gap-3 short:lg:mt-2.5 short:lg:gap-2.5">{children}</div>
    </fieldset>
  );

  return (
    <div
      ref={cardRef}
      id={id}
      data-surface="light"
      className={cn(
        "rounded-card bg-white p-5 text-ink shadow-[0_24px_60px_rgb(0_0_0/0.3)] sm:p-6 short:lg:py-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id={titleId} className="font-serif text-[28px] font-bold leading-none tracking-tight text-navy">
          {t.title}
        </h2>
        <StepProgress
          steps={steps}
          current={step}
          complete={Boolean(received)}
          label={t.progressLabel}
          completedSuffix={t.completedSuffix}
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted">{t.intro}</p>
      <hr className="my-3.5 border-line short:lg:my-3" />

      <form
        ref={formRef}
        noValidate
        hidden={Boolean(received)}
        onSubmit={handleSubmit}
        onChange={handleChange}
        aria-labelledby={titleId}
        aria-busy={submitting || undefined}
      >
        {/* Spam honeypot: rendered once, outside the steps. */}
        <HoneypotField id={fieldId("website")} label={shared.honeypotLabel} />

        {stepFieldset(
          0,
          <>
            <TextField
              inset
              icon={User}
              id={fieldId("name")}
              name="name"
              label={t.labels.studentName}
              required
              autoComplete="off"
              maxLength={80}
              placeholder={t.placeholders.studentName}
              error={errors.name}
            />
            <SelectField
              inset
              icon={GraduationCap}
              id={fieldId("classOrExam")}
              name="classOrExam"
              label={t.labels.classOrExam}
              required
              placeholder={t.placeholders.classOrExam}
              groups={classExamGroups(shared.options)}
              error={errors.classOrExam}
            />
          </>,
        )}

        {stepFieldset(
          1,
          <>
            <TextField
              inset
              icon={UserRound}
              id={fieldId("guardianName")}
              name="guardianName"
              label={t.labels.guardianName}
              required
              autoComplete="name"
              maxLength={80}
              placeholder={t.placeholders.guardianName}
              error={errors.guardianName}
            />
            <TextField
              inset
              icon={Phone}
              id={fieldId("phone")}
              name="phone"
              label={t.labels.mobile}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder={t.placeholders.mobile}
              hint={t.hints.mobile}
              error={errors.phone}
            />
          </>,
        )}

        {stepFieldset(
          2,
          <>
            {hasCentreField && (
              <SelectField
                inset
                icon={MapPin}
                id={fieldId("preferredCentre")}
                name="preferredCentre"
                label={t.labels.preferredCentre}
                optionalLabel={shared.optionalSuffix}
                options={[notSureCentre, ...centreOptions]}
                defaultValue={notSureCentre.value}
                error={errors.preferredCentre}
              />
            )}
            {showDistrict && (
              <SelectField
                inset
                icon={MapPinned}
                id={fieldId("district")}
                name="district"
                label={shared.district.label}
                optionalLabel={shared.optionalSuffix}
                placeholder={shared.district.placeholder}
                options={districtOptions(locale, shared.district.outsideHp)}
                hint={shared.district.hint}
                error={errors.district}
              />
            )}
            <TextAreaField
              inset
              id={fieldId("message")}
              name="message"
              label={t.labels.message}
              optionalLabel={shared.optionalSuffix}
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder={t.placeholders.message}
              hint={format(t.hints.message, { max: MESSAGE_MAX })}
              error={errors.message}
            />
            <ConsentField
              id={fieldId("consent")}
              error={errors.consent}
              large
              text={shared.consent}
              linkText={shared.consentLink}
              privacyHref={privacyHref}
            />
            {notConnected && (
              <Notice variant="info" title={t.notConnectedTitle}>
                {format(t.notConnectedBody, { check: t.check })}{" "}
                <DirectContact onContactPage={false} messages={shared.directContact} contactHref={contactHref} />
              </Notice>
            )}
          </>,
        )}

        <div className="mt-4 flex gap-3 short:lg:mt-3">
          {step > 0 && (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t.back}
            </Button>
          )}
          <Button
            type="submit"
            aria-disabled={submitting || undefined}
            className="flex-1 aria-disabled:cursor-wait aria-disabled:opacity-70"
          >
            {submitting ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                {notConnected ? t.checking : shared.sending}
              </>
            ) : isLastStep ? (
              <>
                {notConnected ? t.check : t.submit}
                {!notConnected && <Send aria-hidden="true" className="size-4" />}
              </>
            ) : (
              <>
                {t.next}
                <ArrowRight aria-hidden="true" className="size-4" />
              </>
            )}
          </Button>
        </div>

        {!isLastStep && (
          <div className="mt-3 space-y-1.5 text-xs leading-4 text-muted short:lg:mt-2.5">
            {step === 0 && notConnected && (
              <p className="flex items-start gap-1.5 font-semibold text-[#7a5600]">
                <Info aria-hidden="true" className="size-3.5 shrink-0" />
                {t.notConnectedShort}
              </p>
            )}
            <p className="flex items-start gap-1.5">
              <Lock aria-hidden="true" className="size-3.5 shrink-0" />
              <span>
                {/* No "only"/"safe" promise until the privacy notice's TBC items are confirmed (FP-4/FP-6). */}
                {t.privacyNote}{" "}
                <Link
                  href={privacyHref}
                  className="whitespace-nowrap font-semibold text-blue underline underline-offset-2 hover:text-navy"
                >
                  {t.privacyLink}
                </Link>
              </span>
            </p>
          </div>
        )}

        <FormStatus
          state={received ? { kind: "idle" } : state}
          onContactPage={false}
          messages={shared}
          contactHref={contactHref}
        />
      </form>

      {received && (
        <div>
          <div className="flex items-start gap-3">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-7 shrink-0 text-success" />
            <div>
              <h3 ref={successHeadingRef} tabIndex={-1} className="rounded-sm text-lg font-bold leading-snug text-navy">
                {shared.status.receivedTitle}
              </h3>
              <p className="mt-1 text-sm">
                {formatNodes(shared.status.receivedBody, {
                  reference: <strong className="font-extrabold">{received.reference}</strong>,
                })}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={startOver} className="mt-5 w-full">
            {t.startOver}
          </Button>
        </div>
      )}
    </div>
  );
}
