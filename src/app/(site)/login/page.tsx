import { Eye, GraduationCap, HeartHandshake, Lock, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, ButtonLink, Card, Notice, PageHero, Section } from "@/components/ui";
import { isPortalPreviewEnabled } from "@/lib/auth/config";
import { PORTAL_HOME, portalRoleForPath, sanitizeNextPath } from "@/lib/auth/paths";
import { isRole, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Portal sign-in",
  description:
    "Student, parent and staff portal sign-in for Aspire IIT & Medical is not available yet. See what is planned and how to contact Aspire.",
  robots: { index: false, follow: true },
};

type PortalOption = { role: Role; title: string; name: string; description: string; icon: LucideIcon; tile: string };

const OPTIONS: PortalOption[] = [
  {
    role: "student",
    title: "Student",
    name: "student",
    description: "For enrolled students: timetable, study material and progress, once Aspire's systems are connected.",
    icon: GraduationCap,
    tile: "bg-blue-soft text-blue",
  },
  {
    role: "parent",
    title: "Parent or guardian",
    name: "parent",
    description:
      "For families of enrolled learners. You will only see learners Aspire has linked to your account and authorised.",
    icon: HeartHandshake,
    tile: "bg-success-soft text-[#0f6b48]",
  },
  {
    role: "admin",
    title: "Aspire staff",
    name: "staff",
    description: "For authorised Aspire staff managing enquiries and website content.",
    icon: ShieldCheck,
    tile: "bg-gold-soft text-[#7a5600]",
  },
];

/**
 * /login — explains that portal sign-in is not available. There is deliberately
 * no form and no password field: no identity provider is integrated (D-011).
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <PageHero
        title="Portal sign-in"
        lead="Student, parent and staff portals are being prepared. Sign-in isn't available yet."
        crumbs={[{ label: "Portal sign-in" }]}
      />
      <Section>
        <Notice variant="warning" title="Sign-in isn't connected yet" className="mb-8 max-w-3xl">
          Aspire hasn&apos;t connected an identity provider, so there are no student, parent or staff accounts to sign
          in to. This page will never ask for a password until a secure sign-in service is in place.
        </Notice>

        <Suspense fallback={<PortalOptions preview={false} suggested={null} next={null} />}>
          <PortalOptionsForRequest searchParams={searchParams} />
        </Suspense>

        <div className="mt-10 flex flex-col gap-4 rounded-card bg-surface p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-navy">Need help now?</h2>
            <p className="mt-1 text-muted">For enrolment, class or account questions, contact the Aspire team directly.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/contact">Contact Aspire</ButtonLink>
            <ButtonLink href="/admissions" variant="outline">
              Admissions
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the request (search params, preview flag), so it streams in under
 * <Suspense>. `?role=` only highlights a card — it is never used for access.
 */
async function PortalOptionsForRequest({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = sanitizeNextPath(first(params.next));
  const roleParam = first(params.role);
  const suggested = roleParam === "staff" ? "admin" : isRole(roleParam) ? roleParam : next ? portalRoleForPath(next) : null;
  return <PortalOptions preview={isPortalPreviewEnabled()} suggested={suggested} next={next} />;
}

function PortalOptions({ preview, suggested, next }: { preview: boolean; suggested: Role | null; next: string | null }) {
  return (
    <>
      {next && (
        <Notice className="mb-6 max-w-3xl" title="That page needs a signed-in account">
          <code className="font-mono">{next}</code> is part of a portal. You&apos;ll be able to continue there once
          sign-in is available.
        </Notice>
      )}

      <h2 className="mb-4 text-xl font-extrabold text-navy">Choose your portal</h2>
      <ul className="grid gap-4 md:grid-cols-3">
        {OPTIONS.map(({ role, title, name, description, icon: Icon, tile }) => {
          const isSuggested = suggested === role;
          return (
            <li key={role}>
              <Card className={cn("flex h-full flex-col p-5", isSuggested && "ring-2 ring-blue")}>
                <div className="flex items-start justify-between gap-3">
                  <span aria-hidden="true" className={cn("grid size-11 place-items-center rounded-xl", tile)}>
                    <Icon className="size-5" />
                  </span>
                  {isSuggested && <Badge variant="info">You selected this</Badge>}
                </div>
                <h3 className="mt-3 text-lg font-bold text-navy">{title}</h3>
                <p className="mt-1 text-sm text-muted">{description}</p>
                <div className="mt-auto flex flex-col items-start gap-3 pt-5">
                  <Badge variant="neutral">
                    <Lock aria-hidden="true" className="size-3" />
                    Sign-in not available yet
                  </Badge>
                  {preview && (
                    <ButtonLink href={PORTAL_HOME[role]} variant="outline">
                      <Eye aria-hidden="true" className="size-4" />
                      Preview {name} portal
                    </ButtonLink>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {preview && (
        <p className="mt-4 max-w-3xl text-sm text-muted">
          <strong className="text-ink">Preview</strong> links open data-free layouts for design review. They are not
          accounts and show no real records.
        </p>
      )}
    </>
  );
}
