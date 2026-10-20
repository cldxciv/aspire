import type { Metadata } from "next";
import { headers } from "next/headers";
import { McpExplainer } from "@/components/mcp-admin/McpExplainer";
import { McpTokenManager, type McpTokenManagerMessages } from "@/components/mcp-admin/McpTokenManager";
import { loadMcpTokenViews, resolveMcpOrigin } from "@/components/mcp-admin/server";
import { mcpEndpoint } from "@/components/mcp-admin/token-view";
import { AdminPreviewPanel } from "@/components/portal/AdminViews";
import { PortalPageHeader } from "@/components/portal/PortalBlocks";
import { PortalGate } from "@/components/portal/PortalGate";
import type { Messages } from "@/i18n/messages/types";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("mcp");
  return { title: t.meta.title, description: t.meta.description };
}

/**
 * Admin: AI agent access (MCP access tokens). The token list is read on the server only after the
 * admin gate passed (an admin with a temporary password is sent to change it first); every change
 * goes through the same-origin JSON APIs under /api/admin/mcp-tokens, which re-check the role.
 * Signed-out visitors get the data-free preview (or the login redirect when previews are off).
 */
export default async function AdminMcpPage() {
  const [locale, t, portal] = await Promise.all([getLocale(), getMessages("mcp"), getMessages("portal")]);
  const messages: McpTokenManagerMessages = {
    mcp: {
      create: t.create,
      secret: t.secret,
      list: t.list,
      status: t.status,
      access: t.access,
      services: t.services,
      revoke: t.revoke,
      announce: t.announce,
      errors: t.errors,
    },
    errors: portal.errors,
  };
  return (
    <PortalGate area="admin" path="/admin/mcp">
      {(access) => (
        <>
          <PortalPageHeader
            area="admin"
            eyebrow={portal.areas.admin.label}
            title={t.page.title}
            description={access.kind === "session" ? t.page.lead : t.page.previewLead}
            badge={access.kind === "preview" ? portal.blocks.previewBadge : undefined}
          />
          {access.kind === "session" ? (
            <AdminMcpContent t={t} messages={messages} />
          ) : (
            <div className="grid gap-6">
              <McpExplainer t={t.explainer} services={t.services} serviceWrite={t.serviceWrite} endpoint={null} />
              <AdminPreviewPanel
                id="admin-mcp-preview"
                title={t.page.previewTitle}
                body={t.page.previewEmpty}
                locale={locale}
                path="/admin/mcp"
                t={portal}
              />
            </div>
          )}
        </>
      )}
    </PortalGate>
  );
}

/** Rendered only inside the admin branch of the gate (already under its Suspense boundary). */
async function AdminMcpContent({ t, messages }: { t: Messages<"mcp">; messages: McpTokenManagerMessages }) {
  const origin = resolveMcpOrigin(await headers());
  return (
    <div className="grid min-w-0 gap-6">
      <McpExplainer
        t={t.explainer}
        services={t.services}
        serviceWrite={t.serviceWrite}
        endpoint={origin ? mcpEndpoint(origin) : null}
      />
      <McpTokenManager initialTokens={loadMcpTokenViews()} messages={messages} />
    </div>
  );
}
