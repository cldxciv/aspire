import type { QbExam, QbSubject } from "@/lib/qb/types";

/**
 * Official syllabus units (QB-SEED, docs/question-bank-plan.md §B3). UNIT NAMES ONLY, each with the
 * official document it comes from and where in it. No syllabus text is copied.
 *
 * How these were transcribed (22 Oct 2026):
 * - JEE (Main) 2026: "Syllabus for JEE (Main) - 2026", Paper 1 (B.E./B.Tech.) only. The PDF is the
 *   file linked as "Information → Syllabus" on https://jeemain.nta.nic.in/ (NTA serves its PDFs from
 *   the Government S3WaaS host cdnbbsr.s3waas.gov.in). Units are numbered in the document.
 * - NEET (UG) 2026: NMC (UGMEB) "Syllabus for NEET (UG)-2026", public notice of 22 Dec 2025, the file
 *   linked as "Syllabus for NEET (UG)-2026 Examination" on https://neet.nta.nic.in/. The NMC link in
 *   the bulletin FAQ (nmc.org.in …Public%20Notice_NEET_removed.pdf) answered 404 on 22 Oct 2026, so the
 *   copy linked from the NTA site was used. Units are numbered in the document.
 * - JEE (Advanced) 2026: Information Brochure (IIT Roorkee), Annexure-I "Syllabi", printed pages 63–78.
 *   Headings are not numbered there; `code` is null and the IDs number them in document order.
 *
 * Names are transcribed as printed, with the case normalised. Two misspellings in the JEE Main PDF are
 * corrected ("INTEGRAL CALCULAS" → "Integral calculus", "DIFFRENTIAL EQUATIONS" → "Differential
 * equations"). Hindi names are left empty: no official Hindi document was transcribed (the admin UI
 * falls back to English). Nothing here is confirmed until an admin confirms the taxonomy per exam
 * (`taxonomy.<EXAM>.confirmed`, set by QB-CORE-B, never by the seed).
 *
 * Unit IDs: `<EXAM>:<syllabusYear>:<subject>:<NN>`, e.g. "JEE_MAIN:2026:physics:05". NEET biology units
 * use the subject "biology" (the document has one Biology list; Botany/Zoology are paper blocks).
 */

export const UNIT_SYLLABUS_YEAR = 2026;

export type SeedUnitExam = Exclude<QbExam, "BOH">;

export interface SeedUnit {
  id: string;
  exam: SeedUnitExam;
  syllabusYear: number;
  subject: QbSubject;
  /** The unit number as printed ("5"), or null when the document does not number its headings. */
  code: string | null;
  labelEn: string;
  sourceUrl: string;
  sourceRef: string;
  sort: number;
}

export const UNIT_SOURCES = {
  JEE_MAIN: {
    url: "https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf",
    linkedFrom: "https://jeemain.nta.nic.in/",
    title: "Syllabus for JEE (Main) - 2026, Paper 1 (B.E./B.Tech.)",
  },
  NEET: {
    url: "https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/01/202601081066816297.pdf",
    linkedFrom: "https://neet.nta.nic.in/",
    title: "NMC (UGMEB) Syllabus for NEET (UG)-2026, public notice of 22-12-2025",
  },
  JEE_ADV: {
    url: "https://jeeadv.ac.in/documents/IBEnglish_2026.pdf",
    linkedFrom: "https://jeeadv.ac.in/",
    title: "JEE (Advanced) 2026 Information Brochure, Annexure-I (Syllabi)",
  },
} as const satisfies Record<SeedUnitExam, { url: string; linkedFrom: string; title: string }>;

/** [label, PDF page (JEE Main / NEET) or printed page (JEE Advanced)] in document order. */
type Row = readonly [label: string, page: number];

const JEE_MAIN_UNITS: Partial<Record<QbSubject, readonly Row[]>> = {
  maths: [
    ["Sets, relations and functions", 1],
    ["Complex numbers and quadratic equations", 1],
    ["Matrices and determinants", 1],
    ["Permutations and combinations", 1],
    ["Binomial theorem and its simple applications", 1],
    ["Sequence and series", 1],
    ["Limit, continuity and differentiability", 1],
    ["Integral calculus", 1],
    ["Differential equations", 2],
    ["Co-ordinate geometry", 2],
    ["Three dimensional geometry", 2],
    ["Vector algebra", 2],
    ["Statistics and probability", 2],
    ["Trigonometry", 2],
  ],
  physics: [
    ["Units and measurements", 3],
    ["Kinematics", 3],
    ["Laws of motion", 3],
    ["Work, energy and power", 3],
    ["Rotational motion", 3],
    ["Gravitation", 3],
    ["Properties of solids and liquids", 3],
    ["Thermodynamics", 4],
    ["Kinetic theory of gases", 4],
    ["Oscillations and waves", 4],
    ["Electrostatics", 4],
    ["Current electricity", 5],
    ["Magnetic effects of current and magnetism", 5],
    ["Electromagnetic induction and alternating currents", 5],
    ["Electromagnetic waves", 5],
    ["Optics", 5],
    ["Dual nature of matter and radiation", 6],
    ["Atoms and nuclei", 6],
    ["Electronic devices", 6],
    ["Experimental skills", 6],
  ],
  chemistry: [
    ["Some basic concepts in chemistry", 7],
    ["Atomic structure", 7],
    ["Chemical bonding and molecular structure", 7],
    ["Chemical thermodynamics", 7],
    ["Solutions", 7],
    ["Equilibrium", 8],
    ["Redox reactions and electrochemistry", 8],
    ["Chemical kinetics", 8],
    ["Classification of elements and periodicity in properties", 8],
    ["p-Block elements", 8],
    ["d- and f-Block elements", 8],
    ["Coordination compounds", 9],
    ["Purification and characterisation of organic compounds", 9],
    ["Some basic principles of organic chemistry", 9],
    ["Hydrocarbons", 9],
    ["Organic compounds containing halogens", 9],
    ["Organic compounds containing oxygen", 10],
    ["Organic compounds containing nitrogen", 10],
    ["Biomolecules", 10],
    ["Principles related to practical chemistry", 10],
  ],
};

const NEET_UNITS: Partial<Record<QbSubject, readonly Row[]>> = {
  physics: [
    ["Physics and measurement", 4],
    ["Kinematics", 4],
    ["Laws of motion", 4],
    ["Work, energy, and power", 4],
    ["Rotational motion", 4],
    ["Gravitation", 5],
    ["Properties of solids and liquids", 5],
    ["Thermodynamics", 5],
    ["Kinetic theory of gases", 5],
    ["Oscillations and waves", 5],
    ["Electrostatics", 5],
    ["Current electricity", 6],
    ["Magnetic effects of current and magnetism", 6],
    ["Electromagnetic induction and alternating currents", 6],
    ["Electromagnetic waves", 6],
    ["Optics", 6],
    ["Dual nature of matter and radiation", 7],
    ["Atoms and nuclei", 7],
    ["Electronic devices", 7],
    ["Experimental skills", 7],
  ],
  chemistry: [
    ["Some basic concepts in chemistry", 9],
    ["Atomic structure", 9],
    ["Chemical bonding and molecular structure", 9],
    ["Chemical thermodynamics", 9],
    ["Solutions", 10],
    ["Equilibrium", 10],
    ["Redox reactions and electrochemistry", 10],
    ["Chemical kinetics", 10],
    ["Classification of elements and periodicity in properties", 11],
    ["p-Block elements", 11],
    ["d- and f-Block elements", 11],
    ["Co-ordination compounds", 11],
    ["Purification and characterisation of organic compounds", 11],
    ["Some basic principles of organic chemistry", 12],
    ["Hydrocarbons", 12],
    ["Organic compounds containing halogens", 12],
    ["Organic compounds containing oxygen", 12],
    ["Organic compounds containing nitrogen", 13],
    ["Biomolecules", 13],
    ["Principles related to practical chemistry", 13],
  ],
  biology: [
    ["Diversity in living world", 15],
    ["Structural organisation in animals and plants", 15],
    ["Cell structure and function", 15],
    ["Plant physiology", 15],
    ["Human physiology", 16],
    ["Reproduction", 17],
    ["Genetics and evolution", 17],
    ["Biology and human welfare", 17],
    ["Biotechnology and its applications", 18],
    ["Ecology and environment", 18],
  ],
};

const JEE_ADV_UNITS: Partial<Record<QbSubject, readonly Row[]>> = {
  chemistry: [
    ["General topics", 63],
    ["States of matter: gases and liquids", 63],
    ["Atomic structure", 63],
    ["Chemical bonding and molecular structure", 63],
    ["Chemical thermodynamics", 64],
    ["Chemical and ionic equilibrium", 64],
    ["Electrochemistry", 64],
    ["Chemical kinetics", 64],
    ["Solid state", 64],
    ["Solutions", 65],
    ["Surface chemistry", 65],
    ["Classification of elements and periodicity in properties", 65],
    ["Hydrogen", 65],
    ["s-Block elements", 65],
    ["p-Block elements", 66],
    ["d-Block elements", 66],
    ["f-Block elements", 66],
    ["Coordination compounds", 67],
    ["Isolation of metals", 67],
    ["Principles of qualitative analysis", 67],
    ["Environmental chemistry", 67],
    ["Basic principles of organic chemistry", 67],
    ["Alkanes", 68],
    ["Alkenes and alkynes", 68],
    ["Benzene", 68],
    ["Phenols", 68],
    ["Alkyl halides", 68],
    ["Alcohols", 69],
    ["Ethers", 69],
    ["Aldehydes and ketones", 69],
    ["Carboxylic acids", 69],
    ["Amines", 69],
    ["Haloarenes", 69],
    ["Biomolecules", 70],
    ["Polymers", 70],
    ["Chemistry in everyday life", 70],
    ["Practical organic chemistry", 70],
  ],
  maths: [
    ["Sets, relations and functions", 71],
    ["Algebra", 71],
    ["Matrices", 72],
    ["Probability and statistics", 72],
    ["Trigonometry", 72],
    ["Analytical geometry", 73],
    ["Differential calculus", 73],
    ["Integral calculus", 74],
    ["Vectors", 74],
  ],
  physics: [
    ["General", 75],
    ["Mechanics", 75],
    ["Thermal physics", 76],
    ["Electricity and magnetism", 76],
    ["Electromagnetic waves", 77],
    ["Optics", 77],
    ["Modern physics", 78],
  ],
};

const SUBJECT_HEADINGS: Partial<Record<QbSubject, string>> = {
  physics: "Physics",
  chemistry: "Chemistry",
  maths: "Mathematics",
  biology: "Biology",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function unitId(exam: SeedUnitExam, subject: QbSubject, n: number, year: number = UNIT_SYLLABUS_YEAR): string {
  return `${exam}:${year}:${subject}:${pad2(n)}`;
}

function build(exam: SeedUnitExam, lists: Partial<Record<QbSubject, readonly Row[]>>, numbered: boolean): SeedUnit[] {
  const units: SeedUnit[] = [];
  for (const [subject, rows] of Object.entries(lists) as [QbSubject, readonly Row[]][]) {
    rows.forEach(([label, page], index) => {
      const n = index + 1;
      const heading = SUBJECT_HEADINGS[subject] ?? subject;
      const where = numbered
        ? `${heading}, Unit ${n}, PDF page ${page}`
        : `${heading}, heading "${label}" (no. ${n} in document order), printed page ${page}`;
      units.push({
        id: unitId(exam, subject, n),
        exam,
        syllabusYear: UNIT_SYLLABUS_YEAR,
        subject,
        code: numbered ? String(n) : null,
        labelEn: label,
        sourceUrl: UNIT_SOURCES[exam].url,
        sourceRef: `${UNIT_SOURCES[exam].title}: ${where} (linked from ${UNIT_SOURCES[exam].linkedFrom})`,
        sort: n,
      });
    });
  }
  return units;
}

/** Every seeded unit, in document order per exam and subject. */
export const SEED_UNITS: readonly SeedUnit[] = [
  ...build("JEE_MAIN", JEE_MAIN_UNITS, true),
  ...build("NEET", NEET_UNITS, true),
  ...build("JEE_ADV", JEE_ADV_UNITS, false),
];

/**
 * Exams whose units could not be transcribed reliably (left empty; their taxonomy stays unconfirmed).
 * BOH has no official syllabus: its pattern and chapters are Aspire's to define (placeholder blueprint).
 */
export const UNIT_GAPS: readonly { exam: QbExam; reason: string }[] = [
  {
    exam: "BOH",
    reason:
      "Aspire's own scholarship test: no official syllabus exists to transcribe. No units or chapters are seeded; staff add them before the BOH blueprint can be confirmed.",
  },
];
