/**
 * Label helpers for the page-layout editor and banner (docs/page-layout-plan.md §11). Client-safe:
 * the messages come in as `t` (`getMessages("layout")` on the server, passed down as props).
 */
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { LayoutPageKey, LayoutSectionDef } from "@/lib/page-layout/registry";

export type LayoutMessages = Messages<"layout">;

type SectionMessages = Readonly<Record<string, { label: string; hint?: string } | undefined>>;

/** Fills `{name}` placeholders; unknown ones stay visible (same rules as `format`). */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return format(template, values);
}

export function pageName(t: LayoutMessages, page: LayoutPageKey): string {
  return t.pages[page].name;
}

function sectionMessages(t: LayoutMessages, page: LayoutPageKey): SectionMessages {
  return t.pages[page].sections as SectionMessages;
}

/** The section's label; the key itself if a label is missing (registry.test.ts prevents that). */
export function sectionLabel(t: LayoutMessages, page: LayoutPageKey, key: string): string {
  return sectionMessages(t, page)[key]?.label ?? key;
}

/** The "shown only when …" sentence of a conditional section, else null. */
export function sectionHint(t: LayoutMessages, page: LayoutPageKey, key: string): string | null {
  return sectionMessages(t, page)[key]?.hint ?? null;
}

/** Why a `keep` section can't be hidden, else null. */
export function keepReason(t: LayoutMessages, def: LayoutSectionDef): string | null {
  return def.keep ? t.keep[def.keep] : null;
}
