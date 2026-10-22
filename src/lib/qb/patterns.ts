import type {
  Bilingual,
  QbBlueprint,
  QbBlueprintPart,
  QbBlueprintSection,
  QbExam,
  QbMarking,
  QbMix,
  QbQuestionType,
  QbSlot,
  QbSubject,
  QbTieBreakStep,
} from "./types";
import { QB_SLOT_EXAM } from "./types";

/**
 * Exam patterns and default blueprints (owner: QB-CORE-A; docs/question-bank-plan.md §B1). Client-safe
 * constants only, so static pages and `generateMetadata` can read titles without touching the database.
 *
 * Honesty rules for this file:
 * - The 2026 patterns of JEE Main, NEET (UG) and JEE (Advanced) were checked on 22 Oct 2026 against the
 *   official documents cited below. Anything else is marked "reported" (secondary sources) or
 *   "unverified".
 * - Section `instructions` quote the official wording only where it is marked VERBATIM below (with its
 *   source); everything else is Aspire's own summary of the official marking rules.
 * - Difficulty mixes are Aspire's choice, never official.
 * - BOH (Brain of Himachal) is a PLACEHOLDER: its pattern is unknown and cannot be published until an
 *   admin confirms it ("pattern confirmed by Aspire").
 * - Hindi strings are drafts pending native review (docs/hindi-review-register.md).
 */

export const QB_PATTERN_VERIFIED_AT = "2026-10-22";
/** The 2027 bulletins are due: patterns must be reviewed by then (`pattern.reviewDueAt`). */
export const QB_PATTERN_REVIEW_DUE = "2026-11-15";

export const QB_SOURCES = {
  jeeMainBulletin2026:
    "https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311145384616.pdf",
  jeeMainNotice2026: "https://nta.ac.in/Download/Notice/Notice_20251019125337.pdf",
  jeeMainSite: "https://jeemain.nta.nic.in/",
  neetBulletin2026: "https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/02/202602081576322299.pdf",
  neetSyllabusNmc:
    "https://www.nmc.org.in/MCIRest/open/getDocument?path=/Documents/Public/Portal/LatestNews/Public%20Notice_NEET_removed.pdf",
  neetSite: "https://neet.nta.nic.in/",
  neetBulletin2025: "https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2025/02/2025020754.pdf",
  neetNotice2021: "https://nta.ac.in/Download/Notice/Notice_20210820233127.pdf",
  neetNotice2024: "https://nta.ac.in/Download/Notice/Notice_20240211105313.pdf",
  jeeAdvBrochure2026: "https://jeeadv.ac.in/documents/IBEnglish_2026.pdf",
  jeeAdvPaper1Instructions2026: "https://jeeadv.ac.in/documents/p1_english.pdf",
  jeeAdvPaper2Instructions2026: "https://jeeadv.ac.in/documents/p2_english.pdf",
  jeeAdvSite: "https://jeeadv.ac.in/",
} as const;

// ---------------------------------------------------------------------------------------------
// Slot metadata (titles for static pages and metadata)

export interface QbSlotMeta {
  slot: QbSlot;
  exam: QbExam;
  title: Bilingual;
  summary: Bilingual;
  /** The exam's short name. */
  examName: Bilingual;
  /** BOH: the pattern is a placeholder until Aspire confirms it. */
  placeholder: boolean;
}

export const QB_SLOT_META: Readonly<Record<QbSlot, QbSlotMeta>> = {
  "jee-main": {
    slot: "jee-main",
    exam: "JEE_MAIN",
    examName: { en: "JEE Main", hi: "JEE Main" },
    title: { en: "JEE Main exam-pattern mock", hi: "JEE Main परीक्षा-पैटर्न मॉक" },
    summary: {
      en: "75 questions in Mathematics, Physics and Chemistry, 3 hours, +4 / −1 marking, as in the 2026 bulletin. A new paper every attempt.",
      hi: "गणित, भौतिकी और रसायन विज्ञान के 75 प्रश्न, 3 घंटे, +4 / −1 अंकन, 2026 सूचना बुलेटिन के अनुसार। हर प्रयास में नया प्रश्नपत्र।",
    },
    placeholder: false,
  },
  "neet-ug": {
    slot: "neet-ug",
    exam: "NEET",
    examName: { en: "NEET (UG)", hi: "NEET (UG)" },
    title: { en: "NEET (UG) exam-pattern mock", hi: "NEET (UG) परीक्षा-पैटर्न मॉक" },
    summary: {
      en: "180 questions in Physics, Chemistry, Botany and Zoology, 3 hours, +4 / −1 marking, as in the 2026 bulletin. A new paper every attempt.",
      hi: "भौतिकी, रसायन विज्ञान, वनस्पति विज्ञान और प्राणि विज्ञान के 180 प्रश्न, 3 घंटे, +4 / −1 अंकन, 2026 सूचना बुलेटिन के अनुसार। हर प्रयास में नया प्रश्नपत्र।",
    },
    placeholder: false,
  },
  "jee-adv": {
    slot: "jee-adv",
    exam: "JEE_ADV",
    examName: { en: "JEE (Advanced)", hi: "JEE (Advanced)" },
    title: { en: "JEE (Advanced) exam-pattern mock", hi: "JEE (Advanced) परीक्षा-पैटर्न मॉक" },
    summary: {
      en: "Paper 1 and Paper 2, 3 hours each, Physics, Chemistry and Mathematics, in the 2026 section pattern. A new pair of papers every attempt.",
      hi: "प्रश्नपत्र 1 और प्रश्नपत्र 2, प्रत्येक 3 घंटे, भौतिकी, रसायन विज्ञान और गणित, 2026 के खंड पैटर्न में। हर प्रयास में प्रश्नपत्रों की नई जोड़ी।",
    },
    placeholder: false,
  },
  "boh-class-10": {
    slot: "boh-class-10",
    exam: "BOH",
    examName: { en: "Brain of Himachal (BOH)", hi: "ब्रेन ऑफ हिमाचल (BOH)" },
    title: { en: "Brain of Himachal (Class 10) mock", hi: "ब्रेन ऑफ हिमाचल (कक्षा 10) मॉक" },
    // Neutral on purpose: it is copied into blueprints and shown once the mock is published. Whether
    // the pattern is still a placeholder is derived at render time (`blueprintPlaceholderNote`).
    summary: {
      en: "Aspire's Brain of Himachal scholarship test for Class 10 students. A new paper every attempt.",
      hi: "कक्षा 10 के विद्यार्थियों के लिए Aspire की ब्रेन ऑफ हिमाचल छात्रवृत्ति परीक्षा। हर प्रयास में नया प्रश्नपत्र।",
    },
    placeholder: true,
  },
};

/**
 * What a placeholder blueprint (BOH) says while nobody has confirmed its pattern. Never stored in a
 * blueprint: derive it with `blueprintPlaceholderNote`.
 */
export const QB_PLACEHOLDER_NOTE: Bilingual = {
  en: "Aspire's scholarship test. The pattern is not yet confirmed by Aspire, so this mock is not available yet.",
  hi: "Aspire की छात्रवृत्ति परीक्षा। इसका पैटर्न अभी Aspire द्वारा पुष्ट नहीं है, इसलिए यह मॉक अभी उपलब्ध नहीं है।",
};

/** The "not confirmed / not available" wording for a placeholder blueprint whose pattern is unconfirmed, else null. */
export function blueprintPlaceholderNote(blueprint: Pick<QbBlueprint, "placeholder" | "patternConfirmedBy">): Bilingual | null {
  return blueprint.placeholder && !blueprint.patternConfirmedBy ? { ...QB_PLACEHOLDER_NOTE } : null;
}

/** Whether a stored summary is still the old placeholder wording (blueprints made before it moved out). */
export function summaryIsPlaceholderNote(summary: Bilingual): boolean {
  const norm = (text: string) => text.replace(/\s+/g, " ").trim();
  return norm(summary.en) === norm(QB_PLACEHOLDER_NOTE.en) || (summary.hi.trim() !== "" && norm(summary.hi) === norm(QB_PLACEHOLDER_NOTE.hi));
}

// ---------------------------------------------------------------------------------------------
// Current (2026) patterns

export interface QbExamPattern {
  exam: QbExam;
  year: number;
  name: Bilingual;
  /** Who sets the paper (shown in source labels); null when not an official exam. */
  issuer: string | null;
  status: "verified" | "placeholder";
  verifiedAt: string | null;
  sourceUrls: string[];
  /** Where in the sources each fact was read. */
  sourceRefs: string[];
  papers: number;
  questionsPerPaper: number[];
  marksPerPaper: number[];
  minutesPerPaper: number;
  /** Compensatory time per paper for eligible PwD/PwBD candidates (official rules). */
  compensatoryMinutesPerPaper: number | null;
  languages: ("en" | "hi")[];
  /** Year of the last syllabus revision used for chapter weights: REPORTED, confirmed by an admin (§B3). */
  syllabusRevisionYear: number | null;
  syllabusUrl: string | null;
  note: Bilingual;
}

export const PATTERNS: Readonly<Record<QbExam, QbExamPattern>> = {
  JEE_MAIN: {
    exam: "JEE_MAIN",
    year: 2026,
    name: { en: "JEE Main", hi: "JEE Main" },
    issuer: "NTA",
    status: "verified",
    verifiedAt: QB_PATTERN_VERIFIED_AT,
    sourceUrls: [QB_SOURCES.jeeMainBulletin2026, QB_SOURCES.jeeMainNotice2026],
    sourceRefs: [
      "Information Bulletin 2026 §2.4 (Paper 1 pattern: 3 subjects × (20 MCQs + 5 numerical), 75 questions, 300 marks)",
      "§2.4.1–2.4.2 (MCQ and numerical marking +4 / −1 / 0; dropped question: +4 to all in the shift)",
      "§2.5 and Note 2.5 (3 hours; 20 minutes per hour compensatory time for scribe-eligible PwD/PwBD)",
      "§2.6 (syllabus on jeemain.nta.nic.in); 'Method of resolving ties'",
    ],
    papers: 1,
    questionsPerPaper: [75],
    marksPerPaper: [300],
    minutesPerPaper: 180,
    compensatoryMinutesPerPaper: 60,
    languages: ["en", "hi"],
    syllabusRevisionYear: 2024,
    syllabusUrl: QB_SOURCES.jeeMainSite,
    note: {
      en: "Pattern as per the NTA JEE (Main) 2026 Information Bulletin (Paper 1, B.E./B.Tech).",
      hi: "पैटर्न NTA की JEE (Main) 2026 सूचना बुलेटिन (प्रश्नपत्र 1, B.E./B.Tech) के अनुसार।",
    },
  },
  NEET: {
    exam: "NEET",
    year: 2026,
    name: { en: "NEET (UG)", hi: "NEET (UG)" },
    issuer: "NTA",
    status: "verified",
    verifiedAt: QB_PATTERN_VERIFIED_AT,
    sourceUrls: [QB_SOURCES.neetBulletin2026, QB_SOURCES.neetSyllabusNmc],
    sourceRefs: [
      "Information Bulletin 2026, Examination Scheme §2 (180 compulsory MCQs, 180 minutes, 720 marks; Physics 45, Chemistry 45, Biology 90)",
      "Examination Scheme §3 (+4 / −1 / 0; dropped or wrong question: +4 to all)",
      "Examination Scheme §5 (compensatory time of one hour for PwD/PwBD with a physical limitation to write)",
      "Inter-se merit (tie-breaking) §2. Botany 45 / Zoology 45 and the block order come from booklets: verify against a 2025 or 2026 booklet.",
    ],
    papers: 1,
    questionsPerPaper: [180],
    marksPerPaper: [720],
    minutesPerPaper: 180,
    compensatoryMinutesPerPaper: 60,
    languages: ["en", "hi"],
    syllabusRevisionYear: 2024,
    syllabusUrl: QB_SOURCES.neetSyllabusNmc,
    note: {
      en: "Pattern as per the NTA NEET (UG) 2026 Information Bulletin. The Botany / Zoology split of the 90 Biology questions follows recent booklets (to be verified).",
      hi: "पैटर्न NTA की NEET (UG) 2026 सूचना बुलेटिन के अनुसार। जीव विज्ञान के 90 प्रश्नों का वनस्पति / प्राणि विज्ञान विभाजन हाल की पुस्तिकाओं के अनुसार है (पुष्टि होनी है)।",
    },
  },
  JEE_ADV: {
    exam: "JEE_ADV",
    year: 2026,
    name: { en: "JEE (Advanced)", hi: "JEE (Advanced)" },
    issuer: null,
    status: "verified",
    verifiedAt: QB_PATTERN_VERIFIED_AT,
    sourceUrls: [QB_SOURCES.jeeAdvBrochure2026, QB_SOURCES.jeeAdvPaper1Instructions2026, QB_SOURCES.jeeAdvPaper2Instructions2026],
    sourceRefs: [
      "Brochure 2026: two compulsory 3-hour papers with Physics, Chemistry and Mathematics; English and Hindi; one hour compensatory time per paper for eligible PwD; syllabus in Annexure-I",
      "Instruction pages of the official 2026 papers: section structure and marking (Paper 1: 48 questions, 180 marks; Paper 2: 54 questions, 180 marks)",
    ],
    papers: 2,
    questionsPerPaper: [48, 54],
    marksPerPaper: [180, 180],
    minutesPerPaper: 180,
    compensatoryMinutesPerPaper: 60,
    languages: ["en", "hi"],
    syllabusRevisionYear: 2023,
    syllabusUrl: QB_SOURCES.jeeAdvBrochure2026,
    note: {
      en: "Section pattern of the official JEE (Advanced) 2026 papers. The pattern changes every year and is revealed only on exam day.",
      hi: "आधिकारिक JEE (Advanced) 2026 प्रश्नपत्रों का खंड पैटर्न। पैटर्न हर वर्ष बदलता है और परीक्षा के दिन ही पता चलता है।",
    },
  },
  BOH: {
    exam: "BOH",
    year: 2026,
    name: { en: "Brain of Himachal (BOH)", hi: "ब्रेन ऑफ हिमाचल (BOH)" },
    issuer: null,
    status: "placeholder",
    verifiedAt: null,
    sourceUrls: [],
    sourceRefs: [
      "PLACEHOLDER from the unverified reference-site card `dl-boh-class-10` (src/content/institute.ts): Physics (20Q), Chemistry (20Q), Math (30Q), Mental Ability (30Q). Time and marking are Aspire guesses.",
    ],
    papers: 1,
    questionsPerPaper: [100],
    marksPerPaper: [400],
    minutesPerPaper: 120,
    compensatoryMinutesPerPaper: null,
    languages: ["en", "hi"],
    syllabusRevisionYear: null,
    syllabusUrl: null,
    note: {
      en: "Placeholder pattern: not yet confirmed by Aspire.",
      hi: "प्लेसहोल्डर पैटर्न: अभी Aspire द्वारा पुष्ट नहीं।",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Tie-break rules (official; JEE Advanced not transcribed yet, BOH unknown)

export const TIE_BREAK: Readonly<Record<QbExam, readonly QbTieBreakStep[] | null>> = {
  // JEE (Main) 2026 bulletin, "Method of resolving ties": NTA scores in Mathematics, Physics, Chemistry;
  // then the lower attempted-wrong : correct ratio in all subjects, then Mathematics, Physics, Chemistry.
  JEE_MAIN: [
    { by: "subject_score", subject: "maths" },
    { by: "subject_score", subject: "physics" },
    { by: "subject_score", subject: "chemistry" },
    { by: "wrong_correct_ratio", subject: "all" },
    { by: "wrong_correct_ratio", subject: "maths" },
    { by: "wrong_correct_ratio", subject: "physics" },
    { by: "wrong_correct_ratio", subject: "chemistry" },
  ],
  // NEET (UG) 2026 bulletin, "Inter-se-merit": Biology (Botany & Zoology), Chemistry, Physics; then the
  // ratio in all subjects, then Biology, Chemistry, Physics (then a random process — not modelled).
  NEET: [
    { by: "subject_score", subject: "biology" },
    { by: "subject_score", subject: "chemistry" },
    { by: "subject_score", subject: "physics" },
    { by: "wrong_correct_ratio", subject: "all" },
    { by: "wrong_correct_ratio", subject: "biology" },
    { by: "wrong_correct_ratio", subject: "chemistry" },
    { by: "wrong_correct_ratio", subject: "physics" },
  ],
  JEE_ADV: null,
  BOH: null,
};

// ---------------------------------------------------------------------------------------------
// Pattern history: old questions keep their own year's tag; mocks always use the current marking.

export type QbPatternStatus = "verified" | "reported" | "conflicting" | "unverified";
export type QbMarkingByType = Partial<Record<QbQuestionType, QbMarking>>;

export interface QbPatternHistoryEntry {
  tag: string;
  exam: QbExam;
  fromYear: number;
  toYear: number;
  summary: string;
  status: QbPatternStatus;
  sourceUrls: string[];
  /** The original marking per question type, where known (null: check each year's archived bulletin). */
  marking: QbMarkingByType | null;
}

const JEE_ADV_2026_MARKING: QbMarkingByType = {
  single: { correct: 3, wrong: -1 },
  multiple: { correct: 4, wrong: -1, partial: "per_correct_option" },
  numerical: { correct: 4, wrong: 0 },
};

export const PATTERN_HISTORY: readonly QbPatternHistoryEntry[] = [
  {
    tag: "jee-main-2017-2018",
    exam: "JEE_MAIN",
    fromYear: 2017,
    toYear: 2018,
    summary: "CBSE: 90 MCQs (30 per subject), +4 / −1, 360 marks, 3 hours",
    status: "reported",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-main-2019",
    exam: "JEE_MAIN",
    fromYear: 2019,
    toYear: 2019,
    summary: "NTA, January and April: 90 MCQs, +4 / −1, computer-based test only",
    status: "reported",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-main-2020",
    exam: "JEE_MAIN",
    fromYear: 2020,
    toYear: 2020,
    summary: "75 questions: 20 MCQs (+4 / −1) and 5 numericals (+4, no negative marking, decimals allowed) per subject",
    status: "reported",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 }, numerical: { correct: 4, wrong: 0 } },
  },
  {
    tag: "jee-main-2021",
    exam: "JEE_MAIN",
    fromYear: 2021,
    toYear: 2021,
    summary: "Section B: 10 numericals, attempt any 5; Section B negative marking unclear (sources conflict)",
    status: "conflicting",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-main-2022-2024",
    exam: "JEE_MAIN",
    fromYear: 2022,
    toYear: 2024,
    summary: "90 questions, attempt 75; Section B −1 reported for 2022, conflicting for 2024: check each year's archived bulletin",
    status: "conflicting",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-main-2025",
    exam: "JEE_MAIN",
    fromYear: 2025,
    toYear: 2025,
    summary: "75 questions, no choice, Section B −1",
    status: "reported",
    sourceUrls: [],
    marking: { single: { correct: 4, wrong: -1 }, numerical: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-main-2026",
    exam: "JEE_MAIN",
    fromYear: 2026,
    toYear: 2026,
    summary: "75 questions: per subject 20 MCQs + 5 numerical (integer) questions, +4 / −1 / 0 for both, 300 marks, 3 hours",
    status: "verified",
    sourceUrls: [QB_SOURCES.jeeMainBulletin2026],
    marking: { single: { correct: 4, wrong: -1 }, numerical: { correct: 4, wrong: -1 } },
  },
  {
    tag: "neet-2017-2020",
    exam: "NEET",
    fromYear: 2017,
    toYear: 2020,
    summary: "180 questions, 180 minutes, +4 / −1, pen and paper",
    status: "reported",
    sourceUrls: [QB_SOURCES.neetBulletin2025],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "neet-2021-2024",
    exam: "NEET",
    fromYear: 2021,
    toYear: 2024,
    summary: "200 questions: per subject Section A 35 + Section B 15 (answer any 10), 200 minutes",
    status: "reported",
    sourceUrls: [QB_SOURCES.neetNotice2021, QB_SOURCES.neetNotice2024],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "neet-2025",
    exam: "NEET",
    fromYear: 2025,
    toYear: 2025,
    summary: "180 compulsory questions, 180 minutes",
    status: "reported",
    sourceUrls: [QB_SOURCES.neetBulletin2025],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "neet-2026",
    exam: "NEET",
    fromYear: 2026,
    toYear: 2026,
    summary: "180 compulsory MCQs, 180 minutes, 720 marks, +4 / −1 / 0",
    status: "verified",
    sourceUrls: [QB_SOURCES.neetBulletin2026],
    marking: { single: { correct: 4, wrong: -1 } },
  },
  {
    tag: "jee-adv-2017-2025",
    exam: "JEE_ADV",
    fromYear: 2017,
    toYear: 2025,
    summary:
      "Changes every year (partial marking with −2 or −1, integer 0–9 or decimal answers, paragraph and matching formats). Each import stores the paper's own instruction block as a pattern snapshot for staff to confirm.",
    status: "unverified",
    sourceUrls: [],
    marking: null,
  },
  {
    tag: "jee-adv-2026",
    exam: "JEE_ADV",
    fromYear: 2026,
    toYear: 2026,
    summary: "Paper 1: 4 sections × 4 per subject (48 questions, 180 marks); Paper 2: 4 + 5 + 5 + 2 passages × 2 per subject (54 questions, 180 marks)",
    status: "verified",
    sourceUrls: [QB_SOURCES.jeeAdvPaper1Instructions2026, QB_SOURCES.jeeAdvPaper2Instructions2026],
    marking: JEE_ADV_2026_MARKING,
  },
];

/** The history tag covering `year` of `exam`, or null when no entry covers it. */
export function patternTagFor(exam: QbExam, year: number | null | undefined): string | null {
  if (typeof year !== "number") return null;
  return PATTERN_HISTORY.find((entry) => entry.exam === exam && entry.fromYear <= year && year <= entry.toYear)?.tag ?? null;
}

/** The original marking of a question type in `exam` / `year`, where the history knows it. */
export function originalMarkingFor(exam: QbExam, year: number | null | undefined, type: QbQuestionType): QbMarking | null {
  if (typeof year !== "number") return null;
  const entry = PATTERN_HISTORY.find((e) => e.exam === exam && e.fromYear <= year && year <= e.toYear);
  const marking = entry?.marking?.[type];
  return marking ? { ...marking } : null;
}

// ---------------------------------------------------------------------------------------------
// Default blueprints (seeded as DRAFTS by QB-SEED; nothing goes live until an admin publishes)

const MARK_4_1: QbMarking = { correct: 4, wrong: -1 };

const SUBJECT_NAMES: Record<QbSubject, Bilingual> = {
  physics: { en: "Physics", hi: "भौतिकी" },
  chemistry: { en: "Chemistry", hi: "रसायन विज्ञान" },
  maths: { en: "Mathematics", hi: "गणित" },
  botany: { en: "Botany", hi: "वनस्पति विज्ञान" },
  zoology: { en: "Zoology", hi: "प्राणि विज्ञान" },
  biology: { en: "Biology", hi: "जीव विज्ञान" },
  mental_ability: { en: "Mental ability", hi: "मानसिक योग्यता" },
};

export function qbSubjectLabel(subject: QbSubject): Bilingual {
  return { ...SUBJECT_NAMES[subject] };
}

function label(subject: QbSubject, suffix: Bilingual): Bilingual {
  return { en: `${SUBJECT_NAMES[subject].en} · ${suffix.en}`, hi: `${SUBJECT_NAMES[subject].hi} · ${suffix.hi}` };
}

// JEE Main ------------------------------------------------------------------------------------

// Aspire summary of bulletin §2.4 / §2.4.1.
const JEE_MAIN_A_INSTRUCTIONS: Bilingual = {
  en: "Section A: 20 multiple-choice questions, each with four options and one correct answer. Marking: +4 for the correct answer, −1 for an incorrect answer, 0 if unanswered.",
  hi: "खंड A: 20 बहुविकल्पीय प्रश्न, प्रत्येक में चार विकल्प और एक सही उत्तर। अंकन: सही उत्तर पर +4, गलत उत्तर पर −1, उत्तर न देने पर 0।",
};
// VERBATIM (first two sentences): JEE (Main) 2026 Information Bulletin §2.4, Paper 1 pattern ("on- screen"
// in the extracted text is printed "on-screen"). The marking sentence is Aspire's summary of §2.4.2.
const JEE_MAIN_B_INSTRUCTIONS: Bilingual = {
  en: "For each question in Section B, a candidate has to enter the correct integer value of the answer using the mouse and the on-screen virtual numeric keypad in the place designated to enter the answer. For Section B, the answer should be rounded off to the nearest integer. Marking: +4 for the correct answer, −1 for an incorrect answer, 0 if unanswered.",
  hi: "खंड B के प्रत्येक प्रश्न के लिए, उम्मीदवार को माउस और स्क्रीन पर दिए गए वर्चुअल न्यूमेरिक कीपैड से निर्धारित स्थान पर उत्तर का सही पूर्णांक मान दर्ज करना है। खंड B के लिए उत्तर को निकटतम पूर्णांक तक पूर्णांकित करना चाहिए। अंकन: सही उत्तर पर +4, गलत उत्तर पर −1, उत्तर न देने पर 0।",
};

function jeeMainSections(): QbBlueprintSection[] {
  return (["maths", "physics", "chemistry"] as const).flatMap((subject) => [
    {
      id: `${subject}-a`,
      subject,
      label: label(subject, { en: "Section A (MCQ)", hi: "खंड A (बहुविकल्पीय)" }),
      type: "single" as const,
      count: 20,
      marking: { ...MARK_4_1 },
      formatMix: "past_papers" as const,
      instructions: { ...JEE_MAIN_A_INSTRUCTIONS },
    },
    {
      id: `${subject}-b`,
      subject,
      label: label(subject, { en: "Section B (numerical value)", hi: "खंड B (संख्यात्मक मान)" }),
      type: "numerical" as const,
      answerFormat: "integer" as const,
      count: 5,
      marking: { ...MARK_4_1 },
      formatMix: null,
      instructions: { ...JEE_MAIN_B_INSTRUCTIONS },
    },
  ]);
}

// NEET ------------------------------------------------------------------------------------------

// First sentence VERBATIM: NEET (UG) 2026 Information Bulletin, Examination Scheme §3. Marking: Aspire
// summary of the same section.
const NEET_INSTRUCTIONS: Bilingual = {
  en: "To answer a question, the candidate needs to choose one option corresponding to the correct answer or the most appropriate answer. Marking: +4 for the correct answer, −1 for an incorrect answer, 0 if unanswered.",
  hi: "किसी प्रश्न का उत्तर देने के लिए उम्मीदवार को सही उत्तर या सबसे उपयुक्त उत्तर वाला एक विकल्प चुनना है। अंकन: सही उत्तर पर +4, गलत उत्तर पर −1, उत्तर न देने पर 0।",
};

function neetSections(): QbBlueprintSection[] {
  return (["physics", "chemistry", "botany", "zoology"] as const).map((subject) => ({
    id: subject,
    subject,
    label: { ...SUBJECT_NAMES[subject] },
    type: "single" as const,
    count: 45,
    marking: { ...MARK_4_1 },
    formatMix: "past_papers" as const,
    instructions: { ...NEET_INSTRUCTIONS },
  }));
}

// JEE (Advanced) ---------------------------------------------------------------------------------
// Aspire summaries of the 2026 papers' section structure (the official instruction wording was not kept).

const ADV_S1: Bilingual = {
  en: "Single correct option: four options, exactly one is correct. Marking: +3 if only the correct option is chosen, 0 if unanswered, −1 otherwise.",
  hi: "एकल सही विकल्प: चार विकल्प, केवल एक सही। अंकन: केवल सही विकल्प चुनने पर +3, उत्तर न देने पर 0, अन्य सभी स्थितियों में −1।",
};
const ADV_S2: Bilingual = {
  en: "One or more correct options: four options, one or more are correct. Marking: +4 if exactly the correct options are chosen; +3, +2 or +1 (one mark per chosen option) if every chosen option is correct but not all correct options are chosen; 0 if unanswered; −1 otherwise.",
  hi: "एक या अधिक सही विकल्प: चार विकल्प, एक या अधिक सही। अंकन: ठीक सभी सही विकल्प चुनने पर +4; यदि चुने गए सभी विकल्प सही हैं पर सभी सही विकल्प नहीं चुने गए तो +3, +2 या +1 (प्रति चुना गया विकल्प एक अंक); उत्तर न देने पर 0; अन्य स्थितियों में −1।",
};
const ADV_S3: Bilingual = {
  en: "Numerical value: enter the answer as a number, truncated or rounded off to two decimal places. Marking: +4 for the correct answer, 0 otherwise.",
  hi: "संख्यात्मक मान: उत्तर को संख्या के रूप में दर्ज करें, दो दशमलव स्थानों तक काटकर या पूर्णांकित करके। अंकन: सही उत्तर पर +4, अन्यथा 0।",
};
const ADV_S4_MATCH: Bilingual = {
  en: "Match the lists: List-I has four entries and List-II has five; four options, exactly one is correct. Marking: +4 if only the correct option is chosen, 0 if unanswered, −1 otherwise.",
  hi: "सूचियों का मिलान: सूची-I में चार और सूची-II में पाँच प्रविष्टियाँ; चार विकल्प, केवल एक सही। अंकन: केवल सही विकल्प चुनने पर +4, उत्तर न देने पर 0, अन्य स्थितियों में −1।",
};
const ADV_S4_PASSAGE: Bilingual = {
  en: "Two paragraphs, each followed by two numerical-value questions. Enter each answer truncated or rounded off to two decimal places. Marking: +2 for the correct answer, 0 otherwise.",
  hi: "दो अनुच्छेद, प्रत्येक के बाद दो संख्यात्मक-मान प्रश्न। प्रत्येक उत्तर दो दशमलव स्थानों तक काटकर या पूर्णांकित करके दर्ज करें। अंकन: सही उत्तर पर +2, अन्यथा 0।",
};

const ADV_ORDER = ["physics", "chemistry", "maths"] as const;
const ADV_SHORT: Record<(typeof ADV_ORDER)[number], string> = { physics: "phy", chemistry: "chem", maths: "math" };

function advPart(paper: 1 | 2): QbBlueprintPart {
  const p = `p${paper}`;
  const sections = ADV_ORDER.flatMap((subject): QbBlueprintSection[] => {
    const s = `${p}-${ADV_SHORT[subject]}`;
    const common = { subject, formatMix: null };
    const list: QbBlueprintSection[] = [
      {
        ...common,
        id: `${s}-s1`,
        label: label(subject, { en: "Section 1 (single correct)", hi: "खंड 1 (एकल सही)" }),
        type: "single",
        count: 4,
        marking: { correct: 3, wrong: -1 },
        instructions: { ...ADV_S1 },
      },
      {
        ...common,
        id: `${s}-s2`,
        label: label(subject, { en: "Section 2 (one or more correct)", hi: "खंड 2 (एक या अधिक सही)" }),
        type: "multiple",
        count: paper === 1 ? 4 : 5,
        marking: { correct: 4, wrong: -1, partial: "per_correct_option" },
        instructions: { ...ADV_S2 },
      },
      {
        ...common,
        id: `${s}-s3`,
        label: label(subject, { en: "Section 3 (numerical value)", hi: "खंड 3 (संख्यात्मक मान)" }),
        type: "numerical",
        answerFormat: "decimal2",
        count: paper === 1 ? 4 : 5,
        marking: { correct: 4, wrong: 0 },
        instructions: { ...ADV_S3 },
      },
    ];
    list.push(
      paper === 1
        ? {
            ...common,
            id: `${s}-s4`,
            label: label(subject, { en: "Section 4 (match the lists)", hi: "खंड 4 (सूचियों का मिलान)" }),
            type: "single",
            format: "match_list",
            count: 4,
            marking: { correct: 4, wrong: -1 },
            instructions: { ...ADV_S4_MATCH },
          }
        : {
            ...common,
            id: `${s}-s4`,
            label: label(subject, { en: "Section 4 (paragraphs)", hi: "खंड 4 (अनुच्छेद)" }),
            type: "numerical",
            format: "passage",
            answerFormat: "decimal2",
            count: 4,
            passageGroupSize: 2,
            marking: { correct: 2, wrong: 0 },
            instructions: { ...ADV_S4_PASSAGE },
          },
    );
    return list;
  });
  return {
    id: p,
    label: { en: `Paper ${paper}`, hi: `प्रश्नपत्र ${paper}` },
    durationMinutes: 180,
    sections,
  };
}

// BOH (PLACEHOLDER) ------------------------------------------------------------------------------

const BOH_INSTRUCTIONS: Bilingual = {
  en: "Placeholder pattern, not confirmed by Aspire: single-correct multiple-choice questions, +4 / −1 / 0.",
  hi: "प्लेसहोल्डर पैटर्न, Aspire द्वारा पुष्ट नहीं: एकल-सही बहुविकल्पीय प्रश्न, +4 / −1 / 0।",
};

function bohSections(): QbBlueprintSection[] {
  const counts: [QbSubject, number][] = [
    ["physics", 20],
    ["chemistry", 20],
    ["maths", 30],
    ["mental_ability", 30],
  ];
  return counts.map(([subject, count]) => ({
    id: subject === "mental_ability" ? "mental" : subject,
    subject,
    label: { ...SUBJECT_NAMES[subject] },
    type: "single" as const,
    count,
    marking: { ...MARK_4_1 },
    formatMix: "past_papers" as const,
    instructions: { ...BOH_INSTRUCTIONS },
  }));
}

const DEFAULT_MIX: Readonly<Record<QbSlot, QbMix>> = {
  "jee-main": { easy: 30, medium: 50, hard: 20 },
  "neet-ug": { easy: 40, medium: 45, hard: 15 },
  "jee-adv": { easy: 15, medium: 45, hard: 40 },
  "boh-class-10": { easy: 40, medium: 40, hard: 20 },
};

/** The id of a slot's blueprint version. */
export function blueprintIdFor(slot: QbSlot, version: number): string {
  return `bp_${slot.replace(/-/g, "_")}_v${version}`;
}

/** A fresh copy of a slot's default blueprint (§B1.3), as a v1 DRAFT. */
export function defaultBlueprint(slot: QbSlot): QbBlueprint {
  const exam = QB_SLOT_EXAM[slot];
  const meta = QB_SLOT_META[slot];
  const pattern = PATTERNS[exam];
  const tieBreak = TIE_BREAK[exam];
  let parts: QbBlueprintPart[];
  switch (slot) {
    case "jee-main":
      parts = [{ id: "main", label: { en: "Paper 1", hi: "प्रश्नपत्र 1" }, durationMinutes: 180, sections: jeeMainSections() }];
      break;
    case "neet-ug":
      parts = [{ id: "main", label: { en: "Paper", hi: "प्रश्नपत्र" }, durationMinutes: 180, sections: neetSections() }];
      break;
    case "jee-adv":
      parts = [advPart(1), advPart(2)];
      break;
    case "boh-class-10":
    default:
      parts = [{ id: "main", label: { en: "Paper", hi: "प्रश्नपत्र" }, durationMinutes: 120, sections: bohSections() }];
      break;
  }
  const placeholder = slot === "boh-class-10";
  return {
    id: blueprintIdFor(slot, 1),
    slot,
    version: 1,
    status: "draft",
    exam,
    title: { ...meta.title },
    summary: { ...meta.summary },
    parts,
    difficultyMix: { ...DEFAULT_MIX[slot] },
    chapterLevels: placeholder ? ["class_9_10", "general"] : ["class_11", "class_12", "general"],
    chapterWeights: { mode: "past_papers", fromYear: null, fallbackYears: 10, halfLifeYears: 3, overrides: {} },
    sourcePolicy: { official: true, aspire: true, sample: "placeholder_only", officialMaxShare: null },
    crossExamMaxShare: 0.2,
    minShortRatio: 0.5,
    recentExclusionDays: 30,
    ranked: slot === "jee-main" || slot === "neet-ug" ? "monthly" : "off",
    languages: ["en", "hi"],
    compensatoryMinutes: pattern.compensatoryMinutesPerPaper,
    tieBreak: tieBreak ? tieBreak.map((step) => ({ ...step })) : null,
    pattern: {
      year: pattern.year,
      sourceUrls: [...pattern.sourceUrls],
      verifiedAt: pattern.verifiedAt,
      reviewDueAt: placeholder ? null : QB_PATTERN_REVIEW_DUE,
      note: { ...pattern.note },
    },
    placeholder,
    patternConfirmedBy: null,
    signoff: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Totals

export interface QbBlueprintTotals {
  parts: { partId: string; questions: number; marks: number; minutes: number }[];
  questions: number;
  marks: number;
  minutes: number;
}

export function blueprintTotals(blueprint: Pick<QbBlueprint, "parts">): QbBlueprintTotals {
  const parts = blueprint.parts.map((part) => ({
    partId: part.id,
    questions: part.sections.reduce((sum, s) => sum + s.count, 0),
    marks: part.sections.reduce((sum, s) => sum + s.count * s.marking.correct, 0),
    minutes: part.durationMinutes,
  }));
  return {
    parts,
    questions: parts.reduce((sum, p) => sum + p.questions, 0),
    marks: parts.reduce((sum, p) => sum + p.marks, 0),
    minutes: parts.reduce((sum, p) => sum + p.minutes, 0),
  };
}

/** Subjects of a blueprint, in first-appearance order. */
export function blueprintSubjects(blueprint: Pick<QbBlueprint, "parts">): QbSubject[] {
  const seen: QbSubject[] = [];
  for (const part of blueprint.parts) for (const s of part.sections) if (!seen.includes(s.subject)) seen.push(s.subject);
  return seen;
}

/** Test ids of generated mocks: `bp-<slot>` (practice), `bp-<slot>-ranked` (monthly ranked). */
export function blueprintTestId(slot: QbSlot, mode: "practice" | "ranked"): string {
  return mode === "ranked" ? `bp-${slot}-ranked` : `bp-${slot}`;
}

/** Parses `bp-<slot>` / `bp-<slot>-ranked`; null for any other id. */
export function parseBlueprintTestId(testId: string): { slot: QbSlot; mode: "practice" | "ranked" } | null {
  const match = /^bp-(.+?)(-ranked)?$/.exec(testId);
  if (!match) return null;
  const slot = match[1];
  if (!(Object.keys(QB_SLOT_META) as string[]).includes(slot)) return null;
  return { slot: slot as QbSlot, mode: match[2] ? "ranked" : "practice" };
}
