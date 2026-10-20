import type { Messages } from "@/i18n/messages/types";
import type { PortalNavGroupKey } from "./areas";

type ComingMessages = Messages<"portal">["admin"]["coming"];
export type RoadmapPhaseKey = keyof ComingMessages["phases"];
export type RoadmapItemKey = keyof ComingMessages["items"];
export type RoadmapItem = { key: RoadmapItemKey; section: PortalNavGroupKey };
export type RoadmapPhase = { phase: RoadmapPhaseKey; current?: boolean; items: RoadmapItem[] };

/**
 * "What's coming" (`/admin/coming`): the planned console pages and features by phase, in the
 * approved order of docs/admin-console-plan.md (§2.3, §3, §4). Unbuilt pages never get an empty
 * sidebar entry; they are listed here instead, each with the console section it will live in.
 * Copy lives in `portal.admin.coming` (every item key appears here exactly once). When a page
 * ships, remove it here and add it to the sidebar (`areas.ts`).
 */
export const consoleRoadmap: RoadmapPhase[] = [
  {
    phase: "p1a",
    current: true,
    items: [
      { key: "addEnquiry", section: "admission" },
      { key: "editErase", section: "admission" },
      { key: "backButton", section: "admission" },
    ],
  },
  {
    phase: "p1b",
    items: [
      { key: "dashboardNumbers", section: "dashboard" },
      { key: "callOutcomes", section: "admission" },
      { key: "whatsappTemplates", section: "admission" },
      { key: "enquiryDetails", section: "admission" },
      { key: "admissionsTargets", section: "admission" },
      { key: "leaveCover", section: "admission" },
      { key: "sources", section: "leadGeneration" },
      { key: "freeTools", section: "leadGeneration" },
      { key: "searchOverview", section: "search" },
      { key: "people", section: "access" },
      { key: "siteStatus", section: "settings" },
      { key: "readableLog", section: "settings" },
    ],
  },
  {
    phase: "p2",
    items: [
      { key: "factSheet", section: "admission" },
      { key: "visits", section: "admission" },
      { key: "scholarshipTest", section: "admission" },
      { key: "importPaper", section: "admission" },
      { key: "campaignLinks", section: "leadGeneration" },
      { key: "frontDesk", section: "access" },
      { key: "rolesTable", section: "access" },
      { key: "privacy", section: "settings" },
    ],
  },
  {
    phase: "p3",
    items: [
      { key: "approvals", section: "website" },
      { key: "announcements", section: "website" },
      { key: "editors", section: "website" },
      { key: "media", section: "website" },
      { key: "hindiReview", section: "website" },
      { key: "logFilters", section: "settings" },
    ],
  },
  {
    phase: "p4",
    items: [
      { key: "titles", section: "search" },
      { key: "businessFacts", section: "search" },
      { key: "centrePages", section: "search" },
      { key: "crawlers", section: "search" },
      { key: "redirects", section: "search" },
      { key: "social", section: "search" },
    ],
  },
  {
    phase: "p5",
    items: [
      { key: "gatedDownloads", section: "leadGeneration" },
      { key: "funnel", section: "leadGeneration" },
      { key: "alerts", section: "dashboard" },
      { key: "leaderboard", section: "access" },
    ],
  },
  {
    phase: "p6",
    items: [
      { key: "feesOffers", section: "admission" },
      { key: "portalAccounts", section: "access" },
      { key: "paid", section: "settings" },
    ],
  },
];
