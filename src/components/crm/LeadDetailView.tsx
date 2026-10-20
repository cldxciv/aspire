import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  Eraser,
  GraduationCap,
  Inbox,
  MessageCircle,
  Pencil,
  Phone,
  StickyNote,
  UserPlus,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { Notice } from "@/components/ui";
import { localeNames, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { CrmPermissions, CrmViewer, LeadActivity, LeadDetail, LeadTask } from "@/lib/crm/types";
import { CrmPageHeader, DueLabel, RelativeTime, SourceBadges, StageBadge } from "./CrmBlocks";
import {
  centreLabel,
  classLabel,
  displayPhone,
  formatDate,
  formatDateTime,
  isoOrUndefined,
  istDayKey,
  lostReasonLabel,
  outcomeLabel,
  programLabel,
  sourceLabel,
  stageLabel,
  telHref,
  toolLabel,
  topicLabel,
  whatsAppHref,
  type CrmMessages,
} from "./format";
import {
  AssigneeControl,
  CompleteTaskButton,
  ContactActions,
  NoteForm,
  StageControl,
  TaskForm,
  type LeadIslandMessages,
} from "./LeadActions";
import type { Option } from "./types";

export type LeadDetailProps = {
  lead: LeadDetail;
  viewer: CrmViewer;
  permissions: CrmPermissions;
  /** Centre slug → localised name. */
  centres: Readonly<Record<string, string>>;
  /** Staff the viewer may assign this lead to (managers / admins), already labelled. */
  assigneeOptions: Option[];
  /** Staff user id → display name, for assignment entries on the timeline. */
  staffNames: Readonly<Record<string, string>>;
  now: number;
  locale: Locale;
  t: CrmMessages;
};

export function leadName(t: CrmMessages, lead: Pick<LeadDetail, "displayName" | "erased">): string {
  if (lead.erased) return t.common.erased;
  return lead.displayName?.trim() || t.common.unnamed;
}

/**
 * One lead (`/crm/leads/[id]`): header with stage + assignee controls, contact actions (tel: /
 * wa.me + "log this contact"), every captured field, follow-up tasks, notes and the timeline.
 * Server-rendered from CRM-CORE's `LeadDetail`; the islands write through `/api/crm/**` and
 * refresh this view.
 */
export function LeadDetailView({ lead, viewer, permissions, centres, assigneeOptions, staffNames, now, locale, t }: LeadDetailProps) {
  const pagePath = `/crm/leads/${lead.id}`;
  const name = leadName(t, lead);
  const island: LeadIslandMessages = { common: t.common, errors: t.errors, stages: t.stages, lostReasons: t.lostReasons, lead: t.lead };
  const editable = !lead.erased;
  const openTasks = lead.tasks.filter((task) => !task.doneAt);
  const doneTasks = lead.tasks.filter((task) => task.doneAt);

  return (
    <div className="space-y-5">
      <Link
        href={localePath("/crm", locale)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t.lead.back}
      </Link>

      <CrmPageHeader
        eyebrow={t.lead.eyebrow}
        title={name}
        description={
          <span className="flex flex-col gap-2">
            {lead.guardianName && !lead.erased && <span>{format(t.lead.guardianLine, { name: lead.guardianName })}</span>}
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <StageBadge stage={lead.stage} t={t} />
              <SourceBadges source={lead.source} tool={lead.tool} t={t} />
              <span>{format(t.lead.receivedOn, { date: formatDate(lead.createdAt, locale) ?? "" })}</span>
            </span>
          </span>
        }
        actions={<ConvertPlaceholder t={t} />}
      />

      {lead.erased && (
        <Notice variant="warning">{format(t.lead.details.erasedNotice, { date: formatDate(lead.erasedAt, locale) ?? "" })}</Notice>
      )}

      {editable && (
        <section aria-labelledby="crm-lead-manage" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
          <h2 id="crm-lead-manage" className="sr-only">
            {t.lead.stage.label}
          </h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <StageControl leadId={lead.id} stage={lead.stage} t={island} pagePath={pagePath} />
            {permissions.canAssign ? (
              <AssigneeControl
                leadId={lead.id}
                assigneeId={lead.assignee?.userId ?? null}
                options={assigneeOptions}
                t={island}
                pagePath={pagePath}
              />
            ) : (
              <div>
                <p className="text-sm font-bold text-navy">{t.lead.assignee.label}</p>
                <p className="mt-2 text-sm">{assigneeName(t, lead.assignee, viewer)}</p>
              </div>
            )}
          </div>
          {lead.stage === "lost" && lead.lostReason && (
            <p className="mt-4 text-sm text-muted">
              <strong className="text-navy">{t.lead.details.lostReason}:</strong> {lostReasonLabel(t, lead.lostReason)}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {editable && lead.phone && (
          <PortalPanel id="crm-lead-contact" title={t.lead.contact.title}>
            <ContactActions
              leadId={lead.id}
              name={name}
              telHref={telHref(lead.phone)}
              whatsAppHref={whatsAppHref(lead.phone)}
              phoneDisplay={displayPhone(lead.phone)}
              email={lead.email}
              t={island}
              pagePath={pagePath}
            />
          </PortalPanel>
        )}

        <PortalPanel id="crm-lead-tasks" title={t.lead.tasks.title}>
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted">{t.lead.tasks.empty}</p>
          ) : (
            <TaskList tasks={openTasks} now={now} locale={locale} t={t} island={island} pagePath={pagePath} editable={editable} />
          )}
          {editable && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted">{t.lead.tasks.add}</h3>
              <TaskForm leadId={lead.id} t={island} pagePath={pagePath} defaultDate={istDayKey(now + 86_400_000)} />
            </div>
          )}
          {doneTasks.length > 0 && (
            <details className="mt-5 border-t border-line pt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-navy">
                {t.lead.tasks.completedTitle} ({doneTasks.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {doneTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2 text-sm text-muted">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <span className="text-ink line-through decoration-1">{task.title}</span>{" "}
                      <span>· {format(t.lead.tasks.completedOn, { date: formatDate(task.doneAt, locale) ?? "" })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </PortalPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <LeadDetailsPanel lead={lead} centres={centres} locale={locale} t={t} />
        <div className="space-y-5">
          {editable && (
            <PortalPanel id="crm-lead-note" title={t.lead.notes.title}>
              <NoteForm leadId={lead.id} t={island} pagePath={pagePath} />
            </PortalPanel>
          )}
          <PortalPanel id="crm-lead-timeline" title={t.lead.timeline.title} description={t.lead.timeline.description}>
            <Timeline lead={lead} viewer={viewer} staffNames={staffNames} locale={locale} t={t} />
          </PortalPanel>
        </div>
      </div>
    </div>
  );
}

function assigneeName(t: CrmMessages, assignee: LeadDetail["assignee"], viewer: CrmViewer): string {
  if (!assignee) return t.common.unassigned;
  return assignee.userId === viewer.userId ? `${assignee.displayName} (${t.common.you})` : assignee.displayName;
}

/** Phase 2 placeholder: visible, focusable, explained — but does nothing. */
function ConvertPlaceholder({ t }: { t: CrmMessages }) {
  return (
    <span className="flex max-w-[16rem] flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby="crm-convert-note"
        title={t.lead.convert.note}
        className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-control border border-dashed border-[#b9cbe0] bg-[#f4f7fb] px-4 text-sm font-bold text-[#5a6a7f]"
      >
        <GraduationCap aria-hidden="true" className="size-4" />
        {t.lead.convert.label}
      </button>
      <span id="crm-convert-note" className="text-xs text-muted sm:text-right">
        {t.lead.convert.note}
      </span>
    </span>
  );
}

function TaskList({
  tasks,
  now,
  locale,
  t,
  island,
  pagePath,
  editable,
}: {
  tasks: LeadTask[];
  now: number;
  locale: Locale;
  t: CrmMessages;
  island: LeadIslandMessages;
  pagePath: string;
  editable: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
          <div className="min-w-0">
            <p className="break-words font-semibold text-ink">{task.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <DueLabel dueAt={task.dueAt} now={now} locale={locale} t={t} />
              {task.assignee && <span>· {format(t.lead.tasks.assignedTo, { name: task.assignee.displayName })}</span>}
            </p>
          </div>
          {editable && <CompleteTaskButton taskId={task.id} title={task.title} t={island} pagePath={pagePath} />}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

function LeadDetailsPanel({
  lead,
  centres,
  locale,
  t,
}: {
  lead: LeadDetail;
  centres: Readonly<Record<string, string>>;
  locale: Locale;
  t: CrmMessages;
}) {
  const d = t.lead.details;
  const value = (text: string | null | undefined) => (text && text.trim() ? text : <span className="text-muted">{t.common.noValue}</span>);
  const latest = newestSubmission(lead.activities);
  const utm = [
    [d.utmSource, lead.utm.source],
    [d.utmMedium, lead.utm.medium],
    [d.utmCampaign, lead.utm.campaign],
    [d.utmTerm, lead.utm.term],
    [d.utmContent, lead.utm.content],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <PortalPanel id="crm-lead-details" title={d.title}>
      <dl className="divide-y divide-line">
        <Row label={d.student}>{value(lead.studentName)}</Row>
        {lead.contactName && <Row label={d.contactName}>{lead.contactName}</Row>}
        <Row label={d.guardian}>{value(lead.guardianName)}</Row>
        <Row label={d.phone}>
          <span lang="en" className="font-mono">
            {value(displayPhone(lead.phone))}
          </span>
        </Row>
        <Row label={d.email}>{lead.email ? <span lang="en">{lead.email}</span> : value(null)}</Row>
        <Row label={d.class}>{value(classLabel(t, lead.currentClass))}</Row>
        <Row label={d.program}>{value(programLabel(t, lead.programInterest))}</Row>
        <Row label={d.centre}>{value(centreLabel(t, centres, lead.centreSlug))}</Row>
        <Row label={d.source}>{sourceLabel(t, lead.source)}</Row>
        {lead.tool && <Row label={d.tool}>{toolLabel(t, lead.tool)}</Row>}
        <Row label={d.message}>{lead.message ? <span className="whitespace-pre-line">{lead.message}</span> : value(null)}</Row>
        <Row label={d.submissions}>{lead.submissionCount}</Row>
        <Row label={d.createdAt}>
          <RelativeTime value={lead.createdAt} locale={locale} />
        </Row>
        <Row label={d.updatedAt}>
          <RelativeTime value={lead.updatedAt} locale={locale} />
        </Row>
        {lead.lostReason && <Row label={d.lostReason}>{lostReasonLabel(t, lead.lostReason)}</Row>}
      </dl>

      <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide text-muted">{d.contextTitle}</h3>
      <dl className="mt-1 divide-y divide-line">
        <Row label={d.page}>{lead.page ? <span lang="en" className="font-mono text-[13px]">{lead.page}</span> : value(null)}</Row>
        <Row label={d.referrer}>{lead.referrer ? <span lang="en" className="break-all font-mono text-[13px]">{lead.referrer}</span> : value(null)}</Row>
        <Row label={d.utm}>
          {utm.length ? (
            <ul className="space-y-0.5">
              {utm.map(([label, text]) => (
                <li key={label}>
                  <span className="text-muted">{label}:</span> <span lang="en" className="break-all">{text}</span>
                </li>
              ))}
            </ul>
          ) : (
            value(null)
          )}
        </Row>
      </dl>

      {latest && <LatestEnquiry activity={latest} locale={locale} t={t} />}

      <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide text-muted">{d.consentTitle}</h3>
      <dl className="mt-1 divide-y divide-line">
        {lead.consentTextVersion || lead.consentAt ? (
          <>
            <Row label={d.consentVersion}>
              <span lang="en" className="font-mono text-[13px]">
                {lead.consentTextVersion ?? t.common.none}
              </span>
            </Row>
            <Row label={d.consentAt}>
              <RelativeTime value={lead.consentAt} locale={locale} />
            </Row>
          </>
        ) : (
          <Row label={d.consentVersion}>{d.noConsent}</Row>
        )}
      </dl>
    </PortalPanel>
  );
}

/** The newest public submission on the timeline (its meta carries tool / language / topic facts). */
export function newestSubmission(activities: readonly LeadActivity[]): LeadActivity | null {
  let newest: LeadActivity | null = null;
  for (const activity of activities) {
    if (activity.type !== "submission") continue;
    if (!newest || Date.parse(activity.at) > Date.parse(newest.at) || (activity.at === newest.at && activity.id > newest.id)) newest = activity;
  }
  return newest;
}

/** Attribution facts of the latest enquiry: tool + predictor exam / band, form language, topic, reference. */
function LatestEnquiry({ activity, locale, t }: { activity: LeadActivity; locale: Locale; t: CrmMessages }) {
  const d = t.lead.details;
  const meta = activity.meta ?? {};
  const tool = toolLabel(t, metaString(meta, "tool"));
  const exam = metaString(meta, "toolExam");
  const band = metaString(meta, "toolBand");
  const lang = metaString(meta, "locale");
  const topic = topicLabel(t, metaString(meta, "topic"));
  const page = metaString(meta, "page");
  const reference = metaString(meta, "reference");
  const source = metaString(meta, "source");
  return (
    <>
      <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide text-muted">{d.latestTitle}</h3>
      <dl className="mt-1 divide-y divide-line">
        <Row label={d.createdAt}>
          <RelativeTime value={activity.at} locale={locale} />
        </Row>
        {source && <Row label={d.source}>{sourceLabel(t, source)}</Row>}
        {tool && <Row label={d.tool}>{tool}</Row>}
        {exam && (
          <Row label={d.toolExam}>
            <span lang="en">{exam}</span>
          </Row>
        )}
        {band && (
          <Row label={d.toolBand}>
            <span lang="en">{band}</span>
          </Row>
        )}
        {lang && <Row label={d.formLanguage}>{lang === "en" || lang === "hi" ? localeNames[lang] : lang}</Row>}
        {topic && <Row label={d.topic}>{topic}</Row>}
        {page && (
          <Row label={d.page}>
            <span lang="en" className="font-mono text-[13px]">
              {page}
            </span>
          </Row>
        )}
        {reference && (
          <Row label={d.reference}>
            <span lang="en" className="font-mono text-[13px]">
              {reference}
            </span>
          </Row>
        )}
      </dl>
    </>
  );
}

const activityIcons: Record<string, LucideIcon> = {
  submission: Inbox,
  created: UserPlus,
  note: StickyNote,
  call: Phone,
  whatsapp: MessageCircle,
  stage_change: ArrowRightLeft,
  assignment: UserRoundCheck,
  field_update: Pencil,
  task_created: ClipboardList,
  task_done: CheckCircle2,
  merge: ArrowRightLeft,
  erase: Eraser,
};

function metaString(meta: LeadActivity["meta"], key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value ? value : null;
}

/** Display name for a staff id seen on the timeline. */
function staffName(id: string | null, viewer: CrmViewer, staffNames: Readonly<Record<string, string>>, t: CrmMessages): string | null {
  if (!id) return null;
  if (id === viewer.userId) return t.common.you;
  return staffNames[id] ?? t.lead.timeline.someone;
}

/** The facts line under one timeline entry (structured meta only; staff text is shown separately). */
export function activitySummary(
  activity: LeadActivity,
  ctx: { t: CrmMessages; locale: Locale; viewer: CrmViewer; staffNames: Readonly<Record<string, string>>; tasks: LeadTask[] },
): string[] {
  const { t, locale } = ctx;
  const tl = t.lead.timeline;
  const meta = activity.meta ?? {};
  const lines: string[] = [];
  switch (activity.type) {
    case "submission": {
      const source = metaString(meta, "source");
      const tool = toolLabel(t, metaString(meta, "tool"));
      lines.push(format(tl.submissionFrom, { source: [sourceLabel(t, source), tool].filter(Boolean).join(" · ") }));
      const toolFacts = [metaString(meta, "toolExam"), metaString(meta, "toolBand")].filter(Boolean);
      if (toolFacts.length) lines.push(toolFacts.join(" · "));
      const page = metaString(meta, "page");
      if (page) lines.push(format(tl.onPage, { page }));
      const reference = metaString(meta, "reference");
      if (reference) lines.push(format(tl.reference, { reference }));
      break;
    }
    case "created": {
      const source = metaString(meta, "source");
      if (source) lines.push(format(tl.submissionFrom, { source: sourceLabel(t, source) }));
      break;
    }
    case "call":
    case "whatsapp": {
      const outcome = outcomeLabel(t, metaString(meta, "outcome"));
      if (outcome) lines.push(format(tl.outcome, { outcome }));
      break;
    }
    case "stage_change": {
      const from = metaString(meta, "from");
      const to = metaString(meta, "to");
      if (from && to) lines.push(format(tl.stageChange, { from: stageLabel(t, from), to: stageLabel(t, to) }));
      else if (to) lines.push(stageLabel(t, to));
      const reason = lostReasonLabel(t, metaString(meta, "lostReason"));
      if (reason) lines.push(format(tl.lostBecause, { reason }));
      break;
    }
    case "assignment": {
      const to = staffName(metaString(meta, "to"), ctx.viewer, ctx.staffNames, t);
      if (!to) lines.push(tl.unassignedNow);
      else lines.push(format(meta.auto === true ? tl.autoAssigned : tl.assignedTo, { name: to }));
      break;
    }
    case "field_update": {
      const fields = Array.isArray(meta.fields) ? meta.fields : [];
      const names = fields.map((field) =>
        Object.hasOwn(t.lead.details.fieldNames, field) ? t.lead.details.fieldNames[field as keyof CrmMessages["lead"]["details"]["fieldNames"]] : field,
      );
      if (names.length) lines.push(format(tl.fieldsEdited, { fields: names.join(", ") }));
      break;
    }
    case "task_created":
    case "task_done": {
      const taskId = metaString(meta, "taskId");
      const task = taskId ? ctx.tasks.find((item) => item.id === taskId) : undefined;
      if (task) lines.push(task.title);
      const dueAt = metaString(meta, "dueAt") ?? (activity.type === "task_created" ? task?.dueAt ?? null : null);
      if (dueAt) lines.push(format(tl.dueOn, { date: formatDateTime(dueAt, locale) ?? "" }));
      break;
    }
    default:
      break;
  }
  return lines;
}

export function activityTypeLabel(t: CrmMessages, type: string): string {
  const types = t.lead.timeline.types;
  return Object.hasOwn(types, type) ? types[type as keyof typeof types] : types.other;
}

function Timeline({
  lead,
  viewer,
  staffNames,
  locale,
  t,
}: {
  lead: LeadDetail;
  viewer: CrmViewer;
  staffNames: Readonly<Record<string, string>>;
  locale: Locale;
  t: CrmMessages;
}) {
  // Newest first (the service already sorts; keep it explicit for safety).
  const items = [...lead.activities].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id);
  if (items.length === 0) return <p className="text-sm text-muted">{t.lead.timeline.empty}</p>;
  const ctx = { t, locale, viewer, staffNames, tasks: lead.tasks };
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {items.map((activity) => {
        const Icon = activityIcons[activity.type] ?? ArrowRightLeft;
        const actor = activity.actorId === viewer.userId ? t.common.you : activity.actorName;
        const lines = activitySummary(activity, ctx);
        return (
          <li key={activity.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[31px] top-0 grid size-6 place-items-center rounded-full border-2 border-white bg-[#f3eeff] text-[#5b3cc4]",
                activity.type === "stage_change" && "bg-blue-soft text-blue",
                (activity.type === "call" || activity.type === "whatsapp") && "bg-success-soft text-success",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <strong className="text-navy">{activityTypeLabel(t, activity.type)}</strong>
              <time dateTime={isoOrUndefined(activity.at)} className="text-xs text-muted">
                {formatDateTime(activity.at, locale)}
              </time>
              {actor && <span className="text-xs text-muted">{format(t.lead.timeline.by, { name: actor })}</span>}
            </p>
            {lines.map((line) => (
              <p key={line} className="text-sm text-[#354b66]">
                {line}
              </p>
            ))}
            {activity.body && <p className="mt-1 whitespace-pre-line break-words rounded-control bg-[#f8fafc] p-2 text-sm text-ink">{activity.body}</p>}
          </li>
        );
      })}
    </ol>
  );
}
