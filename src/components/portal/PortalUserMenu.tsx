import { KeyRound, LogIn } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { buildLoginHref, CHANGE_PASSWORD_PATH, LOGIN_PATH, PORTAL_HOME } from "@/lib/auth/paths";
import type { Role, Session } from "@/lib/auth/roles";

export type PortalUserMenuMessages = {
  shell: Messages<"portal">["shell"];
  roles: Messages<"auth">["roles"];
  signOut: Messages<"auth">["signOut"];
};

/**
 * Right-hand side of the portal header (navy, `data-surface="dark"`): the signed-in account's
 * name and role, "Change password" and "Sign out" — or, for signed-out preview visitors,
 * "Not signed in" with a link to the localised login page. Pure: the caller passes the
 * verified session (see `PortalShell`).
 */
export function PortalUserMenu({
  session,
  area,
  locale,
  t,
}: {
  session: Session | null;
  /** Portal area of the page (null on /account pages). */
  area: Role | null;
  locale: Locale;
  t: PortalUserMenuMessages;
}) {
  if (!session) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[#c2d3e6]">{t.shell.notSignedIn}</span>
        <Link
          href={buildLoginHref(area ? PORTAL_HOME[area] : undefined, locale)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 font-bold text-white hover:text-gold hover:underline"
        >
          <LogIn aria-hidden="true" className="size-4" />
          {t.shell.signIn}
        </Link>
      </div>
    );
  }

  const name = session.displayName ?? session.loginId ?? "";
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="min-w-0 text-right leading-tight">
        <span className="sr-only">{format(t.shell.signedInAs, { name })}</span>
        <span aria-hidden="true" className="block max-w-[10rem] truncate text-sm font-bold text-white sm:max-w-[16rem]">
          {name}
        </span>
        <span className="block text-[11px] font-semibold text-[#c2d3e6]">{t.roles[session.role]}</span>
      </p>
      <Link
        href={localePath(CHANGE_PASSWORD_PATH, locale)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-bold text-white hover:bg-white/10 hover:text-gold"
      >
        <KeyRound aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only lg:not-sr-only">{t.shell.changePassword}</span>
      </Link>
      <SignOutButton messages={t.signOut} redirectTo={localePath(LOGIN_PATH, locale)} tone="dark" compact />
    </div>
  );
}
