"use client";

import { LoaderCircle, Pencil } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import {
  BOARDS,
  DECISION_MAKERS,
  HEARD_VIA,
  HOSTEL_ANSWERS,
  PREFERRED_TIMES,
  TARGET_EXAMS,
  type LeadDetailField,
  type LeadMoreDetails,
} from "@/lib/crm/console/types";
import { DETAIL_TEXT_MAX, detailFormValues, detailsRequest, type DetailFormIssue, type DetailFormValues } from "./details-form";
import type { FamilyMessages } from "./messages";

type Option = { value: string; label: string };

/**
 * "Edit more details" (docs/admin-phase-1b-plan.md §5.E; owner: 1B-FAMILY): a `CrmDialog` with
 * every field visibly labelled, errors linked with `aria-describedby`, 44 px targets. Sends only
 * the changed fields (PUT …/details), then refreshes the lead page; the result is announced in a
 * `role="status"` line next to the button, where focus returns.
 */
export function DetailsForm({
  leadId,
  initial,
  mainPhone,
  yearChoices,
  sessionChoices,
  f,
  t,
  pagePath,
}: {
  leadId: string;
  initial: LeadMoreDetails;
  /** The family's main number (E.164): the second number may not repeat it. */
  mainPhone: string | null;
  yearChoices: number[];
  /** Joining-session choices, already labelled ("2026–27 session"). */
  sessionChoices: Option[];
  f: FamilyMessages["details"];
  t: Pick<CrmMessages, "errors" | "common">;
  /** LOCALE-FREE path of the lead page. */
  pagePath: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<DetailFormValues>(() => detailFormValues(initial));
  const [issues, setIssues] = useState<Partial<Record<LeadDetailField, DetailFormIssue | "invalid">>>({});
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const action = useCrmAction(t, pagePath);

  function openDialog() {
    setValues(detailFormValues(initial));
    setIssues({});
    setNote("");
    setStatus("");
    action.reset();
    setOpen(true);
  }

  function focusField(field: string | undefined) {
    if (field) document.getElementById(`${id}-${field}`)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = detailsRequest(leadId, initial, values, mainPhone);
    if (!built.ok) {
      if (built.nothing) {
        setIssues({});
        setNote(f.nothing);
        return;
      }
      setIssues(built.issues);
      setNote("");
      focusField(Object.keys(built.issues)[0]);
      return;
    }
    setIssues({});
    setNote("");
    const data = await action.run(built.request, f.saved, (failure) => {
      const fields = Object.keys(failure.fieldErrors).filter((field) => field in values) as LeadDetailField[];
      if (failure.status !== 422 || fields.length === 0) return null;
      setIssues(Object.fromEntries(fields.map((field) => [field, field === "altPhone" ? "altPhoneInvalid" : "invalid"])));
      focusField(fields[0]);
      return t.errors.validation;
    });
    if (data === null) return;
    setOpen(false);
    setStatus(f.saved);
  }

  const issueText = (field: LeadDetailField): string | null => {
    const issue = issues[field];
    if (!issue) return null;
    if (issue === "tooLong") return format(f.errors.tooLong, { max: DETAIL_TEXT_MAX[field] ?? 0 });
    if (issue === "invalid") return f.errors.invalid;
    return f.errors[issue];
  };
  const set = (field: LeadDetailField, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const describedBy = (field: LeadDetailField, hint?: string) => [hint, issues[field] ? `${id}-${field}-error` : null].filter(Boolean).join(" ") || undefined;
  const error = (field: LeadDetailField) => {
    const text = issueText(field);
    return text ? (
      <p id={`${id}-${field}-error`} className="text-sm font-semibold text-danger">
        {text}
      </p>
    ) : null;
  };
  const field = (name: LeadDetailField, control: ReactNode, hint?: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className={labelClasses}>
        {f.fields[name]} <span className="font-normal text-muted">{t.common.optional}</span>
      </label>
      {control}
      {hint}
      {error(name)}
    </div>
  );
  const text = (name: "school" | "referredBy") =>
    field(
      name,
      <input
        id={`${id}-${name}`}
        type="text"
        value={values[name]}
        maxLength={DETAIL_TEXT_MAX[name]}
        autoComplete="off"
        aria-invalid={issues[name] ? true : undefined}
        aria-describedby={describedBy(name)}
        onChange={(event) => set(name, event.target.value)}
        className={fieldClasses}
      />,
    );
  /** `emptyLabel`: the choice that saves nothing ("Not recorded"; "Not decided" for the joining session). */
  const select = (name: LeadDetailField, options: Option[], emptyLabel: string = f.notRecorded) => {
    const list = values[name] && !options.some((option) => option.value === values[name]) ? [{ value: values[name], label: values[name] }, ...options] : options;
    return field(
      name,
      <select
        id={`${id}-${name}`}
        value={values[name]}
        aria-invalid={issues[name] ? true : undefined}
        aria-describedby={describedBy(name)}
        onChange={(event) => set(name, event.target.value)}
        className={fieldClasses}
      >
        <option value="">{emptyLabel}</option>
        {list.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>,
    );
  };
  const radios = (name: "hostel" | "preferredTime", options: Option[]) => (
    <fieldset className="min-w-0" aria-describedby={issues[name] ? `${id}-${name}-error` : undefined}>
      <legend className={labelClasses}>
        {f.fields[name]} <span className="font-normal text-muted">{t.common.optional}</span>
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {[{ value: "", label: f.notRecorded }, ...options].map((option) => (
          <label
            key={option.value || "none"}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm has-[:checked]:border-blue has-[:checked]:bg-[#edf4ff] has-[:checked]:font-bold"
          >
            <input
              type="radio"
              name={`${id}-${name}`}
              value={option.value}
              checked={values[name] === option.value}
              onChange={() => set(name, option.value)}
              className="size-4 accent-blue"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error(name)}
    </fieldset>
  );
  const labelled = <T extends string>(list: readonly T[], labels: Record<T, string>): Option[] => list.map((value) => ({ value, label: labels[value] }));

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" onClick={openDialog}>
        <Pencil aria-hidden="true" className="size-4" />
        {f.edit}
      </Button>
      <p role="status" className="text-sm font-semibold text-success">
        {status}
      </p>
      <CrmDialog open={open} titleId={titleId} onClose={() => setOpen(false)} wide>
        <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {f.editTitle}
          </h2>
          <p className="mt-2 text-sm text-muted">{f.editIntro}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field(
              "altPhone",
              <input
                id={`${id}-altPhone`}
                type="tel"
                inputMode="tel"
                value={values.altPhone}
                maxLength={20}
                autoComplete="off"
                aria-invalid={issues.altPhone ? true : undefined}
                aria-describedby={describedBy("altPhone", `${id}-altPhone-hint`)}
                onChange={(event) => set("altPhone", event.target.value)}
                className={fieldClasses}
              />,
              <p id={`${id}-altPhone-hint`} className="text-xs text-muted">
                {f.altPhoneHint}
              </p>,
            )}
            {text("school")}
            {select("board", labelled(BOARDS, f.boards))}
            {select("targetExam", labelled(TARGET_EXAMS, f.exams))}
            {select(
              "targetYear",
              yearChoices.map((year) => ({ value: String(year), label: String(year) })),
            )}
            {select("intakeSession", sessionChoices, f.sessionNotDecided)}
            {select("heardVia", labelled(HEARD_VIA, f.heardVia))}
            {text("referredBy")}
            {select("decisionMaker", labelled(DECISION_MAKERS, f.decisionMakers))}
            <div className="sm:col-span-2">{radios("hostel", labelled(HOSTEL_ANSWERS, f.hostel))}</div>
            <div className="sm:col-span-2">{radios("preferredTime", labelled(PREFERRED_TIMES, f.preferredTime))}</div>
          </div>
          <p role="status" className="mt-4 text-sm font-semibold text-muted">
            {note}
          </p>
          <ActionFeedback status="" error={action.error} className="mt-1" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
              {f.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </div>
  );
}
