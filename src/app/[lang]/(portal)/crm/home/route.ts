import type { NextRequest } from "next/server";

import { defaultLocale, isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { ROBOTS_NOINDEX } from "@/lib/auth/config";
import { buildChangePasswordHref, buildLoginHref } from "@/lib/auth/paths";
import { getSession } from "@/lib/auth/session";
import { CONSOLE_HOME_PATH, consoleHomeFor } from "@/lib/crm/console/home";
import { getDb } from "@/lib/db/connection";

/**
 * GET /[lang]/crm/home — the console's role home (docs/admin-phase-1b-plan.md §5.A, D-078;
 * `PORTAL_HOME.staff`). Answers 307 to: CRM admin → /admin, manager → /crm/dashboard, counsellor →
 * /crm/today, question-bank-only staff → /admin/questions, other staff → /crm ("ask an admin"),
 * students / parents → their portal, signed out → login with `next=/crm/home`, a pending temporary
 * password → the change-password page. The Location is relative and stays in the page's language.
 * A route handler (no layout, no page): nothing is cached and nothing is indexed.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : defaultLocale;
  const home = consoleHomeFor(await getSession(), getDb());
  const location =
    home.kind === "signed_out"
      ? buildLoginHref(CONSOLE_HOME_PATH, locale)
      : home.kind === "change_password"
        ? buildChangePasswordHref(locale, CONSOLE_HOME_PATH)
        : localePath(home.path, locale);
  return new Response(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "no-store", "X-Robots-Tag": ROBOTS_NOINDEX },
  });
}
