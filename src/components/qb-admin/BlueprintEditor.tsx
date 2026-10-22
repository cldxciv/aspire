"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { QbDifficulty, QbMix, QbReadiness } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { CheckboxField, dangerButton, primaryButton, QbDialog, QbFeedback, SelectField, smallButton, TextArea, TextField, useQbAction, useQbData } from "./client-kit";
import { QB_ADMIN_DIFFICULTIES, type QbCapabilityMap } from "./constants";
import type { QbBlueprintAction, QbBlueprintDetail, QbBlueprintEditable, QbBlueprintPreview, QbPreviewStats } from "./contract";
import { blueprintTotals, editableFromBlueprint, percentTextToShare, sectionMix, shareToPercentText, updateSection } from "./blueprint-state";
import { blockerLabel, formatDate, formatOverrides, formatShare, parseOverrides } from "./format";
import { mixCounts, setMixValue } from "./mix";
import { DifficultyBadge, QbPanel, SourceKindBadge } from "./QbBlocks";

/**
 * One blueprint (§B1.3, §B9): the official pattern with its sources, the BOH placeholder banner,
 * publish blockers, the draft editor (difficulty mix sliders that always total 100, sections,
 * sources and limits, chapter weights), the admin actions, readiness, a sample paper and the
 * 100-paper check. Only drafts are editable; published versions change through a new version.
 */
export function BlueprintEditor({ blueprintId, t, locale, can }: { blueprintId: string; t: QbMessages; locale: Locale; can: QbCapabilityMap }) {
  const id = useId();
  const pagePath = `/admin/questions/blueprints/${blueprintId}`;
  const loaded = useQbData<QbBlueprintDetail>(qbRequests.getBlueprint(blueprintId), t, pagePath);
  const save = useQbAction(t, pagePath);
  const detail = loaded.data;
  const key = detail ? `${detail.blueprint.id}:${detail.updatedAt}` : "none";
  const base = useMemo(() => (detail ? editableFromBlueprint(detail.blueprint) : null), [detail]);
  const [edit, setEdit] = useState<{ key: string; value: QbBlueprintEditable } | null>(null);
  const [overridesText, setOverridesText] = useState<{ key: string; text: string } | null>(null);
  const b = t.blueprint;

  if (!detail || !base) {
    return (
      <p role={loaded.error ? "alert" : "status"} className={loaded.error ? "font-semibold text-danger" : "text-muted"}>
        {loaded.error ?? t.common.loading}
      </p>
    );
  }

  const value = edit && edit.key === key ? edit.value : base;
  const update = (change: (current: QbBlueprintEditable) => QbBlueprintEditable) =>
    setEdit((previous) => ({ key, value: change(previous && previous.key === key ? previous.value : base) }));
  const dirty = JSON.stringify(value) !== JSON.stringify(base);
  const bp = detail.blueprint;
  const editable = can.edit_blueprint && bp.status === "draft";
  const overrides = overridesText && overridesText.key === key ? overridesText.text : formatOverrides(value.chapterWeights.overrides);
  const parsedOverrides = parseOverrides(overrides);
  const totals = blueprintTotals(value);
  const today = new Date().toISOString().slice(0, 10);
  const reviewDue = value.pattern.reviewDueAt;
  const firstCount = value.parts[0]?.sections[0]?.count ?? 0;

  const baseUpdatedAt = detail.updatedAt;

  async function onSave() {
    const definition: QbBlueprintEditable = { ...value, chapterWeights: { ...value.chapterWeights, overrides: parsedOverrides.overrides } };
    const next = await save.run<QbBlueprintDetail>(qbRequests.saveBlueprint(bp.id, definition, baseUpdatedAt), t.common.saved);
    if (next) {
      setEdit(null);
      setOverridesText(null);
      loaded.setData(next);
    }
  }

  const setMix = (mix: QbMix) => update((current) => ({ ...current, difficultyMix: mix }));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {t.blueprints.statuses[bp.status]} · {format(t.blueprints.totals, totals)}
        {bp.signoff && ` · ${locale === "hi" && bp.signoff.label.hi ? bp.signoff.label.hi : bp.signoff.label.en}`}
      </p>

      {bp.placeholder && !bp.patternConfirmedBy && (
        <div role="note" className="flex gap-2 rounded-card border border-[#f2dfa0] bg-gold-soft p-4 text-[#5c4a12]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>{b.bohBanner}</p>
        </div>
      )}
      {reviewDue && reviewDue < today && (
        <p role="note" className="rounded-card border border-[#e7b4b4] bg-[#fff4f4] p-3 font-semibold text-[#a61b1b]">
          {format(t.blueprints.reviewOverdue, { date: formatDate(reviewDue, locale) })}
        </p>
      )}
      {detail.publishBlockers.length > 0 && bp.status === "draft" && (
        <div role="note" className="rounded-card border border-line bg-white p-4 text-sm">
          <p className="font-semibold text-navy">{b.blockersTitle}</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {detail.publishBlockers.map((blocker) => (
              <li key={blocker}>{blockerLabel(blocker, t)}</li>
            ))}
          </ul>
        </div>
      )}
      {detail.issues.length > 0 && (
        <div role="alert" className="rounded-card border border-[#e7b4b4] bg-[#fff4f4] p-4 text-sm text-[#7a2020]">
          <p className="font-semibold">{b.issuesTitle}</p>
          <ul className="mt-1 list-disc pl-5" lang="en">
            {detail.issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <span className="font-mono">{issue.path}</span>: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <BlueprintActions detail={detail} t={t} can={can} pagePath={pagePath} dirty={dirty} onChange={loaded.setData} />

      {!editable && <p className="text-sm text-muted">{b.readOnlyNote}</p>}

      <QbPanel id={`${id}-pattern`} title={b.patternTitle}>
        <p className="text-sm">
          {format(b.patternYear, { year: value.pattern.year })} · {value.pattern.verifiedAt ? format(b.patternVerified, { date: formatDate(value.pattern.verifiedAt, locale) }) : b.patternUnverified}
        </p>
        {value.pattern.sourceUrls.length > 0 && (
          <div className="mt-2 text-sm">
            <p className="font-semibold text-navy">{b.patternSources}</p>
            <ul className="mt-1 space-y-1">
              {value.pattern.sourceUrls.map((url) => (
                <li key={url} className="break-all">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextArea
            id={`${id}-note-en`}
            label={`${b.patternNote} (${t.common.english})`}
            value={value.pattern.note.en}
            rows={2}
            maxLength={2000}
            disabled={!editable}
            onChange={(en) => update((current) => ({ ...current, pattern: { ...current.pattern, note: { ...current.pattern.note, en } } }))}
          />
          <TextArea
            id={`${id}-note-hi`}
            label={`${b.patternNote} (${t.common.hindi})`}
            value={value.pattern.note.hi}
            rows={2}
            maxLength={2000}
            lang="hi"
            disabled={!editable}
            onChange={(hi) => update((current) => ({ ...current, pattern: { ...current.pattern, note: { ...current.pattern.note, hi } } }))}
          />
          <TextField
            id={`${id}-review`}
            label={b.reviewDueAt}
            type="date"
            value={value.pattern.reviewDueAt ?? ""}
            disabled={!editable}
            onChange={(reviewDueAt) => update((current) => ({ ...current, pattern: { ...current.pattern, reviewDueAt: reviewDueAt || null } }))}
          />
        </div>
      </QbPanel>

      <QbPanel id={`${id}-general`} title={b.general}>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField id={`${id}-title-en`} label={b.titleField} value={value.title.en} maxLength={200} disabled={!editable} onChange={(en) => update((current) => ({ ...current, title: { ...current.title, en } }))} />
          <TextField id={`${id}-title-hi`} label={b.titleFieldHi} value={value.title.hi} maxLength={200} lang="hi" disabled={!editable} onChange={(hi) => update((current) => ({ ...current, title: { ...current.title, hi } }))} />
          <TextArea id={`${id}-summary-en`} label={b.summaryField} value={value.summary.en} rows={2} maxLength={1000} disabled={!editable} onChange={(en) => update((current) => ({ ...current, summary: { ...current.summary, en } }))} />
          <TextArea id={`${id}-summary-hi`} label={b.summaryFieldHi} value={value.summary.hi} rows={2} maxLength={1000} lang="hi" disabled={!editable} onChange={(hi) => update((current) => ({ ...current, summary: { ...current.summary, hi } }))} />
        </div>
      </QbPanel>

      <QbPanel id={`${id}-mix`} title={b.mixTitle} description={b.mixHint}>
        <MixSliders idPrefix={`${id}-mix`} mix={value.difficultyMix} onChange={setMix} disabled={!editable} t={t} />
        {firstCount > 0 && <p className="mt-2 text-sm text-muted">{format(b.mixCounts, { count: firstCount, ...mixCounts(value.difficultyMix, firstCount) })}</p>}
      </QbPanel>

      <QbPanel id={`${id}-parts`} title={b.partsTitle}>
        <div className="space-y-5">
          {value.parts.map((part, partIndex) => (
            <div key={part.id}>
              <div className="flex flex-wrap items-end gap-3">
                <h3 className="font-bold text-navy">{format(b.part, { label: locale === "hi" && part.label.hi ? part.label.hi : part.label.en, minutes: part.durationMinutes })}</h3>
                <TextField
                  id={`${id}-${part.id}-duration`}
                  label={b.duration}
                  type="number"
                  inputMode="numeric"
                  value={String(part.durationMinutes)}
                  disabled={!editable}
                  className="w-32"
                  onChange={(text) =>
                    update((current) => ({
                      ...current,
                      parts: current.parts.map((p, i) => (i === partIndex ? { ...p, durationMinutes: Math.max(10, Math.min(600, Math.round(Number(text) || 0))) } : p)),
                    }))
                  }
                />
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                    <tr>
                      {(["section", "subject", "type", "count", "correct", "wrong", "partial", "answerFormat", "mix"] as const).map((column) => (
                        <th key={column} scope="col" className="px-2 py-2">
                          {b.sectionColumns[column]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {part.sections.map((section, sectionIndex) => {
                      const prefix = `${id}-${part.id}-${section.id}`;
                      const change = (patch: Parameters<typeof updateSection>[3]) => update((current) => updateSection(current, partIndex, sectionIndex, patch));
                      return (
                        <tr key={section.id} className="align-top">
                          <th scope="row" className="px-2 py-2 font-semibold">
                            {locale === "hi" && section.label.hi ? section.label.hi : section.label.en}
                          </th>
                          <td className="px-2 py-2">{t.subjects[section.subject]}</td>
                          <td className="px-2 py-2">
                            {t.types[section.type]}
                            {section.format && section.format !== "standard" && <span className="block text-xs text-muted">{t.formats[section.format]}</span>}
                          </td>
                          <td className="px-2 py-2">
                            <NumberCell id={`${prefix}-count`} label={b.sectionColumns.count} value={section.count} min={1} max={200} disabled={!editable} onChange={(count) => change({ count })} />
                          </td>
                          <td className="px-2 py-2">
                            <NumberCell id={`${prefix}-correct`} label={b.sectionColumns.correct} value={section.marking.correct} min={0} max={20} disabled={!editable} onChange={(correct) => change({ marking: { ...section.marking, correct } })} />
                          </td>
                          <td className="px-2 py-2">
                            <NumberCell id={`${prefix}-wrong`} label={b.sectionColumns.wrong} value={section.marking.wrong} min={-20} max={0} disabled={!editable} onChange={(wrong) => change({ marking: { ...section.marking, wrong } })} />
                          </td>
                          <td className="px-2 py-2">
                            {section.type === "multiple" ? (
                              // The label pads the 16 px box to a 44 px click target.
                              <label className="flex size-11 cursor-pointer items-center justify-center">
                                <input
                                  type="checkbox"
                                  aria-label={b.sectionColumns.partial}
                                  checked={section.marking.partial === "per_correct_option"}
                                  disabled={!editable}
                                  onChange={(event) => change({ marking: { correct: section.marking.correct, wrong: section.marking.wrong, ...(event.target.checked ? { partial: "per_correct_option" as const } : {}) } })}
                                  className="size-4 accent-navy"
                                />
                              </label>
                            ) : (
                              t.common.none
                            )}
                          </td>
                          <td className="px-2 py-2">{section.type === "numerical" ? b.answerFormats[section.answerFormat ?? "none"] : t.common.none}</td>
                          <td className="px-2 py-2">
                            <CheckboxField
                              id={`${prefix}-own-mix`}
                              label={section.difficultyMix ? QB_ADMIN_DIFFICULTIES.map((d) => `${section.difficultyMix?.[d]}`).join("/") : b.sectionMixInherit}
                              checked={section.difficultyMix !== undefined}
                              disabled={!editable}
                              onChange={(on) => change({ difficultyMix: on ? { ...sectionMix(section, value.difficultyMix) } : undefined })}
                            />
                            {section.difficultyMix && editable && (
                              <MixSliders idPrefix={`${prefix}-mix`} mix={section.difficultyMix} onChange={(mix) => change({ difficultyMix: mix })} disabled={!editable} t={t} compact />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </QbPanel>

      <QbPanel id={`${id}-sources`} title={b.sourcesTitle}>
        <div className="grid gap-3 md:grid-cols-2">
          <CheckboxField id={`${id}-official`} label={b.sourceOfficial} checked={value.sourcePolicy.official} disabled={!editable} onChange={(official) => update((current) => ({ ...current, sourcePolicy: { ...current.sourcePolicy, official } }))} />
          <CheckboxField id={`${id}-aspire`} label={b.sourceAspire} checked={value.sourcePolicy.aspire} disabled={!editable} onChange={(aspire) => update((current) => ({ ...current, sourcePolicy: { ...current.sourcePolicy, aspire } }))} />
          <SelectField<"never" | "placeholder_only">
            id={`${id}-sample`}
            label={b.sourceSample}
            value={value.sourcePolicy.sample}
            disabled={!editable}
            options={[
              { value: "never", label: b.sourceSamples.never },
              { value: "placeholder_only", label: b.sourceSamples.placeholder_only },
            ]}
            onChange={(sample) => update((current) => ({ ...current, sourcePolicy: { ...current.sourcePolicy, sample } }))}
          />
          <ShareField id={`${id}-official-max`} label={b.officialMaxShare} share={value.sourcePolicy.officialMaxShare} nullable disabled={!editable} onChange={(officialMaxShare) => update((current) => ({ ...current, sourcePolicy: { ...current.sourcePolicy, officialMaxShare } }))} />
          <ShareField id={`${id}-cross`} label={b.crossExamMaxShare} share={value.crossExamMaxShare} disabled={!editable} onChange={(share) => update((current) => ({ ...current, crossExamMaxShare: share ?? 0 }))} />
          <ShareField id={`${id}-short`} label={b.minShortRatio} share={value.minShortRatio} disabled={!editable} onChange={(share) => update((current) => ({ ...current, minShortRatio: share ?? current.minShortRatio }))} />
          <TextField
            id={`${id}-recent`}
            label={b.recentExclusionDays}
            type="number"
            inputMode="numeric"
            value={String(value.recentExclusionDays)}
            disabled={!editable}
            onChange={(text) => update((current) => ({ ...current, recentExclusionDays: Math.max(0, Math.min(365, Math.round(Number(text) || 0))) }))}
          />
          <SelectField<"off" | "monthly">
            id={`${id}-ranked`}
            label={b.ranked}
            value={value.ranked}
            disabled={!editable}
            options={[
              { value: "off", label: b.rankedOptions.off },
              { value: "monthly", label: b.rankedOptions.monthly },
            ]}
            onChange={(ranked) => update((current) => ({ ...current, ranked }))}
          />
          <fieldset>
            <legend className="text-sm font-bold text-navy">{b.languages}</legend>
            {(["en", "hi"] as const).map((language) => (
              <CheckboxField
                key={language}
                id={`${id}-lang-${language}`}
                label={language === "en" ? t.common.english : t.common.hindi}
                checked={value.languages.includes(language)}
                disabled={!editable || (value.languages.length === 1 && value.languages[0] === language)}
                onChange={(on) => update((current) => ({ ...current, languages: on ? [...new Set([...current.languages, language])] : current.languages.filter((entry) => entry !== language) }))}
              />
            ))}
          </fieldset>
          <TextField
            id={`${id}-comp`}
            label={b.compensatory}
            type="number"
            inputMode="numeric"
            value={value.compensatoryMinutes === null ? "" : String(value.compensatoryMinutes)}
            disabled={!editable}
            onChange={(text) => update((current) => ({ ...current, compensatoryMinutes: text === "" ? null : Math.max(0, Math.min(180, Math.round(Number(text) || 0))) }))}
          />
        </div>
      </QbPanel>

      <QbPanel id={`${id}-weights`} title={b.weightsTitle}>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField<"past_papers" | "uniform" | "manual">
            id={`${id}-weights-mode`}
            label={b.weightsMode}
            value={value.chapterWeights.mode}
            disabled={!editable}
            options={(["past_papers", "uniform", "manual"] as const).map((mode) => ({ value: mode, label: b.weightsModes[mode] }))}
            onChange={(mode) => update((current) => ({ ...current, chapterWeights: { ...current.chapterWeights, mode } }))}
          />
          <TextField
            id={`${id}-weights-from`}
            label={b.weightsFromYear}
            type="number"
            inputMode="numeric"
            value={value.chapterWeights.fromYear === null ? "" : String(value.chapterWeights.fromYear)}
            disabled={!editable}
            onChange={(text) => update((current) => ({ ...current, chapterWeights: { ...current.chapterWeights, fromYear: text === "" ? null : Math.round(Number(text) || 0) } }))}
          />
          <TextArea
            id={`${id}-weights-overrides`}
            label={b.weightsOverrides}
            value={overrides}
            rows={4}
            maxLength={8000}
            disabled={!editable}
            onChange={(text) => setOverridesText({ key, text })}
            className="md:col-span-2"
          />
          {parsedOverrides.invalid.length > 0 && (
            <p role="alert" className="text-sm font-semibold text-danger md:col-span-2" lang="en">
              {parsedOverrides.invalid.join(" · ")}
            </p>
          )}
        </div>
      </QbPanel>

      {editable && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-card border border-line bg-white/95 p-3 shadow-card backdrop-blur">
          <button type="button" className={primaryButton} disabled={save.pending || (!dirty && overridesText === null) || parsedOverrides.invalid.length > 0} onClick={() => void onSave()}>
            {save.pending ? t.common.saving : b.save}
          </button>
          {dirty && <span className="text-sm font-semibold text-[#7a5600]">{t.editor.unsaved}</span>}
          <QbFeedback state={save} detailsLabel={t.common.details} />
        </div>
      )}

      <ReadinessPanel blueprintId={bp.id} languages={value.languages} t={t} pagePath={pagePath} />
      <PreviewPanel blueprintId={bp.id} languages={value.languages} t={t} pagePath={pagePath} />
      <StatsPanel blueprintId={bp.id} t={t} locale={locale} pagePath={pagePath} />
    </div>
  );
}

function NumberCell({ id, label, value, min, max, disabled, onChange }: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <input
      id={id}
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      }}
      className="min-h-11 w-20 rounded-control border border-[#b9cbe0] bg-white px-2 text-sm disabled:bg-[#f4f7fb]"
    />
  );
}

function ShareField({ id, label, share, nullable = false, disabled, onChange }: { id: string; label: string; share: number | null; nullable?: boolean; disabled: boolean; onChange: (share: number | null) => void }) {
  return (
    <TextField
      id={id}
      label={label}
      type="number"
      inputMode="decimal"
      value={shareToPercentText(share)}
      disabled={disabled}
      onChange={(text) => {
        const next = percentTextToShare(text);
        if (next === undefined) return;
        if (next === null && !nullable) return;
        onChange(next);
      }}
    />
  );
}

/** Three linked sliders whose values always add up to 100 (`setMixValue`). */
function MixSliders({ idPrefix, mix, onChange, disabled, t, compact = false }: { idPrefix: string; mix: QbMix; onChange: (mix: QbMix) => void; disabled: boolean; t: QbMessages; compact?: boolean }) {
  return (
    <div className={compact ? "mt-1 space-y-1" : "grid gap-3 md:grid-cols-3"}>
      {QB_ADMIN_DIFFICULTIES.map((difficulty: QbDifficulty) => (
        <div key={difficulty} className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-${difficulty}`} className={compact ? "text-xs font-semibold" : "text-sm font-bold text-navy"}>
            {format(t.blueprint.mixValue, { difficulty: t.difficulties[difficulty], value: mix[difficulty] })}
          </label>
          <input
            id={`${idPrefix}-${difficulty}`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={mix[difficulty]}
            disabled={disabled}
            onChange={(event) => onChange(setMixValue(mix, difficulty, Number(event.target.value)))}
            className="min-h-8 accent-navy"
          />
        </div>
      ))}
    </div>
  );
}

/** The service's minimum for "how the pattern was confirmed". */
const PATTERN_NOTE_MIN = 3;

function BlueprintActions({ detail, t, can, pagePath, dirty, onChange }: { detail: QbBlueprintDetail; t: QbMessages; can: QbCapabilityMap; pagePath: string; dirty: boolean; onChange: (detail: QbBlueprintDetail) => void }) {
  const id = useId();
  const action = useQbAction(t, pagePath);
  const [dialog, setDialog] = useState<"publish" | "confirm_pattern" | "signoff" | null>(null);
  const [note, setNote] = useState("");
  const [label, setLabel] = useState({ en: t.blueprint.signoffDefault, hi: "" });
  const bp = detail.blueprint;
  const b = t.blueprint;
  const busy = action.pending || dirty;

  async function run(body: QbBlueprintAction) {
    const next = await action.run<QbBlueprintDetail>(qbRequests.blueprintAction(bp.id, body), t.workflow.done);
    if (next) {
      setDialog(null);
      onChange(next);
    }
  }

  const buttons = [
    bp.status === "draft" && can.publish_blueprint && (
      <button key="publish" type="button" className={primaryButton} disabled={busy} onClick={() => setDialog("publish")}>
        {b.publish}
      </button>
    ),
    bp.status === "published" && can.publish_blueprint && (
      <button key="archive" type="button" className={dangerButton} disabled={busy} onClick={() => void run({ action: "archive" })}>
        {b.archive}
      </button>
    ),
    bp.status !== "draft" && can.edit_blueprint && (
      <button key="new" type="button" className={smallButton} disabled={busy} onClick={() => void run({ action: "new_version" })}>
        {b.newVersion}
      </button>
    ),
    bp.placeholder && !bp.patternConfirmedBy && can.publish_blueprint && (
      <button key="confirm" type="button" className={smallButton} disabled={busy} onClick={() => setDialog("confirm_pattern")}>
        {b.confirmPattern}
      </button>
    ),
    can.publish_blueprint && bp.status !== "archived" && (
      <button key="signoff" type="button" className={smallButton} disabled={busy} onClick={() => setDialog("signoff")}>
        {b.signoff}
      </button>
    ),
  ].filter(Boolean);

  if (buttons.length === 0 && !action.error) return null;
  const dialogTitle = dialog === "publish" ? b.publish : dialog === "confirm_pattern" ? b.confirmPattern : b.signoff;
  return (
    <QbPanel id={`${id}-actions`} title={b.actionsTitle}>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      <QbDialog open={dialog !== null} titleId={`${id}-dialog`} onClose={() => setDialog(null)}>
        <h2 id={`${id}-dialog`} className="text-xl font-extrabold text-navy">
          {dialogTitle.replace(/…$/, "")}
        </h2>
        <p className="mt-1 text-sm text-muted">{dialog === "publish" ? b.publishConfirm : dialog === "confirm_pattern" ? b.confirmPatternLead : b.signoffLead}</p>
        {dialog === "signoff" && (
          <div className="mt-3 grid gap-3">
            <TextField id={`${id}-label-en`} label={b.signoffLabel} value={label.en} maxLength={120} onChange={(en) => setLabel((current) => ({ ...current, en }))} />
            <TextField id={`${id}-label-hi`} label={b.signoffLabelHi} value={label.hi} maxLength={120} lang="hi" onChange={(hi) => setLabel((current) => ({ ...current, hi }))} />
          </div>
        )}
        <TextField
          id={`${id}-note`}
          label={dialog === "confirm_pattern" ? b.confirmPatternNote : b.note}
          hint={dialog === "confirm_pattern" ? b.confirmPatternNoteHint : undefined}
          value={note}
          maxLength={500}
          onChange={setNote}
          className="mt-3"
        />
        <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setDialog(null)}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={action.pending || (dialog === "signoff" && !label.en.trim()) || (dialog === "confirm_pattern" && note.trim().length < PATTERN_NOTE_MIN)}
            onClick={() =>
              dialog &&
              void run({
                action: dialog,
                ...(note.trim() ? { note: note.trim() } : {}),
                ...(dialog === "signoff" ? { label: { en: label.en.trim(), hi: label.hi.trim() } } : {}),
              })
            }
          >
            {action.pending ? t.common.saving : t.common.confirm}
          </button>
        </div>
      </QbDialog>
    </QbPanel>
  );
}

function LanguagePicker({ id, value, languages, onChange, t }: { id: string; value: "en" | "hi"; languages: ("en" | "hi")[]; onChange: (value: "en" | "hi") => void; t: QbMessages }) {
  return (
    <SelectField<"en" | "hi">
      id={id}
      label={t.blueprint.language}
      value={value}
      options={languages.map((language) => ({ value: language, label: language === "en" ? t.common.english : t.common.hindi }))}
      onChange={onChange}
      className="max-w-xs"
    />
  );
}

function ReadinessPanel({ blueprintId, languages, t, pagePath }: { blueprintId: string; languages: ("en" | "hi")[]; t: QbMessages; pagePath: string }) {
  const id = useId();
  const [language, setLanguage] = useState<"en" | "hi">(languages[0] ?? "en");
  const data = useQbData<QbReadiness>(qbRequests.readiness(blueprintId, language), t, pagePath);
  const b = t.blueprint;
  const r = data.data;
  return (
    <QbPanel id={`${id}-title`} title={b.readinessTitle} action={<LanguagePicker id={`${id}-language`} value={language} languages={languages} onChange={setLanguage} t={t} />}>
      {data.error && <p role="alert" className="text-sm text-danger">{data.error}</p>}
      {!r && !data.error && <p className="text-sm text-muted">{t.common.loading}</p>}
      {r && (
        <div className="space-y-3 text-sm">
          <p className={r.level === "full" ? "font-semibold text-success" : r.level === "short" ? "font-semibold text-[#7a5600]" : "font-semibold text-danger"}>{b.readinessLevels[r.level]}</p>
          <p>{format(b.readinessSummary, { servable: r.servable, full: r.full, variety: r.variety })}</p>
          <p className="text-muted">{format(b.readinessRanked, { state: r.ranked.available ? b.readinessRankedOn : b.readinessRankedOff })}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  <th scope="col" className="px-2 py-2">{b.readinessSection}</th>
                  <th scope="col" className="px-2 py-2">{b.readinessNeeded}</th>
                  {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
                    <th key={difficulty} scope="col" className="px-2 py-2">
                      {t.difficulties[difficulty]}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2">{b.readinessServable}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.sections.map((section) => (
                  <tr key={section.sectionId}>
                    <th scope="row" className="px-2 py-1.5 font-mono text-xs">
                      {section.sectionId}
                    </th>
                    <td className="px-2 py-1.5">{section.needed}</td>
                    {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
                      <td key={difficulty} className="px-2 py-1.5">
                        {section.available[difficulty]}
                      </td>
                    ))}
                    <td className={section.servable < section.needed ? "px-2 py-1.5 font-semibold text-danger" : "px-2 py-1.5"}>{section.servable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </QbPanel>
  );
}

function PreviewPanel({ blueprintId, languages, t, pagePath }: { blueprintId: string; languages: ("en" | "hi")[]; t: QbMessages; pagePath: string }) {
  const id = useId();
  const action = useQbAction(t, pagePath);
  const [language, setLanguage] = useState<"en" | "hi">(languages[0] ?? "en");
  const [seed, setSeed] = useState("");
  const [preview, setPreview] = useState<QbBlueprintPreview | null>(null);
  const b = t.blueprint;

  async function generate() {
    const result = await action.run<QbBlueprintPreview>(qbRequests.preview(blueprintId, language, seed.trim() || undefined));
    if (result) {
      setPreview(result);
      setSeed(result.seed);
    }
  }

  const composition = preview?.composition;
  return (
    <QbPanel id={`${id}-title`} title={b.previewTitle} description={b.previewLead}>
      <div className="flex flex-wrap items-end gap-3">
        <LanguagePicker id={`${id}-language`} value={language} languages={languages} onChange={setLanguage} t={t} />
        <TextField id={`${id}-seed`} label={b.previewSeed} value={seed} maxLength={64} onChange={setSeed} className="w-56" />
        <button type="button" className={primaryButton} disabled={action.pending} onClick={() => void generate()}>
          {action.pending ? t.common.loading : b.previewGenerate}
        </button>
      </div>
      <QbFeedback state={action} detailsLabel={t.common.details} className="mt-2" />
      {preview && !preview.ok && <p className="mt-3 font-semibold text-danger">{b.previewThin}</p>}
      {preview?.ok && composition && (
        <div className="mt-3 space-y-3 text-sm">
          {preview.short && <p className="font-semibold text-[#7a5600]">{format(b.previewShort, { total: composition.total, full: composition.full })}</p>}
          <p>
            {format(b.previewComposition, {
              official: composition.bySource.official,
              aspire: composition.bySource.aspire,
              sample: composition.bySource.sample,
              years: composition.officialYears.length > 0 ? composition.officialYears.join(", ") : t.common.none,
            })}
          </p>
          {preview.parts.map((part) => (
            <div key={part.partId} className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <caption className="text-left font-bold text-navy">{format(b.part, { label: part.partId, minutes: part.durationMinutes })}</caption>
                <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                  <tr>
                    {(["number", "chapter", "difficulty", "source", "question"] as const).map((column) => (
                      <th key={column} scope="col" className="px-2 py-2">
                        {b.previewColumns[column]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {part.sections.flatMap((section) =>
                    section.items.map((item, index) => (
                      <tr key={`${section.sectionId}-${item.id}`}>
                        <td className="px-2 py-1.5 font-mono text-xs">
                          {section.sectionId}.{index + 1}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs">{item.chapterId}</td>
                        <td className="px-2 py-1.5">
                          <DifficultyBadge difficulty={item.difficulty} t={t} />
                        </td>
                        <td className="px-2 py-1.5">
                          <SourceKindBadge kind={item.sourceKind} t={t} />
                          {item.sourceYear ? <span className="ml-1 text-xs text-muted">{item.sourceYear}</span> : null}
                        </td>
                        <td className="max-w-md px-2 py-1.5" lang="en">
                          {item.stemPreview}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </QbPanel>
  );
}

function StatsPanel({ blueprintId, t, locale, pagePath }: { blueprintId: string; t: QbMessages; locale: Locale; pagePath: string }) {
  const id = useId();
  const action = useQbAction(t, pagePath);
  const [stats, setStats] = useState<QbPreviewStats | null>(null);
  const b = t.blueprint;
  return (
    <QbPanel
      id={`${id}-title`}
      title={b.statsTitle}
      description={b.statsLead}
      action={
        <button
          type="button"
          className={smallButton}
          disabled={action.pending}
          onClick={async () => {
            const result = await action.run<QbPreviewStats>(qbRequests.previewStats(blueprintId, "en"));
            if (result) setStats(result);
          }}
        >
          {action.pending ? t.common.loading : b.statsRun}
        </button>
      }
    >
      <QbFeedback state={action} detailsLabel={t.common.details} />
      {stats && (
        <div className="space-y-3 text-sm">
          <p>{format(b.statsRelaxed, { rate: formatShare(stats.relaxedRate, locale) })}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left">
              <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                <tr>
                  <th scope="col" className="px-2 py-2">{b.statsChapter}</th>
                  <th scope="col" className="px-2 py-2">{b.statsMin}</th>
                  <th scope="col" className="px-2 py-2">{b.statsAvg}</th>
                  <th scope="col" className="px-2 py-2">{b.statsMax}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
                  <tr key={difficulty}>
                    <th scope="row" className="px-2 py-1.5">
                      <DifficultyBadge difficulty={difficulty} t={t} />
                    </th>
                    <td className="px-2 py-1.5">{stats.difficulty[difficulty].min}</td>
                    <td className="px-2 py-1.5">{stats.difficulty[difficulty].avg.toFixed(1)}</td>
                    <td className="px-2 py-1.5">{stats.difficulty[difficulty].max}</td>
                  </tr>
                ))}
                {Object.entries(stats.chapters).map(([chapter, range]) => (
                  <tr key={chapter}>
                    <th scope="row" className="px-2 py-1.5 font-mono text-xs">
                      {chapter}
                    </th>
                    <td className="px-2 py-1.5">{range.min}</td>
                    <td className="px-2 py-1.5">{range.avg.toFixed(1)}</td>
                    <td className="px-2 py-1.5">{range.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.mostUsed.length > 0 && (
            <div>
              <p className="font-semibold text-navy">{b.statsMostUsed}</p>
              <ul className="mt-1 list-disc pl-5">
                {stats.mostUsed.map((entry) => (
                  <li key={entry.id}>{format(b.statsShare, { id: entry.id, share: formatShare(entry.share, locale) })}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </QbPanel>
  );
}
