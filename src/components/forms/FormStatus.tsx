import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { siteConfig } from "@/config/site";
import type { Messages } from "@/i18n/messages/types";
import { formatNodes } from "./format-nodes";
import type { SubmitOutcome } from "./submit-enquiry";

export type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  /** Field errors are shown; `origin` says whether the browser or the server found them. */
  | { kind: "invalid"; count: number; origin: "client" | "server" }
  | Exclude<SubmitOutcome, { kind: "validation" }>;

/** The `forms.shared` messages FormStatus and DirectContact read. */
export type FormStatusMessages = Pick<Messages<"forms">["shared"], "status" | "directContact" | "wait">;

/**
 * How to reach Aspire when the form can't deliver. Shows verified contact details
 * only when they exist in siteConfig (all null until Aspire verifies them).
 * Exported for the hero form's "not connected yet" notice. `contactHref` is the
 * locale-aware contact page URL (`localePath("/contact", locale)`).
 */
export function DirectContact({
  onContactPage,
  messages,
  contactHref = "/contact",
}: {
  onContactPage: boolean;
  messages: FormStatusMessages["directContact"];
  contactHref?: string;
}) {
  const { phone, email } = siteConfig.contact;
  const phoneLink = phone ? (
    <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-bold underline">
      {phone}
    </a>
  ) : null;
  const emailLink = email ? (
    <a href={`mailto:${email}`} className="font-bold underline">
      {email}
    </a>
  ) : null;

  if (phoneLink && emailLink) return <>{formatNodes(messages.byPhoneOrEmail, { phone: phoneLink, email: emailLink })}</>;
  if (phoneLink) return <>{formatNodes(messages.byPhone, { phone: phoneLink })}</>;
  if (emailLink) return <>{formatNodes(messages.byEmail, { email: emailLink })}</>;
  if (onContactPage) return <>{messages.onContactPage}</>;
  return (
    <>
      {formatNodes(messages.seeContactPage, {
        link: (
          <Link href={contactHref} className="font-bold underline">
            {messages.contactPageLink}
          </Link>
        ),
      })}
    </>
  );
}

function waitText(t: FormStatusMessages["wait"], seconds?: number): string {
  if (!seconds) return t.fewMinutes;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? t.oneMinute : t.minutes.replace("{count}", String(minutes));
}

function StatusMessage({
  state,
  onContactPage,
  messages,
  contactHref,
}: {
  state: FormState;
  onContactPage: boolean;
  messages: FormStatusMessages;
  contactHref?: string;
}): ReactNode {
  const t = messages.status;
  const contact = <DirectContact onContactPage={onContactPage} messages={messages.directContact} contactHref={contactHref} />;

  switch (state.kind) {
    case "idle":
      return null;
    case "submitting":
      return <p className="sr-only">{t.submitting}</p>;
    case "invalid": {
      const count = String(state.count);
      return state.origin === "client" ? (
        <Notice variant="error" title={t.invalidClientTitle}>
          {state.count === 1 ? t.invalidClientOne : t.invalidClientMany.replace("{count}", count)}
        </Notice>
      ) : (
        <Notice variant="error" title={t.invalidServerTitle}>
          {state.count === 1 ? t.invalidServerOne : t.invalidServerMany.replace("{count}", count)}
        </Notice>
      );
    }
    case "received":
      return (
        <Notice variant="success" title={t.receivedTitle}>
          {formatNodes(t.receivedBody, { reference: <strong className="font-extrabold">{state.reference}</strong> })}
        </Notice>
      );
    case "not_configured":
      return (
        <Notice variant="warning" title={t.notConfiguredTitle}>
          {formatNodes(t.notConfiguredBody, { contact })}
        </Notice>
      );
    case "rate_limited":
      return (
        <Notice variant="error" title={t.rateLimitedTitle}>
          {formatNodes(t.rateLimitedBody, { wait: waitText(messages.wait, state.retryAfterSeconds) })}
        </Notice>
      );
    case "rejected":
      return (
        <Notice variant="error" title={t.rejectedTitle}>
          {formatNodes(t.rejectedBody, { contact })}
        </Notice>
      );
    case "unavailable":
      return (
        <Notice variant="error" title={t.unavailableTitle}>
          {formatNodes(t.unavailableBody, { contact })}
        </Notice>
      );
    case "server_error":
      return (
        <Notice variant="error" title={t.serverErrorTitle}>
          {formatNodes(t.serverErrorBody, { contact })}
        </Notice>
      );
    case "timeout":
      return (
        <Notice variant="error" title={t.timeoutTitle}>
          {t.timeoutBody}
        </Notice>
      );
    case "network":
      return (
        <Notice variant="error" title={t.networkTitle}>
          {t.networkBody}
        </Notice>
      );
  }
}

/**
 * Persistent polite live region: it is always in the DOM so screen readers
 * reliably announce each new status. Copy comes from `forms.shared` (chosen by the
 * outcome kind, never the server's English `message`).
 */
export function FormStatus({
  state,
  onContactPage,
  messages,
  contactHref,
}: {
  state: FormState;
  onContactPage: boolean;
  messages: FormStatusMessages;
  contactHref?: string;
}) {
  return (
    <div aria-live="polite" aria-atomic="true" className="[&>*]:mt-4">
      <StatusMessage state={state} onContactPage={onContactPage} messages={messages} contactHref={contactHref} />
    </div>
  );
}
