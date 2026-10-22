"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import type { CrmImportMessages } from "./types";

/**
 * Chunk progress for the preview and the import. After a dropped connection (or a "wait and try
 * again" answer) the wizard shows Resume: the rows already sent are safe (external refs), so the
 * failed chunk is simply re-sent.
 */
export function ImportProgress({
  label,
  done,
  total,
  dropped = false,
  droppedText,
  onResume,
  t,
}: {
  /** A message with `{done}` and `{total}` (e.g. `t.run.importing`). */
  label: string;
  done: number;
  total: number;
  dropped?: boolean;
  /** Why it paused, when it is not a dropped connection (e.g. "wait about 5 minutes"). */
  droppedText?: string;
  onResume?: () => void;
  t: CrmImportMessages;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-label={format(label, { done: Math.min(done + 1, total), total })}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-blue transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
      {dropped ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm font-semibold text-danger">
            {droppedText ?? t.run.dropped}
          </p>
          {onResume && (
            <Button variant="dark" size="sm" onClick={onResume}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {t.run.resume}
            </Button>
          )}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-navy">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          {format(label, { done: Math.min(done + 1, total), total })}
        </p>
      )}
    </div>
  );
}
