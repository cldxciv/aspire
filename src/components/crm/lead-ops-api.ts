/**
 * Typed request builders for every lead-routing endpoint (docs/lead-routing-plan.md §21; owner:
 * LR-CORE; FROZEN after LR-CORE). Each builder is pure (path, method, body) so tests can check it
 * without a network; run one with `sendCrm(request)` (./api.ts) or `useCrmAction(...).run(request)`
 * (./client-kit.tsx). The servers re-validate everything; these only shape the calls.
 *
 * Packages may add an `api.ts` in their own component folder for endpoints only their UI calls,
 * but the paths and bodies here are the contract.
 */
import type {
  AliasKind,
  CallingHours,
  ImportConsentBasis,
  ImportRowInput,
  MetaAction,
  MetaConfig,
  MetaInboxStatus,
  MetaSecretName,
  ReassignScope,
  RoutingMode,
  SlaView,
  SpeedRule,
} from "@/lib/crm/lead-ops-types";
import type { CrmRole } from "@/lib/crm/types";
import type { CrmRequest } from "./api";

const enc = encodeURIComponent;
const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

// ---------------------------------------------------------------------------------------------
// Bodies

export interface StaffLoginBody {
  displayName: string;
  loginId: string;
  crmRole: CrmRole;
  centreSlugs: string[];
  /** Area memberships (the `setUserAreas` seam). */
  areaIds?: string[];
}

export interface AreaCreateBody {
  id?: string;
  nameEn: string;
  nameHi: string;
  defaultCentreSlug?: string | null;
}

export interface AreaPatchBody {
  nameEn?: string;
  nameHi?: string;
  defaultCentreSlug?: string | null;
  centres?: string[];
  active?: boolean;
  position?: number;
}

export interface AreaMemberInput {
  userId: string;
  centreSlug?: string | null;
  /** Managers only: also take calls. */
  takesLeads?: boolean;
}

export interface AreaMergeBody {
  from: string;
  into: string;
  /** For each person in `from`: move to `into`, or remove (L5). */
  people: { userId: string; action: "move" | "remove" }[];
}

export interface SetupFromCentreBody {
  centreSlug: string;
  headIds: string[];
  executiveIds: string[];
  headsTakeCalls: boolean;
}

export interface AvailabilityBody {
  userId: string;
  /** ISO date-time, or null to clear. */
  awayUntil: string | null;
  note?: string | null;
}

export interface SpeedSettingsBody {
  callingHours?: CallingHours;
  speedRule?: SpeedRule;
  expectedVersion: { callingHours?: number; speedRule?: number };
}

export interface ImportBatchBody {
  consentBasis: ImportConsentBasis;
  startClock: boolean;
  rowsTotal: number;
  fileName?: string | null;
  fileSha256?: string | null;
}

export type MetaActionBody = { action: Exclude<MetaAction, "test_mode"> } | { action: "test_mode"; on: boolean; phone?: string | null };

// ---------------------------------------------------------------------------------------------
// Builders

export const leadOpsRequests = {
  // Super admins (§11)
  listSuperAdmins(): CrmRequest {
    return { path: "/api/admin/super-admins", method: "GET" };
  },
  setSuperAdmin(userId: string, input: { superAdmin: boolean; currentPassword: string }): CrmRequest {
    return { path: `/api/admin/super-admins/${enc(userId)}`, method: "PUT", body: { superAdmin: input.superAdmin, currentPassword: input.currentPassword } };
  },
  /** A staff (CRM) login with its membership and areas — super admins only. */
  createStaffLogin(input: StaffLoginBody): CrmRequest {
    return {
      path: "/api/admin/users",
      method: "POST",
      body: {
        role: "staff",
        displayName: input.displayName.trim().replace(/\s+/g, " "),
        loginId: input.loginId.trim().toLowerCase(),
        crm: { crmRole: input.crmRole, centreSlugs: input.centreSlugs, ...(input.areaIds ? { areaIds: input.areaIds } : {}) },
      },
    };
  },

  // Areas (§13.6)
  listAreas(): CrmRequest {
    return { path: "/api/crm/areas", method: "GET" };
  },
  resolvePlace(q: string, state?: string): CrmRequest {
    return { path: `/api/crm/areas/resolve${query({ q: q.trim().slice(0, 60), state: state?.trim().slice(0, 60) })}`, method: "GET" };
  },
  createArea(body: AreaCreateBody): CrmRequest {
    return { path: "/api/crm/areas", method: "POST", body };
  },
  updateArea(areaId: string, body: AreaPatchBody): CrmRequest {
    return { path: `/api/crm/areas/${enc(areaId)}`, method: "PATCH", body };
  },
  setAreaMembers(areaId: string, members: AreaMemberInput[]): CrmRequest {
    return { path: `/api/crm/areas/${enc(areaId)}/members`, method: "PUT", body: { members } };
  },
  addAreaAlias(areaId: string, alias: { label: string; kind: AliasKind }): CrmRequest {
    return { path: `/api/crm/areas/${enc(areaId)}/aliases`, method: "POST", body: alias };
  },
  removeAreaAlias(areaId: string, key: string): CrmRequest {
    return { path: `/api/crm/areas/${enc(areaId)}/aliases`, method: "DELETE", body: { key } };
  },
  mergeAreas(body: AreaMergeBody): CrmRequest {
    return { path: "/api/crm/areas/merge", method: "POST", body };
  },
  setupFromCentre(body: SetupFromCentreBody): CrmRequest {
    return { path: "/api/crm/areas/setup-from-centre", method: "POST", body };
  },
  rerouteOpenLeads(): CrmRequest {
    return { path: "/api/crm/areas/reroute", method: "POST", body: {} };
  },
  unmatchedPlaces(): CrmRequest {
    return { path: "/api/crm/areas/unmatched", method: "GET" };
  },
  /** "Reassign uncalled leads of X" (A5): re-picked per lead, or all to `toUserId`. */
  reassignLeads(input: { fromUserId: string; scope: ReassignScope; toUserId?: string | null }): CrmRequest {
    return {
      path: "/api/crm/areas/reassign",
      method: "POST",
      body: input.toUserId ? { fromUserId: input.fromUserId, scope: input.scope, toUserId: input.toUserId } : { fromUserId: input.fromUserId, scope: input.scope },
    };
  },
  setAvailability(body: AvailabilityBody): CrmRequest {
    const note = body.note?.trim();
    return { path: "/api/crm/availability", method: "PUT", body: note ? { userId: body.userId, awayUntil: body.awayUntil, note } : { userId: body.userId, awayUntil: body.awayUntil } };
  },
  /** Change a lead's area (`null` = no area). */
  changeLeadArea(leadId: string, areaId: string | null): CrmRequest {
    return { path: `/api/crm/leads/${enc(leadId)}/area`, method: "PATCH", body: { areaId } };
  },

  // Settings (§12, §15)
  getRoutingSettings(): CrmRequest {
    return { path: "/api/crm/settings/routing", method: "GET" };
  },
  setRoutingMode(mode: RoutingMode, expectedVersion: number): CrmRequest {
    return { path: "/api/crm/settings/routing", method: "PUT", body: { mode, expectedVersion } };
  },
  getSpeedSettings(): CrmRequest {
    return { path: "/api/crm/settings/speed", method: "GET" };
  },
  saveSpeedSettings(body: SpeedSettingsBody): CrmRequest {
    return { path: "/api/crm/settings/speed", method: "PUT", body };
  },

  // SLA and dashboard (§15, §16)
  slaQueue(view: SlaView): CrmRequest {
    return { path: `/api/crm/sla${query({ view })}`, method: "GET" };
  },
  slaSummary(): CrmRequest {
    return { path: "/api/crm/sla/summary", method: "GET" };
  },
  dashboard(input: { from?: string; to?: string; area?: string } = {}): CrmRequest {
    return { path: `/api/crm/dashboard${query({ from: input.from, to: input.to, area: input.area })}`, method: "GET" };
  },

  // CSV import (§17)
  importPreview(rows: ImportRowInput[], consentBasis?: ImportConsentBasis | null): CrmRequest {
    return { path: "/api/crm/import/preview", method: "POST", body: consentBasis ? { rows, consentBasis } : { rows } };
  },
  startImport(body: ImportBatchBody): CrmRequest {
    return { path: "/api/crm/import/batches", method: "POST", body };
  },
  importRows(batchId: string, rows: ImportRowInput[], offset: number): CrmRequest {
    return { path: `/api/crm/import/batches/${enc(batchId)}/rows`, method: "POST", body: { rows, offset } };
  },
  finishImport(batchId: string): CrmRequest {
    return { path: `/api/crm/import/batches/${enc(batchId)}/finish`, method: "POST", body: {} };
  },
  importHistory(): CrmRequest {
    return { path: "/api/crm/import/batches", method: "GET" };
  },

  // Meta (§18)
  metaStatus(): CrmRequest {
    return { path: "/api/crm/integrations/meta", method: "GET" };
  },
  saveMetaConfig(config: Partial<MetaConfig>, expectedVersion: number): CrmRequest {
    return { path: "/api/crm/integrations/meta", method: "PUT", body: { config, expectedVersion } };
  },
  setMetaSecret(name: Exclude<MetaSecretName, "page_token" | "verify_token">, value: string, currentPassword: string): CrmRequest {
    return { path: "/api/crm/integrations/meta/secrets", method: "PUT", body: { name, value, currentPassword } };
  },
  deleteMetaSecret(name: MetaSecretName, currentPassword: string): CrmRequest {
    return { path: "/api/crm/integrations/meta/secrets", method: "DELETE", body: { name, currentPassword } };
  },
  metaAction(body: MetaActionBody): CrmRequest {
    return { path: "/api/crm/integrations/meta/actions", method: "POST", body };
  },
  metaInbox(status?: MetaInboxStatus): CrmRequest {
    return { path: `/api/crm/integrations/meta/inbox${query({ status })}`, method: "GET" };
  },
};
