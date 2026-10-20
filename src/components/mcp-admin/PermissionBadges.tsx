import { format } from "@/i18n/format";
import { serviceName, type McpTokenManagerMessages } from "./labels";
import { accessOf, grantedServices, type McpServiceView, type PermissionState } from "./permissions";

type M = McpTokenManagerMessages["mcp"];

const COMPACT_LIMIT = 3;

/** One badge per granted service ("Accounts: write"); write badges stand out (text, not colour alone). */
function Badges({ items, m }: { items: ReturnType<typeof grantedServices>; m: M }) {
  return (
    <>
      {items.map(({ service, access }) => (
        <span
          key={service.id}
          className={
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold " +
            (access === "write" ? "bg-[#fff3d2] text-[#8b5b00]" : "bg-blue-soft text-[#0755b5]")
          }
        >
          {format(m.list.permissionBadge, { service: serviceName(service.id, m.services), access: m.access[access] })}
        </span>
      ))}
    </>
  );
}

/**
 * A token's permissions for the tokens table: up to three badges, "+N more", and a native
 * disclosure (`<details>`, keyboard-operable) with every service and its level.
 */
export function PermissionBadges({
  services,
  summary,
  m,
}: {
  services: readonly McpServiceView[];
  summary: PermissionState;
  m: M;
}) {
  const granted = grantedServices(services, summary);
  if (granted.length === 0) return <span className="text-muted">{m.list.noPermissions}</span>;
  const shown = granted.slice(0, COMPACT_LIMIT);
  const hidden = granted.length - shown.length;
  return (
    <details className="group min-w-0">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-1 rounded-control py-1 [&::-webkit-details-marker]:hidden">
        <Badges items={shown} m={m} />
        {hidden > 0 && <span className="text-xs font-semibold text-muted">{format(m.list.morePermissions, { count: hidden })}</span>}
        <span className="text-xs font-semibold text-blue underline-offset-2 group-open:underline">{m.list.permissionDetails}</span>
      </summary>
      <PermissionList services={services} summary={summary} m={m} className="mt-2" />
    </details>
  );
}

/** Every available service with its level (including "None"), as a definition list. */
export function PermissionList({
  services,
  summary,
  m,
  className,
}: {
  services: readonly McpServiceView[];
  summary: PermissionState;
  m: M;
  className?: string;
}) {
  return (
    <dl className={["grid gap-1 text-xs", className].filter(Boolean).join(" ")}>
      {services
        .filter((service) => service.available)
        .map((service) => {
          const access = accessOf(summary, service.id);
          return (
            <div key={service.id} className="flex flex-wrap justify-between gap-x-3 border-b border-dashed border-line pb-1 last:border-0">
              <dt className="text-[#354b66]">{serviceName(service.id, m.services)}</dt>
              <dd className={access === "write" ? "font-bold text-[#8b5b00]" : access === "read" ? "font-semibold text-navy" : "text-muted"}>
                {m.access[access]}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}
