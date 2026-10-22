import { Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { DecodeWarning } from "@/lib/crm/intake/decode";
import type { CrmImportMessages } from "./types";

/**
 * What Excel (or an "ANSI" save) did to the file: damaged numbers block their rows, garbled
 * names / places block theirs, garbled free answers are left out. Server-safe (no hooks).
 */
export function DamageBanner({
  notice,
  garbledAnswers,
  warnings,
  t,
}: {
  notice: { excel: boolean; numberRows: number; textRows: number };
  garbledAnswers: number;
  warnings: readonly DecodeWarning[];
  t: CrmImportMessages;
}) {
  const ansi = warnings.includes("windows_1252");
  const replacement = warnings.includes("replacement_chars");
  if (!notice.excel && notice.textRows === 0 && garbledAnswers === 0 && !ansi && !replacement) return null;
  return (
    <div className="space-y-3">
      {notice.excel && (
        <Notice variant="error" role="alert" title={t.damage.title}>
          {format(t.damage.body, { count: notice.numberRows })}
        </Notice>
      )}
      {(notice.textRows > 0 || garbledAnswers > 0) && (
        <Notice variant="warning" role="note" title={t.damage.textTitle}>
          {notice.textRows > 0 && <span className="block">{format(t.damage.textBody, { count: notice.textRows })}</span>}
          {garbledAnswers > 0 && <span className="block">{format(t.damage.answersBody, { count: garbledAnswers })}</span>}
        </Notice>
      )}
      {ansi && (
        <Notice variant="warning" role="note">
          {t.file.ansiWarning}
        </Notice>
      )}
      {replacement && !ansi && (
        <Notice variant="warning" role="note">
          {t.file.replacementWarning}
        </Notice>
      )}
    </div>
  );
}
