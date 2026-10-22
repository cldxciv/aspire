"use client";

import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import type { QbExam, QbSubject } from "@/lib/qb/types";
import { qbRequests, type QbMessages } from "./api";
import { SelectField, useQbData } from "./client-kit";
import { QB_ADMIN_DIFFICULTIES, QB_ADMIN_EXAMS, QB_ADMIN_SUBJECTS } from "./constants";
import type { QbCoverage } from "./contract";
import { formatShare, optionLetter, positionShares } from "./format";
import { QbPanel } from "./QbBlocks";

const PAGE = "/admin/questions/coverage";

/**
 * Coverage (§B14 package 7): approved questions per chapter and difficulty for one exam, drafts
 * and in-review counts, the figure backlog with per-chapter alerts, and the correct-answer
 * position distribution per source kind (R24: shuffling is phase 2; this shows any skew).
 */
export function CoverageView({ t, locale, initialExam }: { t: QbMessages; locale: Locale; initialExam: QbExam }) {
  const id = useId();
  const [exam, setExam] = useState<QbExam>(initialExam);
  const [subject, setSubject] = useState<QbSubject | "">("");
  const data = useQbData<QbCoverage>(qbRequests.coverage(exam, subject || undefined), t, PAGE);
  const c = t.coverage;
  const coverage = data.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField<QbExam>
          id={`${id}-exam`}
          label={c.exam}
          value={exam}
          options={QB_ADMIN_EXAMS.map((value) => ({ value, label: t.exams[value] }))}
          onChange={(next) => {
            setExam(next);
            window.history.replaceState(null, "", localePath(`${PAGE}?exam=${next}`, locale));
          }}
        />
        <SelectField<QbSubject | "">
          id={`${id}-subject`}
          label={c.subject}
          value={subject}
          options={[{ value: "", label: t.common.all }, ...QB_ADMIN_SUBJECTS.map((value) => ({ value, label: t.subjects[value] }))]}
          onChange={setSubject}
        />
      </div>
      {data.error && <p role="alert" className="font-semibold text-danger">{data.error}</p>}
      {!coverage && !data.error && <p role="status" className="text-muted">{t.common.loading}</p>}
      {coverage && (
        <>
          <p className="font-semibold text-navy">{format(c.totals, coverage.totals)}</p>

          <QbPanel id={`${id}-figures`} title={c.figureAlertsTitle}>
            {coverage.figureAlerts.length === 0 ? (
              <p className="text-sm text-muted">{c.figureAlertsNone}</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {coverage.figureAlerts.map((alert) => (
                  <li key={alert.chapterId}>
                    {format(c.figureAlert, { chapter: locale === "hi" && alert.label.hi ? alert.label.hi : alert.label.en, count: alert.waiting })}
                  </li>
                ))}
              </ul>
            )}
          </QbPanel>

          {coverage.subjects.length === 0 && <p className="text-muted">{c.empty}</p>}
          {coverage.subjects.map((block) => (
            <QbPanel key={block.subject} id={`${id}-${block.subject}`} title={t.subjects[block.subject]}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-surface text-xs uppercase tracking-wide text-[#354b66]">
                    <tr>
                      <th scope="col" className="px-2 py-2">{c.columns.chapter}</th>
                      {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
                        <th key={difficulty} scope="col" className="px-2 py-2">
                          {c.columns[difficulty]}
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2">{c.columns.inReview}</th>
                      <th scope="col" className="px-2 py-2">{c.columns.drafts}</th>
                      <th scope="col" className="px-2 py-2">{c.columns.figures}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {block.chapters.map((chapter) => {
                      const approved = QB_ADMIN_DIFFICULTIES.reduce((sum, difficulty) => sum + chapter.approved[difficulty], 0);
                      return (
                        <tr key={chapter.chapterId} className={approved === 0 ? "bg-[#fffaf0]" : undefined}>
                          <th scope="row" className="px-2 py-1.5 font-semibold">
                            {locale === "hi" && chapter.label.hi ? chapter.label.hi : chapter.label.en}
                            <span className="block text-xs font-normal text-muted">{t.levels[chapter.level]}</span>
                          </th>
                          {QB_ADMIN_DIFFICULTIES.map((difficulty) => (
                            <td key={difficulty} className={chapter.approved[difficulty] === 0 ? "px-2 py-1.5 text-muted" : "px-2 py-1.5"}>
                              {chapter.approved[difficulty]}
                            </td>
                          ))}
                          <td className="px-2 py-1.5">{chapter.inReview}</td>
                          <td className="px-2 py-1.5">{chapter.drafts}</td>
                          <td className={chapter.figureBacklog > 0 ? "px-2 py-1.5 font-semibold text-[#7a5600]" : "px-2 py-1.5"}>{chapter.figureBacklog}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </QbPanel>
          ))}

          <QbPanel id={`${id}-positions`} title={c.positionsTitle} description={c.positionsLead}>
            <ul className="space-y-3 text-sm">
              {coverage.answerPositions.map((row) => {
                const shares = positionShares(row.counts, row.total);
                return (
                  <li key={row.sourceKind}>
                    <p className="font-semibold">{format(c.positionsRow, { source: t.sourceKinds[row.sourceKind], total: row.total })}</p>
                    <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {shares.map((share, index) => (
                        <div key={index} className="rounded-control border border-line px-2 py-1">
                          <dt className="text-xs font-bold text-muted">{optionLetter(index)}</dt>
                          <dd>
                            {formatShare(share, locale)} <span className="text-xs text-muted">({row.counts[index]})</span>
                          </dd>
                          <div aria-hidden="true" className="mt-1 h-1.5 rounded bg-surface">
                            <div className="h-1.5 rounded bg-navy" style={{ width: `${Math.round(share * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </QbPanel>
        </>
      )}
    </div>
  );
}
