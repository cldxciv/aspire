import type { ContentStatus } from "@/lib/types";
import type { ExamId, SubjectId, SyllabusTopic } from "@/lib/planner/types";

/**
 * Syllabus map for the study planner (A4-PLANNER, D-032).
 *
 * TOPIC NAMES ONLY, taken from the unit structure of the public syllabi:
 * - JEE Main / NEET (UG): the NTA and NMC unit lists (Physics and Chemistry share the same 20 units).
 * - JEE Advanced: uses the same unit names as JEE Main here. The official JEE Advanced syllabus is
 *   grouped differently and differs in detail — Aspire to review before this is published.
 * - Class 9–10 foundation: NCERT chapter names (rationalised books).
 * - BOH (Brain of Himachal): the paper sections listed in Aspire's Class 10 BOH blueprint (Physics,
 *   Chemistry, Maths, Mental Ability). Foundation chapters + common mental-ability topics, as a
 *   SUGGESTION — Aspire has not confirmed a BOH syllabus.
 *
 * No weightages, marks or "important chapter" claims. Ordering by `level` (class 11 / 12, 9 / 10) is
 * a planning suggestion only. Hindi names are a machine draft (needs native review).
 *
 * `status: "placeholder"` → the planner is shown only when `showPlaceholderContent()` is on, with a
 * "Sample" label, until Aspire approves this map (then set it to "published").
 */
export const SYLLABUS_STATUS: ContentStatus = "placeholder";

const seniorPhysics: SyllabusTopic[] = [
  { id: "phy-units", subject: "physics", level: "11", name: { en: "Units and Measurements", hi: "मात्रक और मापन" } },
  { id: "phy-kinematics", subject: "physics", level: "11", name: { en: "Kinematics", hi: "शुद्धगतिकी" } },
  { id: "phy-laws-of-motion", subject: "physics", level: "11", name: { en: "Laws of Motion", hi: "गति के नियम" } },
  { id: "phy-work-energy", subject: "physics", level: "11", name: { en: "Work, Energy and Power", hi: "कार्य, ऊर्जा और शक्ति" } },
  { id: "phy-rotation", subject: "physics", level: "11", name: { en: "Rotational Motion", hi: "घूर्णन गति" } },
  { id: "phy-gravitation", subject: "physics", level: "11", name: { en: "Gravitation", hi: "गुरुत्वाकर्षण" } },
  { id: "phy-solids-liquids", subject: "physics", level: "11", name: { en: "Properties of Solids and Liquids", hi: "ठोसों और द्रवों के गुण" } },
  { id: "phy-thermodynamics", subject: "physics", level: "11", name: { en: "Thermodynamics", hi: "ऊष्मागतिकी" } },
  { id: "phy-kinetic-theory", subject: "physics", level: "11", name: { en: "Kinetic Theory of Gases", hi: "गैसों का अणुगति सिद्धांत" } },
  { id: "phy-oscillations-waves", subject: "physics", level: "11", name: { en: "Oscillations and Waves", hi: "दोलन और तरंगें" } },
  { id: "phy-electrostatics", subject: "physics", level: "12", name: { en: "Electrostatics", hi: "स्थिरवैद्युतिकी" } },
  { id: "phy-current", subject: "physics", level: "12", name: { en: "Current Electricity", hi: "विद्युत धारा" } },
  { id: "phy-magnetism", subject: "physics", level: "12", name: { en: "Magnetic Effects of Current and Magnetism", hi: "धारा के चुंबकीय प्रभाव और चुंबकत्व" } },
  { id: "phy-emi-ac", subject: "physics", level: "12", name: { en: "Electromagnetic Induction and Alternating Currents", hi: "विद्युतचुंबकीय प्रेरण और प्रत्यावर्ती धारा" } },
  { id: "phy-em-waves", subject: "physics", level: "12", name: { en: "Electromagnetic Waves", hi: "विद्युतचुंबकीय तरंगें" } },
  { id: "phy-optics", subject: "physics", level: "12", name: { en: "Optics", hi: "प्रकाशिकी" } },
  { id: "phy-dual-nature", subject: "physics", level: "12", name: { en: "Dual Nature of Matter and Radiation", hi: "द्रव्य और विकिरण की द्वैत प्रकृति" } },
  { id: "phy-atoms-nuclei", subject: "physics", level: "12", name: { en: "Atoms and Nuclei", hi: "परमाणु और नाभिक" } },
  { id: "phy-electronic-devices", subject: "physics", level: "12", name: { en: "Electronic Devices", hi: "इलेक्ट्रॉनिक युक्तियाँ" } },
  { id: "phy-experimental", subject: "physics", level: "both", name: { en: "Experimental Skills", hi: "प्रायोगिक कौशल" } },
];

const seniorChemistry: SyllabusTopic[] = [
  { id: "chem-basic-concepts", subject: "chemistry", level: "11", name: { en: "Some Basic Concepts in Chemistry", hi: "रसायन विज्ञान की कुछ मूल अवधारणाएँ" } },
  { id: "chem-atomic-structure", subject: "chemistry", level: "11", name: { en: "Atomic Structure", hi: "परमाणु संरचना" } },
  { id: "chem-bonding", subject: "chemistry", level: "11", name: { en: "Chemical Bonding and Molecular Structure", hi: "रासायनिक आबंधन और आण्विक संरचना" } },
  { id: "chem-thermodynamics", subject: "chemistry", level: "11", name: { en: "Chemical Thermodynamics", hi: "रासायनिक ऊष्मागतिकी" } },
  { id: "chem-solutions", subject: "chemistry", level: "12", name: { en: "Solutions", hi: "विलयन" } },
  { id: "chem-equilibrium", subject: "chemistry", level: "11", name: { en: "Equilibrium", hi: "साम्यावस्था" } },
  { id: "chem-redox-electrochem", subject: "chemistry", level: "both", name: { en: "Redox Reactions and Electrochemistry", hi: "अपचयोपचय अभिक्रियाएँ और विद्युतरसायन" } },
  { id: "chem-kinetics", subject: "chemistry", level: "12", name: { en: "Chemical Kinetics", hi: "रासायनिक बलगतिकी" } },
  { id: "chem-periodicity", subject: "chemistry", level: "11", name: { en: "Classification of Elements and Periodicity in Properties", hi: "तत्वों का वर्गीकरण और गुणधर्मों में आवर्तता" } },
  { id: "chem-p-block", subject: "chemistry", level: "both", name: { en: "p-Block Elements", hi: "p-ब्लॉक तत्व" } },
  { id: "chem-d-f-block", subject: "chemistry", level: "12", name: { en: "d- and f-Block Elements", hi: "d- और f-ब्लॉक तत्व" } },
  { id: "chem-coordination", subject: "chemistry", level: "12", name: { en: "Coordination Compounds", hi: "उपसहसंयोजन यौगिक" } },
  { id: "chem-purification", subject: "chemistry", level: "11", name: { en: "Purification and Characterisation of Organic Compounds", hi: "कार्बनिक यौगिकों का शोधन और अभिलक्षणन" } },
  { id: "chem-organic-basics", subject: "chemistry", level: "11", name: { en: "Some Basic Principles of Organic Chemistry", hi: "कार्बनिक रसायन के कुछ मूल सिद्धांत" } },
  { id: "chem-hydrocarbons", subject: "chemistry", level: "11", name: { en: "Hydrocarbons", hi: "हाइड्रोकार्बन" } },
  { id: "chem-halogen-compounds", subject: "chemistry", level: "12", name: { en: "Organic Compounds Containing Halogens", hi: "हैलोजन युक्त कार्बनिक यौगिक" } },
  { id: "chem-oxygen-compounds", subject: "chemistry", level: "12", name: { en: "Organic Compounds Containing Oxygen", hi: "ऑक्सीजन युक्त कार्बनिक यौगिक" } },
  { id: "chem-nitrogen-compounds", subject: "chemistry", level: "12", name: { en: "Organic Compounds Containing Nitrogen", hi: "नाइट्रोजन युक्त कार्बनिक यौगिक" } },
  { id: "chem-biomolecules", subject: "chemistry", level: "12", name: { en: "Biomolecules", hi: "जैव-अणु" } },
  { id: "chem-practical", subject: "chemistry", level: "both", name: { en: "Principles Related to Practical Chemistry", hi: "प्रायोगिक रसायन से संबंधित सिद्धांत" } },
];

const seniorMaths: SyllabusTopic[] = [
  { id: "math-sets-functions", subject: "maths", level: "both", name: { en: "Sets, Relations and Functions", hi: "समुच्चय, संबंध और फलन" } },
  { id: "math-complex-quadratic", subject: "maths", level: "11", name: { en: "Complex Numbers and Quadratic Equations", hi: "सम्मिश्र संख्याएँ और द्विघात समीकरण" } },
  { id: "math-matrices", subject: "maths", level: "12", name: { en: "Matrices and Determinants", hi: "आव्यूह और सारणिक" } },
  { id: "math-pnc", subject: "maths", level: "11", name: { en: "Permutations and Combinations", hi: "क्रमचय और संचय" } },
  { id: "math-binomial", subject: "maths", level: "11", name: { en: "Binomial Theorem and its Simple Applications", hi: "द्विपद प्रमेय और उसके सरल अनुप्रयोग" } },
  { id: "math-sequences", subject: "maths", level: "11", name: { en: "Sequence and Series", hi: "अनुक्रम और श्रेणी" } },
  { id: "math-limits", subject: "maths", level: "both", name: { en: "Limit, Continuity and Differentiability", hi: "सीमा, सांतत्य और अवकलनीयता" } },
  { id: "math-integrals", subject: "maths", level: "12", name: { en: "Integral Calculus", hi: "समाकलन गणित" } },
  { id: "math-diff-eq", subject: "maths", level: "12", name: { en: "Differential Equations", hi: "अवकल समीकरण" } },
  { id: "math-coordinate", subject: "maths", level: "11", name: { en: "Coordinate Geometry", hi: "निर्देशांक ज्यामिति" } },
  { id: "math-3d", subject: "maths", level: "both", name: { en: "Three Dimensional Geometry", hi: "त्रिविमीय ज्यामिति" } },
  { id: "math-vectors", subject: "maths", level: "12", name: { en: "Vector Algebra", hi: "सदिश बीजगणित" } },
  { id: "math-stats-probability", subject: "maths", level: "both", name: { en: "Statistics and Probability", hi: "सांख्यिकी और प्रायिकता" } },
  { id: "math-trigonometry", subject: "maths", level: "both", name: { en: "Trigonometry", hi: "त्रिकोणमिति" } },
];

const neetBiology: SyllabusTopic[] = [
  { id: "bio-diversity", subject: "biology", level: "11", name: { en: "Diversity in Living World", hi: "जीव जगत में विविधता" } },
  { id: "bio-structural-org", subject: "biology", level: "11", name: { en: "Structural Organisation in Animals and Plants", hi: "प्राणियों और पादपों में संरचनात्मक संगठन" } },
  { id: "bio-cell", subject: "biology", level: "11", name: { en: "Cell Structure and Function", hi: "कोशिका: संरचना और कार्य" } },
  { id: "bio-plant-physiology", subject: "biology", level: "11", name: { en: "Plant Physiology", hi: "पादप कार्यिकी" } },
  { id: "bio-human-physiology", subject: "biology", level: "11", name: { en: "Human Physiology", hi: "मानव कार्यिकी" } },
  { id: "bio-reproduction", subject: "biology", level: "12", name: { en: "Reproduction", hi: "जनन" } },
  { id: "bio-genetics-evolution", subject: "biology", level: "12", name: { en: "Genetics and Evolution", hi: "आनुवंशिकी और विकास" } },
  { id: "bio-human-welfare", subject: "biology", level: "12", name: { en: "Biology and Human Welfare", hi: "जीव विज्ञान और मानव कल्याण" } },
  { id: "bio-biotechnology", subject: "biology", level: "12", name: { en: "Biotechnology and Its Applications", hi: "जैव प्रौद्योगिकी और उसके अनुप्रयोग" } },
  { id: "bio-ecology", subject: "biology", level: "12", name: { en: "Ecology and Environment", hi: "पारिस्थितिकी और पर्यावरण" } },
];

const foundationPhysics: SyllabusTopic[] = [
  { id: "fphy-motion", subject: "physics", level: "9", name: { en: "Motion", hi: "गति" } },
  { id: "fphy-force", subject: "physics", level: "9", name: { en: "Force and Laws of Motion", hi: "बल तथा गति के नियम" } },
  { id: "fphy-gravitation", subject: "physics", level: "9", name: { en: "Gravitation", hi: "गुरुत्वाकर्षण" } },
  { id: "fphy-work-energy", subject: "physics", level: "9", name: { en: "Work and Energy", hi: "कार्य तथा ऊर्जा" } },
  { id: "fphy-sound", subject: "physics", level: "9", name: { en: "Sound", hi: "ध्वनि" } },
  { id: "fphy-light", subject: "physics", level: "10", name: { en: "Light – Reflection and Refraction", hi: "प्रकाश – परावर्तन तथा अपवर्तन" } },
  { id: "fphy-human-eye", subject: "physics", level: "10", name: { en: "The Human Eye and the Colourful World", hi: "मानव नेत्र तथा रंगबिरंगा संसार" } },
  { id: "fphy-electricity", subject: "physics", level: "10", name: { en: "Electricity", hi: "विद्युत" } },
  { id: "fphy-magnetic-effects", subject: "physics", level: "10", name: { en: "Magnetic Effects of Electric Current", hi: "विद्युत धारा के चुंबकीय प्रभाव" } },
];

const foundationChemistry: SyllabusTopic[] = [
  { id: "fchem-matter", subject: "chemistry", level: "9", name: { en: "Matter in Our Surroundings", hi: "हमारे आस-पास के पदार्थ" } },
  { id: "fchem-pure", subject: "chemistry", level: "9", name: { en: "Is Matter Around Us Pure?", hi: "क्या हमारे आस-पास के पदार्थ शुद्ध हैं?" } },
  { id: "fchem-atoms-molecules", subject: "chemistry", level: "9", name: { en: "Atoms and Molecules", hi: "परमाणु एवं अणु" } },
  { id: "fchem-atom-structure", subject: "chemistry", level: "9", name: { en: "Structure of the Atom", hi: "परमाणु की संरचना" } },
  { id: "fchem-reactions", subject: "chemistry", level: "10", name: { en: "Chemical Reactions and Equations", hi: "रासायनिक अभिक्रियाएँ एवं समीकरण" } },
  { id: "fchem-acids-bases", subject: "chemistry", level: "10", name: { en: "Acids, Bases and Salts", hi: "अम्ल, क्षारक एवं लवण" } },
  { id: "fchem-metals", subject: "chemistry", level: "10", name: { en: "Metals and Non-metals", hi: "धातु एवं अधातु" } },
  { id: "fchem-carbon", subject: "chemistry", level: "10", name: { en: "Carbon and its Compounds", hi: "कार्बन एवं उसके यौगिक" } },
];

const foundationBiology: SyllabusTopic[] = [
  { id: "fbio-cell", subject: "biology", level: "9", name: { en: "The Fundamental Unit of Life", hi: "जीवन की मौलिक इकाई" } },
  { id: "fbio-tissues", subject: "biology", level: "9", name: { en: "Tissues", hi: "ऊतक" } },
  { id: "fbio-food-resources", subject: "biology", level: "9", name: { en: "Improvement in Food Resources", hi: "खाद्य संसाधनों में सुधार" } },
  { id: "fbio-life-processes", subject: "biology", level: "10", name: { en: "Life Processes", hi: "जैव प्रक्रम" } },
  { id: "fbio-control", subject: "biology", level: "10", name: { en: "Control and Coordination", hi: "नियंत्रण एवं समन्वय" } },
  { id: "fbio-reproduce", subject: "biology", level: "10", name: { en: "How do Organisms Reproduce?", hi: "जीव जनन कैसे करते हैं?" } },
  { id: "fbio-heredity", subject: "biology", level: "10", name: { en: "Heredity", hi: "आनुवंशिकता" } },
  { id: "fbio-environment", subject: "biology", level: "10", name: { en: "Our Environment", hi: "हमारा पर्यावरण" } },
];

const foundationMaths: SyllabusTopic[] = [
  { id: "fmath-number-systems", subject: "maths", level: "9", name: { en: "Number Systems", hi: "संख्या पद्धति" } },
  { id: "fmath-real-numbers", subject: "maths", level: "10", name: { en: "Real Numbers", hi: "वास्तविक संख्याएँ" } },
  { id: "fmath-polynomials", subject: "maths", level: "both", name: { en: "Polynomials", hi: "बहुपद" } },
  { id: "fmath-linear-equations", subject: "maths", level: "both", name: { en: "Linear Equations in Two Variables", hi: "दो चरों वाले रैखिक समीकरण" } },
  { id: "fmath-quadratic", subject: "maths", level: "10", name: { en: "Quadratic Equations", hi: "द्विघात समीकरण" } },
  { id: "fmath-ap", subject: "maths", level: "10", name: { en: "Arithmetic Progressions", hi: "समांतर श्रेढ़ियाँ" } },
  { id: "fmath-coordinate", subject: "maths", level: "both", name: { en: "Coordinate Geometry", hi: "निर्देशांक ज्यामिति" } },
  { id: "fmath-euclid", subject: "maths", level: "9", name: { en: "Introduction to Euclid’s Geometry", hi: "यूक्लिड की ज्यामिति का परिचय" } },
  { id: "fmath-lines-angles", subject: "maths", level: "9", name: { en: "Lines and Angles", hi: "रेखाएँ और कोण" } },
  { id: "fmath-triangles", subject: "maths", level: "both", name: { en: "Triangles", hi: "त्रिभुज" } },
  { id: "fmath-quadrilaterals", subject: "maths", level: "9", name: { en: "Quadrilaterals", hi: "चतुर्भुज" } },
  { id: "fmath-circles", subject: "maths", level: "both", name: { en: "Circles", hi: "वृत्त" } },
  { id: "fmath-herons", subject: "maths", level: "9", name: { en: "Heron’s Formula", hi: "हीरोन का सूत्र" } },
  { id: "fmath-trigonometry", subject: "maths", level: "10", name: { en: "Introduction to Trigonometry and its Applications", hi: "त्रिकोणमिति का परिचय और उसके अनुप्रयोग" } },
  { id: "fmath-areas-circles", subject: "maths", level: "10", name: { en: "Areas Related to Circles", hi: "वृत्तों से संबंधित क्षेत्रफल" } },
  { id: "fmath-surface-volume", subject: "maths", level: "both", name: { en: "Surface Areas and Volumes", hi: "पृष्ठीय क्षेत्रफल और आयतन" } },
  { id: "fmath-statistics", subject: "maths", level: "both", name: { en: "Statistics", hi: "सांख्यिकी" } },
  { id: "fmath-probability", subject: "maths", level: "10", name: { en: "Probability", hi: "प्रायिकता" } },
];

const mentalAbility: SyllabusTopic[] = [
  { id: "mat-series", subject: "mat", level: "both", name: { en: "Number and Letter Series", hi: "संख्या और अक्षर श्रेणी" } },
  { id: "mat-analogy", subject: "mat", level: "both", name: { en: "Analogy", hi: "सादृश्यता" } },
  { id: "mat-classification", subject: "mat", level: "both", name: { en: "Classification (Odd One Out)", hi: "वर्गीकरण (विषम को चुनें)" } },
  { id: "mat-coding", subject: "mat", level: "both", name: { en: "Coding–Decoding", hi: "कूटलेखन–कूटवाचन" } },
  { id: "mat-blood-relations", subject: "mat", level: "both", name: { en: "Blood Relations", hi: "रक्त संबंध" } },
  { id: "mat-directions", subject: "mat", level: "both", name: { en: "Direction Sense", hi: "दिशा ज्ञान" } },
  { id: "mat-ranking", subject: "mat", level: "both", name: { en: "Ranking and Order", hi: "क्रम और स्थान निर्धारण" } },
  { id: "mat-calendar-clock", subject: "mat", level: "both", name: { en: "Calendar and Clock", hi: "कैलेंडर और घड़ी" } },
  { id: "mat-venn", subject: "mat", level: "both", name: { en: "Venn Diagrams", hi: "वेन आरेख" } },
  { id: "mat-mirror-images", subject: "mat", level: "both", name: { en: "Mirror and Water Images", hi: "दर्पण और जल प्रतिबिंब" } },
];

/** Subjects per exam, in the order they are shown. */
export const EXAM_SUBJECTS: Readonly<Record<ExamId, readonly SubjectId[]>> = {
  "jee-main": ["physics", "chemistry", "maths"],
  "jee-advanced": ["physics", "chemistry", "maths"],
  neet: ["physics", "chemistry", "biology"],
  boh: ["physics", "chemistry", "maths", "mat"],
  foundation: ["physics", "chemistry", "biology", "maths"],
};

const SYLLABUS: Readonly<Record<ExamId, readonly SyllabusTopic[]>> = {
  "jee-main": [...seniorPhysics, ...seniorChemistry, ...seniorMaths],
  "jee-advanced": [...seniorPhysics, ...seniorChemistry, ...seniorMaths],
  neet: [...seniorPhysics, ...seniorChemistry, ...neetBiology],
  boh: [...foundationPhysics, ...foundationChemistry, ...foundationMaths, ...mentalAbility],
  foundation: [...foundationPhysics, ...foundationChemistry, ...foundationBiology, ...foundationMaths],
};

/** Topics for one exam, in syllabus order. */
export function getSyllabusTopics(exam: ExamId): readonly SyllabusTopic[] {
  return SYLLABUS[exam];
}

/** Every topic of every exam, de-duplicated by id. */
export function getAllSyllabusTopics(): SyllabusTopic[] {
  const byId = new Map<string, SyllabusTopic>();
  for (const topics of Object.values(SYLLABUS)) for (const topic of topics) byId.set(topic.id, topic);
  return [...byId.values()];
}

/**
 * SUGGESTED length of a mock-test block per exam, in minutes (sizes mock-test days; capped by the
 * student's daily hours). Not an official exam duration — check the current information bulletin.
 */
export const MOCK_MINUTES: Readonly<Record<ExamId, number>> = {
  "jee-main": 180,
  "jee-advanced": 180,
  neet: 180,
  boh: 120,
  foundation: 90,
};
