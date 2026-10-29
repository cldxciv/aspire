import "server-only";

import { z } from "zod";

import { getAskConfig } from "@/lib/ask/config";
import { adminListUsers } from "@/lib/auth/accounts";
import { isPortalPreviewEnabled } from "@/lib/auth/config";
import { previewAccessPassword } from "@/lib/auth/preview-gate";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getEnquiryDeliveryStatus, getSiteOrigin, parseEnquiryDestination, parseEnquiryStore } from "@/lib/server/env";

import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "../info";
import { allowedTools, MCP_SERVICES, scopesSummary } from "../scopes";
import { listMcpTokens } from "../tokens";
import { defineTool, READ_ONLY } from "./types";

/**
 * `site_status`: configuration state as yes/no facts. Never a secret value, URL of a webhook,
 * password, API key, database path or IP.
 */
export const siteStatus = defineTool({
  name: "site_status",
  title: "Site status",
  description:
    "Reports the Aspire website's current configuration as non-secret facts: content mode (demo vs production), where enquiries go " +
    "(stored as CRM leads and/or forwarded to a webhook, or 'not_configured' when neither; leads are reachable through the 'crm' service tools " +
    "when this token has crm permissions), whether Rancho (the AI doubt solver) has an API key, preview/password gates, account counts, " +
    "and this MCP token's name, expiry and permissions per service (none / read / write) with the tools it may use. " +
    "Call it first to understand what data is real and what is DEMO, and what this token can do.",
  scope: "read",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  run(_args, ctx) {
    const placeholders = showPlaceholderContent();
    const enquiryDelivery = getEnquiryDeliveryStatus();
    const storedAsLeads = parseEnquiryStore(process.env).mode === "crm";
    const webhook = parseEnquiryDestination(process.env).config.kind === "webhook";
    const ask = getAskConfig();
    const users = adminListUsers();
    const count = (role: string) => users.filter((u) => u.role === role && !u.disabled).length;
    const activeTokens = listMcpTokens(ctx.now).filter((t) => t.status === "active").length;
    const access = scopesSummary(ctx.caller.scopes);
    const granted = MCP_SERVICES.filter((service) => access[service.id] !== "none")
      .map((service) => `${service.id}=${access[service.id]}`)
      .join(", ");

    const data = {
      server: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, environment: process.env.NODE_ENV ?? "unknown" },
      time: new Date(ctx.now).toISOString(),
      siteUrl: getSiteOrigin(process.env),
      contentMode: {
        mode: placeholders ? "demo" : "production",
        placeholderContentVisible: placeholders,
        note: placeholders
          ? "Demo mode: unverified placeholder records (DEMO-labelled) are visible on the site and in these tools."
          : "Production mode: only published, verified records are visible.",
      },
      enquiries: {
        delivery: enquiryDelivery,
        storedAsCrmLeads: storedAsLeads,
        webhook: webhook ? "connected" : "not_configured",
        availableViaMcp: storedAsLeads,
        note: !storedAsLeads && !webhook
          ? "Enquiries are neither stored nor forwarded: the form validates input and tells visitors online enquiries are not connected."
          : `${storedAsLeads ? "Each enquiry is stored as a CRM lead (admin portal)" : "Enquiries are not stored"}` +
            `${webhook ? " and forwarded to the configured webhook" : ""}.` +
            (storedAsLeads ? " Leads are available through the 'crm' service tools (crm:read / crm:write)." : ""),
      },
      askAspire: { configured: ask.configured, model: ask.model },
      portal: { previewShells: isPortalPreviewEnabled() },
      previewPasswordGate: { enabled: previewAccessPassword() !== null },
      accounts: {
        activeStudents: count("student"),
        activeParents: count("parent"),
        activeAdmins: count("admin"),
        disabled: users.filter((u) => u.disabled).length,
      },
      mcp: {
        thisToken: {
          name: ctx.caller.tokenName,
          scopes: ctx.caller.scopes,
          access,
          tools: allowedTools(ctx.caller.scopes),
          expiresAt: new Date(ctx.caller.expiresAt).toISOString(),
        },
        services: MCP_SERVICES.map((service) => ({
          id: service.id,
          available: service.available,
          readTools: [...service.tools.read],
          writeTools: [...service.tools.write],
        })),
        activeTokens,
      },
    };
    return {
      ok: true,
      summary:
        `Aspire website ${MCP_SERVER_VERSION}: ${data.contentMode.mode} mode; enquiries ${enquiryDelivery}${storedAsLeads ? " (stored as CRM leads)" : ""}; ` +
        `Rancho (the AI doubt solver) ${ask.configured ? "configured" : "not configured"}; token "${ctx.caller.tokenName}" can use: ${granted || "nothing"}.`,
      data,
    };
  },
});
