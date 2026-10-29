/**
 * Go-live summary for /admin/status (docs/admin-phase-1b-plan.md §5.M; owner: 1B-HOUSEKEEPING).
 * A STATIC copy of the approval checklist's open items as of 22 Oct 2026: `docs/` is not in the
 * production image, so nothing here is read from a file and nothing updates itself until Phase 3a.
 * The one live item ("Leave demo mode") follows the site's content mode. English only (decision 5).
 * Client-safe: no I/O.
 */

/** When this list was copied from the approval checklist. */
export const GO_LIVE_AS_OF = "22 Oct 2026";

export const GO_LIVE_NOTE = `This list is a summary from the approval checklist (${GO_LIVE_AS_OF}). It does not update itself until Phase 3a.`;

/**
 * `open` / `deferred` / `phase4` are fixed; `live_mode` is worked out from the content mode when the
 * page is shown (demo → still open, production → done).
 */
export type GoLiveStatus = "open" | "deferred" | "phase4" | "live_mode";

export interface GoLiveItem {
  key: string;
  item: string;
  /** Checklist references ("—" when the item has none). */
  refs: string;
  status: GoLiveStatus;
}

export const GO_LIVE_ITEMS: readonly GoLiveItem[] = [
  { key: "consent", item: "Named results and photos: consent recorded", refs: "RC-1, RE-2–RE-4", status: "open" },
  { key: "legal", item: "Consent wording and privacy notice reviewed by legal", refs: "FP-3, FP-6, FP-11, CRM-2", status: "open" },
  { key: "centres", item: "Centre facts verified", refs: "CE-1–CE-7, decision 7", status: "open" },
  { key: "programmes", item: "Programmes and figures verified", refs: "PR-2–PR-4, ST-1–ST-5", status: "open" },
  { key: "domain", item: "Production domain final", refs: "HE-9, decision 17", status: "open" },
  { key: "templates", item: "WhatsApp templates approved", refs: "WA-1–WA-8", status: "open" },
  { key: "backups", item: "Off-server backups", refs: "—", status: "deferred" },
  { key: "demo", item: "Leave demo mode", refs: "—", status: "live_mode" },
  { key: "indexing", item: "Search indexing on the real domain", refs: "—", status: "phase4" },
];

export type GoLiveTone = "open" | "done" | "later" | "unknown";

/** A status word and its tone. `demoMode` null = not read (the data-free preview): "—". */
export function goLiveStatusText(status: GoLiveStatus, demoMode: boolean | null): { text: string; tone: GoLiveTone } {
  switch (status) {
    case "open":
      return { text: "Open", tone: "open" };
    case "deferred":
      return { text: "Deferred", tone: "later" };
    case "phase4":
      return { text: "Phase 4", tone: "later" };
    case "live_mode":
      if (demoMode === null) return { text: "—", tone: "unknown" };
      return demoMode ? { text: "Open (the site is in demo mode)", tone: "open" } : { text: "Done (production mode)", tone: "done" };
  }
}
