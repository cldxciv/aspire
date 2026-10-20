import "server-only";

import type { Locale } from "@/i18n/config";
import type { ConsentVersion, EnquiryContext } from "@/lib/contracts/enquiry";
import type { LeadGateConsentVersion } from "@/lib/lead-gate/contract";

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

/**
 * Consent statements of the lead gate (contact details before a free tool's result;
 * docs/lead-gate-plan.md), by version. Kept apart from CONSENT_TEXTS so neither endpoint can
 * accept the other's sentence: /api/enquiries validates against the enquiry contract's
 * CONSENT_VERSIONS, /api/lead-gate against LEAD_GATE_CONSENT_VERSIONS. Each entry is
 * `leadGate.consent` with `{link}` replaced by `leadGate.consentLink` (a test enforces it).
 * Same change rule as above: new wording → new version; keep old entries.
 *
 * LEGAL REVIEW PENDING (docs/lead-gate-plan.md §8, TG-1 … TG-4): the single tick covers the
 * parent/guardian declaration, contact by phone/WhatsApp and noting which tools are used.
 */
export const LEAD_GATE_CONSENT_TEXTS: Readonly<Record<LeadGateConsentVersion, Readonly<Record<Locale, string>>>> = {
  "2026-10-21.gate.v1": {
    en:
      "I am the student's parent or guardian, or I am the student and my parent or guardian agrees. Aspire may contact " +
      "the number above by phone or WhatsApp about Aspire's courses and admissions, and may note which free tools are " +
      "used on this browser (the tool, exam and score range, never answers, questions or photos). I have read the " +
      "privacy notice.",
    hi:
      "मैं विद्यार्थी का माता-पिता या अभिभावक हूँ, या मैं विद्यार्थी हूँ और मेरे माता-पिता या अभिभावक इसके लिए सहमत हैं। " +
      "Aspire ऊपर दिए नंबर पर फ़ोन या WhatsApp से Aspire के कोर्स और प्रवेश के बारे में संपर्क कर सकता है, और यह नोट कर " +
      "सकता है कि इस ब्राउज़र पर कौन-से मुफ़्त टूल इस्तेमाल हुए (टूल, परीक्षा और अंकों की सीमा, लेकिन उत्तर, प्रश्न या फ़ोटो " +
      "कभी नहीं)। मैंने गोपनीयता सूचना पढ़ ली है।",
  },
};

/** The lead-gate consent a capture is stored with (same shape as an enquiry's, gate version). */
export interface LeadGateConsentRecord {
  version: LeadGateConsentVersion;
  locale: Locale;
  text: string;
  givenAt: string;
}

export function leadGateConsentRecord(version: LeadGateConsentVersion, locale: Locale, givenAt: Date): LeadGateConsentRecord {
  return { version, locale, text: LEAD_GATE_CONSENT_TEXTS[version][locale], givenAt: givenAt.toISOString() };
}
