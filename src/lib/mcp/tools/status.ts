import "server-only";

import { z } from "zod";

import { getAskConfig } from "@/lib/ask/config";
import { adminListUsers } from "@/lib/auth/accounts";
import { isPortalPreviewEnabled } from "@/lib/auth/config";
import { previewAccessPassword } from "@/lib/auth/preview-gate";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getEnquiryDeliveryStatus, getSiteOrigin } from "@/lib/server/env";

import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "../info";
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
    "Reports the Aspire website's current configuration as non-secret facts: content mode (demo vs production), whether enquiries are delivered " +
    "(the site never stores enquiries; when delivery is 'connected' each enquiry is forwarded to a configured webhook, otherwise visitors see a " +
    "'not connected' note and should phone or visit), whether Ask Aspire (AI doubt solver) has an API key, preview/password gates, account counts, " +
    "and this MCP token's name, scopes and expiry. Call it first to understand what data is real and what is DEMO.",
  scope: "read",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  run(_args, ctx) {
    const placeholders = showPlaceholderContent();
    const enquiryDelivery = getEnquiryDeliveryStatus();
    const ask = getAskConfig();
    const users = adminListUsers();
    const count = (role: string) => users.filter((u) => u.role === role && !u.disabled).length;
    const activeTokens = listMcpTokens(ctx.now).filter((t) => t.status === "active").length;

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
        stored: false,
        delivery: enquiryDelivery,
        note:
          enquiryDelivery === "connected"
            ? "Enquiry form submissions are forwarded to the configured webhook destination; the website keeps no copy, so there is no enquiry tool."
            : "No enquiry destination is configured: the form validates input and tells visitors online enquiries are not connected. Nothing is stored or sent.",
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
          expiresAt: new Date(ctx.caller.expiresAt).toISOString(),
        },
        activeTokens,
      },
    };
    return {
      ok: true,
      summary:
        `Aspire website ${MCP_SERVER_VERSION}: ${data.contentMode.mode} mode; enquiries ${enquiryDelivery} (never stored); ` +
        `Ask Aspire ${ask.configured ? "configured" : "not configured"}; token "${ctx.caller.tokenName}" (${ctx.caller.scopes}).`,
      data,
    };
  },
});
