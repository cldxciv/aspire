/**
 * Admin console Phase 1b — People list words (docs/admin-phase-1b-plan.md §5.L; owner:
 * 1B-HOUSEKEEPING). Registered in messages/index.ts (repo-wide checks only); /admin/users imports this file and
 * ../hi/console-people.ts and picks one with `pick(locale, en, hi)`. English defines the shape; the
 * Hindi file is typed `typeof` this object. Plain object, no `as const`.
 */
const consolePeople = {
  chips: {
    label: "Show accounts",
    all: "All",
    staff: "Staff",
    admin: "Admins",
    student: "Students",
    parent: "Parents",
    /** "Staff (4)": the chip and how many accounts it holds. */
    withCount: "{label} ({count})",
  },
  staff: {
    detailsLabel: "CRM details for {name}",
    crmRole: {
      counsellor: "Counsellor (executive)",
      manager: "Area head (manager)",
    },
    noMembership: "No CRM access set up yet",
    access: {
      active: "CRM access on",
      inactive: "CRM access off",
    },
    areas: "Areas",
    noAreas: "No areas",
    areaInactive: "{name} (not in use)",
    centres: "Centres (older setting)",
    everyCentre: "Every centre",
    away: "Away until {date}",
    openLeads: "Open enquiries",
    areasLink: "Areas & people",
    rulesLink: "Rules",
  },
  create: {
    crmRole: "CRM role",
    crmRoleHint: "Choose what this person does in the CRM. Nothing is chosen for you.",
    crmRoleRequired: "Choose the CRM role.",
    areas: "Areas (optional)",
    areasHint: "Enquiries from these areas go to this person. You can change areas later under Areas & people.",
    noAreasWarning: "No areas: this person will get no enquiries and, as area head, will see only enquiries assigned to them.",
    areasLoading: "Loading areas…",
    areasFailed: "The areas could not be loaded. You can add this person to areas later under Areas & people.",
    noAreasYet: "No areas are set up yet.",
    areaInactive: "{name} (not in use)",
  },
};

export default consolePeople;
