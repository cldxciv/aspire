import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { SessionKey, SessionRef } from "@/lib/crm/console/types";

/**
 * Session picker (owner: 1B-NUMBERS; Targets and Admissions done): one link per session (the
 * previous two, the current one and the next, plan §5.B), the chosen one marked
 * `aria-current="page"`. Plain links, so it works without JavaScript. Server-safe.
 */
export function SessionPicker({
  sessions,
  current,
  selected,
  hrefFor,
  label,
  currentLabel,
  locale,
}: {
  sessions: readonly SessionRef[];
  /** The session `now` falls in. */
  current: SessionKey;
  selected: SessionKey;
  /** LOCALE-FREE link for a session. */
  hrefFor: (session: SessionKey) => string;
  /** The nav's accessible name ("Choose a session"). */
  label: string;
  /** "{session} (current)". */
  currentLabel: string;
  locale: Locale;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {sessions.map((session) => {
          const chosen = session.key === selected;
          return (
            <li key={session.key}>
              <Link
                href={localePath(hrefFor(session.key), locale)}
                aria-current={chosen ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold tabular-nums",
                  chosen ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-blue",
                )}
              >
                {session.key === current ? format(currentLabel, { session: session.label }) : session.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
