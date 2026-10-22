import type { ReactNode } from "react";

import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages } from "@/i18n/server";
import { cn } from "@/lib/cn";
import {
  PAGE_LAYOUT_ADMIN_PATH,
  PAGE_LAYOUT_PREVIEW_EXIT_PATH,
  type LayoutPageKey,
} from "@/lib/page-layout/registry";
import type { ResolvedPageLayout } from "@/lib/page-layout/types";

import type { LayoutMessages } from "./labels";

/**
 * "Draft preview" banner (docs/page-layout-plan.md §4, D6). Shown above the hero only while a super
 * admin previews a layout (Next Draft Mode); visitors never see it. It sits in the normal flow
 * (never fixed or sticky) and its controls are at least 44 px tall.
 *
 * "Exit preview" posts to the exit route outside the portal API, so it works after sign-out too.
 */

/** Async helper (not a component): null unless the layout is a preview; otherwise the banner. */
export async function layoutPreviewBanner(layout: ResolvedPageLayout): Promise<ReactNode> {
  if (!layout.preview) return null;
  const [locale, t] = await Promise.all([getLocale(), getMessages("layout")]);
  return <LayoutPreviewBanner page={layout.page} locale={locale} hasDraft={layout.preview.hasDraft} t={t} />;
}

/** Shared control box (no horizontal padding: `cn` does not resolve Tailwind conflicts). */
const CONTROL = "inline-flex min-h-11 items-center justify-center rounded-control py-2.5 text-sm font-bold";

/** The banner markup. Synchronous, so tests can render it with renderToStaticMarkup. */
export function LayoutPreviewBanner({
  page,
  locale,
  hasDraft,
  t,
}: {
  page: LayoutPageKey;
  locale: Locale;
  hasDraft: boolean;
  t: LayoutMessages;
}) {
  const titleId = "page-layout-preview-title";
  return (
    <aside
      aria-labelledby={titleId}
      className="border-y border-[#f2dfa0] border-l-[6px] border-l-gold bg-gold-soft text-ink"
      data-surface="light"
    >
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id={titleId} className="text-base font-extrabold text-navy">
            {t.banner.title}
          </h2>
          <p className="mt-0.5 text-sm leading-snug">{hasDraft ? t.banner.draft : t.banner.noDraft}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form method="post" action={PAGE_LAYOUT_PREVIEW_EXIT_PATH}>
            <input type="hidden" name="page" value={page} />
            <input type="hidden" name="lang" value={locale} />
            <button type="submit" className={cn(CONTROL, "bg-navy px-4 text-white hover:bg-navy-2")}>
              {t.banner.exit}
            </button>
          </form>
          <a
            href={`${localePath(PAGE_LAYOUT_ADMIN_PATH, locale)}?page=${page}`}
            className={cn(CONTROL, "px-2 text-navy underline underline-offset-4 hover:text-blue")}
          >
            {t.banner.back}
          </a>
        </div>
      </div>
    </aside>
  );
}
