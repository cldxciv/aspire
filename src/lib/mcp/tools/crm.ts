import "server-only";

import { z } from "zod";

import { adminGetUser } from "@/lib/auth/accounts";
import {
  addNote,
  assignLead,
  changeStage,
  completeTask,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  createManualLead,
  createTask,
  funnelReport,
  getLead,
  LEAD_SORTS,
  LEAD_STAGES,
  LEAD_TOOLS,
  listLeads,
  logContact,
  LOST_REASONS,
  MANUAL_LEAD_SOURCES,
  myTasks,
  reportRange,
  resolveCrmViewer,
  TASK_RANGES,
  type CrmResult,
  type CrmViewer,
  type LeadActivity,
  type LeadFilters,
  type LeadSummary,
  type LeadTask,
  type MyTask,
} from "@/lib/crm";

import { compact, limitSchema, offsetSchema, pageSummary, paginate, recordIdSchema } from "./common";
import { defineTool, fail, READ_ONLY, type ToolContext, type ToolOutcome, type ToolSuccess } from "./types";

/**
 * CRM (lead & admission engine) tools — service `crm` (src/lib/mcp/scopes.ts). Every call goes
 * through the CRM services in src/lib/crm (never SQL), so their validation, record-level access and
 * `crm.*` audit rows apply. The CRM viewer is the admin who created the token (admin-level access).
 *
 * Privacy: lists show phone numbers MASKED (last 4 digits only); `get_lead` is the full record
 * (its view is audited by the CRM as `crm.lead_view`) but never the consent sentence, only its
 * version and time. Nothing is ever sent to a family (D-041): `log_lead_contact` only records what
 * a staff member did. Not exposed via MCP: CSV export, erase, staff / assignment-rule management.
 */

const SCAN_PAGE = 100;
/** Upper bound for filters the CRM service cannot apply itself (the `tool` filter). */
const SCAN_MAX = 5000;

function crmViewer(ctx: ToolContext): CrmViewer | null {
  const user = adminGetUser(ctx.caller.createdBy);
  if (!user || user.disabled || user.role !== "admin") return null;
  return resolveCrmViewer({
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
  });
}

const NO_VIEWER = fail("forbidden", "The admin who created this token cannot use the CRM right now.");

function crmFailure(result: Extract<CrmResult<unknown>, { ok: false }>): ToolOutcome {
  const fields = result.fieldErrors
    ? ` ${Object.entries(result.fieldErrors)
        .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
        .join("; ")}`
    : "";
  return fail(result.error, `${result.message}${fields}`.slice(0, 600));
}

/** `+91******3210`-style masking for lists. */
export function maskPhone(phone: string | null): { phoneMasked: string | null; phoneLast4: string | null } {
  if (!phone) return { phoneMasked: null, phoneLast4: null };
  const last4 = phone.slice(-4);
  return { phoneMasked: `${phone.startsWith("+91") ? "+91" : ""}******${last4}`, phoneLast4: last4 };
}

function leadListItem(lead: LeadSummary) {
  return compact({
    id: lead.id,
    displayName: lead.displayName,
    studentName: lead.studentName,
    guardianName: lead.guardianName,
    ...maskPhone(lead.phone),
    stage: lead.stage,
    lostReason: lead.lostReason,
    centreSlug: lead.centreSlug,
    programInterest: lead.programInterest,
    currentClass: lead.currentClass,
    source: lead.source,
    tool: lead.tool,
    assignee: lead.assignee,
    createdAt: lead.createdAt,
    lastActivityAt: lead.lastActivityAt,
    nextTaskDueAt: lead.nextTaskDueAt,
    overdue: lead.overdue,
    submissionCount: lead.submissionCount,
    erased: lead.erased ? true : undefined,
  });
}

/** Activity meta without the consent sentence (only its version is shown). */
function activityOut(activity: LeadActivity) {
  const meta = Object.fromEntries(
    Object.entries(activity.meta).filter(([key]) => key !== "consentText" && key !== "consentLocale"),
  );
  return { ...activity, meta };
}

function taskOut(task: LeadTask | MyTask) {
  if (!("leadPhone" in task)) return task;
  const { leadPhone, ...rest } = task;
  return { ...rest, leadPhoneLast4: maskPhone(leadPhone).phoneLast4 };
}

const leadIdSchema = recordIdSchema.describe("Lead id (from list_leads).");
const slug = z.string().trim().max(60).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "Use a lowercase slug, e.g. shimla.");
const isoTime = z
  .string()
  .trim()
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "Use an ISO date or date-time, e.g. 2026-10-20 or 2026-10-20T10:00:00+05:30.");

// ---------------------------------------------------------------------------
// crm:read
// ---------------------------------------------------------------------------

export const listLeadsTool = defineTool({
  name: "list_leads",
  title: "List CRM leads",
  description:
    "Lists enquiry leads from the Aspire CRM (families who asked about admissions, newest activity first by default). " +
    "Filters: stage (a pipeline stage or 'open'), centre (slug or 'none'), program, source (hero, admissions, contact, quick, tool, walk_in, phone_call, referral, other), " +
    "tool (predictor, mocktest, ask, planner — leads from that tool's 'talk to a counsellor' button), assignee (staff user id, 'me' = the admin who owns this token, 'unassigned'), " +
    "due ('today' / 'overdue' follow-ups), search (name, or the last 4+ digits of the phone), createdFrom / createdTo (ISO). " +
    "Phone numbers are MASKED here (last 4 digits); open one lead with get_lead for the full record. Paginated: page (1…) and pageSize (1–100, default 25). " +
    "These are families' personal data, often of minors: use them only for the admission task at hand.",
  scope: "read",
  inputSchema: z.object({
    stage: z.enum([...LEAD_STAGES, "open"]).optional().describe("A stage, or 'open' (not enrolled and not lost)."),
    centre: z.union([slug, z.literal("none")]).optional().describe("Centre slug, or 'none' for leads without a centre."),
    program: slug.optional().describe("Program interest: jee, neet, foundation, integrated, not-sure."),
    source: slug.optional(),
    tool: z.enum(LEAD_TOOLS).optional(),
    assignee: z.union([recordIdSchema, z.literal("me"), z.literal("unassigned")]).optional(),
    due: z.enum(["today", "overdue"]).optional(),
    search: z.string().trim().max(80).optional().describe("Name (contains) or the last 4+ phone digits."),
    createdFrom: isoTime.optional(),
    createdTo: isoTime.optional(),
    sort: z.enum(LEAD_SORTS as unknown as [string, ...string[]]).optional().describe("recent_activity (default), newest, oldest, due, name."),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  }),
  annotations: READ_ONLY,
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const filters: LeadFilters = compact({
      stage: args.stage,
      centre: args.centre,
      program: args.program,
      source: args.source,
      assignee: args.assignee,
      due: args.due,
      q: args.search,
      createdFrom: args.createdFrom,
      createdTo: args.createdTo,
      sort: args.sort as LeadFilters["sort"],
    });

    let items: LeadSummary[];
    let total: number;
    let truncated = false;
    if (args.tool) {
      // The CRM service has no tool filter: walk its pages (same scope and other filters), then page here.
      const matches: LeadSummary[] = [];
      let seen = 0;
      for (let page = 1; ; page += 1) {
        const result = listLeads(viewer, filters, { page, pageSize: SCAN_PAGE }, ctx.now);
        seen += result.items.length;
        matches.push(...result.items.filter((lead) => lead.tool === args.tool));
        if (result.items.length === 0 || seen >= result.total) break;
        if (seen >= SCAN_MAX) {
          truncated = true;
          break;
        }
      }
      total = matches.length;
      items = matches.slice((args.page - 1) * args.pageSize, args.page * args.pageSize);
    } else {
      const result = listLeads(viewer, filters, { page: args.page, pageSize: args.pageSize }, ctx.now);
      items = result.items;
      total = result.total;
    }
    const nextPage = args.page * args.pageSize < total ? args.page + 1 : null;
    const first = (args.page - 1) * args.pageSize + 1;
    return {
      ok: true,
      summary:
        total === 0
          ? "No leads match."
          : `${items.length === 0 ? 0 : first}–${first + items.length - 1} of ${total} leads.${nextPage ? ` More: call again with page ${nextPage}.` : ""}${truncated ? ` Only the first ${SCAN_MAX} leads were searched for this tool; narrow the filters.` : ""}`,
      data: compact({ total, page: args.page, pageSize: args.pageSize, nextPage, truncated: truncated || undefined, leads: items.map(leadListItem) }),
    };
  },
});

export const getLeadTool = defineTool({
  name: "get_lead",
  title: "Get CRM lead",
  description:
    "Opens one CRM lead with everything staff see: names, full phone (E.164) and email, centre, program, class, stage, assignee, attribution " +
    "(source, tool, page, UTM), the family's latest message, consent version and time, the timeline (submissions, notes, calls, stage changes, newest first) and tasks. " +
    "Each view is recorded in the audit log (crm.lead_view). Use it only when the task needs this family's details.",
  scope: "read",
  inputSchema: z.object({ leadId: leadIdSchema }),
  annotations: READ_ONLY,
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = getLead(viewer, args.leadId, ctx.now);
    if (!result.ok) return crmFailure(result);
    // Consent: version and time only — never the sentence (or its language).
    const { consentText: _text, consentLocale: _locale, activities, tasks, ...lead } = result.data;
    void _text;
    void _locale;
    return {
      ok: true,
      summary: `Lead "${lead.displayName ?? "(erased)"}": stage ${lead.stage}, ${lead.assignee ? `assigned to ${lead.assignee.displayName}` : "unassigned"}, ${tasks.filter((t) => !t.doneAt).length} open task(s), ${activities.length} timeline entries.`,
      data: { lead: { ...lead, activities: activities.map(activityOut), tasks } },
    };
  },
});

export const listMyTasksTool = defineTool({
  name: "list_my_tasks",
  title: "List my CRM follow-up tasks",
  description:
    "Lists CRM follow-up tasks assigned to the admin who owns this token. range: today (due this India day), overdue, upcoming, open (default), done (latest 100). " +
    "For the whole team's due follow-ups use list_leads with due 'today' or 'overdue'. Lead phones are masked (last 4 digits). Paginated: limit 1–100 and offset.",
  scope: "read",
  inputSchema: z.object({
    range: z.enum(TASK_RANGES as unknown as [string, ...string[]]).default("open"),
    limit: limitSchema,
    offset: offsetSchema,
  }),
  annotations: READ_ONLY,
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const tasks = myTasks(viewer, args.range as (typeof TASK_RANGES)[number], ctx.now).map(taskOut);
    const page = paginate(tasks, args.offset, args.limit);
    return {
      ok: true,
      summary: pageSummary(page, `${args.range} tasks`),
      data: { range: args.range, total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset, tasks: page.items },
    };
  },
});

export const crmReportTool = defineTool({
  name: "crm_report",
  title: "CRM funnel report",
  description:
    "Admissions funnel for leads created in a date range (default: the last 30 days; at most about 3 years): current count per stage, " +
    "how many ever reached each stage, breakdowns by source, tool, centre, program and counsellor (total / contacted / enrolled / lost), lost reasons, " +
    "and contacted / enrolled conversion rates. Counts only, no personal data. from / to are ISO dates or date-times (to is exclusive).",
  scope: "read",
  inputSchema: z.object({
    from: isoTime.optional().describe("Start (inclusive), e.g. 2026-09-01."),
    to: isoTime.optional().describe("End (exclusive), e.g. 2026-10-01. Default now."),
  }),
  annotations: READ_ONLY,
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const range = reportRange(args.from ? Date.parse(args.from) : null, args.to ? Date.parse(args.to) : null, ctx.now);
    if (!range) return fail("validation", "Invalid range: from must be before to, and the range at most about 3 years.");
    const report = funnelReport(viewer, range);
    return {
      ok: true,
      summary: `${report.total} lead(s) created ${report.from.slice(0, 10)} – ${report.to.slice(0, 10)}: ${report.byStage.enrolled} enrolled, ${report.byStage.lost} lost; contacted rate ${Math.round(report.conversion.contactedRate * 100)}%, enrolled rate ${Math.round(report.conversion.enrolledRate * 100)}%.`,
      data: { report },
    };
  },
});

// ---------------------------------------------------------------------------
// crm:write
// ---------------------------------------------------------------------------

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** A write tool's success: the `mcp.<tool>` audit row gets the lead id and non-free-text facts only. */
function written(
  summary: string,
  data: Record<string, unknown>,
  target: string,
  details: Record<string, string | number | boolean | null>,
): ToolSuccess {
  return { ok: true, summary, data, audit: { target, details } };
}

export const addLeadNoteTool = defineTool({
  name: "add_lead_note",
  title: "Add a note to a lead",
  description:
    "WRITE (needs crm:write). Adds a staff note (1–2000 characters) to a lead's timeline, written as the admin who owns this token. " +
    "Notes are visible to every staff member who can see the lead. Never put passwords or unrelated personal data in notes.",
  scope: "write",
  inputSchema: z.object({ leadId: leadIdSchema, body: z.string().trim().min(1).max(2000).describe("The note text.") }),
  annotations: { ...WRITE, idempotentHint: false },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = addNote(viewer, args.leadId, args.body, ctx.now);
    if (!result.ok) return crmFailure(result);
    return written("Note added to the lead's timeline.", { leadId: args.leadId, activity: result.data }, args.leadId, {});
  },
});

export const changeLeadStageTool = defineTool({
  name: "change_lead_stage",
  title: "Change a lead's stage",
  description:
    "WRITE (needs crm:write). Moves a lead to another pipeline stage: new, contacted, counselling_booked, visited_or_demo, applied, test_taken, offer, enrolled, lost. " +
    `Moving to 'lost' requires lostReason (${LOST_REASONS.join(", ")}); leaving 'lost' clears it. Any stage may move to any other (to correct mistakes). Recorded on the timeline and audited.`,
  scope: "write",
  inputSchema: z
    .object({
      leadId: leadIdSchema,
      stage: z.enum(LEAD_STAGES),
      lostReason: z.enum(LOST_REASONS).optional().describe("Required when stage is 'lost'."),
    })
    .refine((value) => value.stage !== "lost" || value.lostReason !== undefined, {
      message: "lostReason is required when stage is 'lost'.",
      path: ["lostReason"],
    }),
  annotations: { ...WRITE, idempotentHint: true },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = changeStage(viewer, args.leadId, args.stage, args.stage === "lost" ? (args.lostReason ?? null) : null, ctx.now);
    if (!result.ok) return crmFailure(result);
    const lead = result.data;
    return written(
      `Lead is now '${lead.stage}'${lead.lostReason ? ` (lost: ${lead.lostReason})` : ""}.`,
      { leadId: lead.id, stage: lead.stage, lostReason: lead.lostReason, furthestStage: lead.furthestStage },
      lead.id,
      { stage: lead.stage, lostReason: lead.lostReason },
    );
  },
});

export const assignLeadTool = defineTool({
  name: "assign_lead",
  title: "Assign a lead",
  description:
    "WRITE (needs crm:write). Assigns a lead to a CRM staff member (assigneeId = their user id; find ids with list_accounts role 'staff', or from assignees in list_leads / crm_report), " +
    "or unassigns it with assigneeId null. The member must have an active CRM membership. Recorded on the timeline and audited.",
  scope: "write",
  inputSchema: z.object({
    leadId: leadIdSchema,
    assigneeId: recordIdSchema.nullable().describe("Staff user id, or null to unassign."),
  }),
  annotations: { ...WRITE, idempotentHint: true },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = assignLead(viewer, args.leadId, args.assigneeId, ctx.now);
    if (!result.ok) return crmFailure(result);
    const lead = result.data;
    return written(
      lead.assignee ? `Lead assigned to ${lead.assignee.displayName}.` : "Lead is now unassigned.",
      { leadId: lead.id, assignee: lead.assignee },
      lead.id,
      { assigned: lead.assignee !== null },
    );
  },
});

export const createLeadTaskTool = defineTool({
  name: "create_lead_task",
  title: "Create a follow-up task",
  description:
    "WRITE (needs crm:write). Creates a follow-up task on a lead: title (1–200 characters), dueAt (ISO date-time between one day ago and two years ahead; " +
    "use the India time zone, e.g. 2026-10-21T10:00:00+05:30), optional assigneeId (default: the lead's assignee, else the admin who owns this token). Audited.",
  scope: "write",
  inputSchema: z.object({
    leadId: leadIdSchema,
    title: z.string().trim().min(1).max(200),
    dueAt: isoTime,
    assigneeId: recordIdSchema.optional(),
  }),
  annotations: { ...WRITE, idempotentHint: false },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = createTask(viewer, args.leadId, { title: args.title, dueAt: args.dueAt, assigneeId: args.assigneeId ?? null }, ctx.now);
    if (!result.ok) return crmFailure(result);
    const task = result.data;
    return written(
      `Task created, due ${task.dueAt}${task.assignee ? ` for ${task.assignee.displayName}` : ""}.`,
      { task },
      task.leadId,
      { taskId: task.id },
    );
  },
});

export const completeLeadTaskTool = defineTool({
  name: "complete_lead_task",
  title: "Complete a follow-up task",
  description:
    "WRITE (needs crm:write). Marks a lead's follow-up task as done (idempotent). taskId from get_lead or list_my_tasks. Audited.",
  scope: "write",
  inputSchema: z.object({ taskId: recordIdSchema.describe("Task id.") }),
  annotations: { ...WRITE, idempotentHint: true },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = completeTask(viewer, args.taskId, ctx.now);
    if (!result.ok) return crmFailure(result);
    const task = result.data;
    return written(`Task done (${task.doneAt}).`, { task }, task.leadId, { taskId: task.id });
  },
});

export const logLeadContactTool = defineTool({
  name: "log_lead_contact",
  title: "Log a call or WhatsApp contact",
  description:
    "WRITE (needs crm:write). RECORDS a call or WhatsApp message that a staff member made themselves — the system sends NOTHING to the family (no calls, SMS or WhatsApp). " +
    `channel: call | whatsapp; outcome: ${CONTACT_OUTCOMES.join(", ")}; optional note (≤ 2000 characters). A 'connected' outcome moves a 'new' lead to 'contacted'. Audited.`,
  scope: "write",
  inputSchema: z.object({
    leadId: leadIdSchema,
    channel: z.enum(CONTACT_CHANNELS),
    outcome: z.enum(CONTACT_OUTCOMES),
    note: z.string().trim().max(2000).optional(),
  }),
  annotations: { ...WRITE, idempotentHint: false },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = logContact(viewer, args.leadId, { channel: args.channel, outcome: args.outcome, body: args.note ?? null }, ctx.now);
    if (!result.ok) return crmFailure(result);
    return written(
      `Logged ${args.channel} (${args.outcome}). Nothing was sent by the system.`,
      { leadId: args.leadId, activity: result.data },
      args.leadId,
      { channel: args.channel, contactOutcome: args.outcome },
    );
  },
});

export const createWalkinLeadTool = defineTool({
  name: "create_walkin_lead",
  title: "Create a walk-in / phone lead",
  description:
    "WRITE (needs crm:write). Enters a lead that came in person, by phone or by referral (source: walk_in default, phone_call, referral, other). " +
    "Needs the student's or the parent's name and an Indian mobile number; optional email, currentClass (class-6-8, class-9, class-10, class-11, class-12, dropper), " +
    "programInterest (jee, neet, foundation, integrated, not-sure), centreSlug and a first note. familyConsented must be true: only enter families who agreed to be contacted. " +
    "A phone that already has a lead reuses it (isNew false). New leads are auto-assigned by the CRM rules. Audited.",
  scope: "write",
  inputSchema: z.object({
    source: z.enum(MANUAL_LEAD_SOURCES).default("walk_in"),
    studentName: z.string().trim().max(80).optional(),
    guardianName: z.string().trim().max(80).optional(),
    phone: z.string().trim().min(10).max(32).describe("Indian mobile, e.g. 98765 43210 or +91 98765 43210."),
    email: z.string().trim().max(254).optional(),
    currentClass: slug.optional(),
    programInterest: slug.optional(),
    centreSlug: slug.optional(),
    note: z.string().trim().max(2000).optional(),
    familyConsented: z.literal(true, { error: "familyConsented must be true: the family agreed to be contacted." }),
  }),
  annotations: { ...WRITE, idempotentHint: false },
  run(args, ctx) {
    const viewer = crmViewer(ctx);
    if (!viewer) return NO_VIEWER;
    const result = createManualLead(
      viewer,
      {
        source: args.source,
        studentName: args.studentName ?? null,
        guardianName: args.guardianName ?? null,
        phone: args.phone,
        email: args.email ?? null,
        currentClass: args.currentClass ?? null,
        programInterest: args.programInterest ?? null,
        centreSlug: args.centreSlug ?? null,
        note: args.note ?? null,
        consent: true,
      },
      ctx.now,
    );
    if (!result.ok) return crmFailure(result);
    const { leadId, isNew } = result.data;
    return written(
      isNew ? "New lead created." : "A lead with this phone already existed; the visit was added to it.",
      { leadId, isNew },
      leadId,
      { source: args.source, isNew },
    );
  },
});

export const CRM_TOOLS = [
  listLeadsTool,
  getLeadTool,
  listMyTasksTool,
  crmReportTool,
  addLeadNoteTool,
  changeLeadStageTool,
  assignLeadTool,
  createLeadTaskTool,
  completeLeadTaskTool,
  logLeadContactTool,
  createWalkinLeadTool,
] as const;
