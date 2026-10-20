import { describe, expect, it } from "vitest";

// Per-service MCP scopes (src/lib/mcp/scopes.ts): the contract shared with the admin UI.
const scopes = await import("./scopes");
const { MCP_TOOLS } = await import("./tools");

const ALL_READ = ["site:read", "accounts:read", "progress:read", "audit:read", "content:read"];

describe("MCP_SERVICES", () => {
  it("lists the services in a stable order with their tools", () => {
    expect(scopes.MCP_SERVICES.map((service) => service.id)).toEqual(["site", "accounts", "progress", "audit", "content", "crm"]);
    expect(scopes.MCP_SERVICES.find((service) => service.id === "crm")).toEqual({
      id: "crm",
      tools: {
        read: ["list_leads", "get_lead", "list_my_tasks", "crm_report"],
        write: [
          "add_lead_note",
          "change_lead_stage",
          "assign_lead",
          "create_lead_task",
          "complete_lead_task",
          "log_lead_contact",
          "create_walkin_lead",
        ],
      },
      hasWrite: true,
      available: true,
    });
    for (const service of scopes.MCP_SERVICES) {
      expect(service.hasWrite || service.tools.write.length === 0).toBe(true);
      if (service.available) expect(service.tools.read.length).toBeGreaterThan(0);
    }
  });

  it("matches the registered tools exactly (every tool in one service, read/write as declared)", () => {
    const registry = scopes.MCP_SERVICES.flatMap((service) => [...service.tools.read, ...service.tools.write]);
    expect([...registry].sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
    expect(new Set(registry).size).toBe(registry.length);
    for (const tool of MCP_TOOLS) {
      expect(scopes.toolPermission(tool.name)?.level).toBe(tool.scope);
      expect(tool.annotations.readOnlyHint).toBe(tool.scope === "read");
    }
  });
});

describe("normalizeScopes", () => {
  it("maps the legacy whole-token values to the services that existed then (never crm)", () => {
    expect(scopes.normalizeScopes("read")).toEqual(ALL_READ);
    expect(scopes.normalizeScopes("read write")).toEqual([
      "site:read",
      "accounts:read",
      "accounts:write",
      "progress:read",
      "audit:read",
      "content:read",
    ]);
  });

  it("adds read for write, de-duplicates and sorts in catalogue order", () => {
    expect(scopes.normalizeScopes(["content:read", "accounts:write", "content:read"])).toEqual([
      "accounts:read",
      "accounts:write",
      "content:read",
    ]);
    expect(scopes.normalizeScopes("content:read accounts:write")).toEqual(["accounts:read", "accounts:write", "content:read"]);
  });

  it("drops unknown entries and write on read-only services", () => {
    expect(scopes.normalizeScopes(["billing:read", "site:write", "nonsense", "audit:read"])).toEqual(["audit:read"]);
    expect(scopes.normalizeScopes(["crm:write"])).toEqual(["crm:read", "crm:write"]);
    expect(scopes.normalizeScopes([])).toEqual([]);
    expect(scopes.normalizeScopes("")).toEqual([]);
  });
});

describe("isToolAllowed / scopesSummary / allowedTools", () => {
  it("checks read and write per service; write implies read", () => {
    expect(scopes.isToolAllowed(["accounts:read"], "list_accounts")).toBe(true);
    expect(scopes.isToolAllowed(["accounts:read"], "create_account")).toBe(false);
    expect(scopes.isToolAllowed(["accounts:write"], "create_account")).toBe(true);
    expect(scopes.isToolAllowed(["accounts:write"], "get_account")).toBe(true);
    expect(scopes.isToolAllowed(["accounts:write"], "site_status")).toBe(false);
    expect(scopes.isToolAllowed(ALL_READ, "drop_database")).toBe(false);
    expect(scopes.isToolAllowed([], "site_status")).toBe(false);
  });

  it("summarises every service", () => {
    expect(scopes.scopesSummary(["accounts:write", "content:read"])).toEqual({
      site: "none",
      accounts: "write",
      progress: "none",
      audit: "none",
      content: "read",
      crm: "none",
    });
  });

  it("lists the allowed tools", () => {
    expect(scopes.allowedTools(["accounts:read", "content:read"])).toEqual([
      "list_accounts",
      "get_account",
      "list_programs",
      "list_centres",
      "list_results",
    ]);
  });
});

describe("mcpScopesInputSchema", () => {
  it("accepts valid lists and returns them normalised", () => {
    expect(scopes.mcpScopesInputSchema.parse(["accounts:write", "site:read"])).toEqual(["site:read", "accounts:read", "accounts:write"]);
    expect(scopes.mcpScopesInputSchema.parse(["accounts:read", "accounts:write"])).toEqual(["accounts:read", "accounts:write"]);
  });

  it.each([
    ["empty", []],
    ["unknown service", ["billing:read"]],
    ["write on a read-only service", ["content:write"]],
    ["duplicate", ["site:read", "site:read"]],
    ["bad shape", ["site"]],
    ["legacy value in a list", ["read"]],
  ])("rejects %s", (_label, value) => {
    const result = scopes.mcpScopesInputSchema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it("rejects non-arrays", () => {
    expect(scopes.mcpScopesInputSchema.safeParse("site:read").success).toBe(false);
    expect(scopes.mcpScopesInputSchema.safeParse([1]).success).toBe(false);
  });

  it("explains each problem", () => {
    expect(scopes.scopeIssues(["content:write"])[0]).toContain("no write tools");
    expect(scopes.scopeIssues(["crm:delete"])[0]).toContain("not a known permission");
    expect(scopes.scopeIssues(["crm:read", "crm:write"])).toEqual([]);
  });
});
