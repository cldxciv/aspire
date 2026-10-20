"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, useState, type DragEvent, type FormEvent } from "react";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { LEAD_STAGES, type LeadStage } from "@/lib/crm/types";
import { ActionFeedback, fieldClasses, useCrmAction } from "./client-kit";
import { withBack } from "./format";
import { LostReasonDialog, type LeadIslandMessages } from "./LeadActions";
import { needsLostReason, stageChangeRequest } from "./lead-forms";
import type { LeadCard } from "./types";

export type PipelineColumn = { stage: LeadStage; total: number; cards: LeadCard[] };

export type PipelineMessages = LeadIslandMessages & { pipeline: Messages<"crm">["pipeline"] };

const PAGE_PATH = "/crm/pipeline";

/**
 * Kanban by stage. Every card has a keyboard-friendly "Move to stage" select + button; moving to
 * Lost opens the lost-reason dialog. Mouse users may also drag a card onto another column. Cards
 * carry only the last four phone digits (no full numbers in the browser).
 */
export function PipelineBoard({
  columns,
  inboxQuery,
  t,
}: {
  columns: PipelineColumn[];
  /** Current filters as an inbox query string ("?centre=…"), for the "see all" links. */
  inboxQuery: string;
  t: PipelineMessages;
}) {
  const locale = useLocale();
  const action = useCrmAction(t, PAGE_PATH);
  const [lost, setLost] = useState<LeadCard | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<LeadStage | null>(null);
  const [lostStatus, setLostStatus] = useState("");
  const byId = new Map(columns.flatMap((column) => column.cards.map((card) => [card.id, card] as const)));

  async function move(card: LeadCard, stage: LeadStage) {
    if (card.stage === stage) return;
    setLostStatus("");
    if (needsLostReason(card.stage, stage)) {
      action.reset();
      setLost(card);
      return;
    }
    const built = stageChangeRequest(card.id, stage);
    if (!built.ok) return;
    await action.run(built.request, format(t.pipeline.moved, { name: card.name, stage: t.stages[stage] }));
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: LeadStage) {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData("text/x-crm-lead") || dragging;
    setDragging(null);
    const card = id ? byId.get(id) : undefined;
    if (card) void move(card, stage);
  }

  return (
    <div>
      <ActionFeedback status={action.status} error={action.error} className="mb-3" />
      <p className="mb-3 hidden text-xs text-muted md:block">{t.pipeline.dragHint}</p>
      <div
        role="region"
        aria-label={format(t.pipeline.boardLabel, { count: columns.length })}
        tabIndex={0}
        className="relative flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-3"
      >
        {columns.map((column) => {
          const headingId = `crm-col-${column.stage}`;
          return (
            <section
              key={column.stage}
              aria-labelledby={headingId}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setDropTarget(column.stage);
              }}
              onDragLeave={() => setDropTarget((current) => (current === column.stage ? null : current))}
              onDrop={(event) => onDrop(event, column.stage)}
              className={cn(
                "flex min-w-0 flex-col rounded-card border border-line bg-[#f8fafc] p-3 md:w-72 md:shrink-0",
                dropTarget === column.stage && "border-[#7c5cd6] bg-[#f3eeff]",
              )}
            >
              <h2 id={headingId} className="mb-3 flex items-center justify-between gap-2 text-sm font-extrabold text-navy">
                <span>{t.stages[column.stage]}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted ring-1 ring-line">
                  <span className="sr-only">{format(t.pipeline.columnCount, { count: column.total })}</span>
                  <span aria-hidden="true">{column.total}</span>
                </span>
              </h2>
              {column.cards.length === 0 ? (
                <p className="rounded-control border border-dashed border-[#cbd8e7] p-3 text-center text-xs text-muted">
                  {t.pipeline.columnEmpty}
                </p>
              ) : (
                <ul className="space-y-2">
                  {column.cards.map((card) => (
                    <PipelineCard
                      key={card.id}
                      card={card}
                      t={t}
                      locale={locale}
                      back={`${PAGE_PATH}${inboxQuery}`}
                      busy={action.pending}
                      dragging={dragging === card.id}
                      onMove={(stage) => move(card, stage)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/x-crm-lead", card.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(card.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                    />
                  ))}
                </ul>
              )}
              {column.total > column.cards.length && (
                <Link
                  href={`${localePath("/crm", locale)}${withStage(inboxQuery, column.stage)}`}
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-blue hover:underline"
                >
                  {format(t.pipeline.moreInInbox, { count: column.total })}
                </Link>
              )}
            </section>
          );
        })}
      </div>
      <LostReasonDialog
        open={lost !== null}
        leadId={lost?.id ?? ""}
        leadName={lost?.name}
        t={t}
        pagePath={PAGE_PATH}
        onClose={() => setLost(null)}
        onDone={(message) => {
          setLost(null);
          action.reset();
          setLostStatus(message);
        }}
      />
      <p role="status" className="mt-2 text-sm font-semibold text-success">
        {lostStatus}
      </p>
    </div>
  );
}

/** Adds `stage=` to an inbox query string. */
export function withStage(query: string, stage: LeadStage): string {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  params.set("stage", stage);
  return `?${params.toString()}`;
}

function PipelineCard({
  card,
  t,
  locale,
  back,
  busy,
  dragging,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  card: LeadCard;
  t: PipelineMessages;
  locale: ReturnType<typeof useLocale>;
  /** LOCALE-FREE pipeline path + filters, so the lead's "Back" returns here. */
  back: string;
  busy: boolean;
  dragging: boolean;
  onMove: (stage: LeadStage) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<LeadStage>(card.stage);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMove(choice);
  }

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn("rounded-control border border-line bg-white p-3 shadow-soft", dragging && "opacity-60")}
    >
      <h3 className="break-words text-sm font-bold">
        <Link href={withBack(localePath(`/crm/leads/${encodeURIComponent(card.id)}`, locale), back)} className="text-blue hover:underline">
          {card.name}
        </Link>
      </h3>
      {(card.classProgram || card.centre) && (
        <p className="mt-1 text-xs text-muted">{[card.classProgram, card.centre].filter(Boolean).join(" · ")}</p>
      )}
      <p className="mt-1 text-xs text-[#354b66]">{card.assignee ?? t.common.unassigned}</p>
      {card.overdue && <p className="mt-1 text-xs font-bold text-[#8b5b00]">{t.common.overdue}</p>}
      <form onSubmit={submit} className="mt-2 flex items-end gap-1.5">
        <label htmlFor={`${id}-move`} className="sr-only">
          {format(t.pipeline.moveLabel, { name: card.name })}
        </label>
        <select
          id={`${id}-move`}
          value={choice}
          onChange={(event) => setChoice(event.target.value as LeadStage)}
          className={cn(fieldClasses, "min-h-9 py-1 text-sm")}
        >
          {LEAD_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {t.stages[stage]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || choice === card.stage}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-control bg-navy px-3 text-xs font-bold text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {busy && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
          {t.pipeline.move}
        </button>
      </form>
    </li>
  );
}
