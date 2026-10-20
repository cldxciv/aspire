import { BookOpenCheck, KeyRound, LayoutList, ScrollText, Terminal, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { Messages } from "@/i18n/messages/types";
import { serviceDescription, serviceName } from "./labels";
import { MCP_SERVICE_VIEWS, type McpServiceView } from "./permissions";

type McpT = Messages<"mcp">;

/**
 * What MCP is, what each service's Read / Write permission allows (from the service catalogue in
 * src/lib/mcp/scopes.ts), a warning about Write, that every call is audited and that tokens are
 * secrets. Server-rendered and static: no request data except the endpoint URL passed in.
 */
export function McpExplainer({
  t,
  services: names,
  serviceWrite,
  endpoint,
  catalogue = MCP_SERVICE_VIEWS,
}: {
  t: McpT["explainer"];
  services: McpT["services"];
  serviceWrite: McpT["serviceWrite"];
  endpoint: string | null;
  catalogue?: readonly McpServiceView[];
}) {
  const writeText = serviceWrite as Record<string, string | undefined>;
  return (
    <section aria-labelledby="mcp-explainer-title" className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id="mcp-explainer-title" className="text-lg font-extrabold text-navy">
        {t.title}
      </h2>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <Item icon={<BookOpenCheck aria-hidden="true" className="size-5" />} title={t.whatTitle}>
          <p>{t.what}</p>
          {endpoint && (
            <code lang="en" translate="no" className="mt-2 block break-all rounded-control border border-line bg-[#f4f7fb] px-3 py-2 font-mono text-sm text-navy">
              {endpoint}
            </code>
          )}
        </Item>
        <Item icon={<Terminal aria-hidden="true" className="size-5" />} title={t.setupTitle}>
          <p>{t.setup}</p>
        </Item>

        <Item icon={<LayoutList aria-hidden="true" className="size-5" />} title={t.servicesTitle} wide>
          <p>{t.servicesLead}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {catalogue.map((service) => {
              const write = writeText[service.id];
              return (
                <li key={service.id} className="min-w-0 rounded-control border border-line bg-[#fbfdff] p-3">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                    {serviceName(service.id, names)}
                    {!service.available && <Badge variant="neutral">{t.comingSoon}</Badge>}
                  </p>
                  {service.available ? (
                    <dl className="mt-1 grid gap-1">
                      <div>
                        <dt className="inline font-semibold text-[#354b66]">{t.read}: </dt>
                        <dd className="inline">{serviceDescription(service.id, names)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-[#8b5b00]">{t.write}: </dt>
                        <dd className="inline">{service.hasWrite && write ? write : t.noWrite}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-1">{serviceDescription(service.id, names)}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div role="note" className="mt-3 flex gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-[#5c4a12]">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="block">{t.writeWarningTitle}</strong>
              {t.writeWarning}
            </p>
          </div>
        </Item>

        <Item icon={<ScrollText aria-hidden="true" className="size-5" />} title={t.auditTitle}>
          <p>{t.audit}</p>
        </Item>
        <Item icon={<KeyRound aria-hidden="true" className="size-5" />} title={t.secretTitle}>
          <p>{t.secret}</p>
        </Item>
      </div>
    </section>
  );
}

function Item({ icon, title, wide = false, children }: { icon: ReactNode; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "min-w-0 md:col-span-2" : "min-w-0"}>
      <h3 className="flex items-center gap-2 font-bold text-navy">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-soft text-blue">{icon}</span>
        {title}
      </h3>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  );
}
