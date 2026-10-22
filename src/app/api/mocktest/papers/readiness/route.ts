import { connection } from "next/server";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { showPlaceholderContent } from "@/lib/content-mode";
import { generationEnabled, qbPaperPort } from "@/lib/mocktest/generated";
import { mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { mocktestLimiters } from "@/lib/mocktest/service";
import type { PaperReadinessView } from "@/lib/mocktest/types";
import { isQbSlot, QB_SLOT_EXAM } from "@/lib/qb/types";
import { getClientIp } from "@/lib/server/request-guards";

/**
 * GET /api/mocktest/papers/readiness?slot=<slot>[&language=en|hi] — can this exam-pattern mock be
 * served right now, and how (docs/question-bank-plan.md §B10.6)? Public and read-only; asked BEFORE
 * the contact form, so a family never gives details for a slot that would answer `bank_thin`.
 * → `PaperReadinessView`: full / short / thin (per language), the real exam's size, the honest
 * composition of a paper made now, the pattern and its source, and the monthly ranked status
 * (`signedIn`: the caller is a signed-in student). `available: false` with a reason when generation
 * is switched off or no blueprint is published ("coming soon"). 404 unknown slot, 400 bad language,
 * 300 per IP per 10 minutes.
 */
export async function GET(request: Request) {
  try {
    await connection();
    const limit = mocktestLimiters.readiness.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const params = new URL(request.url).searchParams;
    const slot = params.get("slot") ?? "";
    if (!isQbSlot(slot)) return testNotFound();
    const languageParam = params.get("language") ?? "en";
    if (languageParam !== "en" && languageParam !== "hi") return portalApiError("bad_request", "Unknown language.");

    const session = await getSession();
    const signedIn = session?.role === "student";
    if (!generationEnabled()) {
      return portalApiItem<PaperReadinessView>({
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
        ranked: { mode: "off", available: false, windowId: null, closesAt: null, signedIn },
      });
    }
    const port = await qbPaperPort();
    const view = await port.readiness({ slot, language: languageParam, placeholderMode: showPlaceholderContent(), now: Date.now() });
    return portalApiItem<PaperReadinessView>({ ...view, ranked: { ...view.ranked, signedIn } });
  } catch (error) {
    return mocktestServerError("readiness", error);
  }
}
