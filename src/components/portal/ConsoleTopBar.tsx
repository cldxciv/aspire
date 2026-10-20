import { Plus, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ADD_ENQUIRY_HREF, ENQUIRY_SEARCH_PARAM, ENQUIRY_SEARCH_PATH } from "./areas";

export type ConsoleTopBarMessages = Pick<Messages<"portal">["shell"], "findLabel" | "findPlaceholder" | "findSubmit" | "addEnquiry">;

/**
 * Console top bar tools (admin and staff areas; docs/admin-console-plan.md §2.2): "Find an
 * enquiry" (a GET search of the Enquiries inbox, `/crm?q=…`) and "+ Add enquiry" (the inbox with
 * `?add=1`, which opens the add form). Full width on its own row below `lg`; from `lg` inline
 * beside the area badge, never narrower than its content (the account cluster wraps instead).
 * Static: no session is read, so it prerenders with the shell; `/crm` re-checks access on the
 * server.
 */
export function ConsoleTopBarTools({ locale, t, className }: { locale: Locale; t: ConsoleTopBarMessages; className?: string }) {
  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2 lg:w-auto lg:max-w-xl lg:flex-auto", className)}>
      <Form action={localePath(ENQUIRY_SEARCH_PATH, locale)} role="search" aria-label={t.findLabel} className="flex min-w-0 flex-1 lg:min-w-48">
        <label htmlFor="console-find-enquiry" className="sr-only">
          {t.findLabel}
        </label>
        <input
          id="console-find-enquiry"
          name={ENQUIRY_SEARCH_PARAM}
          type="search"
          maxLength={80}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t.findPlaceholder}
          className="min-h-11 w-full min-w-0 rounded-l-control border border-r-0 border-white/40 bg-white px-3 text-sm text-ink placeholder:text-[#5b6b80]"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-r-control border border-white/40 bg-[#214d7d] px-3 text-white hover:bg-[#2b5f96]"
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">{t.findSubmit}</span>
        </button>
      </Form>
      <Link href={localePath(ADD_ENQUIRY_HREF, locale)} className={buttonClasses({ variant: "primary", className: "shrink-0 px-3 sm:px-4" })}>
        <Plus aria-hidden="true" className="size-4" />
        {t.addEnquiry}
      </Link>
    </div>
  );
}
