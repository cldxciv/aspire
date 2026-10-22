"use client";

import { UserPlus, Users } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/auth/identifiers";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import type { CrmRole } from "@/lib/crm/types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { staffFieldIssue, validateStaffForm } from "../StaffManager";
import { areaName, LOCALE_FREE_PATH, type AreaPersonView, type AreasMessages, type CentreOption } from "./model";

type Choice = { centreSlug: string | null; takesLeads: boolean };

/** The area's current members as editable choices. */
export function initialChoices(area: Pick<CrmArea, "members">): Record<string, Choice> {
  return Object.fromEntries(area.members.map((member) => [member.userId, { centreSlug: member.centreSlug, takesLeads: member.crmRole === "manager" && member.takesLeads }]));
}

/**
 * "Choose people" for one area (super admins): tick who works in the district, tie executives to
 * a centre, let area heads also take calls; saving REPLACES the area's people (PUT …/members).
 * "Create a login" makes a CRM staff account straight into this area (POST /api/admin/users with
 * `crm.areaIds`); its temporary password is shown once.
 */
export function PeoplePicker({ area, people, centres, t }: { area: CrmArea; people: AreaPersonView[]; centres: CentreOption[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const p = t.a.people;
  const name = areaName(area, locale);
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>(() => initialChoices(area));
  const [filter, setFilter] = useState("");
  const usable = people.filter((person) => !person.disabled);
  const needle = filter.trim().toLowerCase();
  const shown = needle ? usable.filter((person) => person.displayName.toLowerCase().includes(needle)) : usable;

  function openDialog() {
    setChoices(initialChoices(area));
    setFilter("");
    action.reset();
    setOpen(true);
  }

  const toggle = (person: AreaPersonView, on: boolean) =>
    setChoices((current) => {
      const next = { ...current };
      if (on) next[person.userId] = { centreSlug: null, takesLeads: false };
      else delete next[person.userId];
      return next;
    });
  const patch = (userId: string, change: Partial<Choice>) => setChoices((current) => ({ ...current, [userId]: { ...current[userId], ...change } }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const members = Object.entries(choices).map(([userId, choice]) => ({ userId, centreSlug: choice.centreSlug, takesLeads: choice.takesLeads }));
    const saved = await action.run(leadOpsRequests.setAreaMembers(area.id, members), p.saved);
    if (saved) setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} aria-label={format(p.title, { area: name })}>
        <Users aria-hidden="true" className="size-3.5" />
        {t.a.area.managePeople}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} className="basis-full" />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)} wide>
        <div className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(p.title, { area: name })}
          </h2>
          <p className="text-sm text-muted">{p.intro}</p>
          <form onSubmit={save} className="space-y-3">
            {usable.length > 6 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-filter`} className={labelClasses}>
                  {p.filter}
                </label>
                <input id={`${id}-filter`} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} className={fieldClasses} />
              </div>
            )}
            {usable.length === 0 ? (
              <p className="text-sm text-muted">{p.noStaff}</p>
            ) : (
              <ul className="divide-y divide-line rounded-control border border-line">
                {shown.map((person) => {
                  const choice = choices[person.userId];
                  const inArea = choice !== undefined;
                  const label = `${person.displayName} · ${person.crmRole === "manager" ? t.a.area.head : t.a.area.executive}`;
                  return (
                    <li key={person.userId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="checkbox" checked={inArea} onChange={(event) => toggle(person, event.target.checked)} className="size-4" />
                        <span>
                          <span className="font-semibold text-ink">{person.displayName}</span>{" "}
                          <span className="text-sm text-muted">· {person.crmRole === "manager" ? t.a.area.head : t.a.area.executive}</span>
                          {!person.active && <span className="text-sm text-muted"> · {t.a.area.notActive}</span>}
                        </span>
                      </label>
                      {inArea && person.crmRole === "counsellor" && (
                        <div className="flex items-center gap-2">
                          <label htmlFor={`${id}-${person.userId}-centre`} className="text-sm font-bold text-[#354b66]">
                            {p.worksAt}
                          </label>
                          <select
                            id={`${id}-${person.userId}-centre`}
                            value={choice.centreSlug ?? ""}
                            onChange={(event) => patch(person.userId, { centreSlug: event.target.value || null })}
                            aria-label={`${p.worksAt}: ${label}`}
                            className={`${fieldClasses} sm:w-48`}
                          >
                            <option value="">{p.anyCentre}</option>
                            {centres.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {inArea && person.crmRole === "manager" && (
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input type="checkbox" checked={choice.takesLeads} onChange={(event) => patch(person.userId, { takesLeads: event.target.checked })} className="size-4" aria-label={`${p.takesCalls}: ${person.displayName}`} />
                          {p.takesCalls}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <ActionFeedback status="" error={action.error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="dark" disabled={action.pending}>
                {action.pending ? t.common.saving : p.save}
              </Button>
            </div>
          </form>
          <CreateLogin area={area} t={t} onCreated={(userId) => setChoices((current) => ({ ...current, [userId]: { centreSlug: null, takesLeads: false } }))} />
        </div>
      </CrmDialog>
    </>
  );
}

/** Inline "Create a login" inside the people dialog: the new staff account joins this area at once. */
function CreateLogin({ area, t, onCreated }: { area: CrmArea; t: AreasMessages; onCreated: (userId: string) => void }) {
  const id = useId();
  const locale = useLocale();
  const c = t.a.people.create;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [crmRole, setCrmRole] = useState<CrmRole>("counsellor");
  const [issues, setIssues] = useState<{ displayName?: string; loginId?: string }>({});
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateStaffForm({ displayName, loginId });
    const next = { displayName: found.displayName && c.issues[found.displayName], loginId: found.loginId && c.issues[found.loginId] };
    setIssues(next);
    if (next.displayName) return nameRef.current?.focus();
    if (next.loginId) return loginRef.current?.focus();
    setCreated(null);
    setCopied(false);
    const data = await action.run<{ user: { id: string; displayName: string }; temporaryPassword: string }>(
      leadOpsRequests.createStaffLogin({ displayName, loginId, crmRole, centreSlugs: [], areaIds: [area.id] }),
      undefined,
      (failure) => {
        const field = staffFieldIssue(failure);
        if (!field) return null;
        setIssues({ loginId: c.issues[field] });
        loginRef.current?.focus();
        return t.errors.validation;
      },
    );
    if (!data) return;
    onCreated(data.user.id);
    setCreated({ name: data.user.displayName, password: data.temporaryPassword });
    setDisplayName("");
    setLoginId("");
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-control border border-line bg-[#fbfcfe] p-4">
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-base font-extrabold text-navy">
        <UserPlus aria-hidden="true" className="size-4" />
        {c.title}
      </h3>
      <p className="mt-1 text-sm text-muted">{format(c.intro, { area: areaName(area, locale) })}</p>
      <form onSubmit={submit} noValidate className="mt-3 grid gap-3 sm:grid-cols-3" aria-busy={action.pending || undefined}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={labelClasses}>
            {c.name}
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
            {c.loginId}
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
            aria-describedby={`${id}-login-hint${issues.loginId ? ` ${id}-login-error` : ""}`}
            onChange={(event) => setLoginId(event.target.value)}
            className={fieldClasses}
          />
          <p id={`${id}-login-hint`} className="text-xs text-muted">
            {c.loginIdHint}
          </p>
          {issues.loginId && (
            <p id={`${id}-login-error`} className="text-sm font-semibold text-danger">
              {issues.loginId}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className={labelClasses}>
            {c.role}
          </label>
          <select id={`${id}-role`} value={crmRole} onChange={(event) => setCrmRole(event.target.value as CrmRole)} className={fieldClasses}>
            <option value="counsellor">{t.a.area.executive}</option>
            <option value="manager">{t.a.area.head}</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
          <ActionFeedback status="" error={action.error} />
          <Button type="submit" variant="dark" disabled={action.pending}>
            {action.pending ? t.common.saving : c.submit}
          </Button>
        </div>
      </form>
      {created && (
        <div role="status" className="mt-3 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
          <p className="font-bold">{format(c.created, { name: created.name })}</p>
          <p className="mt-1">
            {c.tempPassword}{" "}
            <code lang="en" className="rounded bg-white px-1.5 py-0.5 font-mono text-ink">
              {created.password}
            </code>
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={copy}>
            {copied ? c.copied : c.copy}
          </Button>
        </div>
      )}
    </section>
  );
}
