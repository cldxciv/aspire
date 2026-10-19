import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { siteConfig } from "@/config/site";
import type { SubmitOutcome } from "./submit-enquiry";

export type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  /** Field errors are shown; `origin` says whether the browser or the server found them. */
  | { kind: "invalid"; count: number; origin: "client" | "server" }
  | Exclude<SubmitOutcome, { kind: "validation" }>;

/**
 * How to reach Aspire when the form can't deliver. Shows verified contact details
 * only when they exist in siteConfig (all null until Aspire verifies them).
 */
function DirectContact({ onContactPage }: { onContactPage: boolean }) {
  const { phone, email } = siteConfig.contact;
  if (phone || email) {
    return (
      <>
        Please contact Aspire directly
        {phone && (
          <>
            {" "}
            by phone on{" "}
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-bold underline">
              {phone}
            </a>
          </>
        )}
        {phone && email && " or"}
        {email && (
          <>
            {" "}
            by email at{" "}
            <a href={`mailto:${email}`} className="font-bold underline">
              {email}
            </a>
          </>
        )}
        .
      </>
    );
  }
  if (onContactPage) {
    return <>Please contact Aspire directly. Official contact details will be listed on this page once verified.</>;
  }
  return (
    <>
      Please contact Aspire directly — see the{" "}
      <Link href="/contact" className="font-bold underline">
        contact page
      </Link>
      .
    </>
  );
}

function minutesFrom(seconds?: number) {
  if (!seconds) return "a few minutes";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

function StatusMessage({ state, onContactPage }: { state: FormState; onContactPage: boolean }): ReactNode {
  const contact = <DirectContact onContactPage={onContactPage} />;

  switch (state.kind) {
    case "idle":
      return null;
    case "submitting":
      return <p className="sr-only">Sending your enquiry, please wait.</p>;
    case "invalid":
      return state.origin === "client" ? (
        <Notice variant="error" title="Please check the highlighted fields">
          {state.count === 1 ? "1 field needs" : `${state.count} fields need`} attention. Nothing has been sent yet.
        </Notice>
      ) : (
        <Notice variant="error" title="Some details need correcting">
          Your enquiry was not sent. {state.count === 1 ? "1 field was" : `${state.count} fields were`} not accepted
          — please check the highlighted fields and try again.
        </Notice>
      );
    case "received":
      return (
        <Notice variant="success" title="Enquiry received">
          Thank you — Aspire has received your enquiry. Your reference is{" "}
          <strong className="font-extrabold">{state.reference}</strong>. Please keep it for any follow-up.
        </Notice>
      );
    case "not_configured":
      return (
        <Notice variant="warning" title="Your enquiry has not been sent">
          Your details passed our checks, but online enquiries aren&apos;t connected yet, so nothing was sent or
          stored. {contact} Your details are still in the form.
        </Notice>
      );
    case "rate_limited":
      return (
        <Notice variant="error" title="Too many attempts">
          Your enquiry was not sent because several enquiries came from this connection recently. Please wait{" "}
          {minutesFrom(state.retryAfterSeconds)} and try again. Your details are still in the form.
        </Notice>
      );
    case "rejected":
      return (
        <Notice variant="error" title="Your enquiry couldn't be sent">
          The request couldn&apos;t be verified, so nothing was sent. Please refresh the page and try again. {contact}
        </Notice>
      );
    case "unavailable":
      return (
        <Notice variant="error" title="Online enquiries are unavailable right now">
          We couldn&apos;t reach the enquiry service, so nothing was sent. Please try again later. {contact}
        </Notice>
      );
    case "server_error":
      return (
        <Notice variant="error" title="Something went wrong">
          We couldn&apos;t confirm that your enquiry was received. Please try again in a few minutes. {contact}
        </Notice>
      );
    case "timeout":
      return (
        <Notice variant="error" title="No response from the server">
          The server took too long to reply, so we can&apos;t confirm that your enquiry was received. Please try
          again in a moment. Your details are still in the form.
        </Notice>
      );
    case "network":
      return (
        <Notice variant="error" title="Connection problem">
          We couldn&apos;t connect to the server, so your enquiry may not have been sent. Check your internet
          connection and try again. Your details are still in the form.
        </Notice>
      );
  }
}

/**
 * Persistent polite live region: it is always in the DOM so screen readers
 * reliably announce each new status.
 */
export function FormStatus({ state, onContactPage }: { state: FormState; onContactPage: boolean }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="[&>*]:mt-4">
      <StatusMessage state={state} onContactPage={onContactPage} />
    </div>
  );
}
