"use client";

import { CheckCircle2, ClipboardPenLine, Eraser, LoaderCircle, MessageCircle, Pencil, Phone, Plus, StickyNote } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CallOutcomeDialog } from "@/components/console/calls/CallOutcomeDialog";
import type { CallsMessages } from "@/components/console/calls/messages";
import { focusIfLost, useOutcomeStatus } from "@/components/console/calls/outcome-status";
import { clearWaMark, sessionStore, type WaMark } from "@/components/console/calls/wa-return";
import { WaReturnPrompt } from "@/components/console/calls/WaReturnPrompt";
import { WhatsAppComposer } from "@/components/console/calls/WhatsAppComposer";
import { Button, Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import { ERASE_REASONS, LEAD_STAGES, LOST_REASONS, type ContactChannel, type EditableLeadField, type LeadStage } from "@/lib/crm/types";
import { crmRequests } from "./api";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import {
  NOTE_MAX,
  editDetailsRequest,
  eraseRequest,
  needsLostReason,
  noteRequest,
  stageChangeRequest,
  taskRequest,
  type DetailIssue,
  type DetailValues,
} from "./lead-forms";
import type { Option } from "./types";

/** The `crm` message slices the lead-detail islands need (one shared object, passed to each). */
export type LeadIslandMessages = Pick<Messages<"crm">, "common" | "errors" | "stages" | "lostReasons" | "lead">;

type Base = { leadId: string; t: LeadIslandMessages; pagePath: string };

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

// ---------------------------------------------------------------------------------------------
// Stage

/** Stage selector; choosing "Lost" opens a dialog that requires a reason (D-040). */
export function StageControl({ leadId, stage, t, pagePath }: Base & { stage: LeadStage }) {
  const id = useId();
  const [choice, setChoice] = useState<LeadStage>(stage);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lostStatus, setLostStatus] = useState("");
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice === stage) return;
    setLostStatus("");
    if (needsLostReason(stage, choice)) {
      action.reset();
      setDialogOpen(true);
      return;
    }
    const built = stageChangeRequest(leadId, choice);
    if (!built.ok) return;
    await action.run(built.request, format(t.lead.stage.saved, { stage: t.stages[choice] }));
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-busy={action.pending || undefined}>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-stage`} className={labelClasses}>
            {t.lead.stage.label}
          </label>
          <select
            id={`${id}-stage`}
            value={choice}
            onChange={(event) => setChoice(event.target.value as LeadStage)}
            className={fieldClasses}
          >
            {LEAD_STAGES.map((value) => (
              <option key={value} value={value}>
                {t.stages[value]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="dark" disabled={action.pending || choice === stage}>
          {action.pending && <Spinner />}
          {t.lead.stage.change}
        </Button>
      </form>
      <ActionFeedback status={action.status} error={dialogOpen ? null : action.error} className="mt-2" />
      <LostReasonDialog
        open={dialogOpen}
        leadId={leadId}
        t={t}
        pagePath={pagePath}
        onClose={() => {
          setDialogOpen(false);
          setChoice(stage);
        }}
        onDone={(message) => {
          setDialogOpen(false);
          action.reset();
          setLostStatus(message);
        }}
      />
      <p role="status" className="text-sm font-semibold text-success">
        {lostStatus}
      </p>
    </div>
  );
}

export function LostReasonDialog({
  open,
  leadId,
  t,
  pagePath,
  onClose,
  onDone,
  leadName,
}: Base & { open: boolean; onClose: () => void; onDone: (message: string) => void; leadName?: string }) {
  const id = useId();
  const titleId = `${id}-title`;
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = stageChangeRequest(leadId, "lost", reason);
    if (!built.ok) {
      setIssue(t.lead.stage.reasonRequired);
      document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    if (reason === "other" && !note.trim()) {
      setIssue(t.lead.stage.reasonNoteRequired);
      document.getElementById(`${id}-note`)?.focus();
      return;
    }
    setIssue(null);
    const ok = await action.run(built.request);
    if (ok === null) return;
    const text = note.trim();
    if (text) {
      const noteBuilt = noteRequest(leadId, text);
      if (noteBuilt.ok) await action.run(noteBuilt.request);
    }
    setReason("");
    setNote("");
    onDone(format(t.lead.stage.saved, { stage: t.stages.lost }));
  }

  return (
    <CrmDialog open={open} titleId={titleId} onClose={onClose}>
      <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
        <h2 id={titleId} className="text-lg font-extrabold text-navy">
          {t.lead.stage.lostTitle}
          {leadName && <span className="block text-sm font-semibold text-muted">{leadName}</span>}
        </h2>
        <p className="mt-2 text-sm text-muted">{t.lead.stage.lostIntro}</p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className={labelClasses}>
            {t.lead.stage.reason} <span className="font-normal text-muted">{t.common.required}</span>
          </label>
          <select
            id={`${id}-reason`}
            value={reason}
            required
            aria-invalid={issue === t.lead.stage.reasonRequired ? true : undefined}
            aria-describedby={issue === t.lead.stage.reasonRequired ? `${id}-issue` : undefined}
            onChange={(event) => setReason(event.target.value)}
            className={fieldClasses}
          >
            <option value="">{t.lead.stage.reasonPlaceholder}</option>
            {LOST_REASONS.map((value) => (
              <option key={value} value={value}>
                {t.lostReasons[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className={labelClasses}>
            {t.lead.stage.reasonNote}{" "}
            <span className="font-normal text-muted">{reason === "other" ? t.common.required : t.common.optional}</span>
          </label>
          <textarea
            id={`${id}-note`}
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            aria-invalid={issue === t.lead.stage.reasonNoteRequired ? true : undefined}
            aria-describedby={issue === t.lead.stage.reasonNoteRequired ? `${id}-issue` : undefined}
            onChange={(event) => setNote(event.target.value)}
            className={cn(fieldClasses, "min-h-20")}
          />
        </div>
        {issue && (
          <p id={`${id}-issue`} className="mt-3 text-sm font-semibold text-danger">
            {issue}
          </p>
        )}
        <ActionFeedback status="" error={action.error} className="mt-2" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="dark" disabled={action.pending}>
            {action.pending && <Spinner />}
            {t.lead.stage.confirmLost}
          </Button>
        </div>
      </form>
    </CrmDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Assignee (managers / admins)

export function AssigneeControl({
  leadId,
  assigneeId,
  options,
  t,
  pagePath,
}: Base & { assigneeId: string | null; options: Option[] }) {
  const id = useId();
  const current = assigneeId ?? "";
  const [choice, setChoice] = useState(current);
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice === current) return;
    const label = options.find((option) => option.value === choice)?.label ?? "";
    await action.run(
      crmRequests.assign(leadId, choice || null),
      choice ? format(t.lead.assignee.saved, { name: label }) : t.lead.assignee.unassigned,
    );
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-busy={action.pending || undefined}>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-assignee`} className={labelClasses}>
            {t.lead.assignee.label}
          </label>
          <select id={`${id}-assignee`} value={choice} onChange={(event) => setChoice(event.target.value)} className={fieldClasses}>
            <option value="">{t.lead.assignee.none}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={action.pending || choice === current}>
          {action.pending && <Spinner />}
          {t.lead.assignee.change}
        </Button>
      </form>
      <ActionFeedback status={action.status} error={action.error} className="mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Contact (D-041: links open on the staff member's device; we only log what happened)

/**
 * Admin console 1b (§5.C, §5.D; 1B-CALLS): "Call" is a plain `tel:` link — the tap only marks the
 * call (CallReturnPrompt asks "Back from the call?" afterwards; no dialog on the tap). "Log a call"
 * opens the one-step outcome dialog. "WhatsApp" opens the template composer instead of a bare wa.me
 * link; nothing is logged until the staff member says they sent the message ("Back from WhatsApp?"
 * asks again after a reload).
 */
export function ContactActions({
  leadId,
  name,
  telHref,
  phone,
  phoneDisplay,
  email,
  t,
  c,
  pagePath,
}: Base & { name: string; telHref: string | null; phone: string | null; phoneDisplay: string | null; email: string | null; c: CallsMessages }) {
  const [callOpen, setCallOpen] = useState(false);
  // `answered`: the "Back from WhatsApp?" prompt already got "Yes, I sent it" (open at the follow-up).
  const [composer, setComposer] = useState<{ resume: WaMark | null; answered: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const k = t.lead.contact;
  const linkClasses =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-bold transition hover:-translate-y-px motion-reduce:hover:translate-y-0";

  return (
    <div>
      {phone && (
        <WaReturnPrompt
          leadId={leadId}
          leadName={name}
          suppressed={composer !== null}
          c={c.whatsapp}
          onYes={(mark) => {
            setStatus("");
            setComposer({ resume: mark, answered: true });
          }}
          onNo={() => {
            clearWaMark(sessionStore());
            setStatus(c.whatsapp.nothingLogged);
          }}
        />
      )}
      {phoneDisplay && (
        <p className="mb-3 font-mono text-lg font-bold text-navy" lang="en">
          {phoneDisplay}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {telHref && (
          <a href={telHref} className={cn(linkClasses, "bg-navy text-white hover:bg-navy-2")} aria-label={format(t.common.callLead, { name })}>
            <Phone aria-hidden="true" className="size-4" />
            {k.call}
          </a>
        )}
        {phone && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              setStatus("");
              setComposer({ resume: null, answered: false });
            }}
            className={cn(linkClasses, "bg-[#e7f7ee] text-[#0f5a3c] hover:bg-[#d3f0df]")}
            aria-label={format(c.whatsapp.openLabel, { name })}
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            {c.whatsapp.open}
          </button>
        )}
        {email && (
          <a href={`mailto:${email}`} className={cn(linkClasses, "border border-[#b9cbe0] bg-white text-navy hover:border-blue")}>
            {k.email}
          </a>
        )}
        <Button
          variant="outline"
          aria-haspopup="dialog"
          aria-label={format(c.calls.logCallLabel, { name })}
          onClick={() => {
            setStatus("");
            setCallOpen(true);
          }}
        >
          <ClipboardPenLine aria-hidden="true" className="size-4" />
          {c.calls.logCall}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">{k.honest}</p>
      <p role="status" className="mt-2 text-sm font-semibold text-success">
        {status}
      </p>
      <CallOutcomeDialog
        open={callOpen}
        leadId={leadId}
        leadName={name}
        pagePath={pagePath}
        t={t}
        c={c}
        onClose={() => setCallOpen(false)}
        onDone={(message) => {
          setCallOpen(false);
          setStatus(message);
        }}
      />
      {phone && (
        <WhatsAppComposer
          open={composer !== null}
          leadId={leadId}
          leadName={name}
          phone={phone}
          pagePath={pagePath}
          t={t}
          c={c}
          resume={composer?.resume ?? null}
          resumeAnswered={composer?.answered ?? false}
          onClose={() => setComposer(null)}
          onDone={(message) => {
            setComposer(null);
            setStatus(message);
          }}
        />
      )}
    </div>
  );
}

/**
 * Compatibility wrapper (admin console 1b): the old "Log this contact" dialog now IS the one-step
 * call outcome dialog. `initialChannel` is ignored — WhatsApp messages are logged through the
 * composer's "Did you send it?" step only.
 */
export function LogContactDialog({
  open,
  leadId,
  leadName,
  t,
  c,
  pagePath,
  onClose,
  onDone,
}: Base & { open: boolean; initialChannel?: ContactChannel; leadName: string; c: CallsMessages; onClose: () => void; onDone: (message: string) => void }) {
  return <CallOutcomeDialog open={open} leadId={leadId} leadName={leadName} pagePath={pagePath} t={t} c={c} onClose={onClose} onDone={onDone} />;
}

// ---------------------------------------------------------------------------------------------
// Notes

export function NoteForm({ leadId, t, pagePath }: Base) {
  const id = useId();
  const n = t.lead.notes;
  const [body, setBody] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = noteRequest(leadId, body);
    if (!built.ok) {
      setIssue(built.issue === "required" ? n.required : format(n.tooLong, { max: NOTE_MAX }));
      return;
    }
    setIssue(null);
    const data = await action.run(built.request, n.saved);
    if (data !== null) setBody("");
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={action.pending || undefined}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className={labelClasses}>
          {n.label}
        </label>
        <textarea
          id={`${id}-note`}
          value={body}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder={n.placeholder}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${id}-issue` : undefined}
          onChange={(event) => setBody(event.target.value)}
          className={cn(fieldClasses, "min-h-24")}
        />
      </div>
      {issue && (
        <p id={`${id}-issue`} className="mt-2 text-sm font-semibold text-danger">
          {issue}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <ActionFeedback status={action.status} error={action.error} />
        <Button type="submit" variant="dark" disabled={action.pending}>
          {action.pending ? <Spinner /> : <StickyNote aria-hidden="true" className="size-4" />}
          {n.submit}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Tasks

/**
 * A task's Done button (lead page and Today's calls). Admin console 1b (§5.C; 1B-CALLS): ticking a
 * task off asks what happened — it opens the one-step outcome dialog with this task, which completes
 * the task, sets the next follow-up and logs the call in one save ("No call needed" is offered).
 * Inside an `OutcomeStatusRegion` (the task lists) the result is said by the region, and focus moves
 * to the panel heading when the refresh removes this task's row; elsewhere it keeps its own line.
 */
export function CompleteTaskButton({
  taskId,
  title,
  leadId,
  leadName,
  t,
  c,
  pagePath,
  compact = false,
}: {
  taskId: string;
  title: string;
  leadId: string;
  leadName: string;
  t: Pick<Messages<"crm">, "errors" | "lead">;
  c: CallsMessages;
  pagePath: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  // The task list's region (lead page, Today's calls): it keeps the result line and a focus target
  // after the refresh drops this completed task's row — and this button with it.
  const region = useOutcomeStatus();
  const saved = useRef(false);
  const focusTargetId = region?.focusTargetId ?? null;
  useEffect(
    () => () => {
      // Unmounted after a save: the Done button that held focus is gone, so focus goes to the panel heading.
      if (saved.current) window.requestAnimationFrame(() => focusIfLost(focusTargetId));
    },
    [focusTargetId],
  );
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="outline"
        aria-haspopup="dialog"
        aria-label={format(t.lead.tasks.completeLabel, { title })}
        onClick={() => {
          setStatus("");
          region?.announce("");
          setOpen(true);
        }}
      >
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {compact ? null : t.lead.tasks.complete}
      </Button>
      {!region && (
        <p role="status" className="text-sm font-semibold text-success">
          {status}
        </p>
      )}
      <CallOutcomeDialog
        open={open}
        leadId={leadId}
        leadName={leadName}
        taskId={taskId}
        taskTitle={title}
        pagePath={pagePath}
        t={t}
        c={c}
        onClose={() => setOpen(false)}
        onDone={(message) => {
          saved.current = true;
          setOpen(false);
          if (region) region.announce(message);
          else setStatus(message);
        }}
      />
    </span>
  );
}

export function TaskForm({ leadId, t, pagePath, defaultDate }: Base & { defaultDate: string }) {
  const id = useId();
  const k = t.lead.tasks;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [issues, setIssues] = useState<{ title?: string; due?: string }>({});
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = taskRequest(leadId, { title, date, time });
    if (!built.ok) {
      const next = built.issue === "titleRequired" ? { title: k.titleRequired } : { due: k.dueRequired };
      setIssues(next);
      document.getElementById(next.title ? `${id}-title` : `${id}-date`)?.focus();
      return;
    }
    setIssues({});
    const data = await action.run(built.request, k.created);
    if (data !== null) setTitle("");
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={action.pending || undefined} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
      <div className="flex flex-col gap-1.5 sm:col-span-3">
        <label htmlFor={`${id}-title`} className={labelClasses}>
          {k.taskTitle}
        </label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={200}
          placeholder={k.taskTitlePlaceholder}
          aria-invalid={issues.title ? true : undefined}
          aria-describedby={issues.title ? `${id}-title-error` : undefined}
          onChange={(event) => setTitle(event.target.value)}
          className={fieldClasses}
        />
        {issues.title && (
          <p id={`${id}-title-error`} className="text-sm font-semibold text-danger">
            {issues.title}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-date`} className={labelClasses}>
          {k.dueDate}
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          aria-invalid={issues.due ? true : undefined}
          aria-describedby={issues.due ? `${id}-date-error` : undefined}
          onChange={(event) => setDate(event.target.value)}
          className={fieldClasses}
        />
        {issues.due && (
          <p id={`${id}-date-error`} className="text-sm font-semibold text-danger">
            {issues.due}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-time`} className={labelClasses}>
          {k.dueTime}
        </label>
        <input id={`${id}-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} className={fieldClasses} />
      </div>
      <div className="flex flex-col justify-end sm:pt-7">
        <Button type="submit" variant="dark" disabled={action.pending}>
          {action.pending ? <Spinner /> : <Plus aria-hidden="true" className="size-4" />}
          {k.create}
        </Button>
      </div>
      <ActionFeedback status={action.status} error={action.error} className="sm:col-span-3" />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Edit details (existing PATCH `fields`; admin-console plan §8, Agent B)

export type DetailOptions = { classes: Option[]; programs: Option[]; centres: Option[] };

/** The current value stays selectable even when it is not one of the usual options (old or unknown slugs). */
function withCurrent(options: Option[], current: string): Option[] {
  return current && !options.some((option) => option.value === current) ? [{ value: current, label: current }, ...options] : options;
}

/**
 * "Edit details" button + dialog: names, email, class, program, centre. Sends only what changed;
 * the server marks those fields staff-edited (later website forms never overwrite them). The phone
 * number is not editable (it is the dedupe key).
 */
export function EditDetailsButton({
  leadId,
  initial,
  showContactName,
  options,
  t,
  pagePath,
}: Base & { initial: DetailValues; showContactName: boolean; options: DetailOptions }) {
  const id = useId();
  const titleId = `${id}-title`;
  const e = t.lead.edit;
  const d = t.lead.details;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<DetailValues>(initial);
  const [issues, setIssues] = useState<Partial<Record<EditableLeadField, DetailIssue>>>({});
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const action = useCrmAction(t, pagePath);

  function openDialog() {
    setValues(initial);
    setIssues({});
    setNote("");
    setStatus("");
    action.reset();
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = editDetailsRequest(leadId, initial, values);
    if (!built.ok) {
      if (built.nothing) {
        setIssues({});
        setNote(e.nothing);
        return;
      }
      setIssues(built.issues);
      setNote("");
      const first = Object.keys(built.issues)[0];
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setIssues({});
    setNote("");
    const data = await action.run(built.request, e.saved);
    if (data === null) return;
    setOpen(false);
    setStatus(e.saved);
  }

  const issueText = (field: EditableLeadField) => {
    if (!issues[field]) return null;
    return field === "email" ? e.invalidEmail : e.invalidName;
  };
  const text = (field: EditableLeadField, label: string, type: "text" | "email" = "text") => {
    const issue = issueText(field);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${field}`} className={labelClasses}>
          {label} <span className="font-normal text-muted">{t.common.optional}</span>
        </label>
        <input
          id={`${id}-${field}`}
          type={type}
          value={values[field]}
          maxLength={field === "email" ? 254 : 80}
          autoComplete="off"
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${id}-${field}-error` : undefined}
          onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
          className={fieldClasses}
        />
        {issue && (
          <p id={`${id}-${field}-error`} className="text-sm font-semibold text-danger">
            {issue}
          </p>
        )}
      </div>
    );
  };
  const select = (field: EditableLeadField, label: string, list: Option[]) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${field}`} className={labelClasses}>
        {label}
      </label>
      <select
        id={`${id}-${field}`}
        value={values[field]}
        onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
        className={fieldClasses}
      >
        <option value="">{e.notGiven}</option>
        {withCurrent(list, initial[field]).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" onClick={openDialog}>
        <Pencil aria-hidden="true" className="size-4" />
        {e.button}
      </Button>
      <p role="status" className="text-sm font-semibold text-success">
        {status}
      </p>
      <CrmDialog open={open} titleId={titleId} onClose={() => setOpen(false)}>
        <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {e.title}
          </h2>
          <p className="mt-2 text-sm text-muted">{e.intro}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {text("studentName", d.student)}
            {text("guardianName", d.guardian)}
            {showContactName && text("contactName", d.contactName)}
            {text("email", d.email, "email")}
            {select("currentClass", d.class, options.classes)}
            {select("programInterest", d.program, options.programs)}
            {select("centreSlug", d.centre, options.centres)}
          </div>
          <p className="mt-4 text-xs text-muted">{e.phoneNote}</p>
          <p role="status" className="mt-2 text-sm font-semibold text-muted">
            {note}
          </p>
          <ActionFeedback status="" error={action.error} className="mt-1" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending && <Spinner />}
              {e.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Erase (admins only; existing POST …/erase; D-042)

const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2.5 text-sm font-bold transition disabled:pointer-events-none disabled:opacity-60";

/**
 * Set by EraseLeadPanel just before its erase request. A successful erase refreshes the page, which
 * removes the panel (with its status line and the dialog's trigger); the erased notice of that lead
 * then takes focus once, so keyboard and screen-reader users land on the confirmation.
 */
let focusErasedNoticeFor: string | null = null;

/** The "personal data erased" notice of a lead page; focused once right after this tab erased it. */
export function ErasedNotice({ leadId, children }: { leadId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusErasedNoticeFor !== leadId) return;
    focusErasedNoticeFor = null;
    ref.current?.focus();
  }, [leadId]);
  return (
    <div ref={ref} tabIndex={-1} className="rounded-control">
      <Notice variant="warning">{children}</Notice>
    </div>
  );
}

/**
 * Admin-only "Erase personal data": a dialog that says what is deleted and what is kept, asks for
 * a reason and for the confirmation word typed exactly. The server re-checks the admin role.
 */
export function EraseLeadPanel({ leadId, t, pagePath }: Base) {
  const id = useId();
  const titleId = `${id}-title`;
  const r = t.lead.erase;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [issue, setIssue] = useState<"reasonRequired" | "wordMismatch" | null>(null);
  const [status, setStatus] = useState("");
  const action = useCrmAction(t, pagePath);

  function openDialog() {
    setReason("");
    setTyped("");
    setIssue(null);
    setStatus("");
    action.reset();
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = eraseRequest(leadId, { typed, word: r.word, reason });
    if (!built.ok) {
      setIssue(built.issue);
      document.getElementById(built.issue === "reasonRequired" ? `${id}-reason` : `${id}-word`)?.focus();
      return;
    }
    setIssue(null);
    focusErasedNoticeFor = leadId;
    const data = await action.run(built.request, r.done);
    if (data === null) {
      focusErasedNoticeFor = null;
      return;
    }
    setOpen(false);
    setStatus(r.done);
  }

  return (
    <div>
      <p className="text-sm text-muted">{r.intro}</p>
      <button type="button" onClick={openDialog} className={cn(dangerButton, "mt-3 border-danger bg-white text-danger hover:bg-danger-soft")}>
        <Eraser aria-hidden="true" className="size-4" />
        {r.button}
      </button>
      <p role="status" className="mt-2 text-sm font-semibold text-success">
        {status}
      </p>
      <CrmDialog open={open} titleId={titleId} onClose={() => setOpen(false)}>
        <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {r.dialogTitle}
          </h2>
          <p className="mt-2 text-sm text-ink">{r.what}</p>
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={`${id}-reason`} className={labelClasses}>
              {r.reason} <span className="font-normal text-muted">{t.common.required}</span>
            </label>
            <select
              id={`${id}-reason`}
              value={reason}
              aria-invalid={issue === "reasonRequired" ? true : undefined}
              aria-describedby={issue === "reasonRequired" ? `${id}-issue` : undefined}
              onChange={(event) => setReason(event.target.value)}
              className={fieldClasses}
            >
              <option value="">{r.reasonPlaceholder}</option>
              {ERASE_REASONS.map((value) => (
                <option key={value} value={value}>
                  {r.reasons[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={`${id}-word`} className={labelClasses}>
              {format(r.confirmLabel, { word: r.word })}
            </label>
            <input
              id={`${id}-word`}
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              lang="en"
              aria-invalid={issue === "wordMismatch" ? true : undefined}
              aria-describedby={issue === "wordMismatch" ? `${id}-issue` : undefined}
              onChange={(event) => setTyped(event.target.value)}
              className={cn(fieldClasses, "font-mono")}
            />
          </div>
          {issue && (
            <p id={`${id}-issue`} className="mt-3 text-sm font-semibold text-danger">
              {issue === "reasonRequired" ? r.reasonRequired : format(r.wordMismatch, { word: r.word })}
            </p>
          )}
          <ActionFeedback status="" error={action.error} className="mt-2" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <button type="submit" disabled={action.pending} className={cn(dangerButton, "border-danger bg-danger text-white hover:opacity-90")}>
              {action.pending ? <Spinner /> : <Eraser aria-hidden="true" className="size-4" />}
              {r.confirm}
            </button>
          </div>
        </form>
      </CrmDialog>
    </div>
  );
}
