/**
 * Admin console Phase 1b — shared console words (docs/admin-phase-1b-plan.md §12; owner: 1B-CORE).
 * Registered in messages/index.ts (repo-wide checks only); console pages import this file and ../hi/console-common.ts and pick
 * one with `pick(locale, en, hi)` from src/components/console/shared/messages.ts. English defines
 * the shape; the Hindi file is typed `typeof` this object. Plain object, no `as const`.
 *
 * Honesty (plan §10): "Not set" / "No target set" rather than invented values; rates are always
 * "x of y"; demo centres say so.
 */
const consoleCommon = {
  common: {
    notSet: "Not set",
    noTarget: "No target set",
    notRecorded: "Not recorded",
    xOfY: "{x} of {y}",
    xOfYPercent: "{x} of {y} ({percent} %)",
    demoCentres: "Demo centre list: the real list is pending",
    demoCentresDecision: "Until the real centre list arrives, the console shows the website's centres and any centre already used on an enquiry or an area.",
    smallSample: "Small sample",
    noCentre: "No centre yet",
    total: "Total",
    preview: "Preview · no live data",
    previewValue: "—",
    scrollHint: "{table}: scroll sideways for more columns",
  },
  /**
   * Field names on the timeline's "Edited …" line for the more-details panel
   * (`field_update { fields: ["details.school", …] }`). Lower case, like `crm.lead.details.fieldNames`.
   */
  details: {
    fields: {
      altPhone: "second phone / WhatsApp",
      school: "school",
      board: "board",
      hostel: "hostel",
      targetExam: "target exam",
      targetYear: "target year",
      heardVia: "how they heard about us",
      referredBy: "referred by",
      intakeSession: "joining session",
      preferredTime: "best time to call",
      decisionMaker: "who decides",
    },
  },
};

export default consoleCommon;
