import { generationEnabled, qbPaperPort, type QbSlotReadiness } from "@/lib/mocktest/generated";
import { QB_SLOT_EXAM, QB_SLOTS, type QbSlot } from "@/lib/qb/types";
import { examStatus, type ExamStatus } from "./paper-model";

/**
 * What the question bank can serve for each exam-pattern mock right now, shared by the list on
 * /tools/mock-tests (`ExamPatternMocks`) and the sitemap, so both use the same check. No JSX: the
 * sitemap imports it. Request time only (the bank is seeded and read): call `connection()` first.
 */

export interface ExamPatternItem {
  slot: QbSlot;
  /** Null when the bank could not be read for this exam (shown as "coming soon", never as ready). */
  view: QbSlotReadiness | null;
}

export function examPatternStatus(item: ExamPatternItem): ExamStatus {
  return item.view ? examStatus(item.view) : { kind: "unpublished" };
}

/** A full-length paper or a labelled shorter set can be made now (the list's "start" state). */
export function examPatternServesPaper(item: ExamPatternItem): boolean {
  const kind = examPatternStatus(item).kind;
  return kind === "full" || kind === "short";
}

/**
 * Reads the bank once per exam (readiness is cached per bank revision on the server). Request time
 * only: call it inside `<Suspense>`. Any failure leaves that exam "coming soon" — never "ready".
 */
export async function loadExamPatternItems(input: { placeholderMode: boolean; now?: number }): Promise<ExamPatternItem[] | null> {
  const now = input.now ?? Date.now();
  if (!generationEnabled()) {
    return QB_SLOTS.map((slot) => ({
      slot,
      view: {
        slot,
        exam: QB_SLOT_EXAM[slot],
        available: false,
        reason: "disabled",
        readiness: null,
        full: null,
        languages: [],
        compensatoryMinutes: null,
        composition: null,
        sample: false,
        pattern: null,
        ranked: { mode: "off", available: false, windowId: null, closesAt: null },
      },
    }));
  }
  try {
    const port = await qbPaperPort();
    const items: ExamPatternItem[] = [];
    for (const slot of QB_SLOTS) {
      items.push({ slot, view: await port.readiness({ slot, language: "en", placeholderMode: input.placeholderMode, now }) });
    }
    return items;
  } catch {
    return null;
  }
}
