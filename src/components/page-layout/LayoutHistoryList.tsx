import type { LayoutPageKey } from "@/lib/page-layout/registry";
import type { PageLayoutHistoryItem } from "@/lib/page-layout/types";

import { historySentence } from "./editor-model";
import type { LayoutMessages } from "./labels";

/**
 * The page's layout history, newest first (the last 20 changes; docs/page-layout-plan.md §10.7).
 * "{date} — {who did what}": saves and publishes also list what moved, was hidden or was shown.
 * Every change is in the Activity log as well.
 */
export function LayoutHistoryList({
  page,
  history,
  t,
  formatDate,
  headingId,
}: {
  page: LayoutPageKey;
  history: readonly PageLayoutHistoryItem[];
  t: LayoutMessages;
  formatDate: (ms: number) => string;
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={headingId} className="text-lg font-extrabold text-navy">
        {t.history.heading}
      </h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.history.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {history.map((item) => (
            <li key={item.id} className="py-2.5 leading-relaxed text-ink">
              <time dateTime={new Date(item.at).toISOString()} className="font-semibold text-navy" suppressHydrationWarning>
                {formatDate(item.at)}
              </time>
              {" — "}
              {historySentence(t, page, item)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
