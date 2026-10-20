"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { format } from "@/i18n/format";
import { blockXp } from "@/lib/planner/progress";
import { isBitSet } from "@/lib/planner/state";
import type { PlanDay } from "@/lib/planner/types";
import { blockTitle, type PlannerData, type PlannerMessages } from "./model";

/**
 * The blocks of one plan day. `onToggle` makes them tickable (today only); without it the list is
 * read-only and shows which blocks were done.
 */
export function BlockList({
  t,
  data,
  day,
  mask,
  onToggle,
}: {
  t: PlannerMessages;
  data: PlannerData;
  day: PlanDay;
  mask: number | undefined;
  onToggle?: (index: number, done: boolean) => void;
}) {
  if (day.blocks.length === 0) return <p className="text-sm text-muted">{t.today.noBlocks}</p>;
  return (
    <ul className="grid gap-2">
      {day.blocks.map((block) => {
        const done = isBitSet(mask, block.index);
        const title = blockTitle(block, day, t, data, onToggle ? 4 : 3);
        const meta = (
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
            <span>{format(t.blocks.minutes, { minutes: block.minutes })}</span>
            <span>{format(t.today.xpForBlock, { xp: blockXp(block.kind) })}</span>
          </span>
        );
        return (
          <li key={block.id}>
            {onToggle ? (
              <label
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors ${
                  done ? "border-[#bfe5cf] bg-success-soft" : "border-line bg-white hover:border-blue"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[#14845a]"
                  checked={done}
                  onChange={(e) => onToggle(block.index, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${done ? "text-[#0f5a3c]" : "text-navy"}`}>{title}</span>
                  {meta}
                </span>
              </label>
            ) : (
              <div className="flex items-start gap-3 rounded-control border border-line bg-white p-3">
                {done ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#9fb2c8]" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy">
                    {done && <span className="sr-only">✓ </span>}
                    {title}
                  </span>
                  {meta}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
