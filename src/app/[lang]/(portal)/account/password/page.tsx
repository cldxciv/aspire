import { ArrowLeft, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ChangePasswordForm, type ChangePasswordMessages } from "@/components/auth/ChangePasswordForm";
import { PortalShell } from "@/components/portal/PortalShell";
import { ButtonLink, Notice } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { getLocale, getMessages } from "@/i18n/server";
import { localizedPostLoginPath, sanitizeNextPath } from "@/lib/auth/paths";
import { requireSignedIn } from "@/lib/auth/portal-access";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("auth");
  // noindex comes from the (portal) layout; the proxy also sends X-Robots-Tag for /account.
  return { title: t.changePassword.metaTitle, description: t.changePassword.metaDescription };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Change password for every role (D-029), and the page accounts with an admin-issued
 * temporary password are sent to before any portal page. Signed-out visitors are redirected
 * to the login page of their locale (no preview). Success → the user's portal, in this locale.
 */
export default async function ChangePasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const [locale, t, common] = await Promise.all([getLocale(), getMessages("auth"), getMessages("common")]);
  const c = t.changePassword;
  const image = localizeImage(stockImages.libraryAisle, locale);
  // Role-agnostic portal chrome (no area sidebar), rendered by the page rather than an
  // `account/layout.tsx` so the route adds no layout of its own.
  return (
    <PortalShell area={null}>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="change-password-title" className="min-w-0">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{c.eyebrow}</p>
          <h1 id="change-password-title" className="font-serif text-[clamp(1.9rem,4vw,2.5rem)] font-semibold leading-tight text-navy">
            {c.title}
          </h1>
          <p className="mt-2 max-w-xl text-muted">{c.lead}</p>
          <div data-surface="light" className="mt-6 rounded-card border border-line bg-white p-5 shadow-card md:p-7">
            <Suspense fallback={<p className="text-sm text-muted">{c.loading}</p>}>
              <ChangePasswordContent searchParams={searchParams} locale={locale} t={t} />
            </Suspense>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <figure className="relative m-0 aspect-16/10 overflow-hidden rounded-card bg-navy shadow-card lg:aspect-auto lg:min-h-80 lg:flex-1">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw"
              className="object-cover"
            />
            <figcaption className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {common.labels.illustrativeStockPhoto}
            </figcaption>
          </figure>
          <section aria-labelledby="password-tips" data-surface="dark" className="rounded-card bg-navy p-5 text-white shadow-card">
            <h2 id="password-tips" className="flex items-center gap-2 font-bold">
              <Lightbulb aria-hidden="true" className="size-5 text-gold" />
              {c.tips.title}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#dbe8f7]">
              <li>{c.tips.tip1}</li>
              <li>{c.tips.tip2}</li>
              <li>{c.tips.tip3}</li>
            </ul>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}

/** Request-time part: the verified session (any role) and the sanitised `next`. */
async function ChangePasswordContent({
  searchParams,
  locale,
  t,
}: {
  searchParams: SearchParams;
  locale: Locale;
  t: Messages<"auth">;
}) {
  const session = await requireSignedIn(locale);
  const next = sanitizeNextPath(first((await searchParams).next));
  const c = t.changePassword;
  const messages: ChangePasswordMessages = {
    form: c,
    passwordToggle: t.passwordToggle,
    rateLimitedOne: t.login.errors.rateLimitedOne,
    rateLimitedMany: t.login.errors.rateLimitedMany,
    network: t.login.errors.network,
    blocked: t.login.errors.blocked,
    server: t.login.errors.server,
  };
  const name = session.displayName ?? session.loginId ?? "";
  return (
    <div className="flex flex-col gap-4">
      {session.mustChangePassword ? (
        <Notice variant="warning" title={c.mustChangeTitle}>
          {c.mustChangeBody}
        </Notice>
      ) : (
        <p className="break-words text-sm text-muted">{format(c.signedInAs, { name, role: t.roles[session.role] })}</p>
      )}
      <ChangePasswordForm messages={messages} role={session.role} loginId={session.loginId} next={next} />
      {!session.mustChangePassword && (
        <ButtonLink href={localizedPostLoginPath(session.role, next, locale)} variant="link" className="self-start">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {c.backToPortal}
        </ButtonLink>
      )}
    </div>
  );
}
