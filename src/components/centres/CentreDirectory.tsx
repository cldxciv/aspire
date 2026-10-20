"use client";

import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { EXAM_ORDER, trackLabel } from "@/components/programs/exam-meta";
import { Button, EmptyState, Notice } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { Centre, ExamTrack, ImageAsset } from "@/lib/types";
import { CentreCard, type CentreCardMessages } from "./CentreCard";

/** Copy the directory reads: `centres.directory` plus the card copy. */
export type CentreDirectoryMessages = CentreCardMessages & { directory: Messages<"centres">["directory"] };

const controlClass =
  "min-h-11 w-full rounded-control border border-[#d8e2ef] bg-white text-sm text-ink focus:border-blue";

function matches(centre: Centre, query: string, exam: ExamTrack | "", extra = ""): boolean {
  const q = query.trim().toLowerCase();
  const text = [centre.name, centre.district, centre.label, centre.address, ...(centre.servesDistricts ?? []), extra]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (!q || text.includes(q)) && (!exam || centre.programs.includes(exam));
}

/**
 * Centre search (name / district / districts served / address) + program filter
 * over the server-provided list. The program filter only appears once at least
 * one centre lists its programs. Filtering happens in the browser; nothing is fetched.
 */
export function CentreDirectory({
  centres,
  hostelSlugs = [],
  searchExtra = {},
  photos = {},
  messages,
}: {
  centres: Centre[];
  /** Centres with published hostel details: their cards link to /hostels#hostel-<slug>. */
  hostelSlugs?: string[];
  /**
   * Extra searchable text per centre slug. On Hindi pages the server passes the English name,
   * district, label and districts served, so Latin queries ("Mandi", "Shimla") still match.
   */
  searchExtra?: Record<string, string>;
  /** Stock education photo per centre slug (server-localised alt), shown in the card (D-030 / D-031). */
  photos?: Record<string, ImageAsset>;
  messages: CentreDirectoryMessages;
}) {
  const locale = useLocale();
  const t = messages.directory;
  const [query, setQuery] = useState("");
  const [exam, setExam] = useState<ExamTrack | "">("");
  const searchId = useId();
  const programId = useId();
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const programsListed = centres.some((c) => c.programs.length > 0);
  const examOptions = EXAM_ORDER.filter((e) => centres.some((c) => c.programs.includes(e)));
  const activeExam = programsListed ? exam : "";
  const filtered = centres.filter((c) => matches(c, query, activeExam, searchExtra[c.slug]));
  const filtersActive = query.trim() !== "" || activeExam !== "";
  const hasPlaceholders = centres.some((c) => c.status === "placeholder");

  // The "Clear filters" button unmounts with the empty state, so move focus to the search box.
  const reset = () => {
    setQuery("");
    setExam("");
    searchRef.current?.focus();
  };

  return (
    <div>
      <form
        role="search"
        aria-label={t.formLabel}
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor={searchId} className="mb-1 block text-xs font-bold text-[#354b66]">
            {t.searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              aria-controls={listId}
              className={`${controlClass} pl-9 pr-3`}
            />
          </div>
        </div>
        {programsListed && (
          <div className="sm:w-52">
            <label htmlFor={programId} className="mb-1 block text-xs font-bold text-[#354b66]">
              {t.programLabel}
            </label>
            <select
              id={programId}
              value={exam}
              onChange={(e) => setExam(e.target.value as ExamTrack | "")}
              aria-controls={listId}
              className={`${controlClass} px-3`}
            >
              <option value="">{t.allPrograms}</option>
              {examOptions.map((e) => (
                <option key={e} value={e}>
                  {trackLabel(e, messages.tracks)}
                </option>
              ))}
            </select>
          </div>
        )}
        {filtersActive && (
          <Button variant="outline" onClick={reset}>
            {t.clear}
          </Button>
        )}
      </form>

      <p role="status" className="mb-6 mt-4 text-sm text-muted">
        {filtered.length === 1 ? t.showingOne : format(t.showingMany, { count: filtered.length })}
        {query.trim() !== "" && ` ${format(t.matching, { query: query.trim() })}`}
      </p>

      {hasPlaceholders && (
        <Notice className="mb-8">
          {t.demoNotice}
          {!programsListed && ` ${t.programsUnlisted}`}
        </Notice>
      )}

      {filtered.length > 0 ? (
        <ul id={listId} className="space-y-8 md:space-y-10">
          {filtered.map((centre, index) => (
            <li key={centre.id}>
              <CentreCard
                centre={centre}
                hostelHref={hostelSlugs.includes(centre.slug) ? `/hostels#hostel-${centre.slug}` : undefined}
                photo={photos[centre.slug]}
                photoSide={index % 2 === 0 ? "left" : "right"}
                t={messages}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div id={listId}>
          <EmptyState
            title={t.noMatchTitle}
            description={t.noMatchBody}
            action={
              <Button variant="outline" onClick={reset}>
                {t.clearFilters}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
