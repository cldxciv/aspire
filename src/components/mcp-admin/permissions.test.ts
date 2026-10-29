import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { mcpScopesInputSchema, scopesSummary } from "@/lib/mcp/scopes";
import { permissionSummaryLines } from "./labels";
import {
  accessOf,
  applyPreset,
  grantedServices,
  hasAnyPermission,
  hasAnyWrite,
  matchingPreset,
  MCP_SERVICE_VIEWS,
  setRead,
  setWrite,
  summarise,
  toScopes,
  type McpServiceView,
  type PermissionState,
} from "./permissions";

// Permission-matrix logic (MCP-ADMIN): write ⇒ read, read off ⇒ write off, presets, services
// without write tools, unavailable and explicit-only services. Synthetic catalogue plus the real one.
const SERVICES: McpServiceView[] = [
  { id: "site", readTools: ["site_status"], writeTools: [], hasWrite: false, available: true, explicitOnly: false },
  { id: "accounts", readTools: ["list_accounts"], writeTools: ["create_account"], hasWrite: true, available: true, explicitOnly: false },
  { id: "reserved", readTools: [], writeTools: [], hasWrite: true, available: false, explicitOnly: false },
  { id: "crm", readTools: ["list_leads"], writeTools: ["add_lead_note"], hasWrite: true, available: true, explicitOnly: true },
];
const [site, accounts, reserved, crm] = SERVICES;

describe("matrix rules", () => {
  it("ticking Write also ticks Read; unticking Write keeps Read", () => {
    let state: PermissionState = applyPreset(SERVICES, "clear");
    state = setWrite(state, accounts, true);
    expect(accessOf(state, "accounts")).toBe("write");
    expect(toScopes(SERVICES, state)).toEqual(["accounts:write"]);
    state = setWrite(state, accounts, false);
    expect(accessOf(state, "accounts")).toBe("read");
  });

  it("unticking Read also unticks Write; ticking Read keeps an existing Write", () => {
    let state = setWrite(applyPreset(SERVICES, "clear"), accounts, true);
    expect(accessOf(setRead(state, accounts, true), "accounts")).toBe("write");
    state = setRead(state, accounts, false);
    expect(accessOf(state, "accounts")).toBe("none");
    expect(hasAnyPermission(SERVICES, state)).toBe(false);
  });

  it("services without write tools can only be read", () => {
    const state = setWrite(applyPreset(SERVICES, "clear"), site, true);
    expect(accessOf(state, "site")).toBe("read");
    expect(toScopes(SERVICES, state)).toEqual(["site:read"]);
    expect(toScopes(SERVICES, { site: "write" })).toEqual(["site:read"]);
  });

  it("unavailable services (coming soon) can never be granted", () => {
    let state = setRead(applyPreset(SERVICES, "clear"), reserved, true);
    state = setWrite(state, reserved, true);
    expect(accessOf(state, "reserved")).toBe("none");
    expect(toScopes(SERVICES, { reserved: "write" })).toEqual([]);
  });

  it("presets: Read only, Full access, Clear — and which one the state matches", () => {
    const readOnly = applyPreset(SERVICES, "readOnly");
    expect(readOnly).toEqual({ site: "read", accounts: "read", reserved: "none", crm: "none" });
    expect(hasAnyWrite(SERVICES, readOnly)).toBe(false);
    const full = applyPreset(SERVICES, "full");
    expect(full).toEqual({ site: "read", accounts: "write", reserved: "none", crm: "none" });
    expect(hasAnyWrite(SERVICES, full)).toBe(true);
    expect(applyPreset(SERVICES, "clear")).toEqual({ site: "none", accounts: "none", reserved: "none", crm: "none" });
    expect(matchingPreset(SERVICES, readOnly)).toBe("readOnly");
    expect(matchingPreset(SERVICES, full)).toBe("full");
    expect(matchingPreset(SERVICES, {})).toBe("clear");
    expect(matchingPreset(SERVICES, { site: "read" })).toBeNull();
  });

  it("explicit-only services are never ticked by a preset but can be ticked by hand", () => {
    let state = setRead(applyPreset(SERVICES, "readOnly"), crm, true);
    expect(accessOf(state, "crm")).toBe("read");
    // Once lead data is ticked, the state no longer claims to be the "Read only" preset.
    expect(matchingPreset(SERVICES, state)).toBeNull();
    state = setWrite(state, crm, true);
    expect(toScopes(SERVICES, state)).toEqual(["site:read", "accounts:read", "crm:write"]);
    expect(applyPreset(SERVICES, "clear").crm).toBe("none");
  });

  it("summarises what can be read and changed, in catalogue order", () => {
    const state = { accounts: "write", site: "read" } as const;
    expect(summarise(SERVICES, state)).toEqual({ read: ["site", "accounts"], write: ["accounts"] });
    expect(grantedServices(SERVICES, state).map(({ service, access }) => `${service.id}:${access}`)).toEqual([
      "site:read",
      "accounts:write",
    ]);
  });
});

describe("with the real service catalogue (src/lib/mcp/scopes.ts)", () => {
  it("every preset produces scopes the API accepts (except Clear, which is refused)", () => {
    for (const preset of ["readOnly", "full"] as const) {
      const scopes = toScopes(MCP_SERVICE_VIEWS, applyPreset(MCP_SERVICE_VIEWS, preset));
      const parsed = mcpScopesInputSchema.safeParse(scopes);
      expect(parsed.success, preset).toBe(true);
      // The server's own summary agrees with the matrix.
      expect(scopesSummary(parsed.data ?? [])).toEqual({ ...applyPreset(MCP_SERVICE_VIEWS, preset) });
    }
    expect(mcpScopesInputSchema.safeParse(toScopes(MCP_SERVICE_VIEWS, applyPreset(MCP_SERVICE_VIEWS, "clear"))).success).toBe(false);
  });

  it("Full access writes only where the catalogue has write tools; CRM lead data stays off", () => {
    const full = applyPreset(MCP_SERVICE_VIEWS, "full");
    for (const service of MCP_SERVICE_VIEWS) {
      const expected = !service.available || service.explicitOnly ? "none" : service.hasWrite ? "write" : "read";
      expect(full[service.id], service.id).toBe(expected);
    }
    expect(MCP_SERVICE_VIEWS.find((service) => service.id === "crm")).toMatchObject({ available: true, explicitOnly: true });
    expect(full.crm).toBe("none");
    expect(mcpScopesInputSchema.safeParse(toScopes(MCP_SERVICE_VIEWS, { crm: "write" })).success).toBe(true);
  });

  it("builds localised summary lines", () => {
    const t = messagesFor("en", "mcp");
    const lines = permissionSummaryLines(MCP_SERVICE_VIEWS, { accounts: "write", content: "read" }, t.create, t.services);
    expect(lines).toEqual({
      read: "Can read: Accounts, Website content",
      write: "Can change: Accounts",
    });
    expect(permissionSummaryLines(MCP_SERVICE_VIEWS, { site: "read" }, t.create, t.services)?.write).toBe("Can change: nothing");
    expect(permissionSummaryLines(MCP_SERVICE_VIEWS, {}, t.create, t.services)).toBeNull();
    const hi = messagesFor("hi", "mcp");
    expect(permissionSummaryLines(MCP_SERVICE_VIEWS, { accounts: "write" }, hi.create, hi.services)?.write).toBe("बदल सकता है: खाते");
  });

  it("has a name and description for every service id", () => {
    for (const locale of ["en", "hi"] as const) {
      const services = messagesFor(locale, "mcp").services as Record<string, { name: string; description: string }>;
      for (const service of MCP_SERVICE_VIEWS) {
        expect(services[service.id]?.name, `${locale}:${service.id}`).toBeTruthy();
        expect(services[service.id]?.description, `${locale}:${service.id}`).toBeTruthy();
      }
      const write = messagesFor(locale, "mcp").serviceWrite as Record<string, string>;
      for (const service of MCP_SERVICE_VIEWS.filter((s) => s.available && s.hasWrite)) expect(write[service.id]).toBeTruthy();
    }
  });
});
