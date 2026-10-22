"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbAnswer, QbFlag, QbViewer } from "@/lib/qb/types";
import { qbCall, qbRequests, type QbMessages } from "./api";
import { CheckboxField, dangerButton, primaryButton, QbDialog, QbFeedback, SelectField, smallButton, TextArea, TextField, useQbAction } from "./client-kit";
import { QB_REVIEWER_CLEARABLE_FLAGS, type QbCapabilityMap } from "./constants";
import { QB_CHECKLIST_KEYS, type QbChecklistKey, type QbCorrectionResult, type QbQuestionAction, type QbQuestionDetail } from "./contract";
import { blockerLabel, formatDateTime, formatShare, optionLetter, sortFlags } from "./format";
import { FlagChip, QbPanel } from "./QbBlocks";

type DialogKind = "approve" | "reject" | "suspend" | "retire" | "adapted" | "verify" | "thirdParty" | "correction" | "clearFlag";

/** Duplicate marks are decided as a pair in the duplicates queue, not cleared here. */
const DUPLICATE_FLAGS: readonly QbFlag[] = ["exact_duplicate", "near_duplicate"];
const DUPLICATES_QUEUE = "/admin/questions/review?queue=duplicates";
/** The service's minimum note length for clearing a flag. */
const CLEAR_NOTE_MIN = 3;

/**
 * The editor's side column: workflow buttons by status and capability (each re-checked by the
 * server), the server's approval blockers, flags, calibration suggestions (never automatic),
 * key corrections, duplicates, statistics and history.
 */
export function QuestionAside({
  detail,
  dirty,
  t,
  locale,
  can,
  viewer,
  pagePath,
  onChange,
}: {
  detail: QbQuestionDetail;
  dirty: boolean;
  t: QbMessages;
  locale: Locale;
  can: QbCapabilityMap;
  viewer: QbViewer;
  pagePath: string;
  onChange: (detail: QbQuestionDetail) => void;
}) {
  const id = useId();
  const action = useQbAction(t, pagePath);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [flagToClear, setFlagToClear] = useState<QbFlag | null>(null);
  const [notice, setNotice] = useState("");
  const q = detail.question;
  const w = t.workflow;
  const e = t.editor;

  async function act(body: QbQuestionAction, message: string = w.done) {
    const next = await action.run<QbQuestionDetail>(qbRequests.questionAction(q.id, body), message);
    if (next) {
      setDialog(null);
      onChange(next);
    }
  }

  async function refetch() {
    const result = await qbCall<QbQuestionDetail>(qbRequests.getQuestion(q.id));
    if (result.ok) onChange(result.data);
  }

  const busy = action.pending || dirty;
  const flags = sortFlags(q.flags);
  const suggestions = q.stats.filter((row) => row.state === "suggested" && row.calibrated);

  return (
    <aside className="min-w-0 space-y-4" aria-label={e.sections.workflow}>
      <QbPanel id={`${id}-workflow`} title={e.sections.workflow}>
        {dirty && <p className="mb-2 text-sm font-semibold text-[#7a5600]">{e.unsaved}</p>}
        {q.status === "approved" && <p className="mb-2 text-sm text-success">{format(w.approvedNote, { version: q.approvedVersion ?? q.version })}</p>}
        {q.suspended && <p className="mb-2 text-sm text-[#7a5600]">{w.suspendedNote}</p>}
        {q.status === "retired" && <p className="mb-2 text-sm text-muted">{w.retiredNote}</p>}
        {(q.status === "draft" || q.status === "in_review") && (
          <div className="mb-3 text-sm">
            {detail.approval.allowed ? (
              <p className="font-semibold text-success">{w.blockersNone}</p>
            ) : (
              <>
                <p className="font-semibold text-navy">{w.blockers}</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {detail.approval.blockers.map((blocker) => (
                    <li key={blocker}>{blockerLabel(blocker, t)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {q.status === "draft" && can.edit_draft && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "submit" })}>
              {w.submit}
            </button>
          )}
          {(q.status === "draft" || q.status === "in_review") && can.approve && (
            <>
              <button type="button" className={primaryButton} disabled={busy} onClick={() => setDialog("approve")}>
                {w.approve}
              </button>
              <button type="button" className={dangerButton} disabled={busy} onClick={() => setDialog("reject")}>
                {w.reject}
              </button>
            </>
          )}
          {q.status === "in_review" && can.edit_draft && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "return_to_draft" })}>
              {w.returnToDraft}
            </button>
          )}
          {q.status === "approved" && can.retire && (
            <>
              {q.suspended ? (
                <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "unsuspend" })}>
                  {w.unsuspend}
                </button>
              ) : (
                <button type="button" className={smallButton} disabled={busy} onClick={() => setDialog("suspend")}>
                  {w.suspend}
                </button>
              )}
              <button type="button" className={dangerButton} disabled={busy} onClick={() => setDialog("retire")}>
                {w.retire}
              </button>
            </>
          )}
          {(q.status === "rejected" || q.status === "retired") && can.retire && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "restore" })}>
              {w.restore}
            </button>
          )}
          {q.flags.includes("fidelity_unconfirmed") && can.approve && (
            <>
              <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "set_fidelity", fidelity: "transcription_fixed" })}>
                {w.markTranscription}
              </button>
              <button type="button" className={smallButton} disabled={busy} onClick={() => setDialog("adapted")}>
                {w.markAdapted}
              </button>
            </>
          )}
          {q.flags.includes("key_provisional") && can.approve && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => setDialog("verify")}>
              {w.staffVerifyKey}
            </button>
          )}
          {q.flags.includes("third_party_source") && viewer.role === "admin" && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => setDialog("thirdParty")}>
              {w.clearThirdParty}
            </button>
          )}
        </div>
        <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      </QbPanel>

      <QbPanel id={`${id}-flags`} title={e.sections.flags}>
        {flags.length === 0 ? (
          <p className="text-sm text-muted">{t.common.none}</p>
        ) : (
          <ul className="space-y-1.5">
            {flags.map((flag) => {
              const clearable = QB_REVIEWER_CLEARABLE_FLAGS.includes(flag) && can.approve;
              return (
                <li key={flag} className="flex flex-wrap items-center gap-2">
                  <FlagChip flag={flag} t={t} />
                  {clearable && (
                    <button
                      type="button"
                      className="min-h-11 text-sm font-bold text-blue hover:underline disabled:opacity-60"
                      disabled={busy}
                      onClick={() => {
                        setFlagToClear(flag);
                        setDialog("clearFlag");
                      }}
                    >
                      {w.clearFlag}
                      <span className="sr-only"> {t.flags[flag]}</span>
                    </button>
                  )}
                  {DUPLICATE_FLAGS.includes(flag) && can.merge_duplicates && (
                    <Link href={localePath(DUPLICATES_QUEUE, locale)} className="inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline">
                      {w.decideDuplicate}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </QbPanel>

      <QbPanel id={`${id}-stats`} title={e.sections.stats}>
        {q.stats.length === 0 ? (
          <p className="text-sm text-muted">{t.stats.empty}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {q.stats.map((row) => (
              <li key={row.exam}>
                {format(t.stats.row, {
                  exam: t.exams[row.exam],
                  correct: row.correct,
                  attempted: row.attempted,
                  rate: formatShare(row.pAttempted, locale),
                  omitted: row.omitted,
                })}
                {row.calibrated && <span className="mt-1 block font-semibold">{format(t.stats.calibrated, { difficulty: t.difficulties[row.calibrated] })}</span>}
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && can.set_labels && (
          <ul className="mt-3 space-y-2">
            {suggestions.map((row) => (
              <li key={row.exam} className="rounded-control border border-[#f2dfa0] bg-gold-soft p-2 text-sm">
                <p>{format(w.calibrationSuggestion, { exam: t.exams[row.exam], difficulty: row.calibrated ? t.difficulties[row.calibrated] : "—", attempted: row.attempted })}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "accept_calibration", exam: row.exam })}>
                    {w.acceptCalibration}
                  </button>
                  <button type="button" className={smallButton} disabled={busy} onClick={() => void act({ action: "dismiss_calibration", exam: row.exam })}>
                    {w.dismissCalibration}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QbPanel>

      <QbPanel
        id={`${id}-corrections`}
        title={e.sections.corrections}
        description={t.corrections.lead}
        action={
          can.key_corrections && q.approvedVersion ? (
            <button type="button" className={smallButton} disabled={busy} onClick={() => setDialog("correction")}>
              {t.corrections.add}
            </button>
          ) : undefined
        }
      >
        {notice && (
          <p role="status" className="mb-2 text-sm font-semibold text-success">
            {notice}
          </p>
        )}
        {detail.corrections.length === 0 ? (
          <p className="text-sm text-muted">{t.corrections.empty}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detail.corrections.map((correction) => (
              <li key={correction.id} lang="en">
                {format(t.corrections.item, {
                  date: formatDateTime(correction.createdAt, locale),
                  kind: t.corrections.kinds[correction.kind],
                  reason: correction.reason,
                })}
              </li>
            ))}
          </ul>
        )}
      </QbPanel>

      <QbPanel id={`${id}-duplicates`} title={e.sections.duplicates} description={t.duplicates.lead}>
        {detail.duplicates.length === 0 ? (
          <p className="text-sm text-muted">{t.common.none}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detail.duplicates.map((pair) => {
              const other = pair.a === q.id ? pair.b : pair.a;
              return (
                <li key={`${pair.a}-${pair.b}`}>
                  <Link href={localePath(`/admin/questions/${encodeURIComponent(other)}`, locale)} className="inline-flex min-h-11 items-center font-bold text-blue hover:underline">
                    {other}
                  </Link>{" "}
                  · {t.duplicates.kinds[pair.kind]} · {pair.status === "open" ? format(t.duplicates.pair, { score: formatShare(pair.score, locale) }) : t.duplicates.decisions[pair.status]}
                </li>
              );
            })}
          </ul>
        )}
      </QbPanel>

      <QbPanel id={`${id}-history`} title={e.sections.history}>
        {detail.events.length === 0 ? (
          <p className="text-sm text-muted">{t.history.empty}</p>
        ) : (
          <ol className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
            {detail.events.map((event) => (
              <li key={event.id}>
                <span className="font-mono text-xs">{event.action}</span> · {formatDateTime(event.at, locale)}
                {event.actorName ? ` · ${format(t.history.by, { name: event.actorName })}` : ""}
              </li>
            ))}
          </ol>
        )}
        {detail.versions.length > 0 && (
          <>
            <h3 className="mt-3 text-sm font-bold text-navy">{t.history.versions}</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {detail.versions.map((version) => (
                <li key={version.version}>
                  {format(t.history.version, { version: version.version })} · {formatDateTime(version.createdAt, locale)}
                  {version.approved ? ` · ${t.history.approvedVersion}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </QbPanel>

      {dialog === "approve" && <ChecklistDialog t={t} pending={action.pending} onClose={() => setDialog(null)} onConfirm={(checklist, note) => void act({ action: "approve", checklist, ...(note ? { note } : {}) })} />}
      {(dialog === "reject" || dialog === "suspend" || dialog === "retire" || dialog === "verify") && (
        <ReasonDialog
          title={{ reject: w.reject, suspend: w.suspend, retire: w.retire, verify: w.staffVerifyKey }[dialog]}
          confirmLabel={{ reject: w.rejectConfirm, suspend: w.suspendConfirm, retire: w.retireConfirm, verify: w.verifyConfirm }[dialog]}
          label={dialog === "verify" ? w.note : w.reason}
          danger={dialog !== "verify"}
          t={t}
          pending={action.pending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void act(
              dialog === "reject"
                ? { action: "reject", reason }
                : dialog === "suspend"
                  ? { action: "suspend", reason }
                  : dialog === "retire"
                    ? { action: "retire", reason }
                    : { action: "set_key_stage", keyStage: "staff_verified", note: reason },
            )
          }
        />
      )}
      {dialog === "adapted" && (
        <AdaptedDialog t={t} pending={action.pending} initial={q.adaptedNote} onClose={() => setDialog(null)} onConfirm={(note) => void act({ action: "set_fidelity", fidelity: "adapted", note })} />
      )}
      {dialog === "clearFlag" && flagToClear && (
        <ReasonDialog
          title={format(w.clearFlagTitle, { flag: t.flags[flagToClear] })}
          lead={(w.clearFlagLeads as Partial<Record<QbFlag, string>>)[flagToClear] ?? w.clearFlagLead}
          confirmLabel={w.clearFlagConfirm}
          label={w.note}
          danger={false}
          minLength={CLEAR_NOTE_MIN}
          t={t}
          pending={action.pending}
          onClose={() => setDialog(null)}
          onConfirm={(note) => void act({ action: "clear_flag", flag: flagToClear, note })}
        />
      )}
      {dialog === "thirdParty" && (
        <ThirdPartyDialog
          t={t}
          pending={action.pending}
          onClose={() => setDialog(null)}
          onConfirm={(note, officialUrl) => void act({ action: "clear_flag", flag: "third_party_source", note, officialUrl })}
        />
      )}
      {dialog === "correction" && (
        <CorrectionDialog
          detail={detail}
          t={t}
          pagePath={pagePath}
          onClose={() => setDialog(null)}
          onSaved={(rescored) => {
            setDialog(null);
            setNotice(format(t.corrections.saved, { count: rescored }));
            void refetch();
          }}
        />
      )}
    </aside>
  );
}

function DialogButtons({ t, pending, confirmLabel, disabled, danger = false, onClose, onConfirm }: { t: QbMessages; pending: boolean; confirmLabel: string; disabled?: boolean; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" className={smallButton} onClick={onClose}>
        {t.common.cancel}
      </button>
      <button type="button" className={danger ? dangerButton : primaryButton} disabled={pending || disabled} onClick={onConfirm}>
        {pending ? t.common.saving : confirmLabel}
      </button>
    </div>
  );
}

function ChecklistDialog({ t, pending, onClose, onConfirm }: { t: QbMessages; pending: boolean; onClose: () => void; onConfirm: (checklist: Record<QbChecklistKey, boolean>, note: string) => void }) {
  const id = useId();
  const [checked, setChecked] = useState<Record<QbChecklistKey, boolean>>(() => Object.fromEntries(QB_CHECKLIST_KEYS.map((key) => [key, false])) as Record<QbChecklistKey, boolean>);
  const [note, setNote] = useState("");
  const w = t.workflow;
  const all = QB_CHECKLIST_KEYS.every((key) => checked[key]);
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {w.checklistTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{w.checklistLead}</p>
      <fieldset className="mt-3 space-y-1">
        <legend className="sr-only">{w.checklistTitle}</legend>
        {QB_CHECKLIST_KEYS.map((key) => (
          <CheckboxField key={key} id={`${id}-${key}`} label={w.checklist[key]} checked={checked[key]} onChange={(value) => setChecked((current) => ({ ...current, [key]: value }))} />
        ))}
      </fieldset>
      <TextField id={`${id}-note`} label={w.note} value={note} maxLength={500} onChange={setNote} className="mt-2" />
      <DialogButtons t={t} pending={pending} confirmLabel={w.approveConfirm} disabled={!all} onClose={onClose} onConfirm={() => onConfirm(checked, note.trim())} />
    </QbDialog>
  );
}

function ReasonDialog({
  title,
  lead,
  confirmLabel,
  label,
  danger,
  minLength = 5,
  t,
  pending,
  onClose,
  onConfirm,
}: {
  title: string;
  lead?: string;
  confirmLabel: string;
  label: string;
  danger: boolean;
  /** Characters the trimmed text needs before the confirm button is enabled. */
  minLength?: number;
  t: QbMessages;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {title.replace(/…$/, "")}
      </h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      <TextField id={`${id}-reason`} label={label} value={reason} maxLength={500} onChange={setReason} className="mt-3" />
      <DialogButtons t={t} pending={pending} confirmLabel={confirmLabel} danger={danger} disabled={reason.trim().length < minLength} onClose={onClose} onConfirm={() => onConfirm(reason.trim())} />
    </QbDialog>
  );
}

function AdaptedDialog({ t, pending, initial, onClose, onConfirm }: { t: QbMessages; pending: boolean; initial: { en: string; hi: string } | null; onClose: () => void; onConfirm: (note: { en: string; hi: string }) => void }) {
  const id = useId();
  const [en, setEn] = useState(initial?.en ?? "");
  const [hi, setHi] = useState(initial?.hi ?? "");
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {t.editor.fidelities.adapted}
      </h2>
      <TextArea id={`${id}-en`} label={`${t.editor.adaptedNote} (${t.common.english})`} value={en} rows={2} maxLength={1000} onChange={setEn} className="mt-3" />
      <TextArea id={`${id}-hi`} label={`${t.editor.adaptedNote} (${t.common.hindi})`} value={hi} rows={2} maxLength={1000} lang="hi" onChange={setHi} className="mt-3" />
      <DialogButtons t={t} pending={pending} confirmLabel={t.workflow.adaptedConfirm} disabled={en.trim().length === 0} onClose={onClose} onConfirm={() => onConfirm({ en: en.trim(), hi: hi.trim() })} />
    </QbDialog>
  );
}

function ThirdPartyDialog({ t, pending, onClose, onConfirm }: { t: QbMessages; pending: boolean; onClose: () => void; onConfirm: (note: string, officialUrl: string) => void }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const valid = /^https:\/\/\S+$/.test(url.trim()) && note.trim().length >= 3;
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {t.workflow.clearThirdParty.replace(/…$/, "")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.workflow.clearThirdPartyLead}</p>
      <TextField id={`${id}-url`} label={t.workflow.officialUrl} type="url" value={url} maxLength={500} onChange={setUrl} className="mt-3" />
      <TextField id={`${id}-note`} label={t.workflow.note} value={note} maxLength={500} onChange={setNote} className="mt-3" />
      <DialogButtons t={t} pending={pending} confirmLabel={t.common.confirm} disabled={!valid} onClose={onClose} onConfirm={() => onConfirm(note.trim(), url.trim())} />
    </QbDialog>
  );
}

function CorrectionDialog({ detail, t, pagePath, onClose, onSaved }: { detail: QbQuestionDetail; t: QbMessages; pagePath: string; onClose: () => void; onSaved: (rescoredAttempts: number) => void }) {
  const id = useId();
  const action = useQbAction(t, pagePath);
  const q = detail.question;
  const c = t.corrections;
  const [kind, setKind] = useState<"answer" | "dropped">("answer");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [single, setSingle] = useState(0);
  const [multiple, setMultiple] = useState<number[]>([]);
  const [value, setValue] = useState("");
  const version = q.approvedVersion ?? q.version;

  function answer(): QbAnswer | undefined {
    if (kind === "dropped") return undefined;
    if (q.content.type === "single") return { kind: "single", index: single };
    if (q.content.type === "multiple") return multiple.length ? { kind: "multiple", indices: [...multiple].sort((a, b) => a - b) } : undefined;
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n)) return undefined;
    const previous = q.content.answer?.kind === "numerical" ? q.content.answer : null;
    return { kind: "numerical", value: n, integer: previous?.integer ?? Number.isInteger(n) };
  }

  async function save() {
    const corrected = answer();
    const result = await action.run<QbCorrectionResult>(
      qbRequests.createCorrection({
        questionId: q.id,
        appliesToVersion: version,
        kind,
        ...(corrected ? { answer: corrected } : {}),
        reason: reason.trim(),
        ...(evidence.trim() ? { evidenceUrl: evidence.trim() } : {}),
      }),
    );
    if (result) onSaved(result.rescoredAttempts);
  }

  const ready = reason.trim().length >= 5 && (kind === "dropped" || answer() !== undefined) && (evidence.trim() === "" || /^https:\/\/\S+$/.test(evidence.trim()));
  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {c.add.replace(/…$/, "")}
      </h2>
      <p className="mt-1 text-sm text-muted">{format(c.appliesTo, { version })}</p>
      <SelectField<"answer" | "dropped">
        id={`${id}-kind`}
        label={c.kind}
        value={kind}
        options={[
          { value: "answer", label: c.kinds.answer },
          { value: "dropped", label: c.kinds.dropped },
        ]}
        onChange={setKind}
        className="mt-3"
      />
      {kind === "answer" && q.content.type === "single" && (
        <SelectField
          id={`${id}-single`}
          label={c.newAnswer}
          value={String(single)}
          options={q.content.options.map((_, index) => ({ value: String(index), label: optionLetter(index) }))}
          onChange={(next) => setSingle(Number(next))}
          className="mt-3"
        />
      )}
      {kind === "answer" && q.content.type === "multiple" && (
        <fieldset className="mt-3">
          <legend className="text-sm font-bold text-navy">{c.newAnswer}</legend>
          <div className="flex flex-wrap gap-3">
            {q.content.options.map((_, index) => (
              <CheckboxField
                key={index}
                id={`${id}-m-${index}`}
                label={optionLetter(index)}
                checked={multiple.includes(index)}
                onChange={(on) => setMultiple((current) => (on ? [...current, index] : current.filter((value) => value !== index)))}
              />
            ))}
          </div>
        </fieldset>
      )}
      {kind === "answer" && q.content.type === "numerical" && <TextField id={`${id}-value`} label={c.newAnswer} value={value} inputMode="decimal" onChange={setValue} className="mt-3" />}
      <TextField id={`${id}-reason`} label={c.reason} value={reason} maxLength={500} onChange={setReason} className="mt-3" />
      <TextField id={`${id}-evidence`} label={c.evidence} type="url" value={evidence} maxLength={500} onChange={setEvidence} className="mt-3" />
      <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      <DialogButtons t={t} pending={action.pending} confirmLabel={t.common.save} disabled={!ready} onClose={onClose} onConfirm={() => void save()} />
    </QbDialog>
  );
}
