/**
 * People list shapes (docs/admin-phase-1b-plan.md §5.L, §8; owner: 1B-HOUSEKEEPING). Client-safe:
 * types and constants only. GET /api/admin/users and /admin/users add these lead-routing facts to
 * each staff account's `crm` membership.
 */
import type { CrmRole } from "@/lib/crm/types";

/** An area's name in both languages (lead routing's `AreaName`). */
export interface PeopleAreaName {
  id: string;
  en: string;
  hi: string;
  /** False for an area that is no longer in use (merged or switched off). */
  active: boolean;
}

/** A staff account's CRM facts on the People list. */
export interface PeopleCrm {
  crmRole: CrmRole;
  /** The older centre scope (empty = every centre). */
  centreSlugs: string[];
  /** CRM access on (`crm_staff.active`). */
  active: boolean;
  /** Areas the person is a member of, in the areas' own order. */
  areaIds: string[];
  areaNames: PeopleAreaName[];
  /** ISO time while the person is away (lead routing's "Away until"), else null. */
  awayUntil: string | null;
  /** Open enquiries assigned to the person (not admitted, not lost, not erased). */
  openLeads: number;
}

/** The message `POST /api/admin/users` answers when a staff login has no CRM role (422, field `crm`). */
export const CRM_ROLE_REQUIRED_MESSAGE = "Choose the CRM role.";
