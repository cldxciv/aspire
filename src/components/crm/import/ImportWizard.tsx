"use client";

import { CircleStop, FileUp, ListChecks, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { ApiFailure } from "@/lib/auth/client-api";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import type { ImportBatchSummary, ImportPreviewRow, ImportRowResult } from "@/lib/crm/intake/import";
import {
  buildImportRows,
  chunkImportRows,
  mappingIssues,
  type ImportCentreOption,
  type ImportConsentBasis,
  type ImportTarget,
} from "@/lib/crm/intake/rows";
import { crmFailureMessage, sendCrm } from "../api";
import { fieldClasses, labelClasses } from "../client-kit";
import { formatDate, type CrmMessages } from "../format";
import { importRequests } from "./api";
import { ConsentBasisPicker } from "./ConsentBasisPicker";
import { DamageBanner } from "./DamageBanner";
import { ImportProgress } from "./ImportProgress";
import { ImportResultView } from "./ImportResultView";
import { MappingTable } from "./MappingTable";
import type { CrmImportMessages } from "./types";
import {
  areaLabel,
  damageNotice,
  phonesByRow,
  previewTotals,
  problemRows,
  readImportFile,
  resultTotals,
  sha256Hex,
  type FileProblem,
  type ProblemRow,
  type ReadFile,
  type ResultTotals,
} from "./wizard-model";

const PAGE_PATH = "/crm/settings/import";
const MAX_PROBLEMS_SHOWN = 50;

type Phase =
  | { kind: "empty" }
  | { kind: "reading" }
  | { kind: "ready" }
  | { kind: "previewing"; done: number; total: number }
  | { kind: "previewed"; rows: ImportPreviewRow[] }
  /** Creating the batch (the Import button is gone, so a second click cannot start another). */
  | { kind: "starting"; rows: ImportPreviewRow[] }
  /**
   * `running`, or after a failed chunk: `dropped` (the connection failed: Resume re-sends it),
   * `waiting` (429: Resume once the wait is over) or `failed` (refused, or the server failed too
   * often). Every state but `running` offers "Stop and keep what was imported" (finish).
   * `strikes`: server failures of this chunk in a row; `notice`: why it is waiting.
   */
  | {
      kind: "importing";
      batchId: string;
      chunk: number;
      total: number;
      state: ChunkState;
      strikes: number;
      notice?: string;
      /** The last "Stop" (finish) failed too: also offer leaving the batch and starting over. */
      stopFailed?: boolean;
    }
  | { kind: "finishing" }
  /** `stopped`: finished by "Stop" before every chunk was sent. */
  | { kind: "done"; batch: ImportBatchSummary; stopped: boolean };

export type ChunkState = "running" | "dropped" | "waiting" | "failed";

/** Resume is offered this many times in a row for a chunk the server keeps failing; then only Stop. */
export const MAX_SERVER_FAILURES = 3;

/** Localised text for a failed import call (the server's English is never shown). */
export function importFailureMessage(result: ApiFailure, t: CrmImportMessages, crm: Pick<CrmMessages, "errors">): string {
  if (result.error === "not_configured") return t.errors.notConfigured;
  if (result.error === "forbidden") return t.errors.forbidden;
  if (result.status === 409) return t.errors.batchClosed;
  return crmFailureMessage(result, crm);
}

/** A failure worth offering "Resume" for: the request may not have reached the server. */
export function isDroppedConnection(result: ApiFailure): boolean {
  return result.error === "network" || result.error === "server_error" || result.status === 502 || result.status === 504;
}

/** A failure on the server's side (not the viewer's connection): counted towards `MAX_SERVER_FAILURES`. */
function isServerFailure(result: ApiFailure): boolean {
  return result.error !== "network" && isDroppedConnection(result);
}

/**
 * What the wizard offers after a chunk (or the finish call) failed. `strikes` = server failures of
 * this chunk in a row, this one included.
 * - 429 (the 400-an-hour import limit or the CRM write limit): `waiting`, Resume after the wait;
 * - a dropped connection: `dropped`, Resume; a chunk the server failed `MAX_SERVER_FAILURES` times:
 *   `failed` (a row that always fails would otherwise offer Resume forever);
 * - anything else (403, 409, 422 …): `failed`.
 */
export function chunkFailureState(result: ApiFailure, strikes: number): Exclude<ChunkState, "running"> {
  if (result.status === 429 || result.error === "rate_limited") return "waiting";
  if (!isDroppedConnection(result)) return "failed";
  return isServerFailure(result) && strikes >= MAX_SERVER_FAILURES ? "failed" : "dropped";
}

/**
 * "Import leads" (super admin): choose a CSV → check the columns → choose the consent basis →
 * dry run (masked) → import in chunks of ≤ 250 rows / 256 KB, each its own transaction, with
 * Resume after a dropped connection → result with the lost families to check by hand.
 */
export function ImportWizard({
  centres,
  areaNames,
  previousFiles,
  t,
  crm,
}: {
  centres: readonly ImportCentreOption[];
  /** Area id → name in the page's locale (ids are shown when missing). */
  areaNames: Readonly<Record<string, string>>;
  /** sha256 → when it was imported, for the "same file" warning. */
  previousFiles: Readonly<Record<string, string>>;
  t: CrmImportMessages;
  crm: Pick<CrmMessages, "errors">;
}) {
  const router = useRouter();
  const locale = useLocale();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "empty" });
  const [file, setFile] = useState<(ReadFile & { name: string; sha256: string | null }) | null>(null);
  const [problem, setProblem] = useState<FileProblem | null>(null);
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [basis, setBasis] = useState<ImportConsentBasis | null>(null);
  const [startClock, setStartClock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triedPreview, setTriedPreview] = useState(false);
  const [results, setResults] = useState<ImportRowResult[]>([]);

  const built = useMemo(() => (file ? buildImportRows(file.header, file.rows, mapping, { centres, encoding: file.encoding }) : null), [file, mapping, centres]);
  const chunks = useMemo(() => (built ? chunkImportRows(built.rows) : []), [built]);
  /** Rows sent before each chunk: the server uses it to recognise a re-sent chunk. */
  const offsets = useMemo(() => chunks.map((_, index) => chunks.slice(0, index).reduce((sum, chunk) => sum + chunk.length, 0)), [chunks]);
  const phones = useMemo(() => phonesByRow(built?.rows ?? []), [built]);
  const starting = useRef(false);
  const issues = mappingIssues(mapping);
  const busy =
    phase.kind === "reading" || phase.kind === "previewing" || phase.kind === "starting" || phase.kind === "importing" || phase.kind === "finishing";
  const locked = busy || phase.kind === "done";

  // WCAG 2.4.3: the button that was pressed (Check, Import, Resume, Stop, Import another file)
  // leaves the page or is disabled when the step moves on, so focus goes where the outcome appears
  // instead of falling to <body>: the summary after a check, the import step while importing, and
  // the file input when the wizard starts over or a file was just read.
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const shownKind = useRef<Phase["kind"]>(phase.kind);
  useEffect(() => {
    const before = shownKind.current;
    shownKind.current = phase.kind;
    if (before === phase.kind) return;
    if (phase.kind === "previewed") summaryHeading.current?.focus();
    else if (phase.kind === "previewing" || phase.kind === "starting" || phase.kind === "done") stepHeading.current?.focus();
    else if (!document.activeElement || document.activeElement === document.body) {
      (phase.kind === "empty" || phase.kind === "ready" ? fileInput : stepHeading).current?.focus();
    }
  }, [phase.kind]);

  const fail = useCallback(
    (result: ApiFailure) => {
      if (result.error === "unauthenticated") window.location.assign(buildLoginHref(PAGE_PATH, locale));
      else if (result.known === "passwordChangeRequired") window.location.assign(buildChangePasswordHref(locale, PAGE_PATH));
      setError(importFailureMessage(result, t, crm));
    },
    [crm, locale, t],
  );

  const reset = useCallback(() => {
    setPhase({ kind: "empty" });
    setFile(null);
    setProblem(null);
    setMapping([]);
    setBasis(null);
    setStartClock(true);
    setError(null);
    setTriedPreview(false);
    setResults([]);
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError(null);
    setProblem(null);
    setFile(null);
    setResults([]);
    setPhase({ kind: "reading" });
    try {
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      const read = readImportFile(bytes);
      if (!read.ok) {
        setProblem(read.problem);
        setPhase({ kind: "empty" });
        return;
      }
      setFile({ ...read.file, name: chosen.name, sha256: await sha256Hex(bytes) });
      setMapping(read.file.mapping);
      setPhase({ kind: "ready" });
    } catch {
      setError(t.errors.readFailed);
      setPhase({ kind: "empty" });
    }
  }

  function changeMapping(column: number, target: ImportTarget) {
    setMapping((current) => current.map((value, index) => (index === column ? target : value)));
    setPhase({ kind: "ready" });
  }

  function changeBasis(next: ImportConsentBasis) {
    setBasis(next);
    if (phase.kind === "previewed") setPhase({ kind: "ready" });
  }

  async function runPreview() {
    setTriedPreview(true);
    setError(null);
    if (!built || basis === null || issues.length > 0 || chunks.length === 0) return;
    const collected: ImportPreviewRow[] = [];
    for (let index = 0; index < chunks.length; index++) {
      setPhase({ kind: "previewing", done: index, total: chunks.length });
      const result = await sendCrm<{ rows: ImportPreviewRow[] }>(importRequests.preview(chunks[index], basis));
      if (!result.ok) {
        fail(result);
        setPhase({ kind: "ready" });
        return;
      }
      collected.push(...result.data.rows);
    }
    setPhase({ kind: "previewed", rows: collected });
  }

  /** A chunk (or the finish call, `chunk === total`) failed: pause with Resume, or stop with Stop only. */
  function paused(batchId: string, chunk: number, result: ApiFailure, strikesBefore: number) {
    const strikes = strikesBefore + (isServerFailure(result) ? 1 : 0);
    const state = chunkFailureState(result, strikes);
    if (state === "failed") fail(result);
    const notice = state === "waiting" ? crmFailureMessage(result, crm) : undefined;
    setPhase({ kind: "importing", batchId, chunk, total: chunks.length, state, strikes, notice });
  }

  async function sendChunks(batchId: string, from: number, acc: ImportRowResult[], strikesBefore = 0) {
    const collected = [...acc];
    for (let index = from; index < chunks.length; index++) {
      setPhase({ kind: "importing", batchId, chunk: index, total: chunks.length, state: "running", strikes: 0 });
      const result = await sendCrm<{ results: ImportRowResult[]; batch: ImportBatchSummary }>(importRequests.rows(batchId, chunks[index], offsets[index]));
      if (!result.ok) {
        setResults(collected);
        paused(batchId, index, result, index === from ? strikesBefore : 0);
        return;
      }
      collected.push(...result.data.results);
    }
    setResults(collected);
    setPhase({ kind: "finishing" });
    const finished = await sendCrm<ImportBatchSummary>(importRequests.finish(batchId));
    if (!finished.ok) {
      paused(batchId, chunks.length, finished, from === chunks.length ? strikesBefore : 0);
      return;
    }
    setPhase({ kind: "done", batch: finished.data, stopped: false });
    router.refresh();
  }

  async function runImport() {
    setError(null);
    if (starting.current || phase.kind !== "previewed" || !built || !file || basis === null || chunks.length === 0) return;
    starting.current = true;
    const checked = phase.rows;
    setPhase({ kind: "starting", rows: checked });
    try {
      const started = await sendCrm<ImportBatchSummary>(
        importRequests.start({ consentBasis: basis, startClock, rowsTotal: Math.max(1, built.rows.length), fileName: file.name, fileSha256: file.sha256 }),
      );
      if (!started.ok) {
        fail(started);
        setPhase({ kind: "previewed", rows: checked });
        return;
      }
      await sendChunks(started.data.id, 0, []);
    } finally {
      starting.current = false;
    }
  }

  async function resume() {
    if (phase.kind !== "importing" || phase.state === "running") return;
    setError(null);
    await sendChunks(phase.batchId, phase.chunk, results, phase.strikes);
  }

  /**
   * "Stop and keep what was imported": closes the batch (`finish`), so its counts are audited and
   * the history shows it finished. Rows not sent yet are simply not imported.
   */
  async function stop() {
    if (phase.kind !== "importing" || phase.state === "running") return;
    const before = phase;
    setError(null);
    setPhase({ kind: "finishing" });
    const finished = await sendCrm<ImportBatchSummary>(importRequests.finish(before.batchId));
    if (!finished.ok) {
      fail(finished);
      setPhase({ ...before, stopFailed: true });
      return;
    }
    setPhase({ kind: "done", batch: finished.data, stopped: before.chunk < before.total });
    router.refresh();
  }

  const notice = built ? damageNotice(built.rows) : null;
  const preview = phase.kind === "previewed" ? previewTotals(phase.rows, built?.local ?? [], phones) : null;
  const problems = phase.kind === "previewed" ? problemRows(phase.rows, built?.local ?? []) : [];
  const sameFile = file?.sha256 ? previousFiles[file.sha256] : undefined;
  const doneTotals = phase.kind === "done" ? resultTotals(phase.batch, results, built?.local ?? []) : null;
  const announcement = importAnnouncement(t, preview && { ...preview.counts, problems: problems.length }, doneTotals);

  return (
    <div className="space-y-5">
      {/* 1. File */}
      <section aria-labelledby="import-step-file" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
        <h2 id="import-step-file" className="text-lg font-extrabold text-navy">
          {t.steps.file}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.file.hint}</p>
        <Notice variant="warning" role="note" className="mt-3">
          {t.file.excelTip}
        </Notice>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={inputId} className={labelClasses}>
            {t.file.label}
          </label>
          <input
            ref={fileInput}
            id={inputId}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            disabled={busy}
            onChange={choose}
            className={`${fieldClasses} file:mr-3 file:rounded-md file:border-0 file:bg-[#edf4ff] file:px-3 file:py-1.5 file:font-bold file:text-navy`}
          />
        </div>
        {phase.kind === "reading" && (
          <p role="status" className="mt-2 text-sm font-semibold text-navy">
            {t.file.reading}
          </p>
        )}
        {problem && (
          <p role="alert" className="mt-2 text-sm font-semibold text-danger">
            {fileProblemText(problem, t)}
          </p>
        )}
        {file && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm font-semibold text-navy">
            <FileUp aria-hidden="true" className="size-4" />
            {format(t.file.summary, { rows: file.rows.length, columns: file.header.length, encoding: t.file.encodings[file.encoding] })}
          </p>
        )}
        {sameFile && (
          <Notice variant="info" role="note" className="mt-3">
            {format(t.file.sameFile, { date: formatDate(sameFile, locale) ?? sameFile })}
          </Notice>
        )}
        {file && built && notice && (
          <div className="mt-3">
            <DamageBanner notice={notice} garbledAnswers={built.garbledAnswers} warnings={file.warnings} t={t} />
          </div>
        )}
      </section>

      {file && (
        <>
          {/* 2. Columns */}
          <section aria-labelledby="import-step-mapping" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
            <h2 id="import-step-mapping" className="mb-2 text-lg font-extrabold text-navy">
              {t.steps.mapping}
            </h2>
            <MappingTable header={file.header} rows={file.rows} mapping={mapping} onChange={changeMapping} disabled={locked} t={t} />
          </section>

          {/* 3. Consent */}
          <section aria-labelledby="import-step-consent" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
            <h2 id="import-step-consent" className="mb-3 text-lg font-extrabold text-navy">
              {t.steps.consent}
            </h2>
            <ConsentBasisPicker
              basis={basis}
              startClock={startClock}
              onBasis={changeBasis}
              onStartClock={setStartClock}
              disabled={locked}
              showRequired={triedPreview}
              t={t}
            />
          </section>

          {/* 4. Preview + 5. Import */}
          <section aria-labelledby="import-step-preview" className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
            <h2 id="import-step-preview" ref={stepHeading} tabIndex={-1} className="mb-3 text-lg font-extrabold text-navy outline-none">
              {phase.kind === "starting" || phase.kind === "importing" || phase.kind === "finishing" || phase.kind === "done" ? t.steps.import : t.steps.preview}
            </h2>
            {/* WCAG 4.1.3: always in the page, so the end of the check and of the import is announced. */}
            <p role="status" className="sr-only">
              {announcement}
            </p>

            {(phase.kind === "ready" || phase.kind === "previewed") && (
              <Button variant={phase.kind === "previewed" ? "outline" : "dark"} onClick={runPreview} disabled={issues.length > 0 || chunks.length === 0}>
                <ListChecks aria-hidden="true" className="size-4" />
                {phase.kind === "previewed" ? t.preview.recheck : t.preview.check}
              </Button>
            )}
            {phase.kind === "previewing" && <ImportProgress label={t.preview.checking} done={phase.done} total={phase.total} t={t} />}
            {phase.kind === "starting" && <ImportProgress label={t.run.importing} done={0} total={chunks.length} t={t} />}

            {preview && (
              <div className="mt-4 space-y-4">
                <h3 ref={summaryHeading} tabIndex={-1} className="font-extrabold text-navy outline-none">
                  {t.preview.summaryTitle}
                </h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(t.preview.counts) as (keyof typeof t.preview.counts)[])
                    .filter((key) => key === "created" || preview.counts[key] > 0)
                    .filter((key) => key !== "unknownPlace" || preview.placeChecked)
                    .map((key) => (
                      <div key={key} className="flex items-baseline justify-between gap-3 rounded-control border border-line px-3 py-2">
                        <dt className="text-sm text-muted">{t.preview.counts[key]}</dt>
                        <dd className="text-lg font-extrabold tabular-nums text-navy">{preview.counts[key]}</dd>
                      </div>
                    ))}
                </dl>
                {preview.placeChecked ? (
                  preview.byArea.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-navy">{t.preview.areasTitle}</h4>
                      <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                        {preview.byArea.map((item) => (
                          <li key={item.areaId || "none"} className="rounded-md bg-surface px-2 py-1">
                            {areaLabel(item.areaId, areaNames, t.preview.noArea)}: <strong className="tabular-nums">{item.count}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted">{t.preview.placeNotChecked}</p>
                )}
                {problems.length > 0 && <ProblemTable problems={problems} t={t} />}
                {preview.importable === 0 ? (
                  <p className="text-sm font-semibold text-navy">{t.preview.nothingToImport}</p>
                ) : (
                  <Button onClick={runImport} disabled={basis === null}>
                    <Upload aria-hidden="true" className="size-4" />
                    {format(t.run.import, { count: built?.rows.length ?? 0 })}
                  </Button>
                )}
              </div>
            )}

            {phase.kind === "importing" && phase.state !== "failed" && (
              <ImportProgress
                label={t.run.importing}
                done={phase.chunk}
                total={phase.total}
                dropped={phase.state !== "running"}
                droppedText={phase.notice}
                onResume={resume}
                t={t}
              />
            )}
            {phase.kind === "importing" && phase.state === "failed" && <p className="text-sm text-navy">{t.run.failed}</p>}
            {phase.kind === "importing" && phase.state !== "running" && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant={phase.state === "failed" ? "dark" : "outline"} onClick={stop}>
                  <CircleStop aria-hidden="true" className="size-4" />
                  {t.run.stop}
                </Button>
                {phase.stopFailed && (
                  <Button variant="outline" onClick={reset}>
                    {t.result.another}
                  </Button>
                )}
              </div>
            )}
            {phase.kind === "finishing" && (
              <p role="status" className="text-sm font-semibold text-navy">
                {t.run.finishing}
              </p>
            )}
            {phase.kind === "done" && (
              <div className="space-y-4">
                {phase.stopped && (
                  <Notice variant="warning" role="note">
                    {t.result.stopped}
                  </Notice>
                )}
                <ImportResultView totals={resultTotals(phase.batch, results, built?.local ?? [])} startClock={phase.batch.startClock} locale={locale} t={t} />
                <Button variant="outline" onClick={reset}>
                  {t.result.another}
                </Button>
              </div>
            )}
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {error ?? ""}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/** What the wizard's status region says when the check or the import ends (WCAG 4.1.3); "" otherwise. */
export function importAnnouncement(
  t: CrmImportMessages,
  checked: { created: number; attached: number; problems: number } | null,
  done: Pick<ResultTotals, "created" | "attached" | "skipped" | "invalid"> | null,
): string {
  if (done) return format(t.result.announce, { created: done.created, attached: done.attached, skipped: done.skipped, invalid: done.invalid });
  if (checked) return format(t.preview.announce, { created: checked.created, attached: checked.attached, problems: checked.problems });
  return "";
}

function fileProblemText(problem: FileProblem, t: CrmImportMessages): string {
  if (problem.kind === "too_big") return t.file.tooBig;
  if (problem.kind === "xlsx") return t.file.xlsx;
  return format(t.file.issues[problem.issue], { row: problem.row ?? "" });
}

function ProblemTable({ problems, t }: { problems: readonly ProblemRow[]; t: CrmImportMessages }) {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN);
  return (
    <div>
      <h4 className="text-sm font-bold text-navy">{t.preview.problemsTitle}</h4>
      <div role="region" aria-label={t.preview.problemsTitle} tabIndex={0} className="mt-1 max-h-72 overflow-auto rounded-control border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#354b66]">
            <tr>
              <th scope="col" className="px-3 py-2 font-bold">
                {t.preview.row}
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                {t.preview.phone}
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                {t.preview.problem}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((item) => (
              <tr key={item.row}>
                <td className="px-3 py-1.5 tabular-nums">{item.row}</td>
                <td className="px-3 py-1.5 tabular-nums text-muted">{item.phoneMasked ?? "—"}</td>
                <td className="px-3 py-1.5">{t.statuses[item.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problems.length > shown.length && <p className="mt-1 text-xs text-muted">{format(t.preview.more, { count: problems.length - shown.length })}</p>}
    </div>
  );
}
