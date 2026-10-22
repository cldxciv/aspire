"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { qbRequests, type QbMessages } from "./api";
import { fieldClasses, labelClasses, primaryButton, smallButton, useQbData } from "./client-kit";
import {
  QB_ADMIN_DIFFICULTIES,
  QB_ADMIN_EXAMS,
  QB_ADMIN_FLAGS,
  QB_ADMIN_SOURCE_KINDS,
  QB_ADMIN_STATUSES,
  QB_ADMIN_SUBJECTS,
} from "./constants";
import type { QbChapterView, QbQuestionPage } from "./contract";
import { activeFilterCount, pageCount, QB_PAGE_SIZES, QB_QUESTION_SORTS, questionFiltersToQuery, withFilters, type QbQuestionFilters } from "./filters";
import { chapterLabeler, displayStatus, formatDateTime, sortFlags } from "./format";
import { DifficultyBadge, FlagChip, SourceKindBadge, StatusBadge } from "./QbBlocks";

/** A label around a 16 px checkbox that makes the whole 44 × 44 px cell clickable. */
const CHECK_TARGET = "flex size-11 cursor-pointer items-center justify-center";

type Props = {
  initialFilters: QbQuestionFilters;
  t: QbMessages;
  locale: Locale;
  /** LOCALE-FREE page path, for the URL and for coming back after signing in again. */
  pagePath: string;
  /** Keep the filters in the page URL (the list page; not the review queues). */
  syncUrl?: boolean;
  /** Filters the viewer cannot change (a review queue). */
  fixed?: Partial<QbQuestionFilters>;
  /** Show checkboxes for bulk actions. */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (ids: Set<string>) => void;
  /** Bump to reload (after a bulk action). */
  reloadSignal?: number;
};

/**
 * The question list: URL-synced filters (GET form semantics, applied on "Apply"), the table with
 * written-out status, per-exam difficulty, flags and the staff source label, and paging. Rows link
 * to the editor. Data comes from `GET /api/admin/qb/questions`.
 */
export function QuestionList({ initialFilters, t, locale, pagePath, syncUrl = false, fixed, selectable = false, selected, onSelectedChange, reloadSignal = 0 }: Props) {
  const id = useId();
  const [filters, setFilters] = useState<QbQuestionFilters>({ ...initialFilters, ...fixed });
  const [draft, setDraft] = useState<QbQuestionFilters>({ ...initialFilters, ...fixed });
  const request = useMemo(() => {
    const base = qbRequests.listQuestions(filters);
    // A changed reload signal changes the key, so the list is fetched again.
    return reloadSignal ? { ...base, path: `${base.path}${base.path.includes("?") ? "&" : "?"}r=${reloadSignal}` } : base;
  }, [filters, reloadSignal]);
  const list = useQbData<QbQuestionPage>(request, t, pagePath);
  const chapters = useQbData<QbChapterView[]>(qbRequests.chapters({ all: true }), t, pagePath);
  const chapterName = useMemo(() => chapterLabeler(chapters.data ?? [], locale), [chapters.data, locale]);
  const chapterOptions = (chapters.data ?? []).filter((chapter) => !draft.subject || chapter.subject === draft.subject);

  function apply(next: QbQuestionFilters) {
    const merged = { ...next, ...fixed };
    setFilters(merged);
    setDraft(merged);
    if (syncUrl) window.history.replaceState(null, "", localePath(`${pagePath}${questionFiltersToQuery(merged)}`, locale));
  }

  const set = <K extends keyof QbQuestionFilters>(key: K, value: QbQuestionFilters[K] | "") =>
    setDraft((current) => withFilters(current, { [key]: value === "" ? undefined : value } as Partial<QbQuestionFilters>));

  const page = list.data;
  const pages = page ? pageCount(page.total, page.pageSize) : 1;
  const ids = page?.items.map((item) => item.id) ?? [];
  const allSelected = selectable && ids.length > 0 && ids.every((item) => selected?.has(item));
  const toggle = (questionId: string, on: boolean) => {
    const next = new Set(selected ?? []);
    if (on) next.add(questionId);
    else next.delete(questionId);
    onSelectedChange?.(next);
  };
  const locked = (key: keyof QbQuestionFilters) => fixed !== undefined && fixed[key] !== undefined;

  return (
    <div className="space-y-4">
      <form
        role="search"
        aria-label={t.list.filtersTitle}
        className="rounded-card border border-line bg-white p-4 shadow-soft"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ ...draft, page: 1 });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor={`${id}-q`} className={labelClasses}>
              {t.list.search}
            </label>
            <input
              id={`${id}-q`}
              type="search"
              value={draft.q ?? ""}
              maxLength={100}
              placeholder={t.list.searchPlaceholder}
              onChange={(event) => set("q", event.target.value)}
              className={fieldClasses}
            />
          </div>
          <FilterSelect id={`${id}-status`} label={t.list.status} value={draft.status ?? ""} disabled={locked("status")} onChange={(value) => set("status", value as QbQuestionFilters["status"])}>
            <option value="">{t.common.all}</option>
            <option value="open">{t.list.statusOpen}</option>
            {QB_ADMIN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.statuses[status]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-subject`} label={t.list.subject} value={draft.subject ?? ""} onChange={(value) => set("subject", value as QbQuestionFilters["subject"])}>
            <option value="">{t.common.all}</option>
            {QB_ADMIN_SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {t.subjects[subject]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-chapter`} label={t.list.chapter} value={draft.chapterId ?? ""} onChange={(value) => set("chapterId", value)}>
            <option value="">{t.common.all}</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapterName(chapter.id)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-exam`} label={t.list.exam} value={draft.exam ?? ""} onChange={(value) => set("exam", value as QbQuestionFilters["exam"])}>
            <option value="">{t.common.all}</option>
            {QB_ADMIN_EXAMS.map((exam) => (
              <option key={exam} value={exam}>
                {t.exams[exam]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-difficulty`} label={t.list.difficulty} value={draft.difficulty ?? ""} disabled={!draft.exam} onChange={(value) => set("difficulty", value as QbQuestionFilters["difficulty"])}>
            <option value="">{t.common.any}</option>
            {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {t.difficulties[difficulty]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-source`} label={t.list.source} value={draft.sourceKind ?? ""} onChange={(value) => set("sourceKind", value as QbQuestionFilters["sourceKind"])}>
            <option value="">{t.common.all}</option>
            {QB_ADMIN_SOURCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t.sourceKinds[kind]}
              </option>
            ))}
          </FilterSelect>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-year`} className={labelClasses}>
              {t.list.year}
            </label>
            <input
              id={`${id}-year`}
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              value={draft.sourceYear ?? ""}
              onChange={(event) => set("sourceYear", event.target.value === "" ? "" : Number(event.target.value))}
              className={fieldClasses}
            />
          </div>
          <FilterSelect id={`${id}-flag`} label={t.list.flag} value={draft.flag ?? ""} disabled={locked("flag")} onChange={(value) => set("flag", value as QbQuestionFilters["flag"])}>
            <option value="">{t.common.any}</option>
            {QB_ADMIN_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {t.flags[flag]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-flagged`} label={t.list.flagged} value={draft.flagged ?? ""} disabled={locked("flagged")} onChange={(value) => set("flagged", value as QbQuestionFilters["flagged"])}>
            <option value="">{t.common.any}</option>
            <option value="with">{t.list.flaggedWith}</option>
            <option value="blocking">{t.list.flaggedBlocking}</option>
          </FilterSelect>
          <FilterSelect id={`${id}-sort`} label={t.list.sort} value={draft.sort} onChange={(value) => set("sort", value as QbQuestionFilters["sort"])}>
            {QB_QUESTION_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t.list.sorts[sort]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id={`${id}-size`} label={t.list.pageSize} value={String(draft.pageSize)} onChange={(value) => set("pageSize", Number(value))}>
            {QB_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryButton}>
            {t.common.apply}
          </button>
          {activeFilterCount(filters) > Object.keys(fixed ?? {}).length && (
            <button type="button" className={smallButton} onClick={() => apply({ sort: filters.sort, page: 1, pageSize: filters.pageSize })}>
              {t.common.reset}
            </button>
          )}
          {page?.search && <span className="text-xs text-muted">{t.list.searchMode[page.search]}</span>}
        </div>
      </form>

      {list.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {list.error}
        </p>
      )}
      {list.loading && !page && (
        <p role="status" className="text-sm text-muted">
          {t.common.loading}
        </p>
      )}

      {page && page.items.length === 0 && (
        <p className="rounded-card border border-dashed border-line bg-white p-6 text-center text-muted">
          {activeFilterCount(filters) > 0 ? t.list.empty : t.list.emptyBank}
        </p>
      )}

      {page && page.items.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-white shadow-soft">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">{format(t.list.tableCaption, { count: page.total })}</caption>
            <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
              <tr>
                {selectable && (
                  <th scope="col" className="w-12 px-1 py-0">
                    {/* The label pads the 16 px box to a 44 px click target. */}
                    <label className={CHECK_TARGET}>
                      <input
                        type="checkbox"
                        aria-label={t.list.selectAll}
                        checked={allSelected}
                        onChange={(event) => {
                          const next = new Set(selected ?? []);
                          for (const item of ids) {
                            if (event.target.checked) next.add(item);
                            else next.delete(item);
                          }
                          onSelectedChange?.(next);
                        }}
                        className="size-4 accent-navy"
                      />
                    </label>
                  </th>
                )}
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.number}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.question}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.subject}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.status}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.difficulty}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.flags}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.list.columns.updated}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {page.items.map((item) => (
                <tr key={item.id} className="align-top">
                  {selectable && (
                    <td className="px-1 py-0.5">
                      <label className={CHECK_TARGET}>
                        <input
                          type="checkbox"
                          aria-label={t.list.columns.select}
                          aria-describedby={`${id}-row-${item.id}`}
                          checked={selected?.has(item.id) ?? false}
                          onChange={(event) => toggle(item.id, event.target.checked)}
                          className="size-4 accent-navy"
                        />
                      </label>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">{item.n}</td>
                  <td className="max-w-md px-3 py-2.5">
                    <Link id={`${id}-row-${item.id}`} href={localePath(`/admin/questions/${encodeURIComponent(item.id)}`, locale)} className="font-semibold text-navy hover:text-blue hover:underline" lang="en">
                      {item.stemPreview || item.id}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <SourceKindBadge kind={item.sourceKind} t={t} />
                      <span lang="en">{item.sourceLabel}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{t.subjects[item.subject]}</span>
                    <span className="block text-xs text-muted">{chapterName(item.chapterId) ?? t.list.noChapter}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={displayStatus(item)} t={t} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      {item.exams
                        .filter((row) => row.eligible)
                        .map((row) => (
                          <DifficultyBadge key={row.exam} difficulty={row.difficulty} t={t} prefix={t.exams[row.exam]} />
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {sortFlags(item.flags).slice(0, 3).map((flag) => (
                        <FlagChip key={flag} flag={flag} t={t} />
                      ))}
                      {item.flags.length > 3 && <span className="text-xs text-muted">{format(t.list.flagCount, { count: item.flags.length })}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">{formatDateTime(item.updatedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page && page.total > 0 && (
        <nav aria-label={format(t.common.page, { page: page.page, pages })} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {format(t.common.count, { count: page.total })}
            {selectable && selected && selected.size > 0 ? ` · ${format(t.list.selected, { count: selected.size })}` : ""}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" className={smallButton} disabled={page.page <= 1} onClick={() => apply({ ...filters, page: page.page - 1 })}>
              {t.common.previous}
            </button>
            <span>{format(t.common.page, { page: page.page, pages })}</span>
            <button type="button" className={smallButton} disabled={page.page >= pages} onClick={() => apply({ ...filters, page: page.page + 1 })}>
              {t.common.next}
            </button>
          </span>
        </nav>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={fieldClasses}>
        {children}
      </select>
    </div>
  );
}
