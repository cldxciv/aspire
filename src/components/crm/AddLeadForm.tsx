"use client";

import { LoaderCircle, Plus, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { districtOptions } from "@/components/forms/enquiry-payload";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import enAreas from "@/i18n/messages/en/crm-areas";
import hiAreas from "@/i18n/messages/hi/crm-areas";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { CONSENT_METHODS, MANUAL_LEAD_SOURCES, type ManualLeadAnswer, type ManualLeadResult } from "@/lib/crm/types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import { ADD_LEAD_PARAM, DEFAULT_BACK, withBack } from "./format";
import {
  EMPTY_MANUAL_LEAD,
  manualLeadRequest,
  NOTE_MAX,
  type ManualLeadField,
  type ManualLeadIssue,
  type ManualLeadValues,
} from "./lead-forms";
import type { Option } from "./types";

/** The `crm` message slices the "Add enquiry" drawer needs. */
export type AddLeadMessages = Pick<Messages<"crm">, "add" | "common" | "errors">;

/** `openId`: the lead's id when the viewer may open it, else null (no "Open" button). */
type Phase =
  | { kind: "form" }
  | { kind: "duplicate"; openId: string | null; closed: boolean; withdrawn: boolean }
  | { kind: "done"; openId: string | null; message: string };

const PAGE_PATH = "/crm";

/**
 * "+ Add enquiry" (admin-console plan §8, Agent B): a walk-in, phone call, referral or other
 * family, with how they agreed to be contacted. The drawer opens from its own button or when the
 * page is opened with `?add=1` (`openSignal` changes on every such request). A number already on
 * file is only REPORTED first ("This family already exists" with "Open" and "Log a visit"); "Log a
 * visit" adds this contact to that family's record. A new lead the viewer may open is opened.
 */
export function AddLeadForm({
  openSignal,
  sources,
  options,
  t,
}: {
  /** Set (to the request time) when the page was opened with `?add=1`; null otherwise. */
  openSignal: number | null;
  /** Manual sources (walk-in, phone call, referral, other), labelled. */
  sources: Option[];
  options: { classes: Option[]; programs: Option[]; centres: Option[] };
  t: AddLeadMessages;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const a = t.add;
  const router = useRouter();
  const locale = useLocale();
  // Lead routing (§13.8; LR-ROUTING): the district select's copy lives in the areas messages.
  const district = (locale === "hi" ? hiAreas : enAreas).addLead;
  const [open, setOpen] = useState(openSignal !== null);
  const [values, setValues] = useState<ManualLeadValues>(EMPTY_MANUAL_LEAD);
  const [issues, setIssues] = useState<Partial<Record<ManualLeadField, ManualLeadIssue>>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const action = useCrmAction(t, PAGE_PATH);

  useEffect(() => {
    if (openSignal !== null) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (phase.kind !== "form") resultHeading.current?.focus();
  }, [phase]);

  function close() {
    setOpen(false);
    // Drop `?add=1` so a reload does not reopen the drawer (the Next router follows replaceState).
    const url = new URL(window.location.href);
    if (url.searchParams.has(ADD_LEAD_PARAM)) {
      url.searchParams.delete(ADD_LEAD_PARAM);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function startOver() {
    setValues(EMPTY_MANUAL_LEAD);
    setIssues({});
    setPhase({ kind: "form" });
    action.reset();
  }

  const leadHref = (leadId: string) => withBack(localePath(`/crm/leads/${encodeURIComponent(leadId)}`, locale), DEFAULT_BACK.path);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = manualLeadRequest(values, "report");
    if (!built.ok) {
      setIssues(built.issues);
      const order: ManualLeadField[] = ["source", "name", "phone", "email", "note", "consentMethod", "consent"];
      const first = order.find((field) => built.issues[field]);
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setIssues({});
    const data = await action.run<ManualLeadAnswer>(built.request);
    if (!data) return;
    if (data.duplicate) {
      setPhase({ kind: "duplicate", openId: data.canOpen ? data.leadId : null, closed: data.closed === true, withdrawn: data.withdrawn === true });
      return;
    }
    if (data.isNew && data.canOpen) {
      router.push(leadHref(data.leadId));
      setPhase({ kind: "done", openId: data.leadId, message: a.created });
      return;
    }
    setPhase({ kind: "done", openId: data.canOpen ? data.leadId : null, message: data.isNew ? a.createdHidden : a.logged });
  }

  async function logVisit() {
    const built = manualLeadRequest(values, "append");
    if (!built.ok) {
      setIssues(built.issues);
      setPhase({ kind: "form" });
      return;
    }
    const data = await action.run<ManualLeadResult>(built.request);
    if (!data) return;
    setPhase({ kind: "done", openId: data.canOpen ? data.leadId : null, message: data.isNew ? a.created : a.logged });
  }

  const set = (field: keyof ManualLeadValues) => (value: string | boolean) => setValues((current) => ({ ...current, [field]: value }));
  const issueText = (field: ManualLeadField): string | null => {
    const issue = issues[field];
    if (!issue) return null;
    const m = a.issues;
    switch (field) {
      case "source":
        return m.sourceRequired;
      case "name":
        return issue === "required" ? m.nameRequired : m.nameInvalid;
      case "phone":
        return issue === "required" ? m.phoneRequired : m.phoneInvalid;
      case "email":
        return m.emailInvalid;
      case "note":
        return format(m.noteTooLong, { max: NOTE_MAX });
      case "consentMethod":
        return m.consentMethodRequired;
      case "consent":
        return m.consentRequired;
    }
  };
  const errorFor = (field: ManualLeadField) => {
    const text = issueText(field);
    return text ? (
      <p id={`${id}-${field}-error`} className="text-sm font-semibold text-danger">
        {text}
      </p>
    ) : null;
  };
  const invalid = (field: ManualLeadField) =>
    issues[field] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${field}-error` } : {};
  const select = (field: "currentClass" | "programInterest" | "centreSlug", label: string, list: Option[]) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${field}`} className={labelClasses}>
        {label} <span className="font-normal text-muted">{t.common.optional}</span>
      </label>
      <select id={`${id}-${field}`} value={values[field]} onChange={(event) => set(field)(event.target.value)} className={fieldClasses}>
        <option value="">{a.notGiven}</option>
        {list.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
  // Both name inputs point at the "at least one of the two names" hint (and its error, if any).
  const nameDescribed = {
    "aria-invalid": issues.name ? (true as const) : undefined,
    "aria-describedby": issues.name ? `${id}-name-hint ${id}-name-error` : `${id}-name-hint`,
  };
  const choice = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 has-checked:border-blue has-checked:bg-blue-soft";

  return (
    <>
      <Button variant="dark" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {a.button}
      </Button>
      <CrmDialog open={open} titleId={titleId} onClose={close} drawer>
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
            <h2 id={titleId} className="flex items-center gap-2 text-lg font-extrabold text-navy">
              <UserPlus aria-hidden="true" className="size-5" />
              {a.title}
            </h2>
            <button
              type="button"
              onClick={close}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-navy hover:bg-surface"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">{t.common.close}</span>
            </button>
          </div>

          {phase.kind === "form" ? (
            <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4 p-5" aria-busy={action.pending || undefined}>
              <p className="text-sm text-muted">{a.intro}</p>

              <fieldset id={`${id}-source`} tabIndex={-1} {...(issues.source ? { "aria-describedby": `${id}-source-error` } : {})}>
                <legend className={labelClasses}>
                  {a.source} <span className="font-normal text-muted">{t.common.required}</span>
                </legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sources
                    .filter((option) => (MANUAL_LEAD_SOURCES as readonly string[]).includes(option.value))
                    .map((option) => (
                      <label key={option.value} className={choice}>
                        <input
                          type="radio"
                          name={`${id}-source`}
                          value={option.value}
                          checked={values.source === option.value}
                          onChange={() => set("source")(option.value)}
                          className="size-4 accent-[#1768d4]"
                        />
                        <span className="text-sm font-semibold">{option.label}</span>
                      </label>
                    ))}
                </div>
                {errorFor("source")}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-name`} className={labelClasses}>
                    {a.studentName}
                  </label>
                  <input
                    id={`${id}-name`}
                    value={values.studentName}
                    maxLength={80}
                    autoComplete="off"
                    {...nameDescribed}
                    onChange={(event) => set("studentName")(event.target.value)}
                    className={fieldClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-guardian`} className={labelClasses}>
                    {a.guardianName}
                  </label>
                  <input
                    id={`${id}-guardian`}
                    value={values.guardianName}
                    maxLength={80}
                    autoComplete="off"
                    {...nameDescribed}
                    onChange={(event) => set("guardianName")(event.target.value)}
                    className={fieldClasses}
                  />
                </div>
                <p id={`${id}-name-hint`} className="-mt-2 text-xs text-muted sm:col-span-2">
                  {a.nameHint}
                </p>
                <div className="sm:col-span-2">{errorFor("name")}</div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-phone`} className={labelClasses}>
                  {a.phone} <span className="font-normal text-muted">{t.common.required}</span>
                </label>
                <input
                  id={`${id}-phone`}
                  type="tel"
                  inputMode="tel"
                  value={values.phone}
                  maxLength={32}
                  autoComplete="off"
                  lang="en"
                  aria-invalid={issues.phone ? true : undefined}
                  aria-describedby={issues.phone ? `${id}-phone-hint ${id}-phone-error` : `${id}-phone-hint`}
                  onChange={(event) => set("phone")(event.target.value)}
                  className={fieldClasses}
                />
                <p id={`${id}-phone-hint`} className="text-xs text-muted">
                  {a.phoneHint}
                </p>
                {errorFor("phone")}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-email`} className={labelClasses}>
                  {a.email} <span className="font-normal text-muted">{t.common.optional}</span>
                </label>
                <input
                  id={`${id}-email`}
                  type="email"
                  value={values.email}
                  maxLength={254}
                  autoComplete="off"
                  lang="en"
                  {...invalid("email")}
                  onChange={(event) => set("email")(event.target.value)}
                  className={fieldClasses}
                />
                {errorFor("email")}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {select("currentClass", a.class, options.classes)}
                {select("programInterest", a.program, options.programs)}
                <div className="sm:col-span-2">{select("centreSlug", a.centre, options.centres)}</div>
                {!values.centreSlug && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label htmlFor={`${id}-district`} className={labelClasses}>
                      {district.district} <span className="font-normal text-muted">{t.common.optional}</span>
                    </label>
                    <select
                      id={`${id}-district`}
                      value={values.district}
                      aria-describedby={`${id}-district-hint`}
                      onChange={(event) => set("district")(event.target.value)}
                      className={fieldClasses}
                    >
                      <option value="">{district.notGiven}</option>
                      {districtOptions(locale, district.outsideHp).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p id={`${id}-district-hint`} className="text-xs text-muted">
                      {district.districtHint}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-note`} className={labelClasses}>
                  {a.note} <span className="font-normal text-muted">{t.common.optional}</span>
                </label>
                <textarea
                  id={`${id}-note`}
                  value={values.note}
                  rows={3}
                  maxLength={NOTE_MAX}
                  placeholder={a.notePlaceholder}
                  {...invalid("note")}
                  onChange={(event) => set("note")(event.target.value)}
                  className={cn(fieldClasses, "min-h-20")}
                />
                {errorFor("note")}
              </div>

              <fieldset id={`${id}-consentMethod`} tabIndex={-1} {...(issues.consentMethod ? { "aria-describedby": `${id}-consentMethod-error` } : {})}>
                <legend className={labelClasses}>
                  {a.consentMethod} <span className="font-normal text-muted">{t.common.required}</span>
                </legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CONSENT_METHODS.map((method) => (
                    <label key={method} className={choice}>
                      <input
                        type="radio"
                        name={`${id}-consentMethod`}
                        value={method}
                        checked={values.consentMethod === method}
                        onChange={() => set("consentMethod")(method)}
                        className="size-4 accent-[#1768d4]"
                      />
                      <span className="text-sm">{a.consentMethods[method]}</span>
                    </label>
                  ))}
                </div>
                {errorFor("consentMethod")}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line p-3">
                  <input
                    id={`${id}-consent`}
                    type="checkbox"
                    checked={values.consent}
                    {...invalid("consent")}
                    onChange={(event) => set("consent")(event.target.checked)}
                    className="mt-0.5 size-5 shrink-0 accent-[#1768d4]"
                  />
                  <span className="text-sm font-semibold text-ink">{a.consent}</span>
                </label>
                {errorFor("consent")}
              </div>

              <ActionFeedback status="" error={action.error} />
              <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                <Button variant="outline" onClick={close}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" variant="dark" disabled={action.pending}>
                  {action.pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden="true" className="size-4" />}
                  {a.submit}
                </Button>
              </div>
            </form>
          ) : phase.kind === "duplicate" ? (
            <div className="flex flex-col gap-4 p-5" aria-busy={action.pending || undefined}>
              <div className="rounded-control border border-[#f2dfa0] bg-gold-soft p-4">
                <h3 ref={resultHeading} tabIndex={-1} className="text-base font-extrabold text-navy">
                  {a.duplicateTitle}
                </h3>
                <p className="mt-1 text-sm text-ink">{phase.openId ? a.duplicateBody : a.duplicateHidden}</p>
                {(phase.withdrawn || phase.closed) && (
                  <div id={`${id}-duplicate-warning`} className="mt-2 space-y-1 text-sm font-bold text-ink">
                    {phase.withdrawn && <p>{a.duplicateWithdrawn}</p>}
                    {phase.closed && <p>{a.duplicateClosed}</p>}
                  </div>
                )}
              </div>
              <ActionFeedback status="" error={action.error} />
              <div className="flex flex-wrap gap-2">
                {phase.openId && (
                  <Link
                    href={leadHref(phase.openId)}
                    onClick={close}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-2"
                  >
                    {a.open}
                  </Link>
                )}
                <Button
                  variant="outline"
                  onClick={logVisit}
                  disabled={action.pending}
                  aria-describedby={phase.withdrawn || phase.closed ? `${id}-duplicate-warning` : undefined}
                >
                  {action.pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
                  {values.source === "walk_in" ? a.logVisit : a.logContact}
                </Button>
                <Button variant="light" onClick={() => setPhase({ kind: "form" })}>
                  {t.common.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-5">
              <div className="rounded-control border border-[#bfe5cf] bg-success-soft p-4">
                <h3 ref={resultHeading} tabIndex={-1} className="text-base font-extrabold text-[#0f5a3c]">
                  {phase.message}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {phase.openId && (
                  <Link
                    href={leadHref(phase.openId)}
                    onClick={close}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-2"
                  >
                    {a.open}
                  </Link>
                )}
                <Button variant="outline" onClick={startOver}>
                  {a.another}
                </Button>
                <Button variant="light" onClick={close}>
                  {t.common.close}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CrmDialog>
    </>
  );
}
