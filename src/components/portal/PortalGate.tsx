import { Suspense, type ReactNode } from "react";
import { requirePortalAccess, type PortalAccess } from "@/lib/auth/portal-access";
import type { Role } from "@/lib/auth/roles";

type GateChildren = ReactNode | ((access: PortalAccess) => ReactNode);

/**
 * Server-side access check for a portal page. Renders `children` only for a
 * verified session with `area`'s role, or when data-free previews are enabled;
 * otherwise redirects to `/login?next=<path>`.
 *
 * The session is read at request time, so the check sits under `<Suspense>`
 * (Cache Components) and nothing inside renders until it has passed. Pass a
 * function as children to branch on `access.kind` ("session" | "preview").
 */
export function PortalGate({ area, path, children }: { area: Role; path: string; children: GateChildren }) {
  return (
    <Suspense fallback={<GateFallback />}>
      <Gate area={area} path={path}>
        {children}
      </Gate>
    </Suspense>
  );
}

async function Gate({ area, path, children }: { area: Role; path: string; children: GateChildren }) {
  const access = await requirePortalAccess(area, path);
  return <>{typeof children === "function" ? children(access) : children}</>;
}

function GateFallback() {
  return (
    <div role="status" className="rounded-card border border-line bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold text-muted">Checking access…</p>
      <div aria-hidden="true" className="mt-4 space-y-3">
        <div className="h-6 w-2/3 rounded-md bg-surface" />
        <div className="h-4 w-full rounded-md bg-surface" />
        <div className="h-4 w-5/6 rounded-md bg-surface" />
      </div>
    </div>
  );
}
