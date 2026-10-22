"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbSubject } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { CheckboxField, primaryButton, QbDialog, QbFeedback, SelectField, smallButton, useQbAction, useQbData } from "./client-kit";
import { QB_ADMIN_SUBJECTS } from "./constants";
import type { QbApprovalSelf, QbMemberInput, QbMemberView, QbSettingsView, QbTeamView } from "./contract";
import { QbPanel } from "./QbBlocks";

const PAGE = "/admin/questions/team";

type Editing = { userId: string; displayName: string; input: QbMemberInput; isNew: boolean };

/**
 * Team & settings (admins, §B6): QB memberships of staff accounts (author / reviewer, subject
 * scope, active) and the bank settings (AI import on/off under the env kill switch, self-approval).
 * Accounts themselves are created on /admin/users; CRM memberships are not touched here.
 */
export function TeamView({ t, locale }: { t: QbMessages; locale: Locale }) {
  const id = useId();
  const team = useQbData<QbTeamView>(qbRequests.members(), t, PAGE);
  const settings = useQbData<QbSettingsView>(qbRequests.settings(), t, PAGE);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [candidate, setCandidate] = useState("");
  const m = t.team;

  const subjectsLabel = (subjects: QbSubject[]) => (subjects.length === 0 ? t.common.allSubjects : subjects.map((subject) => t.subjects[subject]).join(", "));

  return (
    <div className="space-y-5">
      <QbPanel
        id={`${id}-members`}
        title={m.membersTitle}
        description={
          <>
            {m.lead}{" "}
            <Link href={localePath("/admin/users", locale)} className="font-bold text-blue hover:underline">
              {m.createAccount}
            </Link>
          </>
        }
      >
        {team.error && <p role="alert" className="text-sm text-danger">{team.error}</p>}
        {team.data && team.data.members.length === 0 && <p className="text-muted">{m.membersEmpty}</p>}
        {team.data && team.data.members.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  <th scope="col" className="px-3 py-2">{m.columns.name}</th>
                  <th scope="col" className="px-3 py-2">{m.columns.role}</th>
                  <th scope="col" className="px-3 py-2">{m.columns.subjects}</th>
                  <th scope="col" className="px-3 py-2">{m.columns.status}</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">{m.edit}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.data.members.map((member: QbMemberView) => (
                  <tr key={member.userId}>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{member.displayName}</span>
                      <span className="block font-mono text-xs text-muted">{member.loginId}</span>
                    </td>
                    <td className="px-3 py-2">{m.roles[member.qbRole]}</td>
                    <td className="px-3 py-2">{subjectsLabel(member.subjects)}</td>
                    <td className="px-3 py-2">{member.disabled ? m.disabled : member.active ? m.active : m.inactive}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => setEditing({ userId: member.userId, displayName: member.displayName, input: { qbRole: member.qbRole, subjects: member.subjects, active: member.active }, isNew: false })}
                      >
                        {m.edit}
                        <span className="sr-only"> {member.displayName}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {team.data && team.data.candidates.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <SelectField
              id={`${id}-candidate`}
              label={m.addPick}
              value={candidate}
              options={[{ value: "", label: t.common.none }, ...team.data.candidates.map((entry) => ({ value: entry.userId, label: `${entry.displayName} (${entry.loginId})` }))]}
              onChange={setCandidate}
            />
            <button
              type="button"
              className={smallButton}
              disabled={!candidate}
              onClick={() => {
                const picked = team.data?.candidates.find((entry) => entry.userId === candidate);
                if (picked) setEditing({ userId: picked.userId, displayName: picked.displayName, input: { qbRole: "author", subjects: [], active: true }, isNew: true });
              }}
            >
              {m.add}
            </button>
          </div>
        )}
      </QbPanel>

      <SettingsPanel settings={settings.data} error={settings.error} t={t} onSaved={settings.setData} />

      {editing && (
        <MemberDialog
          editing={editing}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setCandidate("");
            team.reload();
          }}
        />
      )}
    </div>
  );
}

function MemberDialog({ editing, t, onClose, onSaved }: { editing: Editing; t: QbMessages; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const action = useQbAction(t, PAGE);
  const [input, setInput] = useState<QbMemberInput>(editing.input);
  const m = t.team;
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {editing.isNew ? m.add : m.edit}
      </h2>
      <p className="mt-1 font-semibold">{editing.displayName}</p>
      <SelectField<"author" | "reviewer">
        id={`${id}-role`}
        label={m.role}
        value={input.qbRole}
        options={[
          { value: "author", label: m.roles.author },
          { value: "reviewer", label: m.roles.reviewer },
        ]}
        onChange={(qbRole) => setInput((current) => ({ ...current, qbRole }))}
        className="mt-3"
      />
      <fieldset className="mt-3">
        <legend className="text-sm font-bold text-navy">{m.subjects}</legend>
        <div className="grid grid-cols-2 gap-x-3">
          {QB_ADMIN_SUBJECTS.map((subject) => (
            <CheckboxField
              key={subject}
              id={`${id}-${subject}`}
              label={t.subjects[subject]}
              checked={input.subjects.includes(subject)}
              onChange={(on) =>
                setInput((current) => ({ ...current, subjects: on ? [...new Set([...current.subjects, subject])] : current.subjects.filter((entry) => entry !== subject) }))
              }
            />
          ))}
        </div>
      </fieldset>
      <CheckboxField id={`${id}-active`} label={m.activeField} checked={input.active} onChange={(active) => setInput((current) => ({ ...current, active }))} className="mt-2" />
      <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={smallButton} onClick={onClose}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={action.pending}
          onClick={async () => {
            const saved = await action.run<QbMemberView>(qbRequests.saveMember(editing.userId, input), m.saved);
            if (saved) onSaved();
          }}
        >
          {action.pending ? t.common.saving : t.common.save}
        </button>
      </div>
    </QbDialog>
  );
}

function SettingsPanel({ settings, error, t, onSaved }: { settings: QbSettingsView | null; error: string | null; t: QbMessages; onSaved: (settings: QbSettingsView) => void }) {
  const id = useId();
  const action = useQbAction(t, PAGE);
  const m = t.team;

  async function save(patch: { importEnabled?: boolean; approvalSelf?: QbApprovalSelf }) {
    const next = await action.run<QbSettingsView>(qbRequests.saveSettings(patch), m.settingsSaved);
    if (next) onSaved(next);
  }

  return (
    <QbPanel id={`${id}-settings`} title={m.settingsTitle}>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!settings && !error && <p className="text-sm text-muted">{t.common.loading}</p>}
      {settings && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">{m.importLead}</p>
          <CheckboxField id={`${id}-import`} label={m.importEnabled} checked={settings.importEnabled} disabled={action.pending} onChange={(importEnabled) => void save({ importEnabled })} />
          {settings.importEnvOff && <p className="font-semibold text-[#7a5600]">{m.importEnvOff}</p>}
          {!settings.apiKeyConfigured && <p className="font-semibold text-[#7a5600]">{m.apiKeyMissing}</p>}
          <SelectField<QbApprovalSelf>
            id={`${id}-self`}
            label={m.approvalSelf}
            value={settings.approvalSelf}
            disabled={action.pending}
            options={(["allowed_recorded", "second_reviewer"] as const).map((value) => ({ value, label: m.approvalSelfOptions[value] }))}
            onChange={(approvalSelf) => void save({ approvalSelf })}
            className="max-w-md"
          />
          <p className="text-muted">
            {format(m.bankRevision, { revision: settings.bankRevision })} · {format(m.searchMode, { mode: t.list.searchMode[settings.searchMode] })} ·{" "}
            {format(m.figures, { used: settings.figures.usedMb.toFixed(1), quota: settings.figures.quotaMb })}
          </p>
          <QbFeedback state={action} detailsLabel={t.common.details} />
        </div>
      )}
    </QbPanel>
  );
}
