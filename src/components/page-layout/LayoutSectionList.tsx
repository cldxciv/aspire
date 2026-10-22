import { ArrowDown, ArrowUp, Lock } from "lucide-react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pinnedLastKey, type LayoutPageKey } from "@/lib/page-layout/registry";
import type { StoredEntry } from "@/lib/page-layout/types";

import {
  isVisibleReason,
  moveBlock,
  positionOf,
  reasonText,
  toggleBlock,
  totalRows,
  type BlockReason,
  type MoveDirection,
} from "./editor-model";
import { fill, sectionHint, sectionLabel, type LayoutMessages } from "./labels";

/**
 * The page's sections, top to bottom (docs/page-layout-plan.md §10.4, D14). Fixed rows (the hero
 * and the pinned-last band) have no controls. Movable rows get Move up / Move down buttons and a
 * "Show on page" checkbox; blocked controls stay focusable with `aria-disabled="true"` (never
 * `disabled`) and point at their reason with `aria-describedby`. No drag anywhere (WCAG 2.5.7).
 * Read-only (`canEdit` false): the order and the "Hidden" badges only.
 */

/** 44 × 44 px icon button. */
const MOVE_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-[#b9cbe0] bg-white text-navy " +
  "transition hover:border-blue aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-surface " +
  "aria-disabled:text-[#8a99ad] aria-disabled:hover:border-line";

export type SectionListProps = {
  page: LayoutPageKey;
  entries: readonly StoredEntry[];
  canEdit: boolean;
  t: LayoutMessages;
  /** Unique id prefix (useId). */
  idPrefix: string;
  headingId: string;
  onMove?: (index: number, direction: MoveDirection) => void;
  onToggle?: (index: number) => void;
  /** Registers a control for focus restoring, keyed `${key}:up` / `${key}:down` / `${key}:show`. */
  registerControl?: (name: string, element: HTMLElement | null) => void;
};

function Position({ n, t }: { n: number; t: LayoutMessages }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-extrabold text-navy"
      >
        {n}
      </span>
      <span className="sr-only">{fill(t.row.position, { n })}</span>
    </>
  );
}

function FixedRow({ n, label, note, t }: { n: number; label: string; note: string; t: LayoutMessages }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <Position n={n} t={t} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-bold text-navy">{label}</p>
      </div>
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Lock aria-hidden="true" className="size-4" />
        {note}
      </p>
    </li>
  );
}

export function LayoutSectionList({
  page,
  entries,
  canEdit,
  t,
  idPrefix,
  headingId,
  onMove,
  onToggle,
  registerControl,
}: SectionListProps) {
  const last = pinnedLastKey(page);
  return (
    <ol aria-labelledby={headingId} className="divide-y divide-line rounded-card border border-line bg-white shadow-soft">
      <FixedRow n={1} label={sectionLabel(t, page, "hero")} note={t.row.fixedFirst} t={t} />
      {entries.map((entry, index) => (
        <MovableRow
          key={entry.key}
          page={page}
          entries={entries}
          index={index}
          canEdit={canEdit}
          t={t}
          idPrefix={idPrefix}
          onMove={onMove}
          onToggle={onToggle}
          registerControl={registerControl}
        />
      ))}
      {last && <FixedRow n={totalRows(page)} label={sectionLabel(t, page, last)} note={t.row.fixedLast} t={t} />}
    </ol>
  );
}

function MovableRow({
  page,
  entries,
  index,
  canEdit,
  t,
  idPrefix,
  onMove,
  onToggle,
  registerControl,
}: {
  page: LayoutPageKey;
  entries: readonly StoredEntry[];
  index: number;
  canEdit: boolean;
  t: LayoutMessages;
  idPrefix: string;
  onMove?: (index: number, direction: MoveDirection) => void;
  onToggle?: (index: number) => void;
  registerControl?: (name: string, element: HTMLElement | null) => void;
}) {
  const entry = entries[index];
  const label = sectionLabel(t, page, entry.key);
  const hint = sectionHint(t, page, entry.key);
  const rowId = `${idPrefix}-${entry.key}`;

  const blocks: Record<"up" | "down" | "show", BlockReason | null> = {
    up: canEdit ? moveBlock(page, entries, index, "up") : null,
    down: canEdit ? moveBlock(page, entries, index, "down") : null,
    show: canEdit ? toggleBlock(page, entries, index) : null,
  };

  // One reason element per distinct text; controls with the same reason share it.
  const reasons: { id: string; text: string; visible: boolean }[] = [];
  const reasonId = (control: "up" | "down" | "show"): string | undefined => {
    const block = blocks[control];
    if (!block) return undefined;
    const text = reasonText(t, page, block);
    const found = reasons.find((reason) => reason.text === text);
    if (found) return found.id;
    const id = `${rowId}-${control}-reason`;
    reasons.push({ id, text, visible: isVisibleReason(block) });
    return id;
  };
  const describedBy = { up: reasonId("up"), down: reasonId("down"), show: reasonId("show") };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
      <Position n={positionOf(index)} t={t} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
          <span className={cn(entry.hidden && "text-muted")}>{label}</span>
          {entry.hidden && <Badge variant="neutral">{t.row.hidden}</Badge>}
        </p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        {reasons.map((reason) => (
          <p
            key={reason.id}
            id={reason.id}
            className={reason.visible ? "mt-1 text-sm font-semibold text-[#7a5600]" : "sr-only"}
          >
            {reason.text}
          </p>
        ))}
      </div>
      {canEdit && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {(["up", "down"] as const).map((direction) => {
            const Icon = direction === "up" ? ArrowUp : ArrowDown;
            const blocked = blocks[direction] !== null;
            return (
              <button
                key={direction}
                type="button"
                ref={(element) => registerControl?.(`${entry.key}:${direction}`, element)}
                className={MOVE_BUTTON}
                aria-disabled={blocked ? "true" : undefined}
                aria-describedby={describedBy[direction]}
                onClick={() => onMove?.(index, direction)}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="sr-only">{fill(direction === "up" ? t.row.moveUp : t.row.moveDown, { section: label })}</span>
              </button>
            );
          })}
          <label
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold",
              // `cn` does not resolve Tailwind conflicts, so the two looks are exclusive.
              blocks.show
                ? "cursor-not-allowed border-line bg-surface text-muted"
                : "cursor-pointer border-[#b9cbe0] bg-white text-navy",
            )}
          >
            <input
              type="checkbox"
              ref={(element) => registerControl?.(`${entry.key}:show`, element)}
              className="size-5 accent-navy"
              checked={!entry.hidden}
              aria-disabled={blocks.show ? "true" : undefined}
              aria-describedby={describedBy.show}
              onChange={() => onToggle?.(index)}
            />
            <span>{t.row.show}</span>
            <span className="sr-only">{fill(t.row.showFor, { section: label })}</span>
          </label>
        </div>
      )}
    </li>
  );
}
