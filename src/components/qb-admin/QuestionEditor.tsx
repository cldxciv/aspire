"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type ClipboardEvent } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbDifficulty, QbExam, QbFigureRef, QbFormat, QbQuestionType, QbSource, QbSubject, QbViewer } from "@/lib/qb/types";
import { qbFailureMessage, qbRequests, uploadFigure, type QbMessages } from "./api";
import {
  CheckboxField,
  dangerButton,
  fieldClasses,
  labelClasses,
  primaryButton,
  QbFeedback,
  SelectField,
  smallButton,
  TextArea,
  TextField,
  useQbAction,
  useQbData,
} from "./client-kit";
import { QB_ADMIN_DIFFICULTIES, QB_ADMIN_EXAMS, QB_ADMIN_FORMATS, QB_ADMIN_SUBJECTS, QB_ADMIN_TYPES, type QbCapabilityMap } from "./constants";
import { qbFigureAdminUrl, type QbChapterView, type QbFigureView, type QbQuestionDetail } from "./contract";
import {
  addOption,
  changeType,
  emptyForm,
  figurePosition,
  formFromQuestion,
  isDirty,
  MAX_OPTIONS,
  MIN_OPTIONS,
  numericalAnswer,
  removeOption,
  toCreateInput,
  toggleMultiple,
  toPatch,
  type EditorForm,
  type ExamRow,
} from "./editor-state";
import { imageFromClipboard, prepareFigure } from "./figure-upload";
import { optionLetter } from "./format";
import { QbPanel, SourceKindBadge, StatusBadge } from "./QbBlocks";
import { QuestionAside } from "./QuestionAside";
import { RichPreview } from "./RichPreview";

type Lang = "en" | "hi";

/**
 * The question editor (§B7): chapter (which sets the subject) and type, English and Hindi tabs
 * with a live preview, the answer by type, figures (pasted or chosen, shrunk to 700 px WebP),
 * per-exam difficulty / syllabus / cross-exam / expected time, and the source panel (official
 * fields read-only for authors). The workflow, flags, duplicates, corrections and history sit in
 * the side column. Saving sends only what changed, guarded by version + timestamp (409 `stale`).
 */
export function QuestionEditor({ questionId, t, locale, can, viewer }: { questionId: string | null; t: QbMessages; locale: Locale; can: QbCapabilityMap; viewer: QbViewer }) {
  const router = useRouter();
  const pagePath = questionId ? `/admin/questions/${questionId}` : "/admin/questions/new";
  const loaded = useQbData<QbQuestionDetail>(questionId ? qbRequests.getQuestion(questionId) : null, t, pagePath);
  const chapters = useQbData<QbChapterView[]>(qbRequests.chapters(), t, pagePath);
  const save = useQbAction(t, pagePath);
  const detail = loaded.data;

  // The form follows the loaded version; local edits are kept until the next server version.
  const key = detail ? `${detail.question.id}:${detail.question.version}:${detail.question.updatedAt}` : "new";
  const base = useMemo(() => (detail ? formFromQuestion(detail.question) : emptyForm()), [detail]);
  const [edit, setEdit] = useState<{ key: string; form: EditorForm } | null>(null);
  const form = edit && edit.key === key ? edit.form : base;
  // Functional update: an edit that lands late (a figure upload) never drops keystrokes made meanwhile.
  const update = (change: (current: EditorForm) => EditorForm) =>
    setEdit((previous) => ({ key, form: change(previous && previous.key === key ? previous.form : base) }));
  const dirty = isDirty(form, base);

  if (questionId && !detail) {
    return (
      <p role={loaded.error ? "alert" : "status"} className={loaded.error ? "font-semibold text-danger" : "text-muted"}>
        {loaded.error ? `${t.editor.loadFailed} ${loaded.error}` : t.common.loading}
      </p>
    );
  }

  const status = detail?.question.status ?? "draft";
  const readOnly = !can.edit_draft || status === "retired" || status === "rejected";
  const labelsLocked = status === "approved" && !can.set_labels;
  const officialLocked = !can.approve && base.source.kind === "official" && detail !== null;

  async function onSave() {
    if (!detail) {
      const created = await save.run<QbQuestionDetail>(qbRequests.createQuestion(toCreateInput(form)), t.editor.created);
      if (created) router.push(localePath(`/admin/questions/${encodeURIComponent(created.question.id)}`, locale));
      return;
    }
    const patch = toPatch(form, base, { version: detail.question.version, updatedAt: detail.question.updatedAt });
    if (!patch) return;
    const updated = await save.run<QbQuestionDetail>(qbRequests.updateQuestion(detail.question.id, patch), t.common.saved);
    if (updated) {
      setEdit(null);
      loaded.setData(updated);
    }
  }

  const e = t.editor;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        {detail && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={detail.question.status === "approved" && detail.question.suspended ? "suspended" : detail.question.status} t={t} />
            <SourceKindBadge kind={detail.question.source.kind} t={t} />
            <span className="text-muted">
              {detail.question.approvedVersion
                ? format(e.versionNote, { version: detail.question.version, approved: detail.question.approvedVersion })
                : format(e.versionNoteNone, { version: detail.question.version })}
            </span>
          </div>
        )}
        <ClassificationPanel form={form} update={update} chapters={chapters.data ?? []} t={t} locale={locale} disabled={readOnly} />
        <ContentPanel form={form} update={update} t={t} disabled={readOnly} />
        <AnswerPanel key={`answer-${key}-${form.content.type}`} form={form} update={update} t={t} disabled={readOnly} />
        <FiguresPanel form={form} update={update} t={t} disabled={readOnly} />
        <ExamsPanel form={form} update={update} t={t} disabled={readOnly || labelsLocked} canSetLabels={can.set_labels} />
        <SourcePanel form={form} update={update} detail={detail} t={t} disabled={readOnly} officialLocked={officialLocked} />

        {!readOnly && (
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-card border border-line bg-white/95 p-3 shadow-card backdrop-blur">
            <button type="button" className={primaryButton} disabled={save.pending || (detail !== null && !dirty)} onClick={() => void onSave()}>
              {save.pending ? t.common.saving : detail ? e.saveChanges : e.saveDraft}
            </button>
            {dirty && <span className="text-sm font-semibold text-[#7a5600]">{e.unsaved}</span>}
            <QbFeedback state={save} detailsLabel={t.common.details} />
          </div>
        )}
      </div>
      {detail && (
        <QuestionAside
          detail={detail}
          dirty={dirty}
          t={t}
          locale={locale}
          can={can}
          viewer={viewer}
          pagePath={pagePath}
          onChange={(next) => {
            setEdit(null);
            loaded.setData(next);
          }}
        />
      )}
    </div>
  );
}

type PanelProps = { form: EditorForm; update: (change: (current: EditorForm) => EditorForm) => void; t: QbMessages; disabled: boolean };

function ClassificationPanel({ form, update, chapters, t, locale, disabled }: PanelProps & { chapters: QbChapterView[]; locale: Locale }) {
  const id = useId();
  const e = t.editor;
  const active = chapters.filter((chapter) => chapter.active || chapter.id === form.chapterId);
  const label = (chapter: QbChapterView) => (locale === "hi" && chapter.label.hi ? chapter.label.hi : chapter.label.en);
  const chosen = chapters.find((chapter) => chapter.id === form.chapterId) ?? null;
  return (
    <QbPanel id={`${id}-title`} title={e.sections.classification}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor={`${id}-chapter`} className={labelClasses}>
            {e.chapter}
          </label>
          <select
            id={`${id}-chapter`}
            value={form.chapterId ?? ""}
            disabled={disabled}
            aria-describedby={`${id}-chapter-hint`}
            onChange={(event) => update((current) => ({ ...current, chapterId: event.target.value || null }))}
            className={fieldClasses}
          >
            <option value="">{e.chapterNone}</option>
            {QB_ADMIN_SUBJECTS.map((subject) => {
              const list = active.filter((chapter) => chapter.subject === subject);
              if (list.length === 0) return null;
              return (
                <optgroup key={subject} label={t.subjects[subject]}>
                  {list.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {label(chapter)} ({t.levels[chapter.level]})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p id={`${id}-chapter-hint`} className="text-xs text-muted">
            {chosen ? `${t.subjects[chosen.subject]} · ${e.chapterHint}` : e.chapterHint}
          </p>
        </div>
        {form.chapterId === null && (
          <SelectField<QbSubject | "">
            id={`${id}-subject`}
            label={e.subjectOnly}
            value={form.subject ?? ""}
            disabled={disabled}
            options={[{ value: "", label: t.common.none }, ...QB_ADMIN_SUBJECTS.map((subject) => ({ value: subject, label: t.subjects[subject] }))]}
            onChange={(value) => update((current) => ({ ...current, subject: value || null }))}
          />
        )}
        <SelectField<QbQuestionType>
          id={`${id}-type`}
          label={e.type}
          value={form.content.type}
          disabled={disabled}
          options={QB_ADMIN_TYPES.map((type) => ({ value: type, label: t.types[type] }))}
          onChange={(type) => update((current) => ({ ...current, content: changeType(current.content, type) }))}
        />
        <SelectField<QbFormat>
          id={`${id}-format`}
          label={e.format}
          value={form.content.format}
          disabled={disabled || form.content.passageId !== null}
          options={QB_ADMIN_FORMATS.filter((value) => value !== "passage" || form.content.passageId !== null).map((value) => ({ value, label: t.formats[value] }))}
          onChange={(value) => update((current) => ({ ...current, content: { ...current.content, format: value } }))}
        />
        {form.content.passageId && (
          <p className="text-sm text-muted md:col-span-2">{format(e.passage, { id: form.content.passageId, order: form.content.passageOrder ?? "?" })}</p>
        )}
      </div>
    </QbPanel>
  );
}

function LanguageTabs({ lang, setLang, t }: { lang: Lang; setLang: (lang: Lang) => void; t: QbMessages }) {
  return (
    <div role="group" aria-label={t.editor.languageTabs} className="mb-3 inline-flex rounded-control border border-line p-0.5">
      {(["en", "hi"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={lang === value}
          onClick={() => setLang(value)}
          className={lang === value ? "min-h-11 rounded-control bg-navy px-4 text-sm font-bold text-white" : "min-h-11 rounded-control px-4 text-sm font-bold text-navy"}
        >
          {value === "en" ? t.common.english : t.common.hindi}
        </button>
      ))}
    </div>
  );
}

function ContentPanel({ form, update, t, disabled }: PanelProps) {
  const id = useId();
  const [lang, setLang] = useState<Lang>("en");
  const e = t.editor;
  const { content } = form;
  const setText = (field: "stem" | "solution", value: string) =>
    update((current) => ({ ...current, content: { ...current.content, [field]: { ...current.content[field], [lang]: value } } }));
  const setOption = (index: number, value: string) =>
    update((current) => ({
      ...current,
      content: { ...current.content, options: current.content.options.map((option, i) => (i === index ? { ...option, [lang]: value } : option)) },
    }));
  const htmlLang = lang === "hi" ? "hi" : "en";
  return (
    <QbPanel id={`${id}-title`} title={e.sections.content} description={e.lead}>
      <LanguageTabs lang={lang} setLang={setLang} t={t} />
      {lang === "hi" && <p className="mb-3 text-sm text-muted">{e.hindiNote}</p>}
      <div className="space-y-4">
        <div className="grid gap-2 xl:grid-cols-2">
          <TextArea id={`${id}-stem-${lang}`} label={e.stem} value={content.stem[lang]} onChange={(value) => setText("stem", value)} rows={6} disabled={disabled} lang={htmlLang} />
          <div>
            <p className={labelClasses}>{e.preview}</p>
            <RichPreview text={content.stem[lang]} lang={htmlLang} emptyLabel={e.previewEmpty} figures={content.figures} slot="stem" className="mt-1" />
          </div>
        </div>
        {content.type !== "numerical" && (
          <fieldset className="space-y-3">
            <legend className={labelClasses}>{e.options}</legend>
            {content.options.map((option, index) => (
              <div key={index} className="grid gap-2 rounded-control border border-line p-2 xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <TextArea
                    id={`${id}-option-${index}-${lang}`}
                    label={format(e.option, { letter: optionLetter(index) })}
                    value={option[lang]}
                    onChange={(value) => setOption(index, value)}
                    rows={2}
                    disabled={disabled}
                    lang={htmlLang}
                  />
                  {content.options.length > MIN_OPTIONS && !disabled && (
                    <button type="button" className={`${dangerButton} self-start`} onClick={() => update((current) => ({ ...current, content: removeOption(current.content, index) }))}>
                      {format(e.removeOption, { letter: optionLetter(index) })}
                    </button>
                  )}
                </div>
                <RichPreview text={option[lang]} lang={htmlLang} emptyLabel={e.previewEmpty} figures={content.figures} slot={`option:${index}`} />
              </div>
            ))}
            {content.options.length < MAX_OPTIONS && !disabled && (
              <button type="button" className={smallButton} onClick={() => update((current) => ({ ...current, content: addOption(current.content) }))}>
                {e.addOption}
              </button>
            )}
          </fieldset>
        )}
        <div className="grid gap-2 xl:grid-cols-2">
          <TextArea id={`${id}-solution-${lang}`} label={e.solution} value={content.solution[lang]} onChange={(value) => setText("solution", value)} rows={5} disabled={disabled} lang={htmlLang} />
          <div>
            <p className={labelClasses}>{e.preview}</p>
            <RichPreview text={content.solution[lang]} lang={htmlLang} emptyLabel={e.previewEmpty} figures={content.figures} slot="solution" className="mt-1" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            id={`${id}-solution-source`}
            label={e.solutionSource}
            value={content.solutionSource}
            disabled={disabled}
            options={(Object.keys(e.solutionSources) as (keyof typeof e.solutionSources)[]).map((value) => ({ value, label: e.solutionSources[value] }))}
            onChange={(value) => update((current) => ({ ...current, content: { ...current.content, solutionSource: value } }))}
          />
          <SelectField
            id={`${id}-hi-source`}
            label={e.hiSource}
            value={content.hiSource}
            disabled={disabled}
            options={(Object.keys(e.hiSources) as (keyof typeof e.hiSources)[]).map((value) => ({ value, label: e.hiSources[value] }))}
            onChange={(value) => update((current) => ({ ...current, content: { ...current.content, hiSource: value } }))}
          />
        </div>
      </div>
    </QbPanel>
  );
}

function AnswerPanel({ form, update, t, disabled }: PanelProps) {
  const id = useId();
  const e = t.editor;
  const { content } = form;
  const answer = content.answer;
  const setAnswer = (next: typeof answer) => update((current) => ({ ...current, content: { ...current.content, answer: next } }));
  const initial = answer?.kind === "numerical" ? answer : null;
  const [num, setNum] = useState({
    value: initial ? String(initial.value) : "",
    integer: initial?.integer ?? true,
    range: initial ? initial.low !== undefined || initial.high !== undefined : false,
    low: initial?.low !== undefined ? String(initial.low) : "",
    high: initial?.high !== undefined ? String(initial.high) : "",
    unitEn: initial?.unit?.en ?? "",
    unitHi: initial?.unit?.hi ?? "",
  });
  const setNumField = (change: Partial<typeof num>) => {
    const next = { ...num, ...change };
    setNum(next);
    setAnswer(numericalAnswer(next));
  };

  return (
    <QbPanel id={`${id}-title`} title={e.sections.answer}>
      {content.type === "single" && (
        <fieldset>
          <legend className={labelClasses}>{e.answerSingle}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {content.options.map((_, index) => (
              <label key={index} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3">
                <input
                  type="radio"
                  name={`${id}-single`}
                  checked={answer?.kind === "single" && answer.index === index}
                  disabled={disabled}
                  onChange={() => setAnswer({ kind: "single", index })}
                  className="size-4 accent-navy"
                />
                {optionLetter(index)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {content.type === "multiple" && (
        <fieldset>
          <legend className={labelClasses}>{e.answerMultiple}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {content.options.map((_, index) => (
              <label key={index} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3">
                <input
                  type="checkbox"
                  checked={answer?.kind === "multiple" && answer.indices.includes(index)}
                  disabled={disabled}
                  onChange={(event) => setAnswer(toggleMultiple(answer, index, event.target.checked))}
                  className="size-4 accent-navy"
                />
                {optionLetter(index)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {content.type === "numerical" && (
        <div className="grid gap-3 md:grid-cols-2">
          <TextField id={`${id}-value`} label={e.answerValue} value={num.value} inputMode="decimal" disabled={disabled} onChange={(value) => setNumField({ value })} />
          <CheckboxField id={`${id}-integer`} label={e.answerInteger} checked={num.integer} disabled={disabled} onChange={(integer) => setNumField({ integer, range: integer ? false : num.range })} />
          {!num.integer && (
            <CheckboxField id={`${id}-range`} label={e.answerRange} checked={num.range} disabled={disabled} onChange={(range) => setNumField({ range })} className="md:col-span-2" />
          )}
          {!num.integer && num.range && (
            <>
              <TextField id={`${id}-low`} label={e.answerLow} value={num.low} inputMode="decimal" disabled={disabled} onChange={(low) => setNumField({ low })} />
              <TextField id={`${id}-high`} label={e.answerHigh} value={num.high} inputMode="decimal" disabled={disabled} onChange={(high) => setNumField({ high })} />
            </>
          )}
          <TextField id={`${id}-unit-en`} label={e.answerUnit} value={num.unitEn} maxLength={40} disabled={disabled} onChange={(unitEn) => setNumField({ unitEn })} />
          <TextField id={`${id}-unit-hi`} label={e.answerUnitHi} value={num.unitHi} maxLength={40} disabled={disabled} lang="hi" onChange={(unitHi) => setNumField({ unitHi })} />
        </div>
      )}
      {answer === null && <p className="mt-2 text-sm font-semibold text-[#7a5600]">{e.answerNone}</p>}
    </QbPanel>
  );
}

function FiguresPanel({ form, update, t, disabled }: PanelProps) {
  const id = useId();
  const e = t.editor;
  const [lineDrawing, setLineDrawing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const figures = form.content.figures;

  async function add(file: Blob) {
    setUploading(true);
    setError(null);
    try {
      const prepared = await prepareFigure(file, { lineDrawing });
      const result = await uploadFigure<QbFigureView>(prepared.blob, "figure.webp");
      if (!result.ok) {
        setError(qbFailureMessage(result, t));
        return;
      }
      const figure: QbFigureRef = { id: result.data.id, slot: "stem", alt: { en: "", hi: "" }, width: result.data.width, height: result.data.height };
      update((current) => ({ ...current, content: { ...current.content, figures: [...current.content.figures, figure] } }));
    } catch {
      setError(t.errors.unsupported);
    } finally {
      setUploading(false);
    }
  }

  const setFigure = (index: number, change: Partial<QbFigureRef>) =>
    update((current) => ({
      ...current,
      content: { ...current.content, figures: current.content.figures.map((figure, i) => (i === index ? { ...figure, ...change } : figure)) },
    }));
  const slots: { value: QbFigureRef["slot"]; label: string }[] = [
    { value: "stem", label: e.figureSlots.stem },
    { value: "solution", label: e.figureSlots.solution },
    ...form.content.options.map((_, index) => ({ value: `option:${index}` as const, label: format(e.figureSlots.option, { letter: optionLetter(index) }) })),
  ];

  return (
    <QbPanel id={`${id}-title`} title={e.sections.figures} description={e.figuresLead}>
      <ul className="space-y-3">
        {figures.map((figure, index) => (
          <li key={`${figure.id}-${index}`} className="grid gap-3 rounded-control border border-line p-3 md:grid-cols-[10rem_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- staff-only figure from the admin API (drafts included); next/image does not apply */}
            <img src={qbFigureAdminUrl(figure.id)} alt={figure.alt.en} width={figure.width} height={figure.height} className="h-auto max-h-40 w-full rounded border border-line bg-white object-contain" />
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-sm text-muted sm:col-span-2">
                {format(e.figureMarker, { n: figurePosition(figures, index) })}
              </p>
              <SelectField id={`${id}-slot-${index}`} label={e.figureSlot} value={figure.slot} disabled={disabled} options={slots} onChange={(slot) => setFigure(index, { slot })} />
              <TextField id={`${id}-alt-${index}`} label={e.figureAlt} value={figure.alt.en} maxLength={300} disabled={disabled} onChange={(en) => setFigure(index, { alt: { ...figure.alt, en } })} />
              <TextField id={`${id}-alt-hi-${index}`} label={e.figureAltHi} value={figure.alt.hi} maxLength={300} disabled={disabled} lang="hi" onChange={(hi) => setFigure(index, { alt: { ...figure.alt, hi } })} />
              {!disabled && (
                <button
                  type="button"
                  className={`${dangerButton} self-end`}
                  onClick={() => update((current) => ({ ...current, content: { ...current.content, figures: current.content.figures.filter((_, i) => i !== index) } }))}
                >
                  {t.common.remove}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="mt-3 space-y-2">
          <CheckboxField id={`${id}-line`} label={e.figureLineDrawing} checked={lineDrawing} onChange={setLineDrawing} />
          <div
            tabIndex={0}
            role="button"
            aria-label={e.figurePaste}
            onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
              const file = imageFromClipboard(event.clipboardData);
              if (file) {
                event.preventDefault();
                void add(file);
              }
            }}
            className="flex min-h-20 items-center justify-center rounded-control border-2 border-dashed border-[#b9cbe0] bg-[#f8fbff] p-3 text-sm text-muted focus:border-blue focus:outline-none"
          >
            {uploading ? e.figureUploading : e.figurePaste}
          </div>
          <label htmlFor={`${id}-file`} className={labelClasses}>
            {e.figureAdd}
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void add(file);
            }}
            className="block text-sm"
          />
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </QbPanel>
  );
}

/** Cross-exam use and syllabus status are reviewer labels (the API drops an author's values). */
function ExamsPanel({ form, update, t, disabled, canSetLabels }: PanelProps & { canSetLabels: boolean }) {
  const id = useId();
  const e = t.editor;
  const setRow = (exam: ExamRow["exam"], change: Partial<ExamRow>) =>
    update((current) => ({ ...current, exams: current.exams.map((row) => (row.exam === exam ? { ...row, ...change } : row)) }));
  return (
    <QbPanel id={`${id}-title`} title={e.sections.exams} description={e.examsLead}>
      <div className="space-y-3">
        {form.exams.map((row) => (
          <fieldset key={row.exam} className="rounded-control border border-line p-3">
            <legend className="px-1 font-bold text-navy">{t.exams[row.exam]}</legend>
            <CheckboxField id={`${id}-${row.exam}-eligible`} label={format(e.examEligible, { exam: t.exams[row.exam] })} checked={row.eligible} disabled={disabled} onChange={(eligible) => setRow(row.exam, { eligible })} />
            {row.eligible && (
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div>
                  <SelectField<QbDifficulty | "">
                    id={`${id}-${row.exam}-difficulty`}
                    label={e.examDifficulty}
                    value={row.difficulty ?? ""}
                    disabled={disabled}
                    options={[{ value: "", label: t.common.none }, ...QB_ADMIN_DIFFICULTIES.map((value) => ({ value, label: t.difficulties[value] }))]}
                    onChange={(value) => setRow(row.exam, { difficulty: value || null })}
                  />
                  {row.aiDifficulty && (
                    <p className="mt-1 text-xs text-muted" lang="en">
                      {format(e.examAiSuggestion, { difficulty: t.difficulties[row.aiDifficulty], reason: row.aiReason ?? "" })}
                    </p>
                  )}
                </div>
                <SelectField
                  id={`${id}-${row.exam}-syllabus`}
                  label={e.examSyllabus}
                  value={row.syllabus ?? "unchecked"}
                  disabled={disabled || !canSetLabels}
                  hint={canSetLabels ? undefined : e.examSyllabusReviewer}
                  options={(["current", "removed", "unchecked"] as const).map((value) => ({ value, label: t.syllabus[value] }))}
                  onChange={(syllabus) => setRow(row.exam, { syllabus })}
                />
                <TextField
                  id={`${id}-${row.exam}-time`}
                  label={e.examExpectedTime}
                  type="number"
                  inputMode="numeric"
                  value={row.expectedTimeSec === null || row.expectedTimeSec === undefined ? "" : String(row.expectedTimeSec)}
                  disabled={disabled}
                  onChange={(value) => setRow(row.exam, { expectedTimeSec: value === "" ? null : Math.max(0, Math.round(Number(value))) })}
                />
                <CheckboxField
                  id={`${id}-${row.exam}-cross`}
                  label={e.examCrossExam}
                  checked={row.crossExam ?? false}
                  disabled={disabled || !canSetLabels}
                  onChange={(crossExam) => setRow(row.exam, { crossExam })}
                  className="md:col-span-3"
                />
              </div>
            )}
          </fieldset>
        ))}
      </div>
    </QbPanel>
  );
}

const OFFICIAL_FIELDS = ["exam", "year", "date", "session", "shift", "paper", "booklet", "qno", "questionRef", "page", "evidenceUrl", "evidencePage"] as const;
const NUMBER_FIELDS = new Set(["year", "page", "evidencePage"]);

function SourcePanel({ form, update, detail, t, disabled, officialLocked }: PanelProps & { detail: QbQuestionDetail | null; officialLocked: boolean }) {
  const id = useId();
  const e = t.editor;
  const source = form.source;
  const setSource = (change: Partial<QbSource>) => update((current) => ({ ...current, source: { ...current.source, ...change } }));
  const sample = source.kind === "sample";
  const fidelity = detail?.question.fidelity ?? null;
  return (
    <QbPanel id={`${id}-title`} title={e.sections.source} description={e.sourceLead}>
      <div className="grid gap-3 md:grid-cols-2">
        {sample ? (
          <p className="md:col-span-2">
            <SourceKindBadge kind="sample" t={t} /> <span className="text-sm text-muted">{t.sourceKinds.sample}</span>
          </p>
        ) : (
          <SelectField<"official" | "aspire">
            id={`${id}-kind`}
            label={e.sourceKind}
            value={source.kind === "official" ? "official" : "aspire"}
            disabled={disabled || officialLocked}
            options={[
              { value: "official", label: t.sourceKinds.official },
              { value: "aspire", label: t.sourceKinds.aspire },
            ]}
            onChange={(kind) => setSource({ kind })}
            className="md:col-span-2"
          />
        )}
        {officialLocked && <p className="text-sm text-muted md:col-span-2">{e.sourceReadOnly}</p>}
        {source.kind === "official" &&
          OFFICIAL_FIELDS.map((field) =>
            field === "exam" ? (
              // No silent default: an official question without an exam is an incomplete source.
              <SelectField<QbExam | "">
                key={field}
                id={`${id}-${field}`}
                label={e.sourceFields.exam}
                value={source.exam ?? ""}
                disabled={disabled || officialLocked}
                options={[{ value: "", label: e.sourceExamChoose }, ...QB_ADMIN_EXAMS.map((value) => ({ value, label: t.exams[value] }))]}
                onChange={(exam) => setSource({ exam: exam || undefined })}
                invalid={!source.exam}
                hint={source.exam ? undefined : e.sourceExamMissing}
              />
            ) : (
              <TextField
                key={field}
                id={`${id}-${field}`}
                label={e.sourceFields[field]}
                type={field === "date" ? "date" : NUMBER_FIELDS.has(field) ? "number" : field === "evidenceUrl" ? "url" : "text"}
                value={source[field] === undefined ? "" : String(source[field])}
                disabled={disabled || officialLocked}
                maxLength={field === "evidenceUrl" ? 500 : 40}
                hint={field === "evidenceUrl" ? e.evidenceUrlHint : undefined}
                onChange={(value) =>
                  setSource({ [field]: NUMBER_FIELDS.has(field) ? (value === "" ? undefined : Math.round(Number(value))) : value || undefined } as Partial<QbSource>)
                }
              />
            ),
          )}
        {!sample && (
          <>
            <TextField id={`${id}-aspire-ref`} label={e.sourceFields.aspireRef} value={source.aspireRef ?? ""} maxLength={120} disabled={disabled} onChange={(aspireRef) => setSource({ aspireRef: aspireRef || undefined })} />
            <TextField
              id={`${id}-claimed`}
              label={e.sourceFields.claimedSource}
              value={source.claimedSource ?? ""}
              maxLength={200}
              disabled={disabled}
              onChange={(claimedSource) => setSource({ claimedSource: claimedSource || undefined })}
            />
          </>
        )}
      </div>
      {detail && (
        <div className="mt-4 space-y-1 text-sm">
          <p lang="en">{format(e.publicLabel, { label: detail.publicSourceLabel })}</p>
          <p className="text-muted" lang="en">
            {format(e.staffLabel, { label: detail.sourceLabel })}
          </p>
          {detail.question.alsoIn.length > 0 && (
            <p className="text-muted" lang="en">
              {format(e.alsoIn, { list: detail.question.alsoIn.map((entry) => [entry.exam, entry.year, entry.shift ?? entry.booklet ?? entry.paper].filter(Boolean).join(" ")).join("; ") })}
            </p>
          )}
          {fidelity && (
            <p>
              <span className="font-semibold">{e.fidelity}:</span> {e.fidelities[fidelity]}
            </p>
          )}
          {detail.question.keyStage && (
            <p>
              <span className="font-semibold">{e.keyStage}:</span> {t.keyStages[detail.question.keyStage]}
            </p>
          )}
        </div>
      )}
      {(fidelity === "adapted" || form.adaptedNote) && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextArea
            id={`${id}-adapted-en`}
            label={`${e.adaptedNote} (${t.common.english})`}
            value={form.adaptedNote?.en ?? ""}
            rows={2}
            maxLength={1000}
            disabled={disabled}
            onChange={(en) => update((current) => ({ ...current, adaptedNote: { en, hi: current.adaptedNote?.hi ?? "" } }))}
          />
          <TextArea
            id={`${id}-adapted-hi`}
            label={`${e.adaptedNote} (${t.common.hindi})`}
            value={form.adaptedNote?.hi ?? ""}
            rows={2}
            maxLength={1000}
            lang="hi"
            disabled={disabled}
            onChange={(hi) => update((current) => ({ ...current, adaptedNote: { en: current.adaptedNote?.en ?? "", hi } }))}
          />
        </div>
      )}
      {detail?.imported && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">{e.importedOriginal}</summary>
          <div className="mt-2 space-y-2">
            <RichPreview text={detail.imported.stem.en} lang="en" emptyLabel={e.previewEmpty} />
            {detail.imported.options.map((option, index) => (
              <p key={index} lang="en" className="font-mono text-xs">
                {optionLetter(index)}. {option.en}
              </p>
            ))}
          </div>
        </details>
      )}
    </QbPanel>
  );
}

