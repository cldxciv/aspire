import type { Bilingual, MockSubject } from "./types";

/**
 * Chapter-level topics used by the sample questions (standard JEE Main / NEET-UG syllabus areas).
 * Ids are unique across subjects. Used for the topic-wise strength heatmap and the 30-day plan.
 */
export const MOCK_TOPICS: Record<string, { subject: MockSubject; label: Bilingual }> = {
  // Physics
  "phy-units": { subject: "physics", label: { en: "Units and dimensions", hi: "मात्रक और विमाएँ" } },
  "phy-kinematics": { subject: "physics", label: { en: "Kinematics", hi: "शुद्ध गतिकी (Kinematics)" } },
  "phy-laws-of-motion": { subject: "physics", label: { en: "Laws of motion", hi: "गति के नियम" } },
  "phy-work-energy": { subject: "physics", label: { en: "Work, energy and power", hi: "कार्य, ऊर्जा और शक्ति" } },
  "phy-rotation": { subject: "physics", label: { en: "Rotational motion", hi: "घूर्णी गति" } },
  "phy-gravitation": { subject: "physics", label: { en: "Gravitation", hi: "गुरुत्वाकर्षण" } },
  "phy-thermodynamics": { subject: "physics", label: { en: "Thermodynamics", hi: "ऊष्मागतिकी" } },
  "phy-kinetic-theory": { subject: "physics", label: { en: "Kinetic theory of gases", hi: "गैसों का अणुगति सिद्धांत" } },
  "phy-oscillations": { subject: "physics", label: { en: "Oscillations and waves", hi: "दोलन और तरंगें" } },
  "phy-electrostatics": { subject: "physics", label: { en: "Electrostatics", hi: "स्थिरवैद्युतिकी" } },
  "phy-current": { subject: "physics", label: { en: "Current electricity", hi: "विद्युत धारा" } },
  "phy-magnetism": { subject: "physics", label: { en: "Magnetic effects of current", hi: "धारा के चुंबकीय प्रभाव" } },
  "phy-optics": { subject: "physics", label: { en: "Ray optics", hi: "किरण प्रकाशिकी" } },
  "phy-modern": { subject: "physics", label: { en: "Dual nature and modern physics", hi: "द्वैत प्रकृति और आधुनिक भौतिकी" } },

  // Chemistry
  "chem-mole": { subject: "chemistry", label: { en: "Mole concept and stoichiometry", hi: "मोल संकल्पना और रससमीकरणमिति" } },
  "chem-atomic": { subject: "chemistry", label: { en: "Atomic structure", hi: "परमाणु संरचना" } },
  "chem-periodic": { subject: "chemistry", label: { en: "Periodic properties", hi: "आवर्त गुणधर्म" } },
  "chem-bonding": { subject: "chemistry", label: { en: "Chemical bonding", hi: "रासायनिक आबंधन" } },
  "chem-thermo": { subject: "chemistry", label: { en: "Chemical thermodynamics", hi: "रासायनिक ऊष्मागतिकी" } },
  "chem-equilibrium": { subject: "chemistry", label: { en: "Equilibrium", hi: "साम्यावस्था" } },
  "chem-redox": { subject: "chemistry", label: { en: "Redox and electrochemistry", hi: "अपचयोपचय और विद्युतरसायन" } },
  "chem-kinetics": { subject: "chemistry", label: { en: "Chemical kinetics", hi: "रासायनिक बलगतिकी" } },
  "chem-solutions": { subject: "chemistry", label: { en: "Solutions", hi: "विलयन" } },
  "chem-coordination": { subject: "chemistry", label: { en: "Coordination compounds", hi: "उपसहसंयोजन यौगिक" } },
  "chem-goc": { subject: "chemistry", label: { en: "Organic chemistry basics", hi: "कार्बनिक रसायन की मूल बातें" } },
  "chem-hydrocarbons": { subject: "chemistry", label: { en: "Hydrocarbons", hi: "हाइड्रोकार्बन" } },

  // Mathematics
  "math-quadratic": { subject: "maths", label: { en: "Quadratic equations", hi: "द्विघात समीकरण" } },
  "math-sequences": { subject: "maths", label: { en: "Sequences and series", hi: "अनुक्रम और श्रेणी" } },
  "math-trigonometry": { subject: "maths", label: { en: "Trigonometry", hi: "त्रिकोणमिति" } },
  "math-complex": { subject: "maths", label: { en: "Complex numbers", hi: "सम्मिश्र संख्याएँ" } },
  "math-pnc": { subject: "maths", label: { en: "Permutations and combinations", hi: "क्रमचय और संचय" } },
  "math-binomial": { subject: "maths", label: { en: "Binomial theorem", hi: "द्विपद प्रमेय" } },
  "math-matrices": { subject: "maths", label: { en: "Matrices and determinants", hi: "आव्यूह और सारणिक" } },
  "math-coordinate": { subject: "maths", label: { en: "Coordinate geometry", hi: "निर्देशांक ज्यामिति" } },
  "math-limits": { subject: "maths", label: { en: "Limits and continuity", hi: "सीमा और सांतत्य" } },
  "math-derivatives": { subject: "maths", label: { en: "Applications of derivatives", hi: "अवकलज के अनुप्रयोग" } },
  "math-integrals": { subject: "maths", label: { en: "Integrals", hi: "समाकलन" } },
  "math-differential-eq": { subject: "maths", label: { en: "Differential equations", hi: "अवकल समीकरण" } },
  "math-vectors": { subject: "maths", label: { en: "Vectors and 3D geometry", hi: "सदिश और त्रिविमीय ज्यामिति" } },
  "math-probability": { subject: "maths", label: { en: "Probability", hi: "प्रायिकता" } },

  // Botany
  "bot-cell": { subject: "botany", label: { en: "Cell: the unit of life", hi: "कोशिका: जीवन की इकाई" } },
  "bot-cell-division": { subject: "botany", label: { en: "Cell cycle and cell division", hi: "कोशिका चक्र और कोशिका विभाजन" } },
  "bot-photosynthesis": { subject: "botany", label: { en: "Photosynthesis", hi: "प्रकाश-संश्लेषण" } },
  "bot-respiration": { subject: "botany", label: { en: "Respiration in plants", hi: "पौधों में श्वसन" } },
  "bot-growth": { subject: "botany", label: { en: "Plant growth and development", hi: "पादप वृद्धि एवं परिवर्धन" } },
  "bot-genetics": { subject: "botany", label: { en: "Principles of inheritance", hi: "वंशागति के सिद्धांत" } },
  "bot-reproduction": { subject: "botany", label: { en: "Sexual reproduction in flowering plants", hi: "पुष्पी पादपों में लैंगिक जनन" } },
  "bot-ecology": { subject: "botany", label: { en: "Ecosystem", hi: "पारितंत्र" } },

  // Zoology
  "zoo-breathing": { subject: "zoology", label: { en: "Breathing and exchange of gases", hi: "श्वसन और गैसों का विनिमय" } },
  "zoo-circulation": { subject: "zoology", label: { en: "Body fluids and circulation", hi: "शरीर द्रव तथा परिसंचरण" } },
  "zoo-excretion": { subject: "zoology", label: { en: "Excretory products", hi: "उत्सर्जी उत्पाद" } },
  "zoo-locomotion": { subject: "zoology", label: { en: "Locomotion and movement", hi: "गमन एवं संचलन" } },
  "zoo-neural": { subject: "zoology", label: { en: "Neural control and coordination", hi: "तंत्रिकीय नियंत्रण एवं समन्वय" } },
  "zoo-endocrine": { subject: "zoology", label: { en: "Chemical coordination", hi: "रासायनिक समन्वय" } },
  "zoo-reproduction": { subject: "zoology", label: { en: "Human reproduction", hi: "मानव जनन" } },
  "zoo-molecular": { subject: "zoology", label: { en: "Molecular basis of inheritance", hi: "वंशागति का आणविक आधार" } },
  "zoo-evolution": { subject: "zoology", label: { en: "Evolution", hi: "विकास" } },
  "zoo-health": { subject: "zoology", label: { en: "Human health and disease", hi: "मानव स्वास्थ्य तथा रोग" } },
};

export function topicLabel(topic: string, locale: "en" | "hi"): string {
  return MOCK_TOPICS[topic]?.label[locale] ?? topic;
}

export const SUBJECT_LABELS: Record<MockSubject, Bilingual> = {
  physics: { en: "Physics", hi: "भौतिकी" },
  chemistry: { en: "Chemistry", hi: "रसायन विज्ञान" },
  maths: { en: "Mathematics", hi: "गणित" },
  botany: { en: "Botany", hi: "वनस्पति विज्ञान" },
  zoology: { en: "Zoology", hi: "प्राणि विज्ञान" },
  biology: { en: "Biology", hi: "जीव विज्ञान" },
};
