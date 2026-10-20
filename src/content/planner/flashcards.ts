import type { ContentStatus } from "@/lib/types";
import type { ExamId, LocalizedText, SubjectId } from "@/lib/planner/types";

/**
 * Formula / key-fact flashcards for the study planner (A4-PLANNER, D-032).
 *
 * SAMPLE — TO BE REVIEWED. Standard textbook-level formulas and facts (NCERT level), written by the
 * build team, not by Aspire's teachers. CONTENT-VERIFY must check every card (statement, symbols,
 * units, sign conventions, Hindi wording) before `status` becomes "published". Until then the cards
 * are shown only when `showPlaceholderContent()` is on, with a "Sample" label.
 *
 * Text uses Unicode symbols (², √, π, θ, Δ, λ, ×) so it renders without a maths library. Hindi is a
 * machine draft (needs native review); symbols and formulas stay as written.
 */
export const FLASHCARDS_STATUS: ContentStatus = "placeholder";

/** "senior" = JEE / NEET (classes 11–12); "foundation" = classes 9–10 and BOH. */
export type CardLevel = "senior" | "foundation";

export interface Flashcard {
  id: string;
  subject: SubjectId;
  /** Syllabus topic ids (src/content/planner/syllabus.ts) the card belongs to. */
  topics: string[];
  levels: CardLevel[];
  front: LocalizedText;
  back: LocalizedText;
}

const S: CardLevel[] = ["senior"];
const F: CardLevel[] = ["foundation"];
const SF: CardLevel[] = ["senior", "foundation"];

export const FLASHCARDS: readonly Flashcard[] = [
  // ---------------------------------------------------------------- Physics
  {
    id: "phy-equations-of-motion",
    subject: "physics",
    topics: ["phy-kinematics", "fphy-motion"],
    levels: SF,
    front: { en: "Equations of motion (constant acceleration)", hi: "गति के समीकरण (एकसमान त्वरण)" },
    back: { en: "v = u + at\ns = ut + ½at²\nv² = u² + 2as", hi: "v = u + at\ns = ut + ½at²\nv² = u² + 2as" },
  },
  {
    id: "phy-newton-second-law",
    subject: "physics",
    topics: ["phy-laws-of-motion", "fphy-force"],
    levels: SF,
    front: { en: "Newton’s second law of motion", hi: "न्यूटन का गति का दूसरा नियम" },
    back: {
      en: "F = ma (constant mass)\nMore generally, force = rate of change of momentum: F = dp/dt",
      hi: "F = ma (नियत द्रव्यमान)\nव्यापक रूप में, बल = संवेग में परिवर्तन की दर: F = dp/dt",
    },
  },
  {
    id: "phy-projectile",
    subject: "physics",
    topics: ["phy-kinematics"],
    levels: S,
    front: {
      en: "Projectile launched with speed u at angle θ on level ground: range, maximum height, time of flight",
      hi: "समतल भूमि पर वेग u से कोण θ पर फेंका गया प्रक्षेप्य: परास, अधिकतम ऊँचाई, उड़ान का समय",
    },
    back: {
      en: "R = u² sin 2θ / g\nH = u² sin²θ / 2g\nT = 2u sin θ / g",
      hi: "R = u² sin 2θ / g\nH = u² sin²θ / 2g\nT = 2u sin θ / g",
    },
  },
  {
    id: "phy-work-energy-theorem",
    subject: "physics",
    topics: ["phy-work-energy", "fphy-work-energy"],
    levels: SF,
    front: { en: "Work–energy theorem", hi: "कार्य–ऊर्जा प्रमेय" },
    back: {
      en: "Net work done on a body = change in its kinetic energy\nW = ΔK, where K = ½mv²",
      hi: "किसी पिंड पर किया गया कुल कार्य = उसकी गतिज ऊर्जा में परिवर्तन\nW = ΔK, जहाँ K = ½mv²",
    },
  },
  {
    id: "phy-universal-gravitation",
    subject: "physics",
    topics: ["phy-gravitation", "fphy-gravitation"],
    levels: SF,
    front: { en: "Newton’s law of universal gravitation", hi: "न्यूटन का सार्वत्रिक गुरुत्वाकर्षण नियम" },
    back: {
      en: "F = G m₁m₂ / r²\nG ≈ 6.67 × 10⁻¹¹ N m² kg⁻²",
      hi: "F = G m₁m₂ / r²\nG ≈ 6.67 × 10⁻¹¹ N m² kg⁻²",
    },
  },
  {
    id: "phy-escape-speed",
    subject: "physics",
    topics: ["phy-gravitation"],
    levels: S,
    front: { en: "Escape speed from the Earth’s surface", hi: "पृथ्वी की सतह से पलायन वेग" },
    back: { en: "vₑ = √(2GM/R) = √(2gR) ≈ 11.2 km/s", hi: "vₑ = √(2GM/R) = √(2gR) ≈ 11.2 km/s" },
  },
  {
    id: "phy-moment-of-inertia",
    subject: "physics",
    topics: ["phy-rotation"],
    levels: S,
    front: {
      en: "Moment of inertia (mass M, radius R): ring and disc about the axis through the centre ⊥ to the plane; solid sphere about a diameter",
      hi: "जड़त्व आघूर्ण (द्रव्यमान M, त्रिज्या R): केंद्र से तल के लंबवत अक्ष के परितः वलय और डिस्क; व्यास के परितः ठोस गोला",
    },
    back: { en: "Ring: MR²\nDisc: ½MR²\nSolid sphere: ⅖MR²", hi: "वलय: MR²\nडिस्क: ½MR²\nठोस गोला: ⅖MR²" },
  },
  {
    id: "phy-shm-period",
    subject: "physics",
    topics: ["phy-oscillations-waves"],
    levels: S,
    front: { en: "Time period: spring–mass system and simple pendulum (small angles)", hi: "आवर्तकाल: स्प्रिंग–द्रव्यमान निकाय और सरल लोलक (छोटे कोण)" },
    back: { en: "Spring–mass: T = 2π√(m/k)\nPendulum: T = 2π√(l/g)", hi: "स्प्रिंग–द्रव्यमान: T = 2π√(m/k)\nलोलक: T = 2π√(l/g)" },
  },
  {
    id: "phy-ideal-gas",
    subject: "physics",
    topics: ["phy-kinetic-theory"],
    levels: S,
    front: { en: "Ideal gas equation", hi: "आदर्श गैस समीकरण" },
    back: { en: "PV = nRT\nR ≈ 8.314 J mol⁻¹ K⁻¹", hi: "PV = nRT\nR ≈ 8.314 J mol⁻¹ K⁻¹" },
  },
  {
    id: "phy-first-law-thermo",
    subject: "physics",
    topics: ["phy-thermodynamics"],
    levels: S,
    front: { en: "First law of thermodynamics", hi: "ऊष्मागतिकी का प्रथम नियम" },
    back: {
      en: "ΔU = Q − W\nQ = heat supplied to the system, W = work done by the system",
      hi: "ΔU = Q − W\nQ = निकाय को दी गई ऊष्मा, W = निकाय द्वारा किया गया कार्य",
    },
  },
  {
    id: "phy-coulomb-law",
    subject: "physics",
    topics: ["phy-electrostatics"],
    levels: S,
    front: { en: "Coulomb’s law (point charges in vacuum)", hi: "कूलॉम का नियम (निर्वात में बिंदु आवेश)" },
    back: {
      en: "F = (1/4πε₀) · q₁q₂ / r²\n1/4πε₀ ≈ 9 × 10⁹ N m² C⁻²",
      hi: "F = (1/4πε₀) · q₁q₂ / r²\n1/4πε₀ ≈ 9 × 10⁹ N m² C⁻²",
    },
  },
  {
    id: "phy-ohm-power",
    subject: "physics",
    topics: ["phy-current", "fphy-electricity"],
    levels: SF,
    front: { en: "Ohm’s law and electric power", hi: "ओम का नियम और विद्युत शक्ति" },
    back: { en: "V = IR (ohmic conductor at constant temperature)\nP = VI = I²R = V²/R", hi: "V = IR (नियत ताप पर ओमीय चालक)\nP = VI = I²R = V²/R" },
  },
  {
    id: "phy-resistors-combination",
    subject: "physics",
    topics: ["phy-current", "fphy-electricity"],
    levels: SF,
    front: { en: "Equivalent resistance in series and in parallel", hi: "श्रेणीक्रम और पार्श्वक्रम में तुल्य प्रतिरोध" },
    back: {
      en: "Series: R = R₁ + R₂ + …\nParallel: 1/R = 1/R₁ + 1/R₂ + …",
      hi: "श्रेणीक्रम: R = R₁ + R₂ + …\nपार्श्वक्रम: 1/R = 1/R₁ + 1/R₂ + …",
    },
  },
  {
    id: "phy-faraday-law",
    subject: "physics",
    topics: ["phy-emi-ac"],
    levels: S,
    front: { en: "Faraday’s law of electromagnetic induction", hi: "फैराडे का विद्युतचुंबकीय प्रेरण का नियम" },
    back: {
      en: "Induced emf ε = −dΦ/dt\nThe minus sign is Lenz’s law: the induced current opposes the change in flux.",
      hi: "प्रेरित विद्युत वाहक बल ε = −dΦ/dt\nऋण चिह्न लेंज़ का नियम है: प्रेरित धारा फ्लक्स में परिवर्तन का विरोध करती है।",
    },
  },
  {
    id: "phy-lens-formula",
    subject: "physics",
    topics: ["phy-optics", "fphy-light"],
    levels: SF,
    front: { en: "Lens formula and magnification (Cartesian sign convention)", hi: "लेंस सूत्र और आवर्धन (कार्तीय चिह्न परिपाटी)" },
    back: { en: "1/v − 1/u = 1/f\nm = v/u", hi: "1/v − 1/u = 1/f\nm = v/u" },
  },
  {
    id: "phy-mirror-formula",
    subject: "physics",
    topics: ["phy-optics", "fphy-light"],
    levels: SF,
    front: { en: "Mirror formula and magnification (Cartesian sign convention)", hi: "दर्पण सूत्र और आवर्धन (कार्तीय चिह्न परिपाटी)" },
    back: { en: "1/v + 1/u = 1/f\nm = −v/u", hi: "1/v + 1/u = 1/f\nm = −v/u" },
  },
  {
    id: "phy-snell-law",
    subject: "physics",
    topics: ["phy-optics", "fphy-light"],
    levels: SF,
    front: { en: "Snell’s law of refraction and refractive index", hi: "अपवर्तन का स्नेल नियम और अपवर्तनांक" },
    back: { en: "n₁ sin i = n₂ sin r\nn = c / v", hi: "n₁ sin i = n₂ sin r\nn = c / v" },
  },
  {
    id: "phy-photoelectric",
    subject: "physics",
    topics: ["phy-dual-nature"],
    levels: S,
    front: { en: "Einstein’s photoelectric equation", hi: "आइंस्टाइन का प्रकाश-विद्युत समीकरण" },
    back: { en: "K_max = hν − φ₀\nφ₀ = work function of the metal", hi: "K_max = hν − φ₀\nφ₀ = धातु का कार्य फलन" },
  },
  {
    id: "phy-de-broglie",
    subject: "physics",
    topics: ["phy-dual-nature"],
    levels: S,
    front: { en: "de Broglie wavelength of a particle", hi: "किसी कण की दे ब्रॉग्ली तरंगदैर्ध्य" },
    back: { en: "λ = h/p = h/(mv)", hi: "λ = h/p = h/(mv)" },
  },
  {
    id: "phy-radioactive-decay",
    subject: "physics",
    topics: ["phy-atoms-nuclei"],
    levels: S,
    front: { en: "Radioactive decay law and half-life", hi: "रेडियोऐक्टिव क्षय नियम और अर्ध-आयु" },
    back: { en: "N = N₀ e^(−λt)\nT½ = ln 2 / λ ≈ 0.693 / λ", hi: "N = N₀ e^(−λt)\nT½ = ln 2 / λ ≈ 0.693 / λ" },
  },
  {
    id: "phy-wave-speed",
    subject: "physics",
    topics: ["phy-oscillations-waves", "fphy-sound"],
    levels: SF,
    front: { en: "Speed of a wave in terms of frequency and wavelength", hi: "आवृत्ति और तरंगदैर्ध्य के पदों में तरंग की चाल" },
    back: { en: "v = fλ (often written v = νλ)", hi: "v = fλ (अक्सर v = νλ लिखा जाता है)" },
  },

  // ---------------------------------------------------------------- Chemistry
  {
    id: "chem-mole",
    subject: "chemistry",
    topics: ["chem-basic-concepts", "fchem-atoms-molecules"],
    levels: SF,
    front: { en: "Number of moles and number of particles", hi: "मोलों की संख्या और कणों की संख्या" },
    back: {
      en: "n = mass / molar mass\nNumber of particles = n × N_A, N_A = 6.022 × 10²³ mol⁻¹",
      hi: "n = द्रव्यमान / मोलर द्रव्यमान\nकणों की संख्या = n × N_A, N_A = 6.022 × 10²³ mol⁻¹",
    },
  },
  {
    id: "chem-molarity-molality",
    subject: "chemistry",
    topics: ["chem-solutions", "chem-basic-concepts"],
    levels: S,
    front: { en: "Molarity and molality", hi: "मोलरता और मोललता" },
    back: {
      en: "Molarity M = moles of solute / volume of solution in L\nMolality m = moles of solute / mass of solvent in kg",
      hi: "मोलरता M = विलेय के मोल / विलयन का आयतन (L)\nमोललता m = विलेय के मोल / विलायक का द्रव्यमान (kg)",
    },
  },
  {
    id: "chem-gibbs",
    subject: "chemistry",
    topics: ["chem-thermodynamics"],
    levels: S,
    front: { en: "Gibbs energy change and spontaneity", hi: "गिब्स ऊर्जा परिवर्तन और स्वतःप्रवर्तिता" },
    back: {
      en: "ΔG = ΔH − TΔS\nAt constant T and P, a process is spontaneous when ΔG < 0.",
      hi: "ΔG = ΔH − TΔS\nस्थिर T और P पर, ΔG < 0 होने पर प्रक्रम स्वतःप्रवर्तित होता है।",
    },
  },
  {
    id: "chem-gibbs-equilibrium",
    subject: "chemistry",
    topics: ["chem-equilibrium", "chem-thermodynamics"],
    levels: S,
    front: { en: "Standard Gibbs energy and the equilibrium constant", hi: "मानक गिब्स ऊर्जा और साम्य स्थिरांक" },
    back: { en: "ΔG° = −RT ln K = −2.303 RT log K", hi: "ΔG° = −RT ln K = −2.303 RT log K" },
  },
  {
    id: "chem-gibbs-cell",
    subject: "chemistry",
    topics: ["chem-redox-electrochem"],
    levels: S,
    front: { en: "Gibbs energy and cell potential", hi: "गिब्स ऊर्जा और सेल विभव" },
    back: { en: "ΔG = −nFE_cell\nF ≈ 96 500 C mol⁻¹", hi: "ΔG = −nFE_cell\nF ≈ 96 500 C mol⁻¹" },
  },
  {
    id: "chem-nernst",
    subject: "chemistry",
    topics: ["chem-redox-electrochem"],
    levels: S,
    front: { en: "Nernst equation at 298 K", hi: "298 K पर नर्न्स्ट समीकरण" },
    back: { en: "E = E° − (0.0591 / n) log Q", hi: "E = E° − (0.0591 / n) log Q" },
  },
  {
    id: "chem-ph",
    subject: "chemistry",
    topics: ["chem-equilibrium"],
    levels: S,
    front: { en: "pH, and the relation between pH and pOH at 25 °C", hi: "pH, और 25 °C पर pH और pOH का संबंध" },
    back: { en: "pH = −log[H⁺]\npH + pOH = 14 (K_w = 1 × 10⁻¹⁴)", hi: "pH = −log[H⁺]\npH + pOH = 14 (K_w = 1 × 10⁻¹⁴)" },
  },
  {
    id: "chem-first-order",
    subject: "chemistry",
    topics: ["chem-kinetics"],
    levels: S,
    front: { en: "First-order reaction: rate constant and half-life", hi: "प्रथम कोटि की अभिक्रिया: वेग स्थिरांक और अर्ध-आयु" },
    back: {
      en: "k = (2.303 / t) log([A]₀ / [A])\nt½ = 0.693 / k (independent of initial concentration)",
      hi: "k = (2.303 / t) log([A]₀ / [A])\nt½ = 0.693 / k (प्रारंभिक सांद्रता पर निर्भर नहीं)",
    },
  },
  {
    id: "chem-arrhenius",
    subject: "chemistry",
    topics: ["chem-kinetics"],
    levels: S,
    front: { en: "Arrhenius equation", hi: "आरेनियस समीकरण" },
    back: { en: "k = A e^(−Ea/RT)", hi: "k = A e^(−Ea/RT)" },
  },
  {
    id: "chem-bohr-energy",
    subject: "chemistry",
    topics: ["chem-atomic-structure"],
    levels: S,
    front: { en: "Energy of the nth orbit (Bohr model, hydrogen-like species)", hi: "n वीं कक्षा की ऊर्जा (बोर मॉडल, हाइड्रोजन-सम स्पीशीज़)" },
    back: { en: "Eₙ = −13.6 Z² / n² eV", hi: "Eₙ = −13.6 Z² / n² eV" },
  },
  {
    id: "chem-uncertainty",
    subject: "chemistry",
    topics: ["chem-atomic-structure"],
    levels: S,
    front: { en: "Heisenberg’s uncertainty principle", hi: "हाइज़ेनबर्ग का अनिश्चितता सिद्धांत" },
    back: { en: "Δx · Δp ≥ h / 4π", hi: "Δx · Δp ≥ h / 4π" },
  },
  {
    id: "chem-raoult",
    subject: "chemistry",
    topics: ["chem-solutions"],
    levels: S,
    front: { en: "Raoult’s law (ideal solution)", hi: "राउल्ट का नियम (आदर्श विलयन)" },
    back: {
      en: "p_A = x_A · p°_A\nPartial vapour pressure = mole fraction × vapour pressure of the pure component",
      hi: "p_A = x_A · p°_A\nआंशिक वाष्प दाब = मोल अंश × शुद्ध घटक का वाष्प दाब",
    },
  },
  {
    id: "chem-colligative",
    subject: "chemistry",
    topics: ["chem-solutions"],
    levels: S,
    front: { en: "Colligative properties with the van ’t Hoff factor i", hi: "वांट हॉफ गुणक i सहित अणुसंख्य गुणधर्म" },
    back: {
      en: "ΔT_b = i K_b m\nΔT_f = i K_f m\nOsmotic pressure π = i C R T\nm = molality, C = molar concentration (dilute solutions)",
      hi: "ΔT_b = i K_b m\nΔT_f = i K_f m\nपरासरण दाब π = i C R T\nm = मोललता, C = मोलर सांद्रता (तनु विलयन)",
    },
  },
  {
    id: "chem-hybridisation",
    subject: "chemistry",
    topics: ["chem-bonding"],
    levels: S,
    front: { en: "Hybridisation → shape and bond angle", hi: "संकरण → आकृति और आबंध कोण" },
    back: {
      en: "sp → linear, 180°\nsp² → trigonal planar, 120°\nsp³ → tetrahedral, 109.5° (109°28′)",
      hi: "sp → रैखिक, 180°\nsp² → त्रिकोणीय समतलीय, 120°\nsp³ → चतुष्फलकीय, 109.5° (109°28′)",
    },
  },
  {
    id: "chem-kp-kc",
    subject: "chemistry",
    topics: ["chem-equilibrium"],
    levels: S,
    front: { en: "Relation between Kp and Kc", hi: "Kp और Kc का संबंध" },
    back: {
      en: "Kp = Kc (RT)^Δn\nΔn = moles of gaseous products − moles of gaseous reactants",
      hi: "Kp = Kc (RT)^Δn\nΔn = गैसीय उत्पादों के मोल − गैसीय अभिकारकों के मोल",
    },
  },
  {
    id: "chem-markovnikov",
    subject: "chemistry",
    topics: ["chem-hydrocarbons"],
    levels: S,
    front: { en: "Markovnikov’s rule", hi: "मार्कोवनिकॉफ़ नियम" },
    back: {
      en: "When HX adds to an unsymmetrical alkene, the negative part (X) goes to the carbon atom that has fewer hydrogen atoms.\nWith HBr in the presence of a peroxide the addition is anti-Markovnikov.",
      hi: "जब HX किसी असममित ऐल्कीन से जुड़ता है, तो ऋणात्मक भाग (X) उस कार्बन परमाणु पर जाता है जिस पर कम हाइड्रोजन परमाणु होते हैं।\nपरॉक्साइड की उपस्थिति में HBr का योग प्रति-मार्कोवनिकॉफ़ होता है।",
    },
  },
  {
    id: "chem-atomic-mass-number",
    subject: "chemistry",
    topics: ["fchem-atom-structure", "chem-atomic-structure"],
    levels: SF,
    front: { en: "Atomic number (Z) and mass number (A)", hi: "परमाणु संख्या (Z) और द्रव्यमान संख्या (A)" },
    back: {
      en: "Z = number of protons\nA = number of protons + number of neutrons",
      hi: "Z = प्रोटॉनों की संख्या\nA = प्रोटॉनों की संख्या + न्यूट्रॉनों की संख्या",
    },
  },
  {
    id: "chem-neutralisation",
    subject: "chemistry",
    topics: ["fchem-acids-bases"],
    levels: F,
    front: { en: "Neutralisation reaction", hi: "उदासीनीकरण अभिक्रिया" },
    back: {
      en: "Acid + base → salt + water\ne.g. HCl + NaOH → NaCl + H₂O",
      hi: "अम्ल + क्षारक → लवण + जल\nउदाहरण: HCl + NaOH → NaCl + H₂O",
    },
  },
  {
    id: "chem-displacement",
    subject: "chemistry",
    topics: ["fchem-reactions", "fchem-metals"],
    levels: F,
    front: { en: "Displacement reaction of metals", hi: "धातुओं की विस्थापन अभिक्रिया" },
    back: {
      en: "A more reactive metal displaces a less reactive metal from its salt solution.\ne.g. Fe + CuSO₄ → FeSO₄ + Cu",
      hi: "अधिक अभिक्रियाशील धातु कम अभिक्रियाशील धातु को उसके लवण के विलयन से विस्थापित करती है।\nउदाहरण: Fe + CuSO₄ → FeSO₄ + Cu",
    },
  },

  // ---------------------------------------------------------------- Maths
  {
    id: "math-quadratic-formula",
    subject: "maths",
    topics: ["math-complex-quadratic", "fmath-quadratic"],
    levels: SF,
    front: { en: "Roots of ax² + bx + c = 0 (a ≠ 0), their sum and product", hi: "ax² + bx + c = 0 (a ≠ 0) के मूल, उनका योग और गुणनफल" },
    back: {
      en: "x = (−b ± √(b² − 4ac)) / 2a\nSum = −b/a, product = c/a",
      hi: "x = (−b ± √(b² − 4ac)) / 2a\nयोग = −b/a, गुणनफल = c/a",
    },
  },
  {
    id: "math-discriminant",
    subject: "maths",
    topics: ["math-complex-quadratic", "fmath-quadratic"],
    levels: SF,
    front: { en: "Nature of roots from the discriminant D = b² − 4ac", hi: "विविक्तकर D = b² − 4ac से मूलों की प्रकृति" },
    back: {
      en: "For real a, b, c (a ≠ 0):\nD > 0: two distinct real roots\nD = 0: two equal real roots\nD < 0: no real roots",
      hi: "वास्तविक a, b, c (a ≠ 0) के लिए:\nD > 0: दो भिन्न वास्तविक मूल\nD = 0: दो बराबर वास्तविक मूल\nD < 0: कोई वास्तविक मूल नहीं",
    },
  },
  {
    id: "math-ap",
    subject: "maths",
    topics: ["math-sequences", "fmath-ap"],
    levels: SF,
    front: { en: "Arithmetic progression: nth term and sum of n terms", hi: "समांतर श्रेढ़ी: n वाँ पद और n पदों का योग" },
    back: { en: "aₙ = a + (n − 1)d\nSₙ = (n/2) [2a + (n − 1)d]", hi: "aₙ = a + (n − 1)d\nSₙ = (n/2) [2a + (n − 1)d]" },
  },
  {
    id: "math-gp",
    subject: "maths",
    topics: ["math-sequences"],
    levels: S,
    front: { en: "Geometric progression: nth term, sum of n terms, sum to infinity", hi: "गुणोत्तर श्रेढ़ी: n वाँ पद, n पदों का योग, अनंत पदों का योग" },
    back: {
      en: "aₙ = arⁿ⁻¹\nSₙ = a(rⁿ − 1)/(r − 1), r ≠ 1\nS∞ = a/(1 − r), |r| < 1",
      hi: "aₙ = arⁿ⁻¹\nSₙ = a(rⁿ − 1)/(r − 1), r ≠ 1\nS∞ = a/(1 − r), |r| < 1",
    },
  },
  {
    id: "math-pythagorean-identities",
    subject: "maths",
    topics: ["math-trigonometry", "fmath-trigonometry"],
    levels: SF,
    front: { en: "Pythagorean trigonometric identities", hi: "पाइथागोरस त्रिकोणमितीय सर्वसमिकाएँ" },
    back: {
      en: "sin²θ + cos²θ = 1\n1 + tan²θ = sec²θ\n1 + cot²θ = cosec²θ",
      hi: "sin²θ + cos²θ = 1\n1 + tan²θ = sec²θ\n1 + cot²θ = cosec²θ",
    },
  },
  {
    id: "math-compound-angles",
    subject: "maths",
    topics: ["math-trigonometry"],
    levels: S,
    front: { en: "sin(A + B) and cos(A + B)", hi: "sin(A + B) और cos(A + B)" },
    back: {
      en: "sin(A + B) = sin A cos B + cos A sin B\ncos(A + B) = cos A cos B − sin A sin B",
      hi: "sin(A + B) = sin A cos B + cos A sin B\ncos(A + B) = cos A cos B − sin A sin B",
    },
  },
  {
    id: "math-double-angle",
    subject: "maths",
    topics: ["math-trigonometry"],
    levels: S,
    front: { en: "Double-angle formulas", hi: "द्विगुण कोण सूत्र" },
    back: {
      en: "sin 2A = 2 sin A cos A\ncos 2A = cos²A − sin²A = 1 − 2 sin²A = 2 cos²A − 1",
      hi: "sin 2A = 2 sin A cos A\ncos 2A = cos²A − sin²A = 1 − 2 sin²A = 2 cos²A − 1",
    },
  },
  {
    id: "math-permutations-combinations",
    subject: "maths",
    topics: ["math-pnc"],
    levels: S,
    front: { en: "ⁿPᵣ and ⁿCᵣ", hi: "ⁿPᵣ और ⁿCᵣ" },
    back: { en: "ⁿPᵣ = n! / (n − r)!\nⁿCᵣ = n! / (r! (n − r)!)\n(0 ≤ r ≤ n)", hi: "ⁿPᵣ = n! / (n − r)!\nⁿCᵣ = n! / (r! (n − r)!)\n(0 ≤ r ≤ n)" },
  },
  {
    id: "math-binomial-term",
    subject: "maths",
    topics: ["math-binomial"],
    levels: S,
    front: { en: "General term of (a + b)ⁿ", hi: "(a + b)ⁿ का व्यापक पद" },
    back: { en: "Tᵣ₊₁ = ⁿCᵣ aⁿ⁻ʳ bʳ", hi: "Tᵣ₊₁ = ⁿCᵣ aⁿ⁻ʳ bʳ" },
  },
  {
    id: "math-standard-limits",
    subject: "maths",
    topics: ["math-limits"],
    levels: S,
    front: { en: "Two standard limits as x → 0", hi: "x → 0 पर दो मानक सीमाएँ" },
    back: { en: "lim (sin x)/x = 1\nlim (eˣ − 1)/x = 1", hi: "lim (sin x)/x = 1\nlim (eˣ − 1)/x = 1" },
  },
  {
    id: "math-basic-derivatives",
    subject: "maths",
    topics: ["math-limits"],
    levels: S,
    front: { en: "Derivatives of xⁿ, sin x, cos x, eˣ and ln x", hi: "xⁿ, sin x, cos x, eˣ और ln x के अवकलज" },
    back: {
      en: "(xⁿ)′ = nxⁿ⁻¹\n(sin x)′ = cos x\n(cos x)′ = −sin x\n(eˣ)′ = eˣ\n(ln x)′ = 1/x, x > 0",
      hi: "(xⁿ)′ = nxⁿ⁻¹\n(sin x)′ = cos x\n(cos x)′ = −sin x\n(eˣ)′ = eˣ\n(ln x)′ = 1/x, x > 0",
    },
  },
  {
    id: "math-product-chain-rule",
    subject: "maths",
    topics: ["math-limits"],
    levels: S,
    front: { en: "Product rule and chain rule", hi: "गुणनफल नियम और शृंखला नियम" },
    back: { en: "(uv)′ = u′v + uv′\nd/dx f(g(x)) = f′(g(x)) · g′(x)", hi: "(uv)′ = u′v + uv′\nd/dx f(g(x)) = f′(g(x)) · g′(x)" },
  },
  {
    id: "math-basic-integrals",
    subject: "maths",
    topics: ["math-integrals"],
    levels: S,
    front: { en: "∫xⁿ dx, ∫(1/x) dx and ∫eˣ dx", hi: "∫xⁿ dx, ∫(1/x) dx और ∫eˣ dx" },
    back: {
      en: "∫xⁿ dx = xⁿ⁺¹/(n + 1) + C, n ≠ −1\n∫(1/x) dx = ln|x| + C\n∫eˣ dx = eˣ + C",
      hi: "∫xⁿ dx = xⁿ⁺¹/(n + 1) + C, n ≠ −1\n∫(1/x) dx = ln|x| + C\n∫eˣ dx = eˣ + C",
    },
  },
  {
    id: "math-integration-by-parts",
    subject: "maths",
    topics: ["math-integrals"],
    levels: S,
    front: { en: "Integration by parts", hi: "खंडशः समाकलन" },
    back: { en: "∫u dv = uv − ∫v du", hi: "∫u dv = uv − ∫v du" },
  },
  {
    id: "math-distance-section",
    subject: "maths",
    topics: ["math-coordinate", "fmath-coordinate"],
    levels: SF,
    front: { en: "Distance formula and section formula (internal division m : n)", hi: "दूरी सूत्र और विभाजन सूत्र (अंतः विभाजन m : n)" },
    back: {
      en: "d = √((x₂ − x₁)² + (y₂ − y₁)²)\nP = ((mx₂ + nx₁)/(m + n), (my₂ + ny₁)/(m + n))",
      hi: "d = √((x₂ − x₁)² + (y₂ − y₁)²)\nP = ((mx₂ + nx₁)/(m + n), (my₂ + ny₁)/(m + n))",
    },
  },
  {
    id: "math-circle-equation",
    subject: "maths",
    topics: ["math-coordinate"],
    levels: S,
    front: { en: "Equation of a circle with centre (h, k) and radius r", hi: "केंद्र (h, k) और त्रिज्या r वाले वृत्त का समीकरण" },
    back: { en: "(x − h)² + (y − k)² = r²", hi: "(x − h)² + (y − k)² = r²" },
  },
  {
    id: "math-dot-cross",
    subject: "maths",
    topics: ["math-vectors"],
    levels: S,
    front: { en: "Dot product and magnitude of the cross product", hi: "अदिश गुणनफल और सदिश गुणनफल का परिमाण" },
    back: { en: "a · b = |a||b| cos θ\n|a × b| = |a||b| sin θ", hi: "a · b = |a||b| cos θ\n|a × b| = |a||b| sin θ" },
  },
  {
    id: "math-matrix-inverse",
    subject: "maths",
    topics: ["math-matrices"],
    levels: S,
    front: { en: "Inverse of a square matrix A", hi: "वर्ग आव्यूह A का व्युत्क्रम" },
    back: {
      en: "A⁻¹ = adj(A) / |A|, which exists only when |A| ≠ 0\nFor [[a, b], [c, d]]: |A| = ad − bc",
      hi: "A⁻¹ = adj(A) / |A|, जो केवल |A| ≠ 0 होने पर विद्यमान है\n[[a, b], [c, d]] के लिए: |A| = ad − bc",
    },
  },
  {
    id: "math-probability-rules",
    subject: "maths",
    topics: ["math-stats-probability"],
    levels: S,
    front: { en: "Addition rule and conditional probability", hi: "योग नियम और सप्रतिबंध प्रायिकता" },
    back: {
      en: "P(A ∪ B) = P(A) + P(B) − P(A ∩ B)\nP(A | B) = P(A ∩ B) / P(B), P(B) ≠ 0",
      hi: "P(A ∪ B) = P(A) + P(B) − P(A ∩ B)\nP(A | B) = P(A ∩ B) / P(B), P(B) ≠ 0",
    },
  },
  {
    id: "math-circle-area",
    subject: "maths",
    topics: ["fmath-areas-circles", "fmath-circles"],
    levels: F,
    front: { en: "Circumference and area of a circle of radius r", hi: "त्रिज्या r वाले वृत्त की परिधि और क्षेत्रफल" },
    back: { en: "C = 2πr\nA = πr²", hi: "C = 2πr\nA = πr²" },
  },
  {
    id: "math-herons-formula",
    subject: "maths",
    topics: ["fmath-herons"],
    levels: F,
    front: { en: "Heron’s formula for the area of a triangle with sides a, b, c", hi: "भुजाओं a, b, c वाले त्रिभुज के क्षेत्रफल का हीरोन सूत्र" },
    back: {
      en: "Area = √(s(s − a)(s − b)(s − c)), where s = (a + b + c)/2",
      hi: "क्षेत्रफल = √(s(s − a)(s − b)(s − c)), जहाँ s = (a + b + c)/2",
    },
  },
  {
    id: "math-volumes",
    subject: "maths",
    topics: ["fmath-surface-volume"],
    levels: F,
    front: { en: "Volume of a cylinder, a cone and a sphere", hi: "बेलन, शंकु और गोले का आयतन" },
    back: {
      en: "Cylinder: πr²h\nCone: ⅓πr²h\nSphere: ⁴⁄₃πr³",
      hi: "बेलन: πr²h\nशंकु: ⅓πr²h\nगोला: ⁴⁄₃πr³",
    },
  },

  // ---------------------------------------------------------------- Biology
  {
    id: "bio-mitochondria",
    subject: "biology",
    topics: ["bio-cell", "fbio-cell"],
    levels: SF,
    front: { en: "Mitochondria", hi: "माइटोकॉन्ड्रिया" },
    back: {
      en: "Site of aerobic respiration (the Krebs cycle runs in the matrix); called the “powerhouse of the cell”.",
      hi: "वायवीय श्वसन का स्थल (क्रेब्स चक्र मैट्रिक्स में होता है); इन्हें “कोशिका का बिजलीघर” कहा जाता है।",
    },
  },
  {
    id: "bio-ribosomes",
    subject: "biology",
    topics: ["bio-cell", "fbio-cell"],
    levels: SF,
    front: { en: "Ribosomes", hi: "राइबोसोम" },
    back: { en: "Site of protein synthesis.", hi: "प्रोटीन संश्लेषण का स्थल।" },
  },
  {
    id: "bio-photosynthesis",
    subject: "biology",
    topics: ["bio-plant-physiology", "fbio-life-processes"],
    levels: SF,
    front: { en: "Overall equation of photosynthesis", hi: "प्रकाश-संश्लेषण का समग्र समीकरण" },
    back: {
      en: "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂\n(in the presence of light and chlorophyll)",
      hi: "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂\n(प्रकाश और क्लोरोफ़िल की उपस्थिति में)",
    },
  },
  {
    id: "bio-glycolysis",
    subject: "biology",
    topics: ["bio-plant-physiology"],
    levels: S,
    front: { en: "Glycolysis: where, and what it produces", hi: "ग्लाइकोलिसिस: कहाँ होता है और क्या बनता है" },
    back: {
      en: "Takes place in the cytoplasm; one molecule of glucose is broken down into two molecules of pyruvic acid.",
      hi: "कोशिकाद्रव्य में होता है; ग्लूकोस का एक अणु पाइरुविक अम्ल के दो अणुओं में टूटता है।",
    },
  },
  {
    id: "bio-monohybrid",
    subject: "biology",
    topics: ["bio-genetics-evolution", "fbio-heredity"],
    levels: SF,
    front: { en: "Mendel’s monohybrid cross: F₂ ratios", hi: "मेंडल का एकसंकर संकरण: F₂ अनुपात" },
    back: { en: "Phenotypic ratio 3 : 1\nGenotypic ratio 1 : 2 : 1\n(one gene, complete dominance)", hi: "लक्षणप्ररूपी अनुपात 3 : 1\nजीनप्ररूपी अनुपात 1 : 2 : 1\n(एक जीन, पूर्ण प्रभाविता)" },
  },
  {
    id: "bio-dihybrid",
    subject: "biology",
    topics: ["bio-genetics-evolution"],
    levels: S,
    front: { en: "Mendel’s dihybrid cross: F₂ phenotypic ratio", hi: "मेंडल का द्विसंकर संकरण: F₂ लक्षणप्ररूपी अनुपात" },
    back: { en: "9 : 3 : 3 : 1\n(two genes that assort independently, each with complete dominance)", hi: "9 : 3 : 3 : 1\n(स्वतंत्र रूप से अपव्यूहित होने वाले दो जीन, प्रत्येक में पूर्ण प्रभाविता)" },
  },
  {
    id: "bio-base-pairing",
    subject: "biology",
    topics: ["bio-genetics-evolution"],
    levels: S,
    front: { en: "Base pairing in DNA", hi: "DNA में क्षारक युग्मन" },
    back: {
      en: "Adenine pairs with thymine (2 hydrogen bonds); guanine pairs with cytosine (3 hydrogen bonds).\nIn RNA, uracil replaces thymine.",
      hi: "एडेनीन थाइमीन से (2 हाइड्रोजन आबंध) और ग्वानीन साइटोसीन से (3 हाइड्रोजन आबंध) युग्मित होता है।\nRNA में थाइमीन के स्थान पर यूरेसिल होता है।",
    },
  },
  {
    id: "bio-hardy-weinberg",
    subject: "biology",
    topics: ["bio-genetics-evolution"],
    levels: S,
    front: { en: "Hardy–Weinberg principle", hi: "हार्डी–वीनबर्ग सिद्धांत" },
    back: {
      en: "p² + 2pq + q² = 1, where p + q = 1\np, q = frequencies of the two alleles; p², 2pq, q² = genotype frequencies (population in Hardy–Weinberg equilibrium)",
      hi: "p² + 2pq + q² = 1, जहाँ p + q = 1\np, q = दो युग्मविकल्पियों की आवृत्तियाँ; p², 2pq, q² = जीनप्ररूपों की आवृत्तियाँ (हार्डी–वीनबर्ग साम्यावस्था वाली समष्टि)",
    },
  },
  {
    id: "bio-chromosome-number",
    subject: "biology",
    topics: ["bio-reproduction", "bio-cell", "fbio-reproduce"],
    levels: SF,
    front: { en: "Chromosome number in humans; mitosis vs meiosis", hi: "मनुष्य में गुणसूत्र संख्या; समसूत्री बनाम अर्धसूत्री विभाजन" },
    back: {
      en: "Body cells: 46 (23 pairs); gametes: 23.\nMitosis keeps the number the same; meiosis halves it.",
      hi: "देह कोशिकाएँ: 46 (23 जोड़े); युग्मक: 23।\nसमसूत्री विभाजन संख्या समान रखता है; अर्धसूत्री विभाजन उसे आधा कर देता है।",
    },
  },
  {
    id: "bio-nephron",
    subject: "biology",
    topics: ["bio-human-physiology", "fbio-life-processes"],
    levels: SF,
    front: { en: "Structural and functional unit of the kidney", hi: "वृक्क की संरचनात्मक और क्रियात्मक इकाई" },
    back: { en: "The nephron.", hi: "नेफ्रॉन।" },
  },
  {
    id: "bio-cardiac-output",
    subject: "biology",
    topics: ["bio-human-physiology"],
    levels: S,
    front: { en: "Cardiac output of a healthy adult", hi: "स्वस्थ वयस्क का हृद् निकास" },
    back: {
      en: "Cardiac output = stroke volume × heart rate ≈ 70 mL × 72 per minute ≈ 5 L per minute",
      hi: "हृद् निकास = प्रवाह आयतन × हृदय दर ≈ 70 mL × 72 प्रति मिनट ≈ 5 L प्रति मिनट",
    },
  },
  {
    id: "bio-insulin-glucagon",
    subject: "biology",
    topics: ["bio-human-physiology"],
    levels: S,
    front: { en: "Insulin and glucagon", hi: "इंसुलिन और ग्लूकागॉन" },
    back: {
      en: "Insulin (β-cells of the islets of Langerhans) lowers blood glucose; glucagon (α-cells) raises it.",
      hi: "इंसुलिन (लैंगरहैंस द्वीपों की β-कोशिकाएँ) रक्त ग्लूकोस घटाता है; ग्लूकागॉन (α-कोशिकाएँ) उसे बढ़ाता है।",
    },
  },
  {
    id: "bio-ten-percent-law",
    subject: "biology",
    topics: ["bio-ecology", "fbio-environment"],
    levels: SF,
    front: { en: "Ten per cent law of energy flow", hi: "ऊर्जा प्रवाह का दस प्रतिशत नियम" },
    back: {
      en: "Only about 10% of the energy at one trophic level is passed on to the next level.",
      hi: "एक पोषी स्तर की ऊर्जा का केवल लगभग 10% भाग ही अगले स्तर तक पहुँचता है।",
    },
  },
];

const SENIOR_EXAMS: readonly ExamId[] = ["jee-main", "jee-advanced", "neet"];

/** Cards for an exam: its subjects only, at the exam's level. */
export function flashcardsForExam(exam: ExamId, subjects: readonly SubjectId[]): Flashcard[] {
  const level: CardLevel = SENIOR_EXAMS.includes(exam) ? "senior" : "foundation";
  return FLASHCARDS.filter((card) => card.levels.includes(level) && subjects.includes(card.subject));
}
