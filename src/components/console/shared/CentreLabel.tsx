import type { Locale } from "@/i18n/config";
import type { CentreRef } from "@/lib/crm/console/types";
import { cn } from "@/lib/cn";
import { consoleCommon, type ConsoleCommon } from "./messages";

/** A centre's name, or "No centre yet" (muted) for `slug: null` / no centre. */
export function centreText(centre: Pick<CentreRef, "slug" | "label"> | null | undefined, t: ConsoleCommon): string {
  return centre && centre.slug !== null ? centre.label : t.common.noCentre;
}

/** A centre's label in console tables and cards. Server- and client-safe. */
export function CentreLabel({
  centre,
  locale,
  t = consoleCommon(locale),
  className,
}: {
  centre: Pick<CentreRef, "slug" | "label"> | null | undefined;
  locale: Locale;
  t?: ConsoleCommon;
  className?: string;
}) {
  const none = !centre || centre.slug === null;
  return <span className={cn(none && "text-muted", className)}>{centreText(centre, t)}</span>;
}
