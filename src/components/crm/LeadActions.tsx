"use client";

import { CheckCircle2, ClipboardPenLine, LoaderCircle, MessageCircle, Phone, Plus, StickyNote } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import { CONTACT_CHANNELS, LEAD_STAGES, LOST_REASONS, type ContactChannel, type LeadStage } from "@/lib/crm/types";
import { crmRequests } from "./api";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import { NOTE_MAX, logContactRequest, needsLostReason, noteRequest, stageChangeRequest, taskRequest } from "./lead-forms";
import { OUTCOMES_BY_CHANNEL, type Option } from "./types";

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

export function ContactActions({
  leadId,
  name,
  telHref,
  whatsAppHref,
  phoneDisplay,
  email,
  t,
  pagePath,
}: Base & { name: string; telHref: string | null; whatsAppHref: string | null; phoneDisplay: string | null; email: string | null }) {
  const [dialog, setDialog] = useState<{ channel: ContactChannel } | null>(null);
  const [status, setStatus] = useState("");
  const c = t.lead.contact;
  const linkClasses =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-bold transition hover:-translate-y-px motion-reduce:hover:translate-y-0";

  return (
    <div>
      {phoneDisplay && (
        <p className="mb-3 font-mono text-lg font-bold text-navy" lang="en">
          {phoneDisplay}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {telHref && (
          <a
            href={telHref}
            onClick={() => setDialog({ channel: "call" })}
            className={cn(linkClasses, "bg-navy text-white hover:bg-navy-2")}
            aria-label={format(t.common.callLead, { name })}
          >
            <Phone aria-hidden="true" className="size-4" />
            {c.call}
          </a>
        )}
        {whatsAppHref && (
          <a
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setDialog({ channel: "whatsapp" })}
            className={cn(linkClasses, "bg-[#e7f7ee] text-[#0f5a3c] hover:bg-[#d3f0df]")}
            aria-label={format(c.whatsappLabel, { name })}
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            {c.whatsapp}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className={cn(linkClasses, "border border-[#b9cbe0] bg-white text-navy hover:border-blue")}>
            {c.email}
          </a>
        )}
        <Button variant="outline" onClick={() => setDialog({ channel: "call" })}>
          <ClipboardPenLine aria-hidden="true" className="size-4" />
          {c.log}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">{c.honest}</p>
      <p role="status" className="mt-2 text-sm font-semibold text-success">
        {status}
      </p>
      <LogContactDialog
        open={dialog !== null}
        initialChannel={dialog?.channel ?? "call"}
        leadId={leadId}
        t={t}
        pagePath={pagePath}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          setStatus(c.saved);
        }}
      />
    </div>
  );
}

export function LogContactDialog({
  open,
  initialChannel,
  leadId,
  t,
  pagePath,
  onClose,
  onDone,
}: Base & { open: boolean; initialChannel: ContactChannel; onClose: () => void; onDone: () => void }) {
  return (
    <CrmDialog open={open} titleId="crm-log-contact-title" onClose={onClose}>
      <LogContactForm
        key={initialChannel}
        initialChannel={initialChannel}
        leadId={leadId}
        t={t}
        pagePath={pagePath}
        onCancel={onClose}
        onDone={onDone}
      />
    </CrmDialog>
  );
}

function LogContactForm({
  initialChannel,
  leadId,
  t,
  pagePath,
  onCancel,
  onDone,
}: Base & { initialChannel: ContactChannel; onCancel: () => void; onDone: () => void }) {
  const id = useId();
  const c = t.lead.contact;
  const [channel, setChannel] = useState<ContactChannel>(initialChannel);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const action = useCrmAction(t, pagePath);
  const outcomes = OUTCOMES_BY_CHANNEL[channel];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = logContactRequest(leadId, { channel, outcome, note });
    if (!built.ok) {
      setIssue(built.issue === "outcomeRequired" ? c.outcomeRequired : format(t.lead.notes.tooLong, { max: NOTE_MAX }));
      return;
    }
    setIssue(null);
    const data = await action.run(built.request);
    if (data !== null) onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
      <h2 id="crm-log-contact-title" className="text-lg font-extrabold text-navy">
        {c.logTitle}
      </h2>
      <p className="mt-2 text-sm text-muted">{c.logIntro}</p>
      <fieldset className="mt-4">
        <legend className={labelClasses}>{c.channel}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONTACT_CHANNELS.map((value) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 has-checked:border-blue has-checked:bg-blue-soft">
              <input
                type="radio"
                name={`${id}-channel`}
                value={value}
                checked={channel === value}
                onChange={() => {
                  setChannel(value);
                  setOutcome("");
                }}
                className="size-4 accent-[#1768d4]"
              />
              <span className="text-sm font-semibold">{c.channels[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4" aria-describedby={issue === c.outcomeRequired ? `${id}-issue` : undefined}>
        <legend className={labelClasses}>
          {c.outcome} <span className="font-normal text-muted">{t.common.required}</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {outcomes.map((value) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 has-checked:border-blue has-checked:bg-blue-soft">
              <input
                type="radio"
                name={`${id}-outcome`}
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="size-4 accent-[#1768d4]"
              />
              <span className="text-sm">{c.outcomes[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className={labelClasses}>
          {c.note} <span className="font-normal text-muted">{t.common.optional}</span>
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder={c.notePlaceholder}
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
        <Button variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="dark" disabled={action.pending}>
          {action.pending && <Spinner />}
          {c.save}
        </Button>
      </div>
    </form>
  );
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

export function CompleteTaskButton({
  taskId,
  title,
  t,
  pagePath,
  compact = false,
}: {
  taskId: string;
  title: string;
  t: Pick<Messages<"crm">, "errors" | "lead">;
  pagePath: string;
  compact?: boolean;
}) {
  const action = useCrmAction(t, pagePath);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={action.pending}
        aria-label={format(t.lead.tasks.completeLabel, { title })}
        onClick={() => action.run(crmRequests.completeTask(taskId), t.lead.tasks.completed)}
      >
        {action.pending ? <Spinner /> : <CheckCircle2 aria-hidden="true" className="size-4" />}
        {compact ? null : t.lead.tasks.complete}
      </Button>
      <ActionFeedback status={action.status} error={action.error} />
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
