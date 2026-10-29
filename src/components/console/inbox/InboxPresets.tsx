import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import type { InboxPreset } from "./presets";

/**
 * The Enquiries quick views (docs/admin-phase-1b-plan.md §5.I; owner: 1B-FAMILY): one link per
 * preset, the active one marked `aria-current="page"` (and drawn filled, with a check mark in
 * text so the state is never colour alone). Wraps on phones; no sideways scroll. Server-safe.
 */
export function InboxPresets({ presets, activeKey, label, locale }: { presets: readonly InboxPreset[]; activeKey: string | null; label: string; locale: Locale }) {
  if (presets.length === 0) return null;
  const base = localePath("/crm", locale);
  return (
    <nav aria-label={label} className="mb-3">
      <ul className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const active = preset.key === activeKey;
          return (
            <li key={preset.key}>
              <Link
                href={`${base}${preset.query}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold",
                  active ? "border-navy bg-navy text-white" : "border-[#b9cbe0] bg-white text-navy hover:border-blue",
                )}
              >
                {active && <span aria-hidden="true">✓</span>}
                {preset.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
