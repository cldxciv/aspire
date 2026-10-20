import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { Role } from "@/lib/auth/roles";
import { SignOutButton } from "./SignOutButton";

/**
 * Shown on the login page to a visitor who already has a verified session: who they are,
 * a link to their own portal (or to the change-password page while a temporary password is
 * pending) and a sign-out button. No password field is rendered for signed-in visitors.
 */
export function SignedInPanel({
  t,
  name,
  role,
  mustChangePassword,
  portalHref,
  changePasswordHref,
  signOutRedirect,
  otherRoleRequested,
}: {
  t: Pick<Messages<"auth">, "roles" | "signedIn" | "signOut">;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  portalHref: string;
  changePasswordHref: string;
  /** Localised login page to reload after signing out. */
  signOutRedirect: string;
  /** The requested `next` belongs to another role's portal. */
  otherRoleRequested: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-soft text-blue">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-navy">{t.signedIn.title}</h2>
          <p className="mt-1 break-words text-muted">{format(t.signedIn.body, { name, role: t.roles[role] })}</p>
        </div>
      </div>

      {mustChangePassword && (
        <Notice variant="warning">{t.signedIn.mustChange}</Notice>
      )}
      {otherRoleRequested && !mustChangePassword && <Notice>{t.signedIn.otherRole}</Notice>}

      <div className="flex flex-wrap items-start gap-3">
        {mustChangePassword ? (
          <ButtonLink href={changePasswordHref} variant="dark">
            <KeyRound aria-hidden="true" className="size-4" />
            {t.signedIn.changePassword}
          </ButtonLink>
        ) : (
          <ButtonLink href={portalHref} variant="dark">
            {t.signedIn.goToPortal}
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        )}
        <SignOutButton messages={t.signOut} redirectTo={signOutRedirect} />
      </div>
      <p className="text-sm text-muted">{t.signedIn.switchHint}</p>
    </div>
  );
}
