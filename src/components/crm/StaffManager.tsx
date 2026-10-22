"use client";

import { Copy, LoaderCircle, Pencil, Plus, Save, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import enAreas from "@/i18n/messages/en/crm-areas";
import hiAreas from "@/i18n/messages/hi/crm-areas";
import type { Messages } from "@/i18n/messages/types";
import type { ApiFailure } from "@/lib/auth/client-api";
import { DISPLAY_NAME_MAX_LENGTH, LOGIN_ID_PATTERN } from "@/lib/auth/identifiers";
import { cn } from "@/lib/cn";
import { CRM_ROLES, type AssignmentRule, type AssignmentRuleInput, type CrmRole, type CrmStaffMember } from "@/lib/crm/types";
import type { RoutingSettings, SettingEnvelope } from "@/lib/crm/lead-ops-types";
import { crmRequests, sendCrm } from "./api";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "./client-kit";
import { leadOpsRequests } from "./lead-ops-api";
import type { Option } from "./types";

export type StaffMessages = Pick<Messages<"crm">, "common" | "errors" | "roles" | "staff">;

const PAGE_PATH = "/crm/staff";
export const MAX_RULES = 50;

type RuleDraft = AssignmentRuleInput & { key: string };

export type RuleIssue = "ruleNeedsCounsellor" | "ruleDuplicate" | "rulesLimit";

/** Client-side checks before PUT /api/crm/rules (the server re-validates). */
export function validateRules(rules: readonly AssignmentRuleInput[]): RuleIssue | null {
  if (rules.length > MAX_RULES) return "rulesLimit";
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.memberIds.length === 0) return "ruleNeedsCounsellor";
    const key = `${rule.centreSlug ?? "*"}|${rule.programInterest ?? "*"}`;
    if (seen.has(key)) return "ruleDuplicate";
    seen.add(key);
  }
  return null;
}

export type StaffFormIssue = { displayName?: "nameRequired"; loginId?: "loginIdRequired" | "invalidLoginId" };

export function validateStaffForm(input: { displayName: string; loginId: string }): StaffFormIssue {
  const issues: StaffFormIssue = {};
  const name = input.displayName.trim();
  if (!name || Array.from(name).length > DISPLAY_NAME_MAX_LENGTH) issues.displayName = "nameRequired";
  const login = input.loginId.trim().toLowerCase();
  if (!login) issues.loginId = "loginIdRequired";
  else if (!LOGIN_ID_PATTERN.test(login)) issues.loginId = "invalidLoginId";
  return issues;
}

/** A 422 from the admin users API about the login id (taken / invalid), recognised from its fixed text. */
export function staffFieldIssue(failure: ApiFailure): "loginIdTaken" | "invalidLoginId" | null {
  const known = failure.fieldErrors.loginId ?? failure.known;
  return known === "loginIdTaken" || known === "invalidLoginId" ? known : null;
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Staff & rules (`/crm/staff`). Admins: create staff accounts (temporary password shown once),
 * change role / centre scope / active, and edit the auto-assignment rules. Managers: the same
 * screens read-only. The server re-checks every write (docs/crm.md §1).
 */
export function StaffManager({
  staff,
  rules,
  canManage,
  centres,
  programs,
  t,
}: {
  staff: CrmStaffMember[];
  rules: AssignmentRule[];
  canManage: boolean;
  centres: Option[];
  programs: Option[];
  t: StaffMessages;
}) {
  const s = t.staff;
  const centreName = (slug: string) => centres.find((option) => option.value === slug)?.label ?? slug;
  const [editing, setEditing] = useState<CrmStaffMember | null>(null);
  const [status, setStatus] = useState("");

  return (
    <div className="space-y-5">
      <section aria-labelledby="crm-staff-list" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
        <h2 id="crm-staff-list" className="mb-4 text-lg font-extrabold text-navy">
          {s.listTitle}
        </h2>
        <p role="status" className="mb-2 text-sm font-semibold text-success">
          {status}
        </p>
        {staff.length === 0 ? (
          <p className="text-sm text-muted">{s.listEmpty}</p>
        ) : (
          <div role="region" aria-labelledby="crm-staff-list" tabIndex={0} className="relative overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead className="bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {s.columns.name}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {s.columns.role}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {s.columns.centres}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    {s.columns.status}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-bold">
                    {s.columns.leads}
                  </th>
                  {canManage && (
                    <th scope="col" className="px-3 py-2.5 font-bold">
                      {s.columns.actions}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staff.map((member) => (
                  <tr key={member.userId} className="align-top">
                    <th scope="row" className="px-3 py-3 font-semibold text-ink">
                      {member.displayName}
                      {member.loginId && (
                        <span lang="en" className="block font-mono text-xs font-normal text-muted">
                          {member.loginId}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-3">{t.roles[member.crmRole]}</td>
                    <td className="px-3 py-3">{member.centreSlugs.length ? member.centreSlugs.map(centreName).join(", ") : s.allCentres}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        <Badge variant={member.active ? "success" : "neutral"} className="normal-case tracking-normal">
                          {member.active ? s.active : s.inactive}
                        </Badge>
                        {member.disabled && (
                          <Badge variant="warning" className="normal-case tracking-normal">
                            {s.accountDisabled}
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{member.openLeads}</td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => setEditing(member)} aria-label={format(s.editLabel, { name: member.displayName })}>
                          <Pencil aria-hidden="true" className="size-4" />
                          {s.edit}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && <CreateStaffForm centres={centres} t={t} />}

      <RulesEditor
        key={rules.map((rule) => rule.id).join(",")}
        rules={rules}
        staff={staff}
        canEdit={canManage}
        centres={centres}
        programs={programs}
        t={t}
      />

      {canManage && (
        <CrmDialog open={editing !== null} titleId="crm-staff-edit-title" onClose={() => setEditing(null)}>
          {editing && (
            <EditStaffForm
              member={editing}
              centres={centres}
              t={t}
              onCancel={() => setEditing(null)}
              onSaved={(message) => {
                setEditing(null);
                setStatus(message);
              }}
            />
          )}
        </CrmDialog>
      )}
    </div>
  );
}

function CentreCheckboxes({
  idPrefix,
  centres,
  value,
  onChange,
  legend,
  hint,
}: {
  idPrefix: string;
  centres: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  legend: string;
  hint: string;
}) {
  return (
    <fieldset aria-describedby={`${idPrefix}-hint`}>
      <legend className={labelClasses}>{legend}</legend>
      <p id={`${idPrefix}-hint`} className="mt-1 text-xs text-muted">
        {hint}
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {centres.map((centre) => (
          <label key={centre.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(centre.value)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, centre.value] : value.filter((slug) => slug !== centre.value))
              }
              className="size-4 accent-[#1768d4]"
            />
            {centre.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EditStaffForm({
  member,
  centres,
  t,
  onCancel,
  onSaved,
}: {
  member: CrmStaffMember;
  centres: Option[];
  t: StaffMessages;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const id = useId();
  const s = t.staff;
  const [crmRole, setCrmRole] = useState<CrmRole>(member.crmRole);
  const [centreSlugs, setCentreSlugs] = useState<string[]>(member.centreSlugs);
  const [active, setActive] = useState(member.active);
  const action = useCrmAction(t, PAGE_PATH);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await action.run(crmRequests.updateStaff(member.userId, { crmRole, centreSlugs, active }));
    if (data === null) return;
    const message =
      active !== member.active
        ? format(active ? s.activated : s.deactivated, { name: member.displayName })
        : format(s.saved, { name: member.displayName });
    onSaved(message);
  }

  return (
    <form onSubmit={submit} className="p-5 md:p-6" aria-busy={action.pending || undefined}>
      <h2 id="crm-staff-edit-title" className="text-lg font-extrabold text-navy">
        {format(s.editTitle, { name: member.displayName })}
      </h2>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={`${id}-role`} className={labelClasses}>
          {s.crmRole}
        </label>
        <select id={`${id}-role`} value={crmRole} onChange={(event) => setCrmRole(event.target.value as CrmRole)} className={fieldClasses}>
          {CRM_ROLES.map((role) => (
            <option key={role} value={role}>
              {t.roles[role]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4">
        <CentreCheckboxes idPrefix={`${id}-centres`} centres={centres} value={centreSlugs} onChange={setCentreSlugs} legend={s.centres} hint={s.centresHint} />
      </div>
      <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-navy">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-[#1768d4]" />
        {s.active}
      </label>
      <ActionFeedback status="" error={action.error} className="mt-2" />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="dark" disabled={action.pending}>
          {action.pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="size-4" />}
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

type TempPassword = { name: string; loginId: string; password: string };

function CreateStaffForm({ centres, t }: { centres: Option[]; t: StaffMessages }) {
  const id = useId();
  const s = t.staff;
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [crmRole, setCrmRole] = useState<CrmRole>("counsellor");
  const [centreSlugs, setCentreSlugs] = useState<string[]>([]);
  const [issues, setIssues] = useState<{ displayName?: string; loginId?: string }>({});
  const [temp, setTemp] = useState<TempPassword | null>(null);
  const action = useCrmAction(t, PAGE_PATH);
  const nameRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateStaffForm({ displayName, loginId });
    const next = { displayName: found.displayName && s[found.displayName], loginId: found.loginId && s[found.loginId] };
    setIssues(next);
    if (next.displayName) return nameRef.current?.focus();
    if (next.loginId) return loginRef.current?.focus();
    const data = await action.run<{ user: { displayName: string; loginId: string }; temporaryPassword: string }>(
      crmRequests.createStaff({ displayName, loginId, crmRole, centreSlugs }),
      undefined,
      (failure) => {
        const field = staffFieldIssue(failure);
        if (!field) return null;
        setIssues({ loginId: s[field] });
        loginRef.current?.focus();
        return t.errors.validation;
      },
    );
    if (!data) return;
    setTemp({ name: data.user.displayName, loginId: data.user.loginId, password: data.temporaryPassword });
    setDisplayName("");
    setLoginId("");
    setCentreSlugs([]);
    setCrmRole("counsellor");
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {s.createTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{s.createIntro}</p>
      <form onSubmit={submit} noValidate className="mt-4 grid gap-4 md:grid-cols-3" aria-busy={action.pending || undefined}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={labelClasses}>
            {s.displayName}
          </label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            value={displayName}
            autoComplete="off"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            aria-invalid={issues.displayName ? true : undefined}
            aria-describedby={issues.displayName ? `${id}-name-error` : undefined}
            onChange={(event) => setDisplayName(event.target.value)}
            className={fieldClasses}
          />
          {issues.displayName && (
            <p id={`${id}-name-error`} className="text-sm font-semibold text-danger">
              {issues.displayName}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-login`} className={labelClasses}>
            {s.loginId}
          </label>
          <input
            ref={loginRef}
            id={`${id}-login`}
            value={loginId}
            lang="en"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            aria-invalid={issues.loginId ? true : undefined}
            aria-describedby={cn(`${id}-login-hint`, issues.loginId && `${id}-login-error`)}
            onChange={(event) => setLoginId(event.target.value)}
            className={fieldClasses}
          />
          <p id={`${id}-login-hint`} className="text-xs text-muted">
            {s.loginIdHint}
          </p>
          {issues.loginId && (
            <p id={`${id}-login-error`} className="text-sm font-semibold text-danger">
              {issues.loginId}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className={labelClasses}>
            {s.crmRole}
          </label>
          <select id={`${id}-role`} value={crmRole} onChange={(event) => setCrmRole(event.target.value as CrmRole)} className={fieldClasses}>
            {CRM_ROLES.map((role) => (
              <option key={role} value={role}>
                {t.roles[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <CentreCheckboxes idPrefix={`${id}-centres`} centres={centres} value={centreSlugs} onChange={setCentreSlugs} legend={s.centres} hint={s.centresHint} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
          <ActionFeedback status="" error={action.error} />
          <Button type="submit" variant="dark" disabled={action.pending}>
            {action.pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <UserPlus aria-hidden="true" className="size-4" />}
            {action.pending ? s.creating : s.create}
          </Button>
        </div>
      </form>
      <CrmDialog open={temp !== null} titleId="crm-staff-temp-title" onClose={() => setTemp(null)}>
        {temp && <TempPasswordPanel temp={temp} t={t} onDone={() => setTemp(null)} />}
      </CrmDialog>
    </section>
  );
}

function TempPasswordPanel({ temp, t, onDone }: { temp: TempPassword; t: StaffMessages; onDone: () => void }) {
  const s = t.staff;
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const codeRef = useRef<HTMLElement>(null);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(temp.password);
      setCopy("copied");
    } catch {
      setCopy("failed");
      const element = codeRef.current;
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div className="p-5 md:p-6">
      <h2 id="crm-staff-temp-title" className="text-lg font-extrabold text-navy">
        {format(s.tempTitle, { name: temp.name })}
      </h2>
      <div className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{format(s.tempWarning, { name: temp.name })}</p>
      </div>
      <dl className="mt-4 grid gap-3">
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{s.tempLoginId}</dt>
          <dd lang="en" className="font-mono text-ink">
            {temp.loginId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#354b66]">{s.tempPassword}</dt>
          <dd className="mt-1">
            <code
              ref={codeRef}
              lang="en"
              translate="no"
              className="block select-all break-all rounded-control border border-line bg-[#f4f7fb] px-3 py-2 font-mono text-lg font-bold tracking-wide text-navy"
            >
              {temp.password}
            </code>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">{s.tempNext}</p>
      <p role="status" className="mt-2 min-h-5 text-sm font-semibold">
        {copy === "copied" ? <span className="text-success">{s.copied}</span> : copy === "failed" ? <span className="text-danger">{s.copyFailed}</span> : ""}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={copyPassword}>
          <Copy aria-hidden="true" className="size-4" />
          {s.copy}
        </Button>
        <Button variant="dark" onClick={onDone}>
          {s.done}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lead routing (docs/lead-routing-plan.md §13.6, A9; LR-ROUTING): in areas mode the rules only
 * cover leads with no area, or areas with no executives — say so above the rules. The mode is
 * read from GET /api/crm/settings/routing; nothing is shown until it is known (or if it fails).
 */
function AreasModeNotice() {
  const locale = useLocale();
  const [areasMode, setAreasMode] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void sendCrm<SettingEnvelope<RoutingSettings>>(leadOpsRequests.getRoutingSettings()).then((result) => {
      if (!cancelled && result.ok) setAreasMode(result.data.value.mode === "areas");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!areasMode) return null;
  return (
    <Notice variant="info" role="note" className="mt-3">
      {(locale === "hi" ? hiAreas : enAreas).rulesNotice}
    </Notice>
  );
}

function RulesEditor({
  rules,
  staff,
  canEdit,
  centres,
  programs,
  t,
}: {
  rules: AssignmentRule[];
  staff: CrmStaffMember[];
  canEdit: boolean;
  centres: Option[];
  programs: Option[];
  t: StaffMessages;
}) {
  const id = useId();
  const s = t.staff;
  const [drafts, setDrafts] = useState<RuleDraft[]>(() =>
    rules.map((rule) => ({ key: rule.id, centreSlug: rule.centreSlug, programInterest: rule.programInterest, memberIds: rule.memberIds, active: rule.active })),
  );
  const [issue, setIssue] = useState<string | null>(null);
  const action = useCrmAction(t, PAGE_PATH);
  const members = staff.filter((member) => member.active && !member.disabled);
  const staffName = (userId: string) => staff.find((member) => member.userId === userId)?.displayName ?? userId;
  const centreName = (slug: string | null) => (slug ? centres.find((option) => option.value === slug)?.label ?? slug : s.ruleAnyCentre);
  const programName = (value: string | null) => (value ? programs.find((option) => option.value === value)?.label ?? value : s.ruleAnyProgram);

  function update(key: string, patch: Partial<RuleDraft>) {
    setDrafts((current) => current.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateRules(drafts);
    if (found) {
      setIssue(found === "rulesLimit" ? format(s.rulesLimit, { max: MAX_RULES }) : s[found]);
      return;
    }
    setIssue(null);
    await action.run(crmRequests.saveRules(drafts), s.rulesSaved);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {s.rulesTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{s.rulesIntro}</p>
      <AreasModeNotice />
      {!canEdit && (
        <p className="mt-2 text-sm font-semibold text-[#5c4a12]">
          <Badge variant="neutral" className="mr-2 normal-case tracking-normal">
            {t.common.readOnly}
          </Badge>
          {s.rulesReadOnly}
        </p>
      )}

      {!canEdit ? (
        rules.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{s.rulesEmpty}</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {rules.map((rule, index) => (
              <li key={rule.id} className="rounded-control border border-line p-3 text-sm">
                <p className="font-bold text-navy">
                  {format(s.ruleLabel, { number: index + 1 })} · {centreName(rule.centreSlug)} · {programName(rule.programInterest)}
                  {!rule.active && (
                    <Badge variant="neutral" className="ml-2 normal-case tracking-normal">
                      {s.inactive}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-muted">
                  {s.ruleCounsellors}: {rule.memberIds.length ? rule.memberIds.map(staffName).join(", ") : s.ruleNoCounsellors}
                </p>
              </li>
            ))}
          </ol>
        )
      ) : (
        <form onSubmit={save} noValidate className="mt-4" aria-busy={action.pending || undefined}>
          {drafts.length === 0 && <p className="mb-3 text-sm text-muted">{s.rulesEmpty}</p>}
          <ol className="space-y-3">
            {drafts.map((rule, index) => {
              const prefix = `${id}-${rule.key}`;
              const label = format(s.ruleLabel, { number: index + 1 });
              return (
                <li key={rule.key}>
                  <fieldset className="rounded-control border border-line p-3">
                    <legend className="px-1 text-sm font-extrabold text-navy">{label}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`${prefix}-centre`} className={labelClasses}>
                          {s.ruleCentre}
                        </label>
                        <select
                          id={`${prefix}-centre`}
                          value={rule.centreSlug ?? ""}
                          onChange={(event) => update(rule.key, { centreSlug: event.target.value || null })}
                          className={fieldClasses}
                        >
                          <option value="">{s.ruleAnyCentre}</option>
                          {centres.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`${prefix}-program`} className={labelClasses}>
                          {s.ruleProgram}
                        </label>
                        <select
                          id={`${prefix}-program`}
                          value={rule.programInterest ?? ""}
                          onChange={(event) => update(rule.key, { programInterest: event.target.value || null })}
                          className={fieldClasses}
                        >
                          <option value="">{s.ruleAnyProgram}</option>
                          {programs.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <fieldset className="mt-3">
                      <legend className={labelClasses}>{s.ruleCounsellors}</legend>
                      {members.length === 0 ? (
                        <p className="mt-1 text-sm text-muted">{s.ruleNoCounsellors}</p>
                      ) : (
                        <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          {members.map((member) => (
                            <label key={member.userId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={rule.memberIds.includes(member.userId)}
                                onChange={(event) =>
                                  update(rule.key, {
                                    memberIds: event.target.checked
                                      ? [...rule.memberIds, member.userId]
                                      : rule.memberIds.filter((userId) => userId !== member.userId),
                                  })
                                }
                                className="size-4 accent-[#1768d4]"
                              />
                              {member.displayName}
                              <span className="text-xs text-muted">({t.roles[member.crmRole]})</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-navy">
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={(event) => update(rule.key, { active: event.target.checked })}
                          className="size-4 accent-[#1768d4]"
                        />
                        {s.ruleActive}
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDrafts((current) => current.filter((item) => item.key !== rule.key))}
                        aria-label={format(s.removeRuleLabel, { number: index + 1 })}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        {s.removeRule}
                      </Button>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {issue && (
            <p role="alert" className="mt-3 text-sm font-semibold text-danger">
              {issue}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              disabled={drafts.length >= MAX_RULES}
              onClick={() => setDrafts((current) => [...current, { key: newKey(), centreSlug: null, programInterest: null, memberIds: [], active: true }])}
            >
              <Plus aria-hidden="true" className="size-4" />
              {s.addRule}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="size-4" />}
              {s.saveRules}
            </Button>
          </div>
          <ActionFeedback status={action.status} error={action.error} className="mt-2" />
        </form>
      )}
    </section>
  );
}
