import "server-only";

import type { Locale } from "@/i18n/config";
import type { ConsentVersion, EnquiryContext } from "@/lib/contracts/enquiry";

/**
 * Consent statements by version (D-039). The text a lead is stored with comes from HERE, never
 * from the request: the client only names the version it showed (`consentVersion`).
 *
 * Each entry is the exact sentence the forms render — `forms.shared.consent` with `{link}`
 * replaced by `forms.shared.consentLink` — in each language. enquiry-consent.test.ts fails when
 * the messages change without a new version. To change the wording: add a new version here and
 * in the contract's CONSENT_VERSIONS, update both message files, and keep the old entries (stored
 * leads refer to them).
 *
 * LEGAL REVIEW PENDING (D-039): the parent/guardian wording and the contact channels.
 */
export const CONSENT_TEXTS: Readonly<Record<ConsentVersion, Readonly<Record<Locale, string>>>> = {
  "2026-10-20.v2": {
    en:
      "I am the student's parent or guardian, or have their permission, and I agree that Aspire may contact me " +
      "about this enquiry by phone, WhatsApp or email. I have read the privacy notice.",
    hi:
      "मैं विद्यार्थी का माता-पिता या अभिभावक हूँ, या मेरे पास उनकी अनुमति है, और मैं सहमत हूँ कि Aspire इस पूछताछ " +
      "के बारे में मुझसे फ़ोन, WhatsApp या ईमेल पर संपर्क कर सकता है। मैंने गोपनीयता सूचना पढ़ ली है।",
  },
};

/** The consent a lead is stored with: which sentence, in which language, and when. */
export interface ConsentRecord {
  version: ConsentVersion;
  locale: Locale;
  text: string;
  /** ISO-8601 server time of the submission (consent is required to submit). */
  givenAt: string;
}

/** Language the consent sentence was shown in: the context's locale, else the page prefix, else English. */
export function consentLocale(context: EnquiryContext | undefined): Locale {
  if (context?.locale) return context.locale;
  if (context?.page && /^\/hi(?:\/|$)/.test(context.page)) return "hi";
  return "en";
}

export function consentRecord(version: ConsentVersion, context: EnquiryContext | undefined, givenAt: Date): ConsentRecord {
  const locale = consentLocale(context);
  return { version, locale, text: CONSENT_TEXTS[version][locale], givenAt: givenAt.toISOString() };
}
