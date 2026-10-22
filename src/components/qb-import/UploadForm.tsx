"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { ImportJobView } from "@/lib/qb/import/types";
import type { QbExam, QbImportKind } from "@/lib/qb/types";

import { fieldClasses, labelClasses, primaryButton } from "./ImportBlocks";
import { type ImportSummaryView, uploadForm, uploadImport } from "./import-api";
import {
  acceptFor,
  EMPTY_UPLOAD,
  type ImportMessages,
  isAiImportKind,
  keyTargetsFor,
  metaFromDraft,
  reasonMessage,
  sourceKindsFor,
  type UploadDraft,
  uploadKinds,
  uploadProblems,
  UPLOAD_EXAMS,
  visibleFields,
} from "./import-view";

/** Fields in screen order: a failed submit moves focus to the first one with a problem. */
const FIELD_ORDER = ["file", "exam", "year", "date", "shift", "paper", "booklet", "pairsWith", "keyStage", "licenceAck"] as const;

/**
 * The upload form: kind, file, details (only those the kind needs), the rights confirmation, and
 * for AI kinds the reading mode. Problems are shown next to their field before anything is sent;
 * the server checks everything again (taxonomy gate, duplicates, size, file type).
 */
export function UploadForm({
  t,
  locale,
  summary,
  canAi,
  papers,
}: {
  t: ImportMessages;
  locale: Locale;
  summary: ImportSummaryView;
  canAi: boolean;
  /** Paper imports staff can pick for "pairs with" / "key for". */
  papers: readonly ImportJobView[];
}) {
  const router = useRouter();
  const ids = useId();
  const [draft, setDraft] = useState<UploadDraft>({ ...EMPTY_UPLOAD, kind: canAi ? "pdf_paper" : "csv_bank", sourceKind: canAi ? "official" : "aspire" });
  const [file, setFile] = useState<File | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [state, setState] = useState<{ pending: boolean; error: string | null; status: string }>({ pending: false, error: null, status: "" });

  const kinds = uploadKinds(canAi);
  const fields = visibleFields(draft);
  const problems = useMemo(() => uploadProblems(draft, summary.maxFileBytes), [draft, summary.maxFileBytes]);
  // Hindi pairing is for official papers only (the server refuses others).
  const englishPapers = papers.filter(
    (paper) => paper.kind === "pdf_paper" && paper.meta.language !== "hi" && paper.status !== "cancelled" && paper.meta.sourceKind === "official",
  );
  // An official key only for official papers, an Aspire key only for Aspire files.
  const keyTargets = keyTargetsFor(papers, draft.sourceKind);
  const sourceKinds = sourceKindsFor(draft.kind, canAi);

  const update = (patch: Partial<UploadDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const changeKind = (kind: QbImportKind) => {
    const sources = sourceKindsFor(kind, canAi);
    // The file input is remounted for the new kind (its key below), so the chosen file goes too.
    update({ kind, sourceKind: sources.includes(draft.sourceKind) ? draft.sourceKind : sources[0], language: "en", pairsWith: "", keyFor: [], keyStage: "", mode: "", fileSize: null });
    setFile(null);
  };

  const problemText = (name: string): string | null => {
    if (!showProblems || !problems[name]) return null;
    if (problems[name] === "too_large") return t.errors.reasons.file_too_large;
    if (name === "licenceAck") return t.errors.reasons.licence_required;
    return t.form.required;
  };
  const fieldId = (name: string) => `${ids}-${name}`;
  const errorId = (name: string) => `${ids}-${name}-error`;
  const hintId = (name: string) => `${ids}-${name}-hint`;
  /** `aria-invalid` and `aria-describedby` (the problem, then the field's hint when it has one). */
  const described = (name: string, hint = false): AriaProblem => {
    const problemShown = problemText(name) !== null;
    const describedBy = [problemShown ? errorId(name) : null, hint ? hintId(name) : null].filter(Boolean).join(" ");
    return { ...(problemShown ? { "aria-invalid": true } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) };
  };
  const problem = (name: string) => {
    const text = problemText(name);
    return text ? (
      <p id={errorId(name)} className="text-sm font-semibold text-[#a61b1b]">
        {text}
      </p>
    ) : null;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowProblems(true);
    if (!file || Object.keys(problems).length > 0) {
      // Announce the failure (role="alert" below) and move focus to the first field that needs attention.
      setState({ pending: false, error: t.errors.validation, status: "" });
      const first = FIELD_ORDER.find((name) => problems[name] || (name === "file" && !file));
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setState({ pending: true, error: null, status: t.form.uploading });
    const result = await uploadImport(
      uploadForm({ file, fileName: file.name, kind: draft.kind, meta: metaFromDraft(draft), licenceAck: draft.licenceAck, licenceNote: draft.licenceNote, mode: draft.mode }),
    );
    if (result.ok) {
      setState({ pending: false, error: null, status: t.form.uploaded });
      router.push(localePath(`/admin/questions/import/${result.data.id}`, locale));
      return;
    }
    let error = t.errors.generic;
    if (result.error === "network") error = t.errors.network;
    else if (result.status === 401) error = t.errors.signIn;
    else if (result.status === 403) error = t.errors.forbidden;
    else if (result.status === 429) error = t.errors.rateLimited;
    else if (result.reason) error = reasonMessage(t, result.reason, (status) => t.status[status as keyof ImportMessages["status"]] ?? status);
    else if (result.status === 422) error = t.errors.validation;
    setState({ pending: false, error, status: "" });
  }

  const examLabel = (exam: QbExam) =>
    summary.confirmedExams.includes(exam) ? t.form.exams[exam] : format(t.form.examUnconfirmed, { exam: t.form.exams[exam] });
  const maxMb = Math.floor(summary.maxFileBytes / (1024 * 1024));

  return (
    <form onSubmit={submit} noValidate className="grid gap-4" aria-describedby={`${ids}-status`}>
      <div className="grid gap-1.5">
        <label htmlFor={fieldId("kind")} className={labelClasses}>
          {t.form.kind}
        </label>
        <select id={fieldId("kind")} className={fieldClasses} value={draft.kind} onChange={(event) => changeKind(event.target.value as QbImportKind)}>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {t.form.kinds[kind]}
              {isAiImportKind(kind) ? ` · ${t.form.aiKind}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={fieldId("file")} className={labelClasses}>
          {t.form.file}
        </label>
        <input
          key={draft.kind}
          id={fieldId("file")}
          type="file"
          accept={acceptFor(draft.kind)}
          className={fieldClasses}
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            setFile(chosen);
            update({ fileSize: chosen ? chosen.size : null });
          }}
          {...described("file", true)}
        />
        <p id={hintId("file")} className="text-xs text-muted">
          {format(t.form.fileHint, { mb: maxMb })}
        </p>
        {problem("file")}
      </div>

      <fieldset className="grid gap-3 rounded-control border border-line p-3">
        <legend className="px-1 text-sm font-bold text-navy">{t.job.meta}</legend>
        {sourceKinds.length > 1 && (
          <div className="grid gap-1.5">
            <label htmlFor={fieldId("source")} className={labelClasses}>
              {t.form.sourceKind}
            </label>
            <select
              id={fieldId("source")}
              className={fieldClasses}
              value={draft.sourceKind}
              onChange={(event) => {
                const sourceKind = event.target.value as "official" | "aspire";
                // Key targets, pairing and key stage depend on the source; Hindi pairing is official-only.
                update({ sourceKind, keyFor: [], pairsWith: "", keyStage: "", language: languagesFor(draft.kind, sourceKind).includes(draft.language) ? draft.language : "en" });
              }}
            >
              {sourceKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t.form.sourceKinds[kind]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={fieldId("exam")} className={labelClasses}>
              {t.form.exam}
            </label>
            <select id={fieldId("exam")} className={fieldClasses} value={draft.exam} onChange={(event) => update({ exam: event.target.value as QbExam | "" })} {...described("exam")}>
              <option value="">{isAiImportKind(draft.kind) || draft.sourceKind === "official" ? t.form.choose : t.form.noExam}</option>
              {UPLOAD_EXAMS.map((exam) => (
                <option key={exam} value={exam}>
                  {examLabel(exam)}
                </option>
              ))}
            </select>
            {problem("exam")}
          </div>
          {fields.year && (
            <TextInput id={fieldId("year")} label={t.form.year} value={draft.year} inputMode="numeric" onChange={(year) => update({ year })} problem={problem("year")} aria={described("year")} />
          )}
          {fields.date && (
            <TextInput id={fieldId("date")} label={t.form.date} type="date" value={draft.date} onChange={(date) => update({ date })} problem={problem("date")} aria={described("date")} />
          )}
          {fields.session && <TextInput id={fieldId("session")} label={t.form.session} hint={t.form.sessionHint} value={draft.session} onChange={(session) => update({ session })} />}
          {fields.shift && (
            <TextInput id={fieldId("shift")} label={t.form.shift} hint={t.form.shiftHint} value={draft.shift} onChange={(shift) => update({ shift })} problem={problem("shift")} aria={described("shift", true)} />
          )}
          {fields.paper && (
            <TextInput id={fieldId("paper")} label={t.form.paper} hint={t.form.paperHint} value={draft.paper} onChange={(paper) => update({ paper })} problem={problem("paper")} aria={described("paper", true)} />
          )}
          {fields.booklet && (
            <TextInput id={fieldId("booklet")} label={t.form.booklet} value={draft.booklet} onChange={(booklet) => update({ booklet })} problem={problem("booklet")} aria={described("booklet")} />
          )}
          {fields.language && (
            <div className="grid gap-1.5">
              <label htmlFor={fieldId("language")} className={labelClasses}>
                {t.form.language}
              </label>
              <select id={fieldId("language")} className={fieldClasses} value={draft.language} onChange={(event) => update({ language: event.target.value as UploadDraft["language"], pairsWith: "" })}>
                {languagesFor(draft.kind, draft.sourceKind).map((language) => (
                  <option key={language} value={language}>
                    {t.form.languages[language]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {fields.keyStage && (
            <div className="grid gap-1.5">
              <label htmlFor={fieldId("keyStage")} className={labelClasses}>
                {t.form.keyStage}
              </label>
              <select id={fieldId("keyStage")} className={fieldClasses} value={draft.keyStage} onChange={(event) => update({ keyStage: event.target.value as UploadDraft["keyStage"] })} {...described("keyStage")}>
                <option value="">{t.form.choose}</option>
                <option value="provisional">{t.form.keyStages.provisional}</option>
                <option value="final">{t.form.keyStages.final}</option>
              </select>
              {problem("keyStage")}
            </div>
          )}
          {fields.aspireRef && <TextInput id={fieldId("aspireRef")} label={t.form.aspireRef} value={draft.aspireRef} onChange={(aspireRef) => update({ aspireRef })} />}
        </div>
        {fields.pairsWith && (
          <div className="grid gap-1.5">
            <label htmlFor={fieldId("pairsWith")} className={labelClasses}>
              {t.form.pairsWith}
            </label>
            <select id={fieldId("pairsWith")} className={fieldClasses} value={draft.pairsWith} onChange={(event) => update({ pairsWith: event.target.value })} {...described("pairsWith")}>
              <option value="">{t.form.choose}</option>
              {englishPapers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.fileName}
                </option>
              ))}
            </select>
            {problem("pairsWith")}
          </div>
        )}
        {fields.keyFor && (
          <fieldset className="grid gap-1.5" aria-describedby={hintId("keyFor")}>
            <legend className={labelClasses}>{t.form.keyFor}</legend>
            <p id={hintId("keyFor")} className="text-xs text-muted">
              {t.form.keyForHint}
            </p>
            {keyTargets.slice(0, 20).map((paper) => (
              <label key={paper.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={draft.keyFor.includes(paper.id)}
                  onChange={(event) => update({ keyFor: event.target.checked ? [...draft.keyFor, paper.id].slice(0, 10) : draft.keyFor.filter((id) => id !== paper.id) })}
                />
                <span className="break-all">{paper.fileName}</span>
              </label>
            ))}
          </fieldset>
        )}
      </fieldset>

      {fields.mode && (
        <fieldset className="grid gap-1.5">
          <legend className={labelClasses}>{t.form.mode}</legend>
          {(["batch", "sync"] as const).map((mode) => (
            <label key={mode} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name={`${ids}-mode`} className="size-4" checked={draft.mode === mode} onChange={() => update({ mode })} />
              {t.form.modes[mode]}
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            id={fieldId("licenceAck")}
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={draft.licenceAck}
            onChange={(event) => update({ licenceAck: event.target.checked })}
            {...described("licenceAck")}
          />
          <span>{t.form.licence}</span>
        </label>
        {problem("licenceAck")}
      </div>
      <TextInput id={fieldId("licenceNote")} label={t.form.licenceNote} hint={t.form.licenceNoteHint} value={draft.licenceNote} onChange={(licenceNote) => update({ licenceNote: licenceNote.slice(0, 500) })} />

      {state.error && (
        <Notice variant="error" role="alert">
          {state.error}
        </Notice>
      )}
      <p id={`${ids}-status`} role="status" className="text-sm text-muted">
        {state.status}
      </p>
      <div>
        <button type="submit" className={primaryButton} disabled={state.pending}>
          {state.pending ? t.form.uploading : t.form.submit}
        </button>
      </div>
    </form>
  );
}

type AriaProblem = { "aria-invalid"?: boolean; "aria-describedby"?: string };

/** A Hindi-only paper is paired with its English import as official Hindi: official papers only. */
function languagesFor(kind: QbImportKind, sourceKind: "official" | "aspire"): readonly UploadDraft["language"][] {
  return kind === "pdf_paper" && sourceKind === "official" ? ["en", "hi", "bilingual"] : ["en", "bilingual"];
}

function TextInput({
  id,
  label,
  hint,
  value,
  onChange,
  type = "text",
  inputMode,
  problem,
  aria,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  inputMode?: "numeric";
  problem?: ReactNode;
  aria?: AriaProblem;
}) {
  // The hint is always part of the field's description (the caller's `aria` may name it as well).
  const hintId = `${id}-hint`;
  const describedBy = [...new Set([...(aria?.["aria-describedby"]?.split(" ") ?? []), ...(hint ? [hintId] : [])])].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        className={fieldClasses}
        value={value}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={aria?.["aria-invalid"]}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {problem}
    </div>
  );
}
