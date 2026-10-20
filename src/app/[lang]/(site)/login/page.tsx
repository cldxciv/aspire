import { ArrowRight, GraduationCap, HeartHandshake, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { LoginForm, type LoginFormMessages } from "@/components/auth/LoginForm";
import { SignedInPanel } from "@/components/auth/SignedInPanel";
import { ButtonLink, MediaSplit, Notice, Section } from "@/components/ui";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getLocale, getMessages, localeAlternates } from "@/i18n/server";
import { getPageSession } from "@/lib/auth/page-session";
import {
  buildChangePasswordHref,
  buildLoginHref,
  FORGOT_PASSWORD_PATH,
  localizedPostLoginPath,
  portalRoleForPath,
  sanitizeNextPath,
} from "@/lib/auth/paths";
import { isRole, type Role } from "@/lib/auth/roles";
import { localizeImage } from "@/lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("auth");
  return {
    title: t.login.metaTitle,
    description: t.login.metaDescription,
    robots: { index: false, follow: true },
    alternates: await localeAlternates("/login"),
  };
}

type SearchParams = PageProps<"/[lang]/login">["searchParams"];

/**
 * /login and /hi/login (D-029): Student / Parent / Admin sign-in. Signed-in visitors see who
 * they are, a link to their portal and a sign-out button instead of a password form.
 * `?role=` only pre-selects a tab and `?next=` is sanitised to a portal path — neither grants
 * anything. Image-rich 50/50 layout (D-030): no person photo beside the signed-in name.
 */
export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const [locale, t, common] = await Promise.all([getLocale(), getMessages("auth"), getMessages("common")]);
  const l = t.login;
  const roleIcons = { student: GraduationCap, parent: HeartHandshake, admin: ShieldCheck };

  return (
    <>
      <AuthSplit
        eyebrow={l.eyebrow}
        title={l.title}
        lead={l.lead}
        image={localizeImage(stockImages.deskLampEvening, locale)}
        imageLabel={common.labels.illustrativeStockPhoto}
        aside={
          <>
            <h2 className="flex items-center gap-2 font-bold">
              <ShieldCheck aria-hidden="true" className="size-5 text-gold" />
              {l.safety.title}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#dbe8f7]">
              <li>{l.safety.point1}</li>
              <li>{l.safety.point2}</li>
              <li>{l.safety.point3}</li>
            </ul>
          </>
        }
      >
        <Suspense fallback={<p className="text-sm text-muted">{l.loading}</p>}>
          <LoginCard searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </AuthSplit>

      <Section aria-labelledby="login-help-title">
        <MediaSplit
          image={localizeImage(stockImages.tableDiscussion, locale)}
          imageSide="left"
          imageLabel={common.labels.illustrativeStockPhoto}
        >
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{l.help.eyebrow}</p>
          <h2 id="login-help-title" className="text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold leading-tight text-navy">
            {l.help.title}
          </h2>
          <p className="mt-2 text-muted">{l.help.body}</p>
          <ul className="mt-5 grid gap-4">
            {(["student", "parent", "admin"] as const).map((role) => {
              const Icon = roleIcons[role];
              return (
                <li key={role} className="flex gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-navy">{t.roles[role]}</h3>
                    <p className="text-sm text-muted">{l.help[role]}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-card bg-surface p-5">
            <h3 className="font-bold text-navy">{l.help.noAccountTitle}</h3>
            <p className="mt-1 text-sm text-muted">{l.help.noAccountBody}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <ButtonLink href={localePath("/contact", locale)}>
                {l.help.contact}
                <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
              <ButtonLink href={localePath("/admissions", locale)} variant="outline">
                {l.help.admissions}
              </ButtonLink>
            </div>
          </div>
        </MediaSplit>
      </Section>
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Request-time part: search params and the verified session (under <Suspense>). */
async function LoginCard({ searchParams, locale, t }: { searchParams: SearchParams; locale: Locale; t: Messages<"auth"> }) {
  const params = await searchParams;
  const next = sanitizeNextPath(first(params.next));
  const session = await getPageSession();

  if (session) {
    return (
      <SignedInPanel
        t={t}
        name={session.displayName ?? session.loginId ?? ""}
        role={session.role}
        mustChangePassword={session.mustChangePassword === true}
        portalHref={localizedPostLoginPath(session.role, next, locale)}
        changePasswordHref={buildChangePasswordHref(locale, next)}
        signOutRedirect={buildLoginHref(next, locale)}
        otherRoleRequested={next !== null && portalRoleForPath(next) !== session.role}
      />
    );
  }

  const roleParam = first(params.role);
  const initialRole: Role =
    roleParam === "staff"
      ? "admin"
      : isRole(roleParam)
        ? roleParam
        : next
          ? (portalRoleForPath(next) ?? "student")
          : "student";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop server-only copy from the client payload
  const { help, safety, metaTitle, metaDescription, ...login } = t.login;
  const messages: LoginFormMessages = { roles: t.roles, roleHints: t.roleHints, passwordToggle: t.passwordToggle, login };
  return (
    <>
      {next && (
        <Notice className="mb-4" role="status">
          {t.login.nextNotice}
        </Notice>
      )}
      <LoginForm
        messages={messages}
        initialRole={initialRole}
        next={next}
        forgotHref={localePath(FORGOT_PASSWORD_PATH, locale)}
      />
    </>
  );
}
