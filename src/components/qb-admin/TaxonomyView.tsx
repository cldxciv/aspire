"use client";

import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbExam, QbLevel, QbSubject } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { CheckboxField, primaryButton, QbDialog, QbFeedback, SelectField, smallButton, TextArea, TextField, useQbAction, useQbData } from "./client-kit";
import { QB_ADMIN_EXAMS, QB_ADMIN_LEVELS, QB_ADMIN_SUBJECTS, type QbCapabilityMap } from "./constants";
import type { QbChapterInput, QbChapterView, QbTaxonomyStatus, QbUnitsView, QbUnitView } from "./contract";
import { formatDate, lines } from "./format";
import { QbPanel } from "./QbBlocks";

const PAGE = "/admin/questions/taxonomy";

/** Syllabus revision years as reported (§B1.2); an admin confirms or changes them here. */
const REPORTED_REVISION_YEAR: Readonly<Record<QbExam, number>> = { JEE_MAIN: 2024, NEET: 2024, JEE_ADV: 2023, BOH: 2026 };

/**
 * Taxonomy (§B3): an exam's official units (names only, each with its official source), the gaps
 * the seed could not fill, Aspire's chapters with their per-exam status and unit mapping, and the
 * admin confirmation that unlocks imports and publishing for the exam.
 */
export function TaxonomyView({ t, locale, can, initialExam }: { t: QbMessages; locale: Locale; can: QbCapabilityMap; initialExam: QbExam }) {
  const id = useId();
  const [exam, setExam] = useState<QbExam>(initialExam);
  const [subject, setSubject] = useState<QbSubject | "">("");
  const units = useQbData<QbUnitsView>(qbRequests.units(exam), t, PAGE);
  const chapters = useQbData<QbChapterView[]>(qbRequests.chapters({ all: true }), t, PAGE);
  const [editing, setEditing] = useState<QbChapterView | "new" | null>(null);
  const x = t.taxonomy;

  function chooseExam(next: QbExam) {
    setExam(next);
    window.history.replaceState(null, "", localePath(`${PAGE}?exam=${next}`, locale));
  }

  const status = units.data?.status ?? null;
  const shownChapters = (chapters.data ?? []).filter((chapter) => !subject || chapter.subject === subject);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField<QbExam> id={`${id}-exam`} label={x.exam} value={exam} options={QB_ADMIN_EXAMS.map((value) => ({ value, label: t.exams[value] }))} onChange={chooseExam} />
      </div>

      {status && (
        <QbPanel id={`${id}-status`} title={t.exams[exam]}>
          <p className={status.confirmed ? "font-semibold text-success" : "font-semibold text-[#7a5600]"}>
            {status.confirmed && status.confirmedAt
              ? format(x.statusConfirmed, { date: formatDate(status.confirmedAt, locale), year: status.syllabusRevisionYear ?? "—" })
              : x.statusUnconfirmed}
          </p>
          {can.confirm_taxonomy && <ConfirmForm key={`${exam}-${status.confirmedAt ?? 0}`} exam={exam} status={status} t={t} onDone={units.reload} />}
        </QbPanel>
      )}

      <QbPanel id={`${id}-units`} title={x.unitsTitle} action={can.confirm_taxonomy ? <UnitForm key={exam} exam={exam} t={t} onDone={units.reload} /> : undefined}>
        {units.error && <p role="alert" className="text-sm text-danger">{units.error}</p>}
        {units.loading && !units.data && <p className="text-sm text-muted">{t.common.loading}</p>}
        {units.data && units.data.gaps.length > 0 && (
          <div role="note" className="mb-3 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-sm text-[#5c4a12]">
            <p className="font-semibold">{x.gapsTitle}</p>
            <ul className="mt-1 list-disc pl-5" lang="en">
              {units.data.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
        {units.data && units.data.units.length === 0 && <p className="text-muted">{x.unitsEmpty}</p>}
        {units.data && units.data.units.length > 0 && <UnitsTable units={units.data.units} t={t} locale={locale} />}
      </QbPanel>

      <QbPanel
        id={`${id}-chapters`}
        title={x.chaptersTitle}
        description={x.chaptersLead}
        action={
          can.manage_chapters ? (
            <button type="button" className={smallButton} onClick={() => setEditing("new")}>
              {x.chapterAdd}
            </button>
          ) : undefined
        }
      >
        <SelectField<QbSubject | "">
          id={`${id}-subject`}
          label={t.list.subject}
          value={subject}
          options={[{ value: "", label: t.common.all }, ...QB_ADMIN_SUBJECTS.map((value) => ({ value, label: t.subjects[value] }))]}
          onChange={setSubject}
          className="mb-3 max-w-xs"
        />
        {chapters.error && <p role="alert" className="text-sm text-danger">{chapters.error}</p>}
        {chapters.data && shownChapters.length === 0 && <p className="text-muted">{x.chaptersEmpty}</p>}
        {shownChapters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  <th scope="col" className="px-3 py-2">{x.chapterFields.label}</th>
                  <th scope="col" className="px-3 py-2">{x.chapterFields.subject}</th>
                  <th scope="col" className="px-3 py-2">{x.chapterFields.level}</th>
                  <th scope="col" className="px-3 py-2">{x.chapterFields.status}</th>
                  <th scope="col" className="px-3 py-2">{x.questionsColumn}</th>
                  {can.manage_chapters && <th scope="col" className="px-3 py-2"><span className="sr-only">{t.common.edit}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shownChapters.map((chapter) => {
                  const examStatus = chapter.examStatus[exam];
                  return (
                    <tr key={chapter.id} className={chapter.active ? "align-top" : "align-top text-muted"}>
                      <td className="px-3 py-2">
                        <span className="font-semibold">{chapter.label.en}</span>
                        {chapter.label.hi && (
                          <span className="block" lang="hi">
                            {chapter.label.hi}
                          </span>
                        )}
                        <span className="block font-mono text-xs text-muted">{chapter.id}</span>
                        {chapter.verifyNote && <span className="mt-1 inline-block rounded-md bg-gold-soft px-1.5 text-xs text-[#6b4c00]">{x.verify}</span>}
                      </td>
                      <td className="px-3 py-2">{t.subjects[chapter.subject]}</td>
                      <td className="px-3 py-2">{t.levels[chapter.level]}</td>
                      <td className="px-3 py-2">
                        {examStatus ? x.chapterStatuses[examStatus] : x.chapterStatuses.unset}
                        {(chapter.units[exam] ?? []).length > 0 && <span className="block font-mono text-xs text-muted">{(chapter.units[exam] ?? []).join(", ")}</span>}
                      </td>
                      <td className="px-3 py-2">{chapter.questionCount}</td>
                      {can.manage_chapters && (
                        <td className="px-3 py-2">
                          <button type="button" className={smallButton} onClick={() => setEditing(chapter)}>
                            {t.common.edit}
                            <span className="sr-only"> {chapter.label.en}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QbPanel>

      {editing && (
        <ChapterDialog
          chapter={editing === "new" ? null : editing}
          exam={exam}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            chapters.reload();
          }}
        />
      )}
    </div>
  );
}

function UnitsTable({ units, t, locale }: { units: QbUnitView[]; t: QbMessages; locale: Locale }) {
  const x = t.taxonomy;
  return (
    <div className="space-y-4">
      {QB_ADMIN_SUBJECTS.map((subject) => {
        const list = units.filter((unit) => unit.subject === subject);
        if (list.length === 0) return null;
        return (
          <div key={subject}>
            <h3 className="font-bold text-navy">{t.subjects[subject]}</h3>
            <ul className="mt-1 divide-y divide-line text-sm">
              {list.map((unit) => (
                <li key={unit.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                  {unit.code && <span className="font-mono text-xs text-muted">{unit.code}</span>}
                  <span className={unit.status === "removed" ? "line-through" : "font-semibold"}>{locale === "hi" && unit.label.hi ? unit.label.hi : unit.label.en}</span>
                  {unit.status === "removed" && <span className="text-xs text-muted">{x.unitStatuses.removed}</span>}
                  <a href={unit.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue hover:underline">
                    {x.unitSource}
                  </a>
                  {unit.sourceRef && (
                    <span className="text-xs text-muted" lang="en">
                      {x.unitRef}: {unit.sourceRef}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmForm({ exam, status, t, onDone }: { exam: QbExam; status: QbTaxonomyStatus; t: QbMessages; onDone: () => void }) {
  const id = useId();
  const action = useQbAction(t, PAGE);
  const x = t.taxonomy;
  const [year, setYear] = useState(String(status.syllabusRevisionYear ?? REPORTED_REVISION_YEAR[exam]));
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const yearNumber = Number(year);
  const valid = checked && Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100;
  return (
    <form
      className="mt-3 space-y-2 rounded-control border border-line p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid) return;
        const result = await action.run<QbTaxonomyStatus>(qbRequests.confirmTaxonomy(exam, yearNumber, note.trim() || undefined), t.common.saved);
        if (result) onDone();
      }}
    >
      <h3 className="font-bold text-navy">{x.confirmTitle}</h3>
      <p className="text-sm text-muted">{x.confirmLead}</p>
      <TextField id={`${id}-year`} label={x.revisionYear} hint={x.revisionYearHint} type="number" inputMode="numeric" value={year} onChange={setYear} className="max-w-xs" />
      <TextField id={`${id}-note`} label={x.confirmNote} value={note} maxLength={500} onChange={setNote} />
      <CheckboxField id={`${id}-check`} label={x.confirmCheck} checked={checked} onChange={setChecked} />
      <button type="submit" className={primaryButton} disabled={!valid || action.pending}>
        {action.pending ? t.common.saving : x.confirmButton}
      </button>
      <QbFeedback state={action} detailsLabel={t.common.details} />
    </form>
  );
}

function UnitForm({ exam, t, onDone }: { exam: QbExam; t: QbMessages; onDone: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const action = useQbAction(t, PAGE);
  const x = t.taxonomy;
  const f = x.unitFields;
  const [unit, setUnit] = useState({ id: "", code: "", en: "", hi: "", subject: "physics" as QbSubject, year: "2026", sourceUrl: "", sourceRef: "", status: "current" as "current" | "removed", sort: "0" });
  const set = (change: Partial<typeof unit>) => setUnit((current) => ({ ...current, ...change }));
  return (
    <>
      <button type="button" className={smallButton} onClick={() => setOpen(true)}>
        {x.unitAdd}
      </button>
      <QbDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
          {x.unitAdd}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField id={`${id}-id`} label={f.id} value={unit.id} maxLength={80} onChange={(value) => set({ id: value })} lang="en" />
          <TextField id={`${id}-code`} label={f.code} value={unit.code} maxLength={20} onChange={(code) => set({ code })} />
          <TextField id={`${id}-en`} label={f.label} value={unit.en} maxLength={200} onChange={(en) => set({ en })} />
          <TextField id={`${id}-hi`} label={f.labelHi} value={unit.hi} maxLength={200} lang="hi" onChange={(hi) => set({ hi })} />
          <SelectField<QbSubject> id={`${id}-subject`} label={f.subject} value={unit.subject} options={QB_ADMIN_SUBJECTS.map((value) => ({ value, label: t.subjects[value] }))} onChange={(subject) => set({ subject })} />
          <TextField id={`${id}-year`} label={f.year} type="number" inputMode="numeric" value={unit.year} onChange={(year) => set({ year })} />
          <TextField id={`${id}-url`} label={f.sourceUrl} type="url" value={unit.sourceUrl} maxLength={500} onChange={(sourceUrl) => set({ sourceUrl })} className="sm:col-span-2" />
          <TextField id={`${id}-ref`} label={f.sourceRef} value={unit.sourceRef} maxLength={200} onChange={(sourceRef) => set({ sourceRef })} />
          <SelectField<"current" | "removed">
            id={`${id}-status`}
            label={f.status}
            value={unit.status}
            options={[
              { value: "current", label: x.unitStatuses.current },
              { value: "removed", label: x.unitStatuses.removed },
            ]}
            onChange={(status) => set({ status })}
          />
          <TextField id={`${id}-sort`} label={f.sort} type="number" inputMode="numeric" value={unit.sort} onChange={(sort) => set({ sort })} />
        </div>
        <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setOpen(false)}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={action.pending || !unit.en.trim() || !unit.sourceUrl.trim()}
            onClick={async () => {
              const result = await action.run<QbUnitView>(
                qbRequests.saveUnit({
                  ...(unit.id.trim() ? { id: unit.id.trim() } : {}),
                  exam,
                  syllabusYear: Number(unit.year),
                  subject: unit.subject,
                  code: unit.code.trim() || null,
                  label: { en: unit.en.trim(), hi: unit.hi.trim() },
                  sourceUrl: unit.sourceUrl.trim(),
                  sourceRef: unit.sourceRef.trim(),
                  status: unit.status,
                  sort: Number(unit.sort) || 0,
                }),
                t.common.saved,
              );
              if (result) {
                setOpen(false);
                onDone();
              }
            }}
          >
            {t.common.save}
          </button>
        </div>
      </QbDialog>
    </>
  );
}

function ChapterDialog({ chapter, exam, t, onClose, onSaved }: { chapter: QbChapterView | null; exam: QbExam; t: QbMessages; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const action = useQbAction(t, PAGE);
  const x = t.taxonomy;
  const f = x.chapterFields;
  const [form, setForm] = useState({
    id: chapter?.id ?? "",
    en: chapter?.label.en ?? "",
    hi: chapter?.label.hi ?? "",
    subject: chapter?.subject ?? ("physics" as QbSubject),
    level: chapter?.level ?? ("class_11" as QbLevel),
    status: (chapter?.examStatus[exam] ?? "unset") as "current" | "removed" | "unset",
    units: (chapter?.units[exam] ?? []).join("\n"),
    sort: String(chapter?.sort ?? 0),
    active: chapter?.active ?? true,
  });
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }));

  async function save() {
    const examStatus = { ...(chapter?.examStatus ?? {}) };
    if (form.status === "unset") delete examStatus[exam];
    else examStatus[exam] = form.status;
    const units = { ...(chapter?.units ?? {}), [exam]: lines(form.units, 40) };
    const body: QbChapterInput = {
      subject: form.subject,
      level: form.level,
      label: { en: form.en.trim(), hi: form.hi.trim() },
      units,
      examStatus,
      sort: Math.max(0, Math.round(Number(form.sort) || 0)),
      active: form.active,
    };
    const result = chapter
      ? await action.run<QbChapterView>(qbRequests.updateChapter(chapter.id, body), t.common.saved)
      : await action.run<QbChapterView>(qbRequests.createChapter({ ...body, id: form.id.trim() }), t.common.saved);
    if (result) onSaved();
  }

  return (
    <QbDialog open titleId={`${id}-title`} onClose={onClose}>
      <h2 id={`${id}-title`} className="text-xl font-extrabold text-navy">
        {chapter ? x.chapterEdit : x.chapterAdd}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!chapter && <TextField id={`${id}-slug`} label={f.id} value={form.id} maxLength={63} onChange={(value) => set({ id: value.toLowerCase() })} className="sm:col-span-2" />}
        <TextField id={`${id}-en`} label={f.label} value={form.en} maxLength={200} onChange={(en) => set({ en })} />
        <TextField id={`${id}-hi`} label={f.labelHi} value={form.hi} maxLength={200} lang="hi" onChange={(hi) => set({ hi })} />
        <SelectField<QbSubject> id={`${id}-subject`} label={f.subject} value={form.subject} options={QB_ADMIN_SUBJECTS.map((value) => ({ value, label: t.subjects[value] }))} onChange={(subject) => set({ subject })} />
        <SelectField<QbLevel> id={`${id}-level`} label={f.level} value={form.level} options={QB_ADMIN_LEVELS.map((value) => ({ value, label: t.levels[value] }))} onChange={(level) => set({ level })} />
        <SelectField<"current" | "removed" | "unset">
          id={`${id}-status`}
          label={`${f.status} (${t.exams[exam]})`}
          value={form.status}
          options={[
            { value: "current", label: x.chapterStatuses.current },
            { value: "removed", label: x.chapterStatuses.removed },
            { value: "unset", label: x.chapterStatuses.unset },
          ]}
          onChange={(status) => set({ status })}
        />
        <TextField id={`${id}-sort`} label={f.sort} type="number" inputMode="numeric" value={form.sort} onChange={(sort) => set({ sort })} />
        <TextArea id={`${id}-units`} label={f.units} value={form.units} rows={3} maxLength={4000} onChange={(units) => set({ units })} className="sm:col-span-2" />
        <CheckboxField id={`${id}-active`} label={f.active} checked={form.active} onChange={(active) => set({ active })} />
      </div>
      <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={smallButton} onClick={onClose}>
          {t.common.cancel}
        </button>
        <button type="button" className={primaryButton} disabled={action.pending || !form.en.trim() || (!chapter && !form.id.trim())} onClick={() => void save()}>
          {action.pending ? t.common.saving : t.common.save}
        </button>
      </div>
    </QbDialog>
  );
}
