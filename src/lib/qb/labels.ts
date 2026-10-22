import { PATTERNS } from "./patterns";
import type { Bilingual, QbExam, QbFidelity, QbSource } from "./types";

/**
 * Source labels (owner: QB-CORE-A; §B2, A7-14). Client-safe.
 *
 * - `sourceLabel` is the PUBLIC label, built only from verified, staff-entered fields (exam, year,
 *   date, session, shift, paper, question number). It never uses `claimedSource` or `aspireRef`.
 *   Official questions that staff changed beyond typing fixes say "Adapted by Aspire from …".
 *   Shown to students after submission only.
 * - `sourceLabelStaff` adds the staff-only facts: Aspire's reference, the UNVERIFIED claimed source and
 *   the fidelity decision.
 * Hindi wording is a draft pending native review.
 */

type Locale = "en" | "hi";

const EXAM_NAMES: Record<QbExam, Bilingual> = {
  JEE_MAIN: PATTERNS.JEE_MAIN.name,
  NEET: PATTERNS.NEET.name,
  JEE_ADV: PATTERNS.JEE_ADV.name,
  BOH: PATTERNS.BOH.name,
};

export function examName(exam: QbExam, locale: Locale): string {
  return EXAM_NAMES[exam][locale];
}

const TEXT = {
  aspire: { en: "Aspire question bank", hi: "Aspire प्रश्न बैंक" },
  sample: { en: "Sample question (written for this demo)", hi: "नमूना प्रश्न (इस डेमो के लिए लिखा गया)" },
  officialUnknown: { en: "Official paper", hi: "आधिकारिक प्रश्नपत्र" },
  adaptedPrefix: { en: "Adapted by Aspire from", hi: "Aspire द्वारा रूपांतरित, मूल:" },
  question: { en: "Q", hi: "प्रश्न" },
  issuerOfficial: { en: "official paper", hi: "आधिकारिक प्रश्नपत्र" },
  claimed: { en: "claimed source, UNVERIFIED", hi: "दावा किया गया स्रोत, असत्यापित" },
  aspireRef: { en: "Aspire ref", hi: "Aspire संदर्भ" },
  fidelity: {
    verbatim: { en: "verbatim", hi: "शब्दशः" },
    transcription_fixed: { en: "transcription fixed", hi: "टंकण सुधार" },
    adapted: { en: "adapted", hi: "रूपांतरित" },
  },
  booklet: { en: "Booklet", hi: "पुस्तिका" },
  page: { en: "p.", hi: "पृ." },
  evidence: { en: "evidence", hi: "प्रमाण" },
  import: { en: "import", hi: "आयात" },
  noFidelity: { en: "fidelity not decided", hi: "मूल से मिलान तय नहीं" },
} as const;

const MONTHS: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  hi: ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"],
};

/** "27 Jan" from "2024-01-27"; null when the date is malformed. */
export function formatSourceDate(date: string | undefined, locale: Locale): string | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[locale][month - 1]}`;
}

/** Hindi renderings of the session / shift / paper words staff type in English (drafts). */
function localiseWord(value: string, locale: Locale): string {
  if (locale === "en") return value;
  return value
    .replace(/^Shift\s*/i, "पाली ")
    .replace(/^Paper\s*/i, "प्रश्नपत्र ")
    .replace(/^Re-exam$/i, "पुनर्परीक्षा")
    .replace(/^January$/i, "जनवरी सत्र")
    .replace(/^April$/i, "अप्रैल सत्र");
}

/** "JEE Main 2024 · 27 Jan · Shift 1 · Q 12 (NTA)" from verified fields only. */
export function officialReference(source: QbSource, locale: Locale): string {
  if (!source.exam) return TEXT.officialUnknown[locale];
  const parts: string[] = [];
  parts.push(source.year ? `${examName(source.exam, locale)} ${source.year}` : examName(source.exam, locale));
  const date = formatSourceDate(source.date, locale);
  if (date) parts.push(date);
  // The session is shown when there is no date, and always for a re-examination.
  if (source.session && (!date || /re-?exam/i.test(source.session))) parts.push(localiseWord(source.session, locale));
  if (source.shift) parts.push(localiseWord(source.shift, locale));
  if (source.paper && source.exam !== "JEE_MAIN") parts.push(localiseWord(source.paper, locale));
  if (source.qno) parts.push(`${TEXT.question[locale]} ${source.qno}`);
  const issuer = PATTERNS[source.exam].issuer;
  return `${parts.join(" · ")} (${issuer ?? TEXT.issuerOfficial[locale]})`;
}

export interface SourceLabelInput {
  source: QbSource;
  fidelity: QbFidelity | null;
}

/** The public source label (shown after submission only). */
export function sourceLabel(q: SourceLabelInput, locale: Locale): string {
  switch (q.source.kind) {
    case "aspire":
      return TEXT.aspire[locale];
    case "sample":
      return TEXT.sample[locale];
    case "official": {
      const reference = officialReference(q.source, locale);
      return q.fidelity === "adapted" ? `${TEXT.adaptedPrefix[locale]} ${reference}` : reference;
    }
  }
}

/** Both languages of the public label. */
export function sourceLabelBilingual(q: SourceLabelInput): Bilingual {
  return { en: sourceLabel(q, "en"), hi: sourceLabel(q, "hi") };
}

/** Staff label: the public label plus Aspire's ref, the UNVERIFIED claimed source, booklet, page and fidelity. */
export function sourceLabelStaff(q: SourceLabelInput & { adaptedNote?: Bilingual | null }, locale: Locale): string {
  const extras: string[] = [];
  const s = q.source;
  if (s.kind === "official") {
    if (s.booklet) extras.push(`${TEXT.booklet[locale]} ${s.booklet}`);
    if (s.page) extras.push(`${TEXT.page[locale]} ${s.page}`);
    if (s.importId) extras.push(`${TEXT.import[locale]} ${s.importId}`);
    if (s.evidenceUrl) extras.push(`${TEXT.evidence[locale]}: ${s.evidenceUrl}${s.evidencePage ? ` ${TEXT.page[locale]} ${s.evidencePage}` : ""}`);
    extras.push(q.fidelity ? TEXT.fidelity[q.fidelity][locale] : TEXT.noFidelity[locale]);
    if (q.fidelity === "adapted" && q.adaptedNote?.[locale]) extras.push(q.adaptedNote[locale]);
  }
  if (s.aspireRef) extras.push(`${TEXT.aspireRef[locale]}: ${s.aspireRef}`);
  if (s.claimedSource) extras.push(`${TEXT.claimed[locale]}: ${s.claimedSource}`);
  const base = sourceLabel(q, locale);
  return extras.length > 0 ? `${base} — ${extras.join(" · ")}` : base;
}
