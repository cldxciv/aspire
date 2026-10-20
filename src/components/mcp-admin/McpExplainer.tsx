import { BookOpenCheck, Eye, KeyRound, PencilLine, ScrollText, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import type { Messages } from "@/i18n/messages/types";

/**
 * What MCP is, what each access level allows, that every call is audited and that tokens are
 * secrets. Server-rendered and static: no request data except the endpoint URL passed in.
 */
export function McpExplainer({ t, endpoint }: { t: Messages<"mcp">["explainer"]; endpoint: string | null }) {
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
        <Item icon={<Eye aria-hidden="true" className="size-5" />} title={t.scopesTitle} wide>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-[#d7e7fb] bg-[#eef5ff] p-3">
              <dt className="font-bold text-navy">{t.readTitle}</dt>
              <dd className="mt-1">{t.read}</dd>
            </div>
            <div className="rounded-control border border-[#f2dfa0] bg-gold-soft p-3">
              <dt className="flex items-center gap-1.5 font-bold text-navy">
                <PencilLine aria-hidden="true" className="size-4 shrink-0 text-[#8b5b00]" />
                {t.writeTitle}
              </dt>
              <dd className="mt-1">{t.write}</dd>
            </div>
          </dl>
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
