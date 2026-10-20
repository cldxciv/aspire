import { GraduationCap, HeartHandshake, UserRound } from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ButtonLink } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { getPageSession } from "@/lib/auth/page-session";
import { buildChangePasswordHref, localizedPostLoginPath } from "@/lib/auth/paths";

type AccountMessages = Messages<"ranchoApp">["account"];
type AuthMessages = Pick<Messages<"auth">, "roles" | "signOut">;

const CARD = "rounded-card border border-line bg-white p-5 shadow-soft";
const HEADING_ID = "rancho-account";

/**
 * Sign-in card on /rancho (request-time: render it under <Suspense> with `RanchoAccountFallback`,
 * so the static shell never contains anything about a visitor). Signed out: Student / Parent
 * sign-in links (the login page pre-selects the tab; after signing in it opens the portal — its
 * `next` only ever accepts portal paths, so it can't return here). Signed in: "Signed in as
 * <name>", a link to the portal and Sign out (back to /rancho). No person photo beside the name
 * (D-019).
 */
export async function RanchoAccountCard({ locale, t, auth }: { locale: Locale; t: AccountMessages; auth: AuthMessages }) {
  const session = await getPageSession();

  if (!session) {
    return (
      <section aria-labelledby={HEADING_ID} className={CARD}>
        <h2 id={HEADING_ID} className="text-lg font-extrabold text-navy">
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.signedOut}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <ButtonLink href={localePath("/login?role=student", locale)} variant="dark">
            <GraduationCap aria-hidden="true" className="size-4" />
            {t.student}
          </ButtonLink>
          <ButtonLink href={localePath("/login?role=parent", locale)} variant="light">
            <HeartHandshake aria-hidden="true" className="size-4" />
            {t.parent}
          </ButtonLink>
        </div>
        <p className="mt-3 text-xs text-muted">{t.noAccount}</p>
      </section>
    );
  }

  const roleLabel = auth.roles[session.role];
  const name = session.displayName?.trim() || session.loginId?.trim() || roleLabel;
  const portalHref =
    session.mustChangePassword === true ? buildChangePasswordHref(locale) : localizedPostLoginPath(session.role, null, locale);

  return (
    <section aria-labelledby={HEADING_ID} className={CARD}>
      <h2 id={HEADING_ID} className="sr-only">
        {t.title}
      </h2>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-soft text-blue">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-navy">{format(t.signedInAs, { name })}</p>
          <p className="text-sm text-muted">{format(t.roleLine, { role: roleLabel })}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ButtonLink href={portalHref} variant="dark">
          {t.openPortal}
        </ButtonLink>
        <SignOutButton messages={auth.signOut} redirectTo={localePath("/rancho", locale)} />
      </div>
    </section>
  );
}

/** Static placeholder while the session is read (same box, no visitor data). */
export function RanchoAccountFallback({ t }: { t: AccountMessages }) {
  return (
    <section aria-labelledby={HEADING_ID} aria-busy="true" className={CARD}>
      <h2 id={HEADING_ID} className="text-lg font-extrabold text-navy">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.checking}</p>
    </section>
  );
}
