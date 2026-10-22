import { MOCK_TOPICS } from "@/content/mocktest/topics";
import type { Bilingual, QbExam, QbLevel, QbSubject } from "@/lib/qb/types";

import { unitId, type SeedUnitExam } from "./units";

/**
 * Aspire teaching chapters (QB-SEED, docs/question-bank-plan.md §B3): finer than the official units,
 * aligned to the NCERT Class 11 and 12 textbooks. Chapter names were checked on 22 Oct 2026 against the
 * contents pages of the 2026-27 NCERT reprints on ncert.nic.in (Physics, Chemistry, Mathematics and
 * Biology, Class XI and XII). Chapters from older NCERT editions that the 2023 rationalisation dropped
 * (for example "Solid state", "Hydrogen", "Mineral nutrition") are kept because past papers before the
 * 2024 syllabus revisions ask them; their `exam_status` is "removed" for every exam whose 2026 syllabus
 * does not list them.
 *
 * Rules kept here:
 * - Every MOCK_TOPICS id is a chapter (its subject is kept), so the sample tests and study plans keep
 *   working. Four legacy ids are narrowed because finer chapters now sit beside them; the sample
 *   questions in them still fit (see SAMPLE_CHAPTER_OVERRIDES in ./samples.ts for the two that do not).
 * - `units[exam]` lists the official units (./units.ts) the chapter belongs to. `exam_status` is
 *   derived: "current" when the chapter has a unit in that exam's 2026 syllabus, else "removed".
 *   Exams that do not examine the subject get no entry at all (never eligible).
 * - Biology chapters: the Botany / Zoology block decides which NEET section a question fills. NEET
 *   booklets, not the bulletin, fix that split, so every biology chapter is listed in
 *   BIOLOGY_BLOCK_UNVERIFIED: "verify against a booklet". New biology chapters use a neutral "bio-" id
 *   so staff can move a block without the id implying the old one.
 * - No BOH or mental-ability chapters (plan §B1.1): BOH stays thin until staff add its chapters.
 * - Level is the NCERT class. A chapter that spans both classes (for example redox in Class 11 and
 *   electrochemistry in Class 12) takes the class of its larger part (MULTI_CLASS_CHAPTER_IDS lists
 *   them). KNOWN LIMITATION: `qb_chapters.level` holds one level, and the generator filters the pool by
 *   `blueprint.chapterLevels` (src/lib/qb/generator.ts), so a Class-11-only or Class-12-only slot would
 *   wrongly include or exclude these chapters. The 2026 JEE / NEET defaults take both classes, so it
 *   has no effect today. Before a part-syllabus slot is built, let a chapter carry several levels or
 *   split these chapters by class.
 *
 * Hindi labels: the legacy ones come from MOCK_TOPICS; the new ones are drafts pending native review
 * (docs/hindi-review-register.md).
 */

type UnitRefs = Partial<Record<SeedUnitExam, readonly number[]>>;

export interface SeedChapter {
  id: string;
  subject: QbSubject;
  level: QbLevel;
  label: Bilingual;
  /** NCERT textbook chapter(s) the chapter follows, for staff (not shown publicly). */
  ncert: string;
  /** Official unit numbers per exam (resolved to unit ids by `chapterUnits`). */
  unitRefs: UnitRefs;
  /** A MOCK_TOPICS id (kept for the sample tests and study plans). */
  legacy: boolean;
}

const EXAMS_BY_SUBJECT: Record<string, readonly SeedUnitExam[]> = {
  physics: ["JEE_MAIN", "NEET", "JEE_ADV"],
  chemistry: ["JEE_MAIN", "NEET", "JEE_ADV"],
  maths: ["JEE_MAIN", "JEE_ADV"],
  botany: ["NEET"],
  zoology: ["NEET"],
};

/** Labels that differ from MOCK_TOPICS: the legacy chapter is narrowed beside new finer chapters. */
const NARROWED: Record<string, Bilingual> = {
  "phy-modern": { en: "Dual nature of radiation and matter", hi: "विकिरण तथा द्रव्य की द्वैत प्रकृति" },
  "math-coordinate": { en: "Straight lines", hi: "सरल रेखाएँ" },
  "math-integrals": { en: "Indefinite integrals", hi: "अनिश्चित समाकलन" },
  "math-vectors": { en: "Vector algebra", hi: "सदिश बीजगणित" },
};

type Spec = readonly [
  id: string,
  subject: Extract<QbSubject, "physics" | "chemistry" | "maths" | "botany" | "zoology">,
  level: Extract<QbLevel, "class_11" | "class_12">,
  ncert: string,
  unitRefs: UnitRefs,
  /** Only for chapters that are not MOCK_TOPICS ids (legacy labels come from MOCK_TOPICS / NARROWED). */
  label?: Bilingual,
];

const bi = (en: string, hi: string): Bilingual => ({ en, hi });

/* JEE Main / NEET physics units 1–20 share numbering; JEE Advanced physics: 1 General, 2 Mechanics,
   3 Thermal physics, 4 Electricity and magnetism, 5 Electromagnetic waves, 6 Optics, 7 Modern physics. */
const PHYSICS: readonly Spec[] = [
  ["phy-units", "physics", "class_11", "Physics XI ch. 1 Units and Measurements", { JEE_MAIN: [1], NEET: [1], JEE_ADV: [1] }],
  ["phy-kinematics", "physics", "class_11", "Physics XI ch. 2 Motion in a Straight Line; ch. 3 Motion in a Plane", { JEE_MAIN: [2], NEET: [2], JEE_ADV: [2] }],
  ["phy-laws-of-motion", "physics", "class_11", "Physics XI ch. 4 Laws of Motion", { JEE_MAIN: [3], NEET: [3], JEE_ADV: [2] }],
  ["phy-work-energy", "physics", "class_11", "Physics XI ch. 5 Work, Energy and Power", { JEE_MAIN: [4], NEET: [4], JEE_ADV: [2] }],
  ["phy-rotation", "physics", "class_11", "Physics XI ch. 6 System of Particles and Rotational Motion", { JEE_MAIN: [5], NEET: [5], JEE_ADV: [2] }],
  ["phy-gravitation", "physics", "class_11", "Physics XI ch. 7 Gravitation", { JEE_MAIN: [6], NEET: [6], JEE_ADV: [2] }],
  ["phy-solids", "physics", "class_11", "Physics XI ch. 8 Mechanical Properties of Solids", { JEE_MAIN: [7], NEET: [7], JEE_ADV: [2] }, bi("Mechanical properties of solids", "ठोसों के यांत्रिक गुण")],
  ["phy-fluids", "physics", "class_11", "Physics XI ch. 9 Mechanical Properties of Fluids", { JEE_MAIN: [7], NEET: [7], JEE_ADV: [2] }, bi("Mechanical properties of fluids", "तरलों के यांत्रिक गुण")],
  ["phy-thermal-properties", "physics", "class_11", "Physics XI ch. 10 Thermal Properties of Matter", { JEE_MAIN: [7], NEET: [7], JEE_ADV: [3] }, bi("Thermal properties of matter", "द्रव्य के तापीय गुण")],
  ["phy-thermodynamics", "physics", "class_11", "Physics XI ch. 11 Thermodynamics", { JEE_MAIN: [8], NEET: [8], JEE_ADV: [3] }],
  ["phy-kinetic-theory", "physics", "class_11", "Physics XI ch. 12 Kinetic Theory", { JEE_MAIN: [9], NEET: [9], JEE_ADV: [3] }],
  ["phy-oscillations", "physics", "class_11", "Physics XI ch. 13 Oscillations; ch. 14 Waves", { JEE_MAIN: [10], NEET: [10], JEE_ADV: [2] }],
  ["phy-experimental", "physics", "class_11", "Practical work in Physics XI and XII (official unit, not an NCERT chapter)", { JEE_MAIN: [20], NEET: [20], JEE_ADV: [1] }, bi("Experimental skills", "प्रायोगिक कौशल")],
  ["phy-electrostatics", "physics", "class_12", "Physics XII ch. 1 Electric Charges and Fields; ch. 2 Electrostatic Potential and Capacitance", { JEE_MAIN: [11], NEET: [11], JEE_ADV: [4] }],
  ["phy-current", "physics", "class_12", "Physics XII ch. 3 Current Electricity", { JEE_MAIN: [12], NEET: [12], JEE_ADV: [4] }],
  ["phy-magnetism", "physics", "class_12", "Physics XII ch. 4 Moving Charges and Magnetism", { JEE_MAIN: [13], NEET: [13], JEE_ADV: [4] }],
  ["phy-magnetism-matter", "physics", "class_12", "Physics XII ch. 5 Magnetism and Matter", { JEE_MAIN: [13], NEET: [13] }, bi("Magnetism and matter", "चुंबकत्व एवं द्रव्य")],
  ["phy-emi", "physics", "class_12", "Physics XII ch. 6 Electromagnetic Induction", { JEE_MAIN: [14], NEET: [14], JEE_ADV: [4] }, bi("Electromagnetic induction", "वैद्युतचुंबकीय प्रेरण")],
  ["phy-ac", "physics", "class_12", "Physics XII ch. 7 Alternating Current", { JEE_MAIN: [14], NEET: [14], JEE_ADV: [4] }, bi("Alternating current", "प्रत्यावर्ती धारा")],
  ["phy-em-waves", "physics", "class_12", "Physics XII ch. 8 Electromagnetic Waves", { JEE_MAIN: [15], NEET: [15], JEE_ADV: [5] }, bi("Electromagnetic waves", "वैद्युतचुंबकीय तरंगें")],
  ["phy-optics", "physics", "class_12", "Physics XII ch. 9 Ray Optics and Optical Instruments", { JEE_MAIN: [16], NEET: [16], JEE_ADV: [6] }],
  ["phy-wave-optics", "physics", "class_12", "Physics XII ch. 10 Wave Optics", { JEE_MAIN: [16], NEET: [16], JEE_ADV: [6] }, bi("Wave optics", "तरंग प्रकाशिकी")],
  ["phy-modern", "physics", "class_12", "Physics XII ch. 11 Dual Nature of Radiation and Matter", { JEE_MAIN: [17], NEET: [17], JEE_ADV: [7] }],
  ["phy-atoms", "physics", "class_12", "Physics XII ch. 12 Atoms", { JEE_MAIN: [18], NEET: [18], JEE_ADV: [7] }, bi("Atoms", "परमाणु")],
  ["phy-nuclei", "physics", "class_12", "Physics XII ch. 13 Nuclei", { JEE_MAIN: [18], NEET: [18], JEE_ADV: [7] }, bi("Nuclei", "नाभिक")],
  ["phy-semiconductors", "physics", "class_12", "Physics XII ch. 14 Semiconductor Electronics: Materials, Devices and Simple Circuits", { JEE_MAIN: [19], NEET: [19] }, bi("Semiconductor electronics", "अर्धचालक इलेक्ट्रॉनिकी")],
  ["phy-communication", "physics", "class_12", "Physics XII (pre-2023 edition) Communication Systems", {}, bi("Communication systems", "संचार व्यवस्था")],
];

/* JEE Main / NEET chemistry units 1–20 share numbering; JEE Advanced chemistry headings 1–37 in
   document order (./units.ts). */
const CHEMISTRY: readonly Spec[] = [
  ["chem-mole", "chemistry", "class_11", "Chemistry XI unit 1 Some Basic Concepts of Chemistry", { JEE_MAIN: [1], NEET: [1], JEE_ADV: [1] }],
  ["chem-atomic", "chemistry", "class_11", "Chemistry XI unit 2 Structure of Atom", { JEE_MAIN: [2], NEET: [2], JEE_ADV: [3] }],
  ["chem-periodic", "chemistry", "class_11", "Chemistry XI unit 3 Classification of Elements and Periodicity in Properties", { JEE_MAIN: [9], NEET: [9], JEE_ADV: [12] }],
  ["chem-bonding", "chemistry", "class_11", "Chemistry XI unit 4 Chemical Bonding and Molecular Structure", { JEE_MAIN: [3], NEET: [3], JEE_ADV: [4] }],
  ["chem-states-of-matter", "chemistry", "class_11", "Chemistry XI (pre-2023 edition) States of Matter", { JEE_ADV: [2] }, bi("States of matter: gases and liquids", "द्रव्य की अवस्थाएँ: गैस और द्रव")],
  ["chem-thermo", "chemistry", "class_11", "Chemistry XI unit 5 Thermodynamics", { JEE_MAIN: [4], NEET: [4], JEE_ADV: [5] }],
  ["chem-equilibrium", "chemistry", "class_11", "Chemistry XI unit 6 Equilibrium", { JEE_MAIN: [6], NEET: [6], JEE_ADV: [6] }],
  ["chem-hydrogen", "chemistry", "class_11", "Chemistry XI (pre-2023 edition) Hydrogen", { JEE_ADV: [13] }, bi("Hydrogen", "हाइड्रोजन")],
  ["chem-s-block", "chemistry", "class_11", "Chemistry XI (pre-2023 edition) The s-Block Elements", { JEE_ADV: [14] }, bi("s-Block elements", "s-ब्लॉक तत्व")],
  ["chem-environmental", "chemistry", "class_11", "Chemistry XI (pre-2023 edition) Environmental Chemistry", { JEE_ADV: [21] }, bi("Environmental chemistry", "पर्यावरणीय रसायन")],
  ["chem-goc", "chemistry", "class_11", "Chemistry XI unit 8 Organic Chemistry – Some Basic Principles and Techniques", { JEE_MAIN: [13, 14], NEET: [13, 14], JEE_ADV: [22] }],
  ["chem-hydrocarbons", "chemistry", "class_11", "Chemistry XI unit 9 Hydrocarbons", { JEE_MAIN: [15], NEET: [15], JEE_ADV: [23, 24, 25] }],
  ["chem-solid-state", "chemistry", "class_12", "Chemistry XII (pre-2023 edition) The Solid State", { JEE_ADV: [9] }, bi("Solid state", "ठोस अवस्था")],
  ["chem-solutions", "chemistry", "class_12", "Chemistry XII unit 1 Solutions", { JEE_MAIN: [5], NEET: [5], JEE_ADV: [10] }],
  ["chem-redox", "chemistry", "class_12", "Chemistry XI unit 7 Redox Reactions; Chemistry XII unit 2 Electrochemistry", { JEE_MAIN: [7], NEET: [7], JEE_ADV: [1, 7] }],
  ["chem-kinetics", "chemistry", "class_12", "Chemistry XII unit 3 Chemical Kinetics", { JEE_MAIN: [8], NEET: [8], JEE_ADV: [8] }],
  ["chem-surface", "chemistry", "class_12", "Chemistry XII (pre-2023 edition) Surface Chemistry", { JEE_ADV: [11] }, bi("Surface chemistry", "पृष्ठ रसायन")],
  ["chem-metallurgy", "chemistry", "class_12", "Chemistry XII (pre-2023 edition) General Principles and Processes of Isolation of Elements", { JEE_ADV: [19] }, bi("Isolation of metals (metallurgy)", "धातुओं का निष्कर्षण (धातुकर्म)")],
  ["chem-p-block", "chemistry", "class_12", "Chemistry XI and XII (pre-2023 editions) The p-Block Elements", { JEE_MAIN: [10], NEET: [10], JEE_ADV: [15] }, bi("p-Block elements", "p-ब्लॉक तत्व")],
  ["chem-d-f-block", "chemistry", "class_12", "Chemistry XII unit 4 The d- and f-Block Elements", { JEE_MAIN: [11], NEET: [11], JEE_ADV: [16, 17] }, bi("d- and f-Block elements", "d- एवं f-ब्लॉक तत्व")],
  ["chem-coordination", "chemistry", "class_12", "Chemistry XII unit 5 Coordination Compounds", { JEE_MAIN: [12], NEET: [12], JEE_ADV: [18] }],
  ["chem-haloalkanes", "chemistry", "class_12", "Chemistry XII unit 6 Haloalkanes and Haloarenes", { JEE_MAIN: [16], NEET: [16], JEE_ADV: [27, 33] }, bi("Haloalkanes and haloarenes", "हैलोऐल्केन तथा हैलोऐरीन")],
  ["chem-alcohols", "chemistry", "class_12", "Chemistry XII unit 7 Alcohols, Phenols and Ethers", { JEE_MAIN: [17], NEET: [17], JEE_ADV: [26, 28, 29] }, bi("Alcohols, phenols and ethers", "ऐल्कोहॉल, फ़ीनॉल एवं ईथर")],
  ["chem-carbonyl", "chemistry", "class_12", "Chemistry XII unit 8 Aldehydes, Ketones and Carboxylic Acids", { JEE_MAIN: [17], NEET: [17], JEE_ADV: [30, 31] }, bi("Aldehydes, ketones and carboxylic acids", "ऐल्डिहाइड, कीटोन एवं कार्बोक्सिलिक अम्ल")],
  ["chem-amines", "chemistry", "class_12", "Chemistry XII unit 9 Amines", { JEE_MAIN: [18], NEET: [18], JEE_ADV: [32] }, bi("Amines", "ऐमीन")],
  ["chem-biomolecules", "chemistry", "class_12", "Chemistry XII unit 10 Biomolecules", { JEE_MAIN: [19], NEET: [19], JEE_ADV: [34] }, bi("Biomolecules", "जैव-अणु")],
  ["chem-polymers", "chemistry", "class_12", "Chemistry XII (pre-2023 edition) Polymers", { JEE_ADV: [35] }, bi("Polymers", "बहुलक")],
  ["chem-everyday", "chemistry", "class_12", "Chemistry XII (pre-2023 edition) Chemistry in Everyday Life", { JEE_ADV: [36] }, bi("Chemistry in everyday life", "दैनिक जीवन में रसायन")],
  ["chem-practical", "chemistry", "class_12", "Laboratory work in Chemistry XI and XII (official unit, not an NCERT chapter)", { JEE_MAIN: [20], NEET: [20], JEE_ADV: [20, 37] }, bi("Principles related to practical chemistry", "प्रायोगिक रसायन के सिद्धांत")],
];

/* JEE Main maths units 1–14; JEE Advanced maths: 1 Sets, relations and functions, 2 Algebra, 3 Matrices,
   4 Probability and statistics, 5 Trigonometry, 6 Analytical geometry, 7 Differential calculus,
   8 Integral calculus, 9 Vectors. */
const MATHS: readonly Spec[] = [
  ["math-sets", "maths", "class_11", "Mathematics XI ch. 1 Sets; ch. 2 Relations and Functions; Mathematics XII ch. 1 Relations and Functions", { JEE_MAIN: [1], JEE_ADV: [1] }, bi("Sets, relations and functions", "समुच्चय, संबंध एवं फलन")],
  ["math-trigonometry", "maths", "class_11", "Mathematics XI ch. 3 Trigonometric Functions; Mathematics XII ch. 2 Inverse Trigonometric Functions", { JEE_MAIN: [14], JEE_ADV: [5] }],
  ["math-complex", "maths", "class_11", "Mathematics XI ch. 4 Complex Numbers and Quadratic Equations (complex numbers)", { JEE_MAIN: [2], JEE_ADV: [2] }],
  ["math-quadratic", "maths", "class_11", "Mathematics XI ch. 4 Complex Numbers and Quadratic Equations (quadratic equations)", { JEE_MAIN: [2], JEE_ADV: [2] }],
  ["math-induction", "maths", "class_11", "Mathematics XI (pre-2023 edition) Principle of Mathematical Induction", {}, bi("Mathematical induction", "गणितीय आगमन")],
  ["math-pnc", "maths", "class_11", "Mathematics XI ch. 6 Permutations and Combinations", { JEE_MAIN: [4], JEE_ADV: [2] }],
  ["math-binomial", "maths", "class_11", "Mathematics XI ch. 7 Binomial Theorem", { JEE_MAIN: [5], JEE_ADV: [2] }],
  ["math-sequences", "maths", "class_11", "Mathematics XI ch. 8 Sequences and Series", { JEE_MAIN: [6], JEE_ADV: [2] }],
  ["math-coordinate", "maths", "class_11", "Mathematics XI ch. 9 Straight Lines", { JEE_MAIN: [10], JEE_ADV: [6] }],
  ["math-circles", "maths", "class_11", "Mathematics XI ch. 10 Conic Sections (circle)", { JEE_MAIN: [10], JEE_ADV: [6] }, bi("Circles", "वृत्त")],
  ["math-conics", "maths", "class_11", "Mathematics XI ch. 10 Conic Sections (parabola, ellipse, hyperbola)", { JEE_MAIN: [10], JEE_ADV: [6] }, bi("Conic sections (parabola, ellipse, hyperbola)", "शंकु परिच्छेद (परवलय, दीर्घवृत्त, अतिपरवलय)")],
  ["math-statistics", "maths", "class_11", "Mathematics XI ch. 13 Statistics", { JEE_MAIN: [13], JEE_ADV: [4] }, bi("Statistics", "सांख्यिकी")],
  ["math-reasoning", "maths", "class_11", "Mathematics XI (pre-2023 edition) Mathematical Reasoning", {}, bi("Mathematical reasoning", "गणितीय विवेचन")],
  ["math-matrices", "maths", "class_12", "Mathematics XII ch. 3 Matrices; ch. 4 Determinants", { JEE_MAIN: [3], JEE_ADV: [3] }],
  ["math-limits", "maths", "class_12", "Mathematics XI ch. 12 Limits and Derivatives; Mathematics XII ch. 5 Continuity and Differentiability", { JEE_MAIN: [7], JEE_ADV: [7] }],
  ["math-derivatives", "maths", "class_12", "Mathematics XII ch. 6 Application of Derivatives", { JEE_MAIN: [7], JEE_ADV: [7] }],
  ["math-integrals", "maths", "class_12", "Mathematics XII ch. 7 Integrals (indefinite integrals)", { JEE_MAIN: [8], JEE_ADV: [8] }],
  ["math-definite-integrals", "maths", "class_12", "Mathematics XII ch. 7 Integrals (definite integrals)", { JEE_MAIN: [8], JEE_ADV: [8] }, bi("Definite integrals", "निश्चित समाकलन")],
  ["math-area", "maths", "class_12", "Mathematics XII ch. 8 Application of Integrals", { JEE_MAIN: [8], JEE_ADV: [8] }, bi("Area under curves (application of integrals)", "वक्रों के अंतर्गत क्षेत्रफल (समाकलनों के अनुप्रयोग)")],
  ["math-differential-eq", "maths", "class_12", "Mathematics XII ch. 9 Differential Equations", { JEE_MAIN: [9], JEE_ADV: [8] }],
  ["math-vectors", "maths", "class_12", "Mathematics XII ch. 10 Vector Algebra", { JEE_MAIN: [12], JEE_ADV: [9] }],
  ["math-3d", "maths", "class_12", "Mathematics XI ch. 11 Introduction to Three Dimensional Geometry; Mathematics XII ch. 11 Three Dimensional Geometry", { JEE_MAIN: [11], JEE_ADV: [6] }, bi("Three-dimensional geometry", "त्रिविमीय ज्यामिति")],
  ["math-probability", "maths", "class_12", "Mathematics XI ch. 14 Probability; Mathematics XII ch. 13 Probability", { JEE_MAIN: [13], JEE_ADV: [4] }],
];

/* NEET biology units 1–10 (one Biology list in the NMC syllabus). Blocks: see BIOLOGY_BLOCK_UNVERIFIED. */
const BIOLOGY: readonly Spec[] = [
  ["bio-living-world", "botany", "class_11", "Biology XI ch. 1 The Living World", { NEET: [1] }, bi("The living world", "जीव जगत")],
  ["bio-biological-classification", "botany", "class_11", "Biology XI ch. 2 Biological Classification", { NEET: [1] }, bi("Biological classification", "जीव जगत का वर्गीकरण")],
  ["bio-plant-kingdom", "botany", "class_11", "Biology XI ch. 3 Plant Kingdom", { NEET: [1] }, bi("Plant kingdom", "वनस्पति जगत")],
  ["bio-animal-kingdom", "zoology", "class_11", "Biology XI ch. 4 Animal Kingdom", { NEET: [1] }, bi("Animal kingdom", "प्राणि जगत")],
  ["bio-morphology", "botany", "class_11", "Biology XI ch. 5 Morphology of Flowering Plants", { NEET: [2] }, bi("Morphology of flowering plants", "पुष्पी पादपों की आकारिकी")],
  ["bio-anatomy", "botany", "class_11", "Biology XI ch. 6 Anatomy of Flowering Plants", { NEET: [2] }, bi("Anatomy of flowering plants", "पुष्पी पादपों का शारीर")],
  ["bio-structural-organisation", "zoology", "class_11", "Biology XI ch. 7 Structural Organisation in Animals", { NEET: [2] }, bi("Structural organisation in animals", "प्राणियों में संरचनात्मक संगठन")],
  ["bot-cell", "botany", "class_11", "Biology XI ch. 8 Cell: The Unit of Life", { NEET: [3] }],
  ["bio-biomolecules", "zoology", "class_11", "Biology XI ch. 9 Biomolecules", { NEET: [3] }, bi("Biomolecules", "जैव अणु")],
  ["bot-cell-division", "botany", "class_11", "Biology XI ch. 10 Cell Cycle and Cell Division", { NEET: [3] }],
  ["bio-transport-plants", "botany", "class_11", "Biology XI (pre-2023 edition) Transport in Plants", {}, bi("Transport in plants", "पौधों में परिवहन")],
  ["bio-mineral-nutrition", "botany", "class_11", "Biology XI (pre-2023 edition) Mineral Nutrition", {}, bi("Mineral nutrition", "खनिज पोषण")],
  ["bot-photosynthesis", "botany", "class_11", "Biology XI ch. 11 Photosynthesis in Higher Plants", { NEET: [4] }],
  ["bot-respiration", "botany", "class_11", "Biology XI ch. 12 Respiration in Plants", { NEET: [4] }],
  ["bot-growth", "botany", "class_11", "Biology XI ch. 13 Plant Growth and Development", { NEET: [4] }],
  ["bio-digestion", "zoology", "class_11", "Biology XI (pre-2023 edition) Digestion and Absorption", {}, bi("Digestion and absorption", "पाचन एवं अवशोषण")],
  ["zoo-breathing", "zoology", "class_11", "Biology XI ch. 14 Breathing and Exchange of Gases", { NEET: [5] }],
  ["zoo-circulation", "zoology", "class_11", "Biology XI ch. 15 Body Fluids and Circulation", { NEET: [5] }],
  ["zoo-excretion", "zoology", "class_11", "Biology XI ch. 16 Excretory Products and their Elimination", { NEET: [5] }],
  ["zoo-locomotion", "zoology", "class_11", "Biology XI ch. 17 Locomotion and Movement", { NEET: [5] }],
  ["zoo-neural", "zoology", "class_11", "Biology XI ch. 18 Neural Control and Coordination", { NEET: [5] }],
  ["zoo-endocrine", "zoology", "class_11", "Biology XI ch. 19 Chemical Coordination and Integration", { NEET: [5] }],
  ["bio-reproduction-organisms", "botany", "class_12", "Biology XII (pre-2023 edition) Reproduction in Organisms", {}, bi("Reproduction in organisms", "जीवों में जनन")],
  ["bot-reproduction", "botany", "class_12", "Biology XII ch. 1 Sexual Reproduction in Flowering Plants", { NEET: [6] }],
  ["zoo-reproduction", "zoology", "class_12", "Biology XII ch. 2 Human Reproduction", { NEET: [6] }],
  ["bio-reproductive-health", "zoology", "class_12", "Biology XII ch. 3 Reproductive Health", { NEET: [6] }, bi("Reproductive health", "जनन स्वास्थ्य")],
  ["bot-genetics", "botany", "class_12", "Biology XII ch. 4 Principles of Inheritance and Variation", { NEET: [7] }],
  ["zoo-molecular", "zoology", "class_12", "Biology XII ch. 5 Molecular Basis of Inheritance", { NEET: [7] }],
  ["zoo-evolution", "zoology", "class_12", "Biology XII ch. 6 Evolution", { NEET: [7] }],
  ["zoo-health", "zoology", "class_12", "Biology XII ch. 7 Human Health and Disease", { NEET: [8] }],
  ["bio-food-production", "botany", "class_12", "Biology XII (pre-2023 edition) Strategies for Enhancement in Food Production", {}, bi("Strategies for enhancement in food production", "खाद्य उत्पादन में वृद्धि की कार्यनीति")],
  ["bio-microbes", "botany", "class_12", "Biology XII ch. 8 Microbes in Human Welfare", { NEET: [8] }, bi("Microbes in human welfare", "मानव कल्याण में सूक्ष्मजीव")],
  ["bio-biotech-principles", "zoology", "class_12", "Biology XII ch. 9 Biotechnology: Principles and Processes", { NEET: [9] }, bi("Biotechnology: principles and processes", "जैव प्रौद्योगिकी: सिद्धांत व प्रक्रम")],
  ["bio-biotech-applications", "zoology", "class_12", "Biology XII ch. 10 Biotechnology and its Applications", { NEET: [9] }, bi("Biotechnology and its applications", "जैव प्रौद्योगिकी एवं उसके उपयोग")],
  ["bio-organisms-populations", "botany", "class_12", "Biology XII ch. 11 Organisms and Populations", { NEET: [10] }, bi("Organisms and populations", "जीव और समष्टियाँ")],
  ["bot-ecology", "botany", "class_12", "Biology XII ch. 12 Ecosystem", { NEET: [10] }],
  ["bio-biodiversity", "botany", "class_12", "Biology XII ch. 13 Biodiversity and Conservation", { NEET: [10] }, bi("Biodiversity and conservation", "जैव विविधता एवं संरक्षण")],
  ["bio-environmental-issues", "botany", "class_12", "Biology XII (pre-2023 edition) Environmental Issues", {}, bi("Environmental issues", "पर्यावरण के मुद्दे")],
];

function toChapter([id, subject, level, ncert, unitRefs, label]: Spec): SeedChapter {
  const topic = MOCK_TOPICS[id];
  if (topic && topic.subject !== subject) throw new Error(`Seed chapter ${id}: subject differs from MOCK_TOPICS`);
  const resolved = NARROWED[id] ?? label ?? topic?.label;
  if (!resolved) throw new Error(`Seed chapter ${id}: no label`);
  return { id, subject, level, label: resolved, ncert, unitRefs, legacy: Boolean(topic) };
}

/** Every seeded chapter, in teaching order per subject (the `sort` column follows this order). */
export const SEED_CHAPTERS: readonly SeedChapter[] = [...PHYSICS, ...CHEMISTRY, ...MATHS, ...BIOLOGY].map(toChapter);

/** Biology chapters whose Botany / Zoology block must be verified against a NEET booklet. */
export const BIOLOGY_BLOCK_UNVERIFIED: readonly string[] = SEED_CHAPTERS.filter(
  (c) => c.subject === "botany" || c.subject === "zoology",
).map((c) => c.id);

/**
 * Chapters whose NCERT material spans Class XI and Class XII but which carry one `level` (see the
 * known limitation in the module comment). Derived from the `ncert` reference.
 */
export const MULTI_CLASS_CHAPTER_IDS: readonly string[] = SEED_CHAPTERS.filter(
  (c) => /\bXI\b/.test(c.ncert) && /\bXII\b/.test(c.ncert),
).map((c) => c.id);

/** The unit subject a chapter's NEET units use: NEET lists Botany and Zoology under one Biology list. */
function unitSubject(chapter: SeedChapter, exam: SeedUnitExam): QbSubject {
  return exam === "NEET" && (chapter.subject === "botany" || chapter.subject === "zoology") ? "biology" : chapter.subject;
}

/** `qb_chapters.units`: official unit ids per exam (only exams that examine the subject and list a unit). */
export function chapterUnits(chapter: SeedChapter): Partial<Record<QbExam, string[]>> {
  const units: Partial<Record<QbExam, string[]>> = {};
  for (const exam of EXAMS_BY_SUBJECT[chapter.subject] ?? []) {
    const refs = chapter.unitRefs[exam];
    if (refs?.length) units[exam] = refs.map((n) => unitId(exam, unitSubject(chapter, exam), n));
  }
  return units;
}

/**
 * `qb_chapters.exam_status`: "current" when the 2026 syllabus of an exam lists the chapter, else
 * "removed". Exams that do not examine the subject (maths for NEET, biology for JEE, every seeded
 * chapter for BOH) get no entry, so the chapter is never eligible there.
 */
export function chapterExamStatus(chapter: SeedChapter): Partial<Record<QbExam, "current" | "removed">> {
  const status: Partial<Record<QbExam, "current" | "removed">> = {};
  for (const exam of EXAMS_BY_SUBJECT[chapter.subject] ?? []) {
    status[exam] = chapter.unitRefs[exam]?.length ? "current" : "removed";
  }
  return status;
}
