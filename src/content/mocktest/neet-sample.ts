import { bi, same, sampleMcq } from "./builders";
import { NEET_MARKING, type MockQuestion } from "./types";

/**
 * "NEET sample" question bank: 40 ORIGINAL sample questions written for the Aspire demo
 * (10 each of Physics, Chemistry, Botany and Zoology; single-correct MCQs, +4 / −1).
 * Not taken from NTA papers, coaching books or NCERT text. status "placeholder" → visible only
 * with showPlaceholderContent(), labelled Sample (D-032). Hindi is a machine-assisted draft.
 */

const mcq = (input: Parameters<typeof sampleMcq>[2]) => sampleMcq("NEET", NEET_MARKING, input);

export const NEET_PHYSICS: MockQuestion[] = [
  mcq({
    id: "neet-p-01",
    subject: "physics",
    topic: "phy-units",
    difficulty: "easy",
    stem: bi("What is the dimensional formula of Planck's constant h?", "प्लांक नियतांक h का विमीय सूत्र क्या है?"),
    options: [same("[M L² T⁻¹]"), same("[M L² T⁻²]"), same("[M L T⁻¹]"), same("[M L² T⁻³]")],
    answer: 0,
    solution: bi(
      "Photon energy E = hν, so h = E / ν.\n[E] = [M L² T⁻²] and [ν] = [T⁻¹].\n[h] = [M L² T⁻²] / [T⁻¹] = [M L² T⁻¹] — the same as angular momentum.",
      "फोटॉन ऊर्जा E = hν, अतः h = E / ν।\n[E] = [M L² T⁻²] तथा [ν] = [T⁻¹]।\n[h] = [M L² T⁻²] / [T⁻¹] = [M L² T⁻¹] — कोणीय संवेग के समान।",
    ),
  }),
  mcq({
    id: "neet-p-02",
    subject: "physics",
    topic: "phy-kinematics",
    difficulty: "easy",
    stem: bi(
      "A car starts from rest and accelerates uniformly to 20 m/s in 5 s. How far does it travel in this time?",
      "एक कार विराम से चलना शुरू करती है और 5 s में एकसमान त्वरण से 20 m/s की चाल प्राप्त करती है। इस समय में वह कितनी दूरी तय करती है?",
    ),
    options: [same("25 m"), same("100 m"), same("50 m"), same("40 m")],
    answer: 2,
    solution: bi(
      "Acceleration a = (20 − 0) / 5 = 4 m/s².\ns = ut + ½at² = 0 + ½ × 4 × 5² = 50 m.\nOr: average speed (0 + 20)/2 = 10 m/s, and 10 m/s × 5 s = 50 m.",
      "त्वरण a = (20 − 0) / 5 = 4 m/s²।\ns = ut + ½at² = 0 + ½ × 4 × 5² = 50 m।\nया: औसत चाल (0 + 20)/2 = 10 m/s, और 10 m/s × 5 s = 50 m।",
    ),
  }),
  mcq({
    id: "neet-p-03",
    subject: "physics",
    topic: "phy-laws-of-motion",
    difficulty: "medium",
    stem: bi(
      "A person of mass 60 kg stands on a weighing scale in a lift that is accelerating upward at 2 m/s². What does the scale read? (g = 10 m/s²)",
      "60 kg द्रव्यमान का एक व्यक्ति लिफ्ट में रखे भार-मापी (weighing scale) पर खड़ा है। लिफ्ट 2 m/s² से ऊपर की ओर त्वरित हो रही है। मापी का पाठ्यांक क्या होगा? (g = 10 m/s²)",
    ),
    options: [same("600 N"), same("660 N"), same("480 N"), same("720 N")],
    answer: 3,
    solution: bi(
      "Forces on the person: normal force N upward, weight mg downward.\nNewton's second law (upward positive): N − mg = ma.\nN = m(g + a) = 60 × (10 + 2) = 720 N.\nThe scale shows the normal force: 720 N.",
      "व्यक्ति पर बल: ऊपर की ओर अभिलंब बल N, नीचे की ओर भार mg।\nन्यूटन का दूसरा नियम (ऊपर धनात्मक): N − mg = ma।\nN = m(g + a) = 60 × (10 + 2) = 720 N।\nमापी अभिलंब बल दर्शाता है: 720 N।",
    ),
  }),
  mcq({
    id: "neet-p-04",
    subject: "physics",
    topic: "phy-work-energy",
    difficulty: "easy",
    stem: bi(
      "A body of mass 1 kg falls freely from rest from a height of 20 m. Ignoring air resistance, what is its kinetic energy just before it hits the ground? (g = 10 m/s²)",
      "1 kg द्रव्यमान का एक पिंड 20 m की ऊँचाई से विराम से स्वतंत्र रूप से गिरता है। वायु प्रतिरोध की उपेक्षा करते हुए, धरातल से टकराने से ठीक पहले इसकी गतिज ऊर्जा कितनी है? (g = 10 m/s²)",
    ),
    options: [same("100 J"), same("200 J"), same("20 J"), same("400 J")],
    answer: 1,
    solution: bi(
      "Mechanical energy is conserved: the loss of potential energy equals the gain in kinetic energy.\nK = mgh = 1 × 10 × 20 = 200 J.",
      "यांत्रिक ऊर्जा संरक्षित रहती है: स्थितिज ऊर्जा में कमी = गतिज ऊर्जा में वृद्धि।\nK = mgh = 1 × 10 × 20 = 200 J।",
    ),
  }),
  mcq({
    id: "neet-p-05",
    subject: "physics",
    topic: "phy-gravitation",
    difficulty: "medium",
    stem: bi(
      "The escape speed from the Earth is about 11.2 km/s. What is the escape speed from a planet that has the same average density as the Earth but twice its radius?",
      "पृथ्वी से पलायन चाल लगभग 11.2 km/s है। उस ग्रह से पलायन चाल क्या होगी जिसका औसत घनत्व पृथ्वी के समान है परंतु त्रिज्या पृथ्वी की दोगुनी है?",
    ),
    options: [same("11.2 km/s"), same("5.6 km/s"), same("22.4 km/s"), same("15.8 km/s")],
    answer: 2,
    solution: bi(
      "vₑ = √(2GM / R) and M = ρ × (4/3)πR³.\nvₑ = √(2G × ρ × (4/3)πR³ / R) = R × √((8/3)πGρ).\nSo vₑ ∝ R when the density is the same. Doubling R doubles vₑ: 2 × 11.2 = 22.4 km/s.",
      "vₑ = √(2GM / R) तथा M = ρ × (4/3)πR³।\nvₑ = √(2G × ρ × (4/3)πR³ / R) = R × √((8/3)πGρ)।\nअतः घनत्व समान रहने पर vₑ ∝ R। R दोगुना करने पर vₑ दोगुना: 2 × 11.2 = 22.4 km/s।",
    ),
  }),
  mcq({
    id: "neet-p-06",
    subject: "physics",
    topic: "phy-kinetic-theory",
    difficulty: "medium",
    stem: bi(
      "The rms speed of the molecules of a gas at 27 °C is v. At what temperature will the rms speed of the molecules of the same gas be 2v?",
      "27 °C पर किसी गैस के अणुओं की वर्ग-माध्य-मूल (rms) चाल v है। किस ताप पर उसी गैस के अणुओं की rms चाल 2v होगी?",
    ),
    options: [same("108 °C"), same("54 °C"), same("1200 °C"), same("927 °C")],
    answer: 3,
    solution: bi(
      "v(rms) = √(3RT / M), so v(rms) ∝ √T, with T in kelvin.\n27 °C = 300 K. Doubling the speed needs 4 times the temperature: T = 4 × 300 = 1200 K.\n1200 K = 1200 − 273 = 927 °C.",
      "v(rms) = √(3RT / M), अतः v(rms) ∝ √T (T केल्विन में)।\n27 °C = 300 K। चाल दोगुनी करने के लिए ताप 4 गुना चाहिए: T = 4 × 300 = 1200 K।\n1200 K = 1200 − 273 = 927 °C।",
    ),
  }),
  mcq({
    id: "neet-p-07",
    subject: "physics",
    topic: "phy-electrostatics",
    difficulty: "easy",
    stem: bi(
      "Capacitors of 2 μF and 3 μF are connected in series. What is their equivalent capacitance?",
      "2 μF और 3 μF के संधारित्र श्रेणी क्रम में जुड़े हैं। इनकी तुल्य धारिता कितनी है?",
    ),
    options: [same("1.2 μF"), same("5 μF"), same("6 μF"), same("0.83 μF")],
    answer: 0,
    solution: bi(
      "For capacitors in series: 1/C = 1/C₁ + 1/C₂ = 1/2 + 1/3 = 5/6 (in μF⁻¹).\nC = 6/5 = 1.2 μF.\nThe series combination is always smaller than the smallest capacitor.",
      "श्रेणी क्रम में संधारित्रों के लिए: 1/C = 1/C₁ + 1/C₂ = 1/2 + 1/3 = 5/6 (μF⁻¹ में)।\nC = 6/5 = 1.2 μF।\nश्रेणी संयोजन की धारिता सदैव सबसे छोटे संधारित्र से भी कम होती है।",
    ),
  }),
  mcq({
    id: "neet-p-08",
    subject: "physics",
    topic: "phy-current",
    difficulty: "easy",
    stem: bi(
      "A wire of resistance R is stretched uniformly until its length is doubled. Its volume and resistivity do not change. What is its new resistance?",
      "R प्रतिरोध वाले एक तार को एकसमान रूप से तब तक खींचा जाता है जब तक इसकी लंबाई दोगुनी न हो जाए। इसका आयतन और प्रतिरोधकता नहीं बदलते। इसका नया प्रतिरोध क्या होगा?",
    ),
    options: [same("2R"), same("4R"), same("R/2"), same("R")],
    answer: 1,
    solution: bi(
      "R = ρL / A. The volume V = A × L is constant, so when L doubles, A becomes A/2.\nR′ = ρ(2L) / (A/2) = 4ρL / A = 4R.",
      "R = ρL / A। आयतन V = A × L नियत है, अतः L दोगुनी होने पर A आधा (A/2) हो जाता है।\nR′ = ρ(2L) / (A/2) = 4ρL / A = 4R।",
    ),
  }),
  mcq({
    id: "neet-p-09",
    subject: "physics",
    topic: "phy-magnetism",
    difficulty: "medium",
    stem: bi(
      "A circular loop of radius 10 cm carries a current of 5 A. Find the magnetic field at its centre. (μ₀ = 4π × 10⁻⁷ T m A⁻¹)",
      "10 cm त्रिज्या के एक वृत्ताकार लूप में 5 A धारा प्रवाहित हो रही है। इसके केंद्र पर चुंबकीय क्षेत्र ज्ञात कीजिए। (μ₀ = 4π × 10⁻⁷ T m A⁻¹)",
    ),
    options: [same("π × 10⁻⁵ T"), same("2π × 10⁻⁵ T"), same("π × 10⁻⁶ T"), same("1 × 10⁻⁵ T")],
    answer: 0,
    solution: bi(
      "Field at the centre of a circular loop: B = μ₀ I / (2R).\nB = (4π × 10⁻⁷ × 5) / (2 × 0.10)\n= (20π × 10⁻⁷) / 0.20\n= 100π × 10⁻⁷ = π × 10⁻⁵ T (about 3.14 × 10⁻⁵ T).",
      "वृत्ताकार लूप के केंद्र पर क्षेत्र: B = μ₀ I / (2R)।\nB = (4π × 10⁻⁷ × 5) / (2 × 0.10)\n= (20π × 10⁻⁷) / 0.20\n= 100π × 10⁻⁷ = π × 10⁻⁵ T (लगभग 3.14 × 10⁻⁵ T)।",
    ),
  }),
  mcq({
    id: "neet-p-10",
    subject: "physics",
    topic: "phy-optics",
    difficulty: "easy",
    stem: bi(
      "Light travels inside a glass of refractive index √2 towards the glass–air surface. What is the critical angle for this surface?",
      "√2 अपवर्तनांक वाले काँच के भीतर प्रकाश काँच–वायु सतह की ओर जा रहा है। इस सतह के लिए क्रांतिक कोण कितना है?",
    ),
    options: [same("30°"), same("45°"), same("60°"), same("90°")],
    answer: 1,
    solution: bi(
      "For light going from a denser medium into air: sin C = 1 / μ.\nsin C = 1/√2, so C = 45°.",
      "सघन माध्यम से वायु में जाने वाले प्रकाश के लिए: sin C = 1 / μ।\nsin C = 1/√2, अतः C = 45°।",
    ),
  }),
];

export const NEET_CHEMISTRY: MockQuestion[] = [
  mcq({
    id: "neet-c-01",
    subject: "chemistry",
    topic: "chem-mole",
    difficulty: "easy",
    stem: bi(
      "How many molecules are present in 9 g of water? (H = 1, O = 16, Avogadro constant = 6.02 × 10²³ mol⁻¹)",
      "9 g जल में कितने अणु उपस्थित हैं? (H = 1, O = 16, आवोगाद्रो नियतांक = 6.02 × 10²³ mol⁻¹)",
    ),
    options: [same("9 × 10²³"), same("6.02 × 10²³"), same("1.5 × 10²³"), same("3.01 × 10²³")],
    answer: 3,
    solution: bi(
      "Molar mass of H₂O = 2 × 1 + 16 = 18 g/mol.\nMoles = 9 / 18 = 0.5 mol.\nNumber of molecules = 0.5 × 6.02 × 10²³ = 3.01 × 10²³.",
      "H₂O का मोलर द्रव्यमान = 2 × 1 + 16 = 18 g/mol।\nमोल = 9 / 18 = 0.5 mol।\nअणुओं की संख्या = 0.5 × 6.02 × 10²³ = 3.01 × 10²³।",
    ),
  }),
  mcq({
    id: "neet-c-02",
    subject: "chemistry",
    topic: "chem-atomic",
    difficulty: "easy",
    stem: bi(
      "What is the maximum number of electrons that can be accommodated in a subshell with azimuthal quantum number l = 2?",
      "दिगंशी क्वांटम संख्या l = 2 वाले उपकोश में अधिकतम कितने इलेक्ट्रॉन समा सकते हैं?",
    ),
    options: [same("2"), same("6"), same("10"), same("14")],
    answer: 2,
    solution: bi(
      "A subshell with azimuthal quantum number l has (2l + 1) orbitals.\nFor l = 2 (a d subshell): 2 × 2 + 1 = 5 orbitals.\nEach orbital holds at most 2 electrons: 5 × 2 = 10 electrons.",
      "दिगंशी क्वांटम संख्या l वाले उपकोश में (2l + 1) कक्षक होते हैं।\nl = 2 (d उपकोश) के लिए: 2 × 2 + 1 = 5 कक्षक।\nप्रत्येक कक्षक में अधिकतम 2 इलेक्ट्रॉन: 5 × 2 = 10 इलेक्ट्रॉन।",
    ),
  }),
  mcq({
    id: "neet-c-03",
    subject: "chemistry",
    topic: "chem-periodic",
    difficulty: "easy",
    stem: bi("Which of the following elements has the largest atomic radius?", "निम्नलिखित में से किस तत्व की परमाणु त्रिज्या सबसे बड़ी है?"),
    options: [same("Na"), same("Mg"), same("Al"), same("Si")],
    answer: 0,
    solution: bi(
      "Na, Mg, Al and Si are all in period 3.\nAcross a period the nuclear charge increases while electrons enter the same shell, so the atomic radius decreases from left to right.\nNa, the leftmost of the four, has the largest radius.",
      "Na, Mg, Al और Si सभी आवर्त 3 में हैं।\nआवर्त में बाएँ से दाएँ नाभिकीय आवेश बढ़ता है जबकि इलेक्ट्रॉन उसी कोश में जुड़ते हैं, अतः परमाणु त्रिज्या घटती है।\nइन चारों में सबसे बाईं ओर स्थित Na की त्रिज्या सबसे बड़ी है।",
    ),
  }),
  mcq({
    id: "neet-c-04",
    subject: "chemistry",
    topic: "chem-bonding",
    difficulty: "easy",
    stem: bi(
      "What is the hybridisation of each carbon atom in ethyne (H–C≡C–H)?",
      "एथाइन (H–C≡C–H) में प्रत्येक कार्बन परमाणु का संकरण क्या है?",
    ),
    options: [same("sp"), same("sp²"), same("sp³"), same("sp³d")],
    answer: 0,
    solution: bi(
      "Each carbon forms two σ-bonds (one to H, one to the other C) and two π-bonds (part of the triple bond).\nTwo σ-bonds need two hybrid orbitals, so each carbon is sp hybridised.\nThe molecule is linear (bond angle 180°).",
      "प्रत्येक कार्बन दो σ-आबंध (एक H से, एक दूसरे C से) और दो π-आबंध (त्रिआबंध का भाग) बनाता है।\nदो σ-आबंधों के लिए दो संकर कक्षक चाहिए, अतः प्रत्येक कार्बन sp संकरित है।\nअणु रैखिक है (आबंध कोण 180°)।",
    ),
  }),
  mcq({
    id: "neet-c-05",
    subject: "chemistry",
    topic: "chem-equilibrium",
    difficulty: "medium",
    stem: bi(
      "For the reaction N₂(g) + 3H₂(g) ⇌ 2NH₃(g), which relation between Kp and Kc is correct?",
      "अभिक्रिया N₂(g) + 3H₂(g) ⇌ 2NH₃(g) के लिए Kp और Kc के बीच कौन-सा संबंध सही है?",
    ),
    options: [same("Kp = Kc (RT)²"), same("Kp = Kc (RT)⁻²"), same("Kp = Kc"), same("Kp = Kc (RT)⁻¹")],
    answer: 1,
    solution: bi(
      "Kp = Kc (RT)^Δn, where Δn = (moles of gaseous products) − (moles of gaseous reactants).\nΔn = 2 − (1 + 3) = −2.\nSo Kp = Kc (RT)⁻².",
      "Kp = Kc (RT)^Δn, जहाँ Δn = (गैसीय उत्पादों के मोल) − (गैसीय अभिकारकों के मोल)।\nΔn = 2 − (1 + 3) = −2।\nअतः Kp = Kc (RT)⁻²।",
    ),
  }),
  mcq({
    id: "neet-c-06",
    subject: "chemistry",
    topic: "chem-redox",
    difficulty: "easy",
    stem: bi("What is the oxidation number of chromium in K₂Cr₂O₇?", "K₂Cr₂O₇ में क्रोमियम की ऑक्सीकरण संख्या क्या है?"),
    options: [same("+3"), same("+7"), same("+6"), same("+2")],
    answer: 2,
    solution: bi(
      "Let the oxidation number of Cr be x. K = +1 and O = −2.\n2(+1) + 2x + 7(−2) = 0\n2 + 2x − 14 = 0, so 2x = 12 and x = +6.",
      "माना Cr की ऑक्सीकरण संख्या x है। K = +1 और O = −2।\n2(+1) + 2x + 7(−2) = 0\n2 + 2x − 14 = 0, अतः 2x = 12 और x = +6।",
    ),
  }),
  mcq({
    id: "neet-c-07",
    subject: "chemistry",
    topic: "chem-solutions",
    difficulty: "medium",
    stem: bi(
      "Which colligative property is generally preferred for finding the molar mass of proteins and other macromolecules?",
      "प्रोटीन और अन्य बृहत् अणुओं (macromolecules) का मोलर द्रव्यमान ज्ञात करने के लिए सामान्यतः कौन-सा अणुसंख्य गुणधर्म (colligative property) उपयुक्त माना जाता है?",
    ),
    options: [
      bi("Relative lowering of vapour pressure", "वाष्प दाब का आपेक्षिक अवनमन"),
      bi("Elevation of boiling point", "क्वथनांक का उन्नयन"),
      bi("Depression of freezing point", "हिमांक का अवनमन"),
      bi("Osmotic pressure", "परासरण दाब"),
    ],
    answer: 3,
    solution: bi(
      "Proteins have very large molar masses, so a practical solution contains very few moles of solute. The changes in vapour pressure, boiling point and freezing point are then too small to measure accurately.\nOsmotic pressure is large enough to measure even for such dilute solutions, and it is measured at room temperature, which suits biomolecules that heating can damage.\nAnswer: osmotic pressure.",
      "प्रोटीन का मोलर द्रव्यमान बहुत अधिक होता है, इसलिए व्यावहारिक विलयन में विलेय के बहुत कम मोल होते हैं। तब वाष्प दाब, क्वथनांक और हिमांक में परिवर्तन इतने कम होते हैं कि उन्हें सही-सही मापना कठिन है।\nपरासरण दाब ऐसे तनु विलयनों के लिए भी मापने योग्य होता है और कमरे के ताप पर मापा जाता है, जो गर्म करने से खराब होने वाले जैव-अणुओं के लिए उपयुक्त है।\nउत्तर: परासरण दाब।",
    ),
  }),
  mcq({
    id: "neet-c-08",
    subject: "chemistry",
    topic: "chem-goc",
    difficulty: "easy",
    stem: bi("What is the IUPAC name of CH₃–CH(CH₃)–CH₂–CH₃?", "CH₃–CH(CH₃)–CH₂–CH₃ का IUPAC नाम क्या है?"),
    options: [bi("Pentane", "पेंटेन"), bi("3-Methylbutane", "3-मेथिलब्यूटेन"), bi("2-Methylbutane", "2-मेथिलब्यूटेन"), bi("2-Ethylpropane", "2-एथिलप्रोपेन")],
    answer: 2,
    solution: bi(
      "The longest carbon chain has 4 carbons, so the parent is butane.\nOne methyl group is attached to the chain. Numbering from the end nearer the branch puts it on C-2 (not C-3).\nName: 2-methylbutane. (It is an isomer of pentane, C₅H₁₂, but it is not n-pentane.)",
      "सबसे लंबी कार्बन शृंखला में 4 कार्बन हैं, अतः मूल नाम ब्यूटेन है।\nशृंखला से एक मेथिल समूह जुड़ा है। शाखा के निकट वाले सिरे से क्रमांकन करने पर यह C-2 पर आता है (C-3 पर नहीं)।\nनाम: 2-मेथिलब्यूटेन। (यह पेंटेन, C₅H₁₂, का समावयव है, परंतु n-पेंटेन नहीं है।)",
    ),
  }),
  mcq({
    id: "neet-c-09",
    subject: "chemistry",
    topic: "chem-hydrocarbons",
    difficulty: "medium",
    stem: bi("Which of the following compounds shows geometrical (cis–trans) isomerism?", "निम्नलिखित में से कौन-सा यौगिक ज्यामितीय (समपक्ष–विपक्ष) समावयवता दर्शाता है?"),
    options: [bi("Propene", "प्रोपीन"), bi("But-2-ene", "ब्यूट-2-ईन"), bi("But-1-ene", "ब्यूट-1-ईन"), bi("2-Methylpropene", "2-मेथिलप्रोपीन")],
    answer: 1,
    solution: bi(
      "Cis–trans isomerism needs each carbon of the C=C bond to carry two different groups.\nPropene (CH₃–CH=CH₂) and but-1-ene (CH₃CH₂–CH=CH₂): one double-bond carbon carries two H atoms, so no.\n2-Methylpropene ((CH₃)₂C=CH₂): one carbon has two CH₃ groups and the other two H atoms, so no.\nBut-2-ene (CH₃–CH=CH–CH₃): each carbon has one H and one CH₃, so cis and trans forms exist.",
      "समपक्ष–विपक्ष समावयवता के लिए C=C आबंध के प्रत्येक कार्बन पर दो भिन्न समूह होने चाहिए।\nप्रोपीन (CH₃–CH=CH₂) और ब्यूट-1-ईन (CH₃CH₂–CH=CH₂): द्विआबंध के एक कार्बन पर दो H परमाणु हैं, अतः नहीं।\n2-मेथिलप्रोपीन ((CH₃)₂C=CH₂): एक कार्बन पर दो CH₃ समूह और दूसरे पर दो H परमाणु, अतः नहीं।\nब्यूट-2-ईन (CH₃–CH=CH–CH₃): प्रत्येक कार्बन पर एक H और एक CH₃, अतः समपक्ष और विपक्ष रूप संभव हैं।",
    ),
  }),
  mcq({
    id: "neet-c-10",
    subject: "chemistry",
    topic: "chem-kinetics",
    difficulty: "easy",
    stem: bi("What is the unit of the rate constant of a zero-order reaction?", "शून्य कोटि की अभिक्रिया के वेग स्थिरांक की इकाई क्या है?"),
    options: [same("s⁻¹"), same("mol L⁻¹ s⁻¹"), same("L mol⁻¹ s⁻¹"), same("L² mol⁻² s⁻¹")],
    answer: 1,
    solution: bi(
      "For a reaction of order n: rate = k[A]ⁿ, so the unit of k is (mol L⁻¹)^(1 − n) s⁻¹.\nFor n = 0, rate = k, so k has the same unit as the rate: mol L⁻¹ s⁻¹.",
      "n कोटि की अभिक्रिया के लिए: वेग = k[A]ⁿ, अतः k की इकाई (mol L⁻¹)^(1 − n) s⁻¹ है।\nn = 0 के लिए वेग = k, अतः k की इकाई वेग की इकाई के समान है: mol L⁻¹ s⁻¹।",
    ),
  }),
];

export const NEET_BOTANY: MockQuestion[] = [
  mcq({
    id: "neet-b-01",
    subject: "botany",
    topic: "bot-cell",
    difficulty: "easy",
    stem: bi("Which of the following cell organelles is NOT bounded by a membrane?", "निम्नलिखित में से कौन-सा कोशिकांग झिल्ली से घिरा नहीं होता?"),
    options: [bi("Mitochondrion", "माइटोकॉन्ड्रिया"), bi("Chloroplast", "हरितलवक (क्लोरोप्लास्ट)"), bi("Lysosome", "लाइसोसोम"), bi("Ribosome", "राइबोसोम")],
    answer: 3,
    solution: bi(
      "Mitochondria and chloroplasts are surrounded by a double membrane; lysosomes by a single membrane.\nRibosomes are made of RNA and proteins and have no membrane around them.\nAnswer: ribosome.",
      "माइटोकॉन्ड्रिया और हरितलवक दोहरी झिल्ली से घिरे होते हैं; लाइसोसोम एकल झिल्ली से।\nराइबोसोम RNA और प्रोटीन से बने होते हैं और इनके चारों ओर कोई झिल्ली नहीं होती।\nउत्तर: राइबोसोम।",
    ),
  }),
  mcq({
    id: "neet-b-02",
    subject: "botany",
    topic: "bot-cell-division",
    difficulty: "medium",
    stem: bi("In which stage of prophase I of meiosis does crossing over take place?", "अर्धसूत्री विभाजन की पूर्वावस्था I (prophase I) की किस अवस्था में जीन विनिमय (crossing over) होता है?"),
    options: [bi("Leptotene", "लेप्टोटीन"), bi("Zygotene", "जाइगोटीन"), bi("Pachytene", "पैकीटीन"), bi("Diplotene", "डिप्लोटीन")],
    answer: 2,
    solution: bi(
      "The stages of prophase I in order: leptotene → zygotene → pachytene → diplotene → diakinesis.\nHomologous chromosomes pair up in zygotene. In pachytene, non-sister chromatids of homologous chromosomes exchange segments: this is crossing over (the enzyme recombinase helps).\nIn diplotene the X-shaped chiasmata, where crossing over happened, become visible.",
      "पूर्वावस्था I की अवस्थाएँ क्रम से: लेप्टोटीन → जाइगोटीन → पैकीटीन → डिप्लोटीन → डायाकाइनेसिस।\nजाइगोटीन में समजात गुणसूत्र युग्मित होते हैं। पैकीटीन में समजात गुणसूत्रों के असहोदर (non-sister) अर्धगुणसूत्र खंडों का आदान-प्रदान करते हैं: यही जीन विनिमय है (रिकॉम्बिनेज़ एंज़ाइम सहायता करता है)।\nडिप्लोटीन में X-आकार के काएज़्मेटा, जहाँ विनिमय हुआ था, दिखाई देने लगते हैं।",
    ),
  }),
  mcq({
    id: "neet-b-03",
    subject: "botany",
    topic: "bot-photosynthesis",
    difficulty: "easy",
    stem: bi("The oxygen released during photosynthesis comes from:", "प्रकाश-संश्लेषण के दौरान निकलने वाली ऑक्सीजन किससे आती है?"),
    options: [bi("Water", "जल"), bi("Carbon dioxide", "कार्बन डाइऑक्साइड"), bi("Glucose", "ग्लूकोज"), bi("Chlorophyll", "पर्णहरित (क्लोरोफिल)")],
    answer: 0,
    solution: bi(
      "In the light reaction, water is split near photosystem II (photolysis of water): 2H₂O → 4H⁺ + O₂ + 4e⁻.\nThe electrons replace those lost by photosystem II, and O₂ is released.\nExperiments with isotope-labelled water show that this O₂ comes from H₂O, not from CO₂.",
      "प्रकाश अभिक्रिया में प्रकाश-तंत्र II के पास जल का विघटन होता है (जल का प्रकाश-अपघटन): 2H₂O → 4H⁺ + O₂ + 4e⁻।\nये इलेक्ट्रॉन प्रकाश-तंत्र II द्वारा खोए इलेक्ट्रॉनों की पूर्ति करते हैं, और O₂ मुक्त होती है।\nसमस्थानिक-चिह्नित जल के प्रयोग दर्शाते हैं कि यह O₂ जल से आती है, CO₂ से नहीं।",
    ),
  }),
  mcq({
    id: "neet-b-04",
    subject: "botany",
    topic: "bot-photosynthesis",
    difficulty: "medium",
    stem: bi("In C₄ plants, which molecule is the primary CO₂ acceptor in the mesophyll cells?", "C₄ पौधों में पर्णमध्योतक (mesophyll) कोशिकाओं में प्राथमिक CO₂ ग्राही कौन-सा अणु है?"),
    options: [
      bi("RuBP (ribulose bisphosphate)", "RuBP (राइबुलोज़ बिसफॉस्फेट)"),
      bi("PGA (phosphoglyceric acid)", "PGA (फॉस्फोग्लिसरिक अम्ल)"),
      bi("OAA (oxaloacetic acid)", "OAA (ऑक्सेलोऐसीटिक अम्ल)"),
      bi("PEP (phosphoenolpyruvate)", "PEP (फॉस्फोईनोलपाइरुवेट)"),
    ],
    answer: 3,
    solution: bi(
      "In C₄ plants the mesophyll cells fix CO₂ with the enzyme PEP carboxylase.\nThe acceptor is phosphoenolpyruvate (PEP, a 3-carbon molecule). The first stable product is oxaloacetic acid (OAA, 4 carbons) — hence the name C₄.\nRuBP is the CO₂ acceptor of the Calvin cycle, which runs in the bundle-sheath cells.",
      "C₄ पौधों में पर्णमध्योतक कोशिकाएँ PEP कार्बोक्सिलेज़ एंज़ाइम से CO₂ का स्थिरीकरण करती हैं।\nग्राही फॉस्फोईनोलपाइरुवेट (PEP, 3-कार्बन अणु) है। पहला स्थायी उत्पाद ऑक्सेलोऐसीटिक अम्ल (OAA, 4 कार्बन) है — इसीलिए नाम C₄।\nRuBP केल्विन चक्र का CO₂ ग्राही है, जो पूलाच्छद (bundle-sheath) कोशिकाओं में चलता है।",
    ),
  }),
  mcq({
    id: "neet-b-05",
    subject: "botany",
    topic: "bot-respiration",
    difficulty: "medium",
    stem: bi(
      "What is the net gain of ATP molecules produced directly in glycolysis, per molecule of glucose?",
      "ग्लाइकोलिसिस में ग्लूकोज के प्रति अणु सीधे बनने वाले ATP अणुओं का शुद्ध लाभ कितना है?",
    ),
    options: [same("2"), same("4"), same("36"), same("8")],
    answer: 0,
    solution: bi(
      "Glycolysis uses 2 ATP (to phosphorylate glucose and fructose 6-phosphate).\nIt produces 4 ATP by substrate-level phosphorylation.\nNet gain = 4 − 2 = 2 ATP. (The 2 NADH formed are counted separately.)",
      "ग्लाइकोलिसिस में 2 ATP खर्च होते हैं (ग्लूकोज और फ्रक्टोज़ 6-फॉस्फेट के फॉस्फोरिलीकरण में)।\nक्रियाधार-स्तर फॉस्फोरिलीकरण से 4 ATP बनते हैं।\nशुद्ध लाभ = 4 − 2 = 2 ATP। (बने हुए 2 NADH अलग से गिने जाते हैं।)",
    ),
  }),
  mcq({
    id: "neet-b-06",
    subject: "botany",
    topic: "bot-growth",
    difficulty: "easy",
    stem: bi("Which plant hormone causes the stomata to close when the plant is under water stress?", "जल की कमी (जल-तनाव) की स्थिति में कौन-सा पादप हॉर्मोन रंध्रों (stomata) को बंद करता है?"),
    options: [bi("Auxin", "ऑक्सिन"), bi("Gibberellin", "जिबरेलिन"), bi("Abscisic acid", "एब्सिसिक अम्ल"), bi("Cytokinin", "साइटोकाइनिन")],
    answer: 2,
    solution: bi(
      "Abscisic acid (ABA) is often called the stress hormone of plants.\nUnder water stress its level rises and it makes the stomata close, which reduces water loss by transpiration.\nAuxin, gibberellin and cytokinin mainly promote growth.",
      "एब्सिसिक अम्ल (ABA) को प्रायः पौधों का 'तनाव हॉर्मोन' कहा जाता है।\nजल-तनाव में इसका स्तर बढ़ता है और यह रंध्रों को बंद कर देता है, जिससे वाष्पोत्सर्जन द्वारा जल की हानि घटती है।\nऑक्सिन, जिबरेलिन और साइटोकाइनिन मुख्यतः वृद्धि को बढ़ावा देते हैं।",
    ),
  }),
  mcq({
    id: "neet-b-07",
    subject: "botany",
    topic: "bot-genetics",
    difficulty: "easy",
    stem: bi(
      "A true-breeding tall pea plant (TT) is crossed with a true-breeding dwarf pea plant (tt). What is the phenotypic ratio in the F₂ generation?",
      "एक शुद्ध लंबे मटर के पौधे (TT) का संकरण एक शुद्ध बौने मटर के पौधे (tt) से कराया जाता है। F₂ पीढ़ी में लक्षणप्ररूपी (phenotypic) अनुपात क्या होगा?",
    ),
    options: [same("1 : 2 : 1"), same("3 : 1"), same("9 : 3 : 3 : 1"), same("1 : 1")],
    answer: 1,
    solution: bi(
      "F₁: all plants are Tt (tall).\nF₁ × F₁ (Tt × Tt) gives TT : Tt : tt = 1 : 2 : 1.\nTT and Tt plants are both tall, so tall : dwarf = 3 : 1.\n(1 : 2 : 1 is the genotypic ratio.)",
      "F₁: सभी पौधे Tt (लंबे)।\nF₁ × F₁ (Tt × Tt) से TT : Tt : tt = 1 : 2 : 1।\nTT और Tt दोनों पौधे लंबे होते हैं, अतः लंबे : बौने = 3 : 1।\n(1 : 2 : 1 जीनप्ररूपी अनुपात है।)",
    ),
  }),
  mcq({
    id: "neet-b-08",
    subject: "botany",
    topic: "bot-genetics",
    difficulty: "easy",
    stem: bi("In a test cross, an organism showing the dominant phenotype is crossed with:", "परीक्षार्थ संकरण (test cross) में प्रभावी लक्षण वाले जीव का संकरण किसके साथ कराया जाता है?"),
    options: [
      bi("a homozygous dominant individual", "समयुग्मजी प्रभावी जीव"),
      bi("a homozygous recessive individual", "समयुग्मजी अप्रभावी जीव"),
      bi("another F₁ individual", "एक अन्य F₁ जीव"),
      bi("a heterozygous individual", "विषमयुग्मजी जीव"),
    ],
    answer: 1,
    solution: bi(
      "A test cross finds out whether an organism with the dominant phenotype is homozygous (TT) or heterozygous (Tt).\nIt is crossed with a homozygous recessive (tt) individual.\nIf all offspring show the dominant trait, the parent was TT; if dominant : recessive = 1 : 1, the parent was Tt.",
      "परीक्षार्थ संकरण से पता चलता है कि प्रभावी लक्षण वाला जीव समयुग्मजी (TT) है या विषमयुग्मजी (Tt)।\nइसका संकरण समयुग्मजी अप्रभावी (tt) जीव से कराया जाता है।\nयदि सभी संतानें प्रभावी लक्षण दिखाएँ तो जनक TT था; यदि प्रभावी : अप्रभावी = 1 : 1 हो तो जनक Tt था।",
    ),
  }),
  mcq({
    id: "neet-b-09",
    subject: "botany",
    topic: "bot-reproduction",
    difficulty: "easy",
    stem: bi("In most flowering plants, the endosperm formed after double fertilisation is:", "अधिकांश पुष्पी पादपों में द्विनिषेचन के बाद बनने वाला भ्रूणपोष (endosperm) होता है:"),
    options: [bi("haploid (n)", "अगुणित (n)"), bi("diploid (2n)", "द्विगुणित (2n)"), bi("triploid (3n)", "त्रिगुणित (3n)"), bi("tetraploid (4n)", "चतुर्गुणित (4n)")],
    answer: 2,
    solution: bi(
      "In double fertilisation one male gamete fuses with the egg, forming the diploid zygote.\nThe other male gamete fuses with the two polar nuclei (the diploid secondary nucleus): triple fusion.\nn + n + n = 3n, so the primary endosperm nucleus, and hence the endosperm, is triploid.",
      "द्विनिषेचन में एक नर युग्मक अंड-कोशिका से संलयन कर द्विगुणित युग्मनज बनाता है।\nदूसरा नर युग्मक दो ध्रुवीय केंद्रकों (द्विगुणित द्वितीयक केंद्रक) से संलयन करता है: त्रिसंलयन।\nn + n + n = 3n, अतः प्राथमिक भ्रूणपोष केंद्रक, और इसलिए भ्रूणपोष, त्रिगुणित होता है।",
    ),
  }),
  mcq({
    id: "neet-b-10",
    subject: "botany",
    topic: "bot-ecology",
    difficulty: "easy",
    stem: bi("The pyramid of energy of an ecosystem is:", "किसी पारितंत्र का ऊर्जा पिरामिड होता है:"),
    options: [
      bi("always upright", "सदैव सीधा"),
      bi("always inverted", "सदैव उल्टा"),
      bi("upright or inverted, depending on the ecosystem", "पारितंत्र के अनुसार सीधा या उल्टा"),
      bi("spindle-shaped", "तर्कु-आकार (spindle-shaped)"),
    ],
    answer: 0,
    solution: bi(
      "At each transfer from one trophic level to the next, much of the energy is lost as heat in respiration; only about 10% is passed on.\nSo every higher trophic level has less energy than the one below it.\nThe pyramid of energy can therefore never be inverted: it is always upright. (Pyramids of number and of biomass can be inverted.)",
      "एक पोषण स्तर से अगले में प्रत्येक स्थानांतरण में अधिकांश ऊर्जा श्वसन में ऊष्मा के रूप में नष्ट होती है; केवल लगभग 10% आगे जाती है।\nअतः प्रत्येक ऊपरी पोषण स्तर में नीचे वाले स्तर से कम ऊर्जा होती है।\nइसलिए ऊर्जा पिरामिड कभी उल्टा नहीं हो सकता: यह सदैव सीधा होता है। (संख्या और जैवभार के पिरामिड उल्टे हो सकते हैं।)",
    ),
  }),
];

/*
 * neet-z-01 (pepsin / "Digestion and absorption") was withdrawn by CONTENT-VERIFY: that chapter is not
 * in the current NMC NEET-UG syllabus. Its id is retired (never reused); neet-z-11 replaces it.
 */
export const NEET_ZOOLOGY: MockQuestion[] = [
  mcq({
    id: "neet-z-02",
    subject: "zoology",
    topic: "zoo-breathing",
    difficulty: "easy",
    stem: bi(
      "The tidal volume — the air breathed in or out in one normal, quiet breath — of a healthy adult human is:",
      "एक स्वस्थ वयस्क मनुष्य का ज्वारीय आयतन (tidal volume) — एक सामान्य, शांत श्वास में अंदर या बाहर जाने वाली वायु — कितना होता है?",
    ),
    options: [bi("about 500 mL", "लगभग 500 mL"), bi("about 1200 mL", "लगभग 1200 mL"), bi("about 3000 mL", "लगभग 3000 mL"), bi("about 150 mL", "लगभग 150 mL")],
    answer: 0,
    solution: bi(
      "Tidal volume is the volume of air inspired or expired in one normal breath: about 500 mL.\nAt about 12–16 breaths a minute this comes to roughly 6000–8000 mL of air per minute.\nAbout 1100–1200 mL is the residual volume, and 2500–3000 mL is the inspiratory reserve volume.",
      "एक सामान्य श्वास में अंदर ली गई या बाहर छोड़ी गई वायु का आयतन ज्वारीय आयतन है: लगभग 500 mL।\nलगभग 12–16 श्वास प्रति मिनट पर यह लगभग 6000–8000 mL वायु प्रति मिनट होता है।\nलगभग 1100–1200 mL अवशिष्ट आयतन है, और 2500–3000 mL अंतःश्वसन आरक्षित आयतन है।",
    ),
  }),
  mcq({
    id: "neet-z-03",
    subject: "zoology",
    topic: "zoo-circulation",
    difficulty: "easy",
    stem: bi("Which chamber of the human heart pumps oxygenated blood into the aorta?", "मानव हृदय का कौन-सा कक्ष ऑक्सीजनित रक्त को महाधमनी (aorta) में पंप करता है?"),
    options: [bi("Right atrium", "दायाँ अलिंद"), bi("Right ventricle", "दायाँ निलय"), bi("Left atrium", "बायाँ अलिंद"), bi("Left ventricle", "बायाँ निलय")],
    answer: 3,
    solution: bi(
      "Oxygenated blood returns from the lungs through the pulmonary veins to the left atrium, which passes it to the left ventricle.\nThe left ventricle contracts and pumps it into the aorta, which carries it to the whole body (systemic circulation).\nThe right ventricle pumps deoxygenated blood into the pulmonary artery.",
      "ऑक्सीजनित रक्त फेफड़ों से फुफ्फुस शिराओं द्वारा बाएँ अलिंद में लौटता है, जो इसे बाएँ निलय में भेजता है।\nबायाँ निलय संकुचित होकर इसे महाधमनी में पंप करता है, जो इसे पूरे शरीर में ले जाती है (दैहिक परिसंचरण)।\nदायाँ निलय विऑक्सीजनित रक्त को फुफ्फुस धमनी में पंप करता है।",
    ),
  }),
  mcq({
    id: "neet-z-04",
    subject: "zoology",
    topic: "zoo-excretion",
    difficulty: "easy",
    stem: bi("What is the structural and functional unit of the human kidney?", "मानव वृक्क (किडनी) की संरचनात्मक और क्रियात्मक इकाई क्या है?"),
    options: [bi("Nephron", "नेफ्रॉन"), bi("Neuron", "न्यूरॉन"), bi("Alveolus", "कूपिका (एल्वियोलस)"), bi("Villus", "रसांकुर (विलस)")],
    answer: 0,
    solution: bi(
      "Each kidney contains about a million nephrons.\nA nephron filters the blood (at the glomerulus), then reabsorbs and secretes substances along its tubule, forming urine.\nNeuron (nervous system), alveolus (lungs) and villus (small intestine) are units of other organs.",
      "प्रत्येक वृक्क में लगभग दस लाख नेफ्रॉन होते हैं।\nनेफ्रॉन रक्त का निस्यंदन करता है (ग्लोमेरुलस में), फिर अपनी नलिका में पदार्थों का पुनःअवशोषण और स्रावण कर मूत्र बनाता है।\nन्यूरॉन (तंत्रिका तंत्र), कूपिका (फेफड़े) और रसांकुर (छोटी आँत) अन्य अंगों की इकाइयाँ हैं।",
    ),
  }),
  mcq({
    id: "neet-z-05",
    subject: "zoology",
    topic: "zoo-neural",
    difficulty: "medium",
    stem: bi("When a neuron is at rest (not conducting an impulse), its axon membrane is:", "जब एक न्यूरॉन विश्राम अवस्था में होता है (आवेग का संचरण नहीं कर रहा), तब उसकी तंत्रिकाक्ष (axon) झिल्ली:"),
    options: [
      bi("more permeable to Na⁺ than to K⁺", "K⁺ की तुलना में Na⁺ के लिए अधिक पारगम्य होती है"),
      bi("more permeable to K⁺ than to Na⁺", "Na⁺ की तुलना में K⁺ के लिए अधिक पारगम्य होती है"),
      bi("equally permeable to Na⁺ and K⁺", "Na⁺ और K⁺ के लिए समान रूप से पारगम्य होती है"),
      bi("impermeable to both Na⁺ and K⁺", "Na⁺ और K⁺ दोनों के लिए अपारगम्य होती है"),
    ],
    answer: 1,
    solution: bi(
      "In the resting state many K⁺ channels are open while Na⁺ channels are mostly closed, so K⁺ crosses the membrane far more easily than Na⁺.\nThe sodium–potassium pump moves 3 Na⁺ out for every 2 K⁺ in and so keeps up the ion gradients (more Na⁺ outside, more K⁺ inside). With K⁺ leaking out more easily than Na⁺ leaks in, the outer surface is left positive relative to the inner surface.\nThis gives the resting potential: the membrane is polarised.",
      "विश्राम अवस्था में अनेक K⁺ चैनल खुले रहते हैं जबकि Na⁺ चैनल अधिकतर बंद रहते हैं, इसलिए K⁺ झिल्ली को Na⁺ की तुलना में कहीं आसानी से पार करता है।\nसोडियम–पोटैशियम पंप प्रत्येक 2 K⁺ अंदर लाने पर 3 Na⁺ बाहर भेजता है और इस प्रकार आयनों की प्रवणता (बाहर अधिक Na⁺, भीतर अधिक K⁺) बनाए रखता है। K⁺ के Na⁺ की तुलना में अधिक आसानी से बाहर रिसने के कारण बाहरी सतह भीतरी सतह की तुलना में धनात्मक रहती है।\nइससे विराम विभव बनता है: झिल्ली ध्रुवित (polarised) रहती है।",
    ),
  }),
  mcq({
    id: "neet-z-06",
    subject: "zoology",
    topic: "zoo-endocrine",
    difficulty: "easy",
    stem: bi("Which hormone lowers the blood glucose level?", "कौन-सा हॉर्मोन रक्त में ग्लूकोज का स्तर घटाता है?"),
    options: [bi("Glucagon", "ग्लूकागॉन"), bi("Cortisol", "कॉर्टिसॉल"), bi("Adrenaline", "एड्रीनलिन"), bi("Insulin", "इंसुलिन")],
    answer: 3,
    solution: bi(
      "Insulin, secreted by the β-cells of the islets of Langerhans in the pancreas, makes liver and body cells take up glucose and helps convert glucose into glycogen.\nThis lowers the blood glucose level.\nGlucagon, adrenaline and cortisol all tend to raise blood glucose.",
      "अग्न्याशय के लैंगरहैंस द्वीपों की β-कोशिकाओं द्वारा स्रावित इंसुलिन यकृत और शरीर की कोशिकाओं को ग्लूकोज ग्रहण करने के लिए प्रेरित करता है और ग्लूकोज को ग्लाइकोजन में बदलने में सहायता करता है।\nइससे रक्त में ग्लूकोज का स्तर घटता है।\nग्लूकागॉन, एड्रीनलिन और कॉर्टिसॉल रक्त ग्लूकोज को बढ़ाने की प्रवृत्ति रखते हैं।",
    ),
  }),
  mcq({
    id: "neet-z-07",
    subject: "zoology",
    topic: "zoo-reproduction",
    difficulty: "easy",
    stem: bi("Where does fertilisation normally take place in the human female reproductive tract?", "मानव मादा जनन मार्ग में निषेचन सामान्यतः कहाँ होता है?"),
    options: [
      bi("Uterus", "गर्भाशय"),
      bi("Cervix", "गर्भाशय ग्रीवा"),
      bi("Ampullary region of the fallopian tube", "फैलोपियन नलिका का तुंबिका (ampullary) भाग"),
      bi("Ovary", "अंडाशय"),
    ],
    answer: 2,
    solution: bi(
      "After ovulation the ovum enters the fallopian tube (oviduct).\nFertilisation happens only if sperm reach the ovum while it is in the ampullary region of the fallopian tube.\nThe zygote divides as it moves down to the uterus, where the embryo later implants.",
      "अंडोत्सर्ग के बाद अंडाणु फैलोपियन नलिका (अंडवाहिनी) में प्रवेश करता है।\nनिषेचन तभी होता है जब शुक्राणु अंडाणु तक उस समय पहुँचें जब वह फैलोपियन नलिका के तुंबिका भाग में हो।\nयुग्मनज विभाजित होते हुए गर्भाशय की ओर बढ़ता है, जहाँ बाद में भ्रूण का रोपण होता है।",
    ),
  }),
  mcq({
    id: "neet-z-08",
    subject: "zoology",
    topic: "zoo-molecular",
    difficulty: "easy",
    stem: bi("In double-stranded DNA, adenine pairs with:", "द्विरज्जुकी DNA में ऐडेनीन किसके साथ युग्म बनाता है?"),
    options: [
      bi("thymine, through two hydrogen bonds", "थाइमीन, दो हाइड्रोजन आबंधों द्वारा"),
      bi("guanine, through three hydrogen bonds", "ग्वानीन, तीन हाइड्रोजन आबंधों द्वारा"),
      bi("cytosine, through two hydrogen bonds", "साइटोसीन, दो हाइड्रोजन आबंधों द्वारा"),
      bi("uracil, through three hydrogen bonds", "यूरेसिल, तीन हाइड्रोजन आबंधों द्वारा"),
    ],
    answer: 0,
    solution: bi(
      "In the double helix a purine always pairs with a pyrimidine.\nAdenine (A) pairs with thymine (T) through two hydrogen bonds.\nGuanine (G) pairs with cytosine (C) through three hydrogen bonds. Uracil is found in RNA, not in DNA.",
      "द्विकुंडली में एक प्यूरीन सदैव एक पिरिमिडीन के साथ युग्म बनाता है।\nऐडेनीन (A) थाइमीन (T) के साथ दो हाइड्रोजन आबंधों द्वारा युग्म बनाता है।\nग्वानीन (G) साइटोसीन (C) के साथ तीन हाइड्रोजन आबंधों द्वारा युग्म बनाता है। यूरेसिल RNA में पाया जाता है, DNA में नहीं।",
    ),
  }),
  mcq({
    id: "neet-z-09",
    subject: "zoology",
    topic: "zoo-evolution",
    difficulty: "easy",
    stem: bi("The wings of a bird and the wings of a butterfly are:", "पक्षी के पंख और तितली के पंख हैं:"),
    options: [
      bi("homologous organs", "समजात अंग"),
      bi("analogous organs", "समरूप (analogous) अंग"),
      bi("vestigial organs", "अवशेषी अंग"),
      bi("an example of divergent evolution", "अपसारी विकास का उदाहरण"),
    ],
    answer: 1,
    solution: bi(
      "Both wings do the same job (flight) but have different structures and origins: a bird's wing is a modified forelimb with bones, while a butterfly's wing is an outgrowth of the body wall.\nOrgans with the same function but different structure and origin are analogous organs.\nThey result from convergent evolution, not divergent evolution.",
      "दोनों पंख एक ही कार्य (उड़ना) करते हैं परंतु उनकी संरचना और उत्पत्ति भिन्न है: पक्षी का पंख हड्डियों वाला रूपांतरित अग्रपाद है, जबकि तितली का पंख शरीर-भित्ति का उभार है।\nसमान कार्य परंतु भिन्न संरचना और उत्पत्ति वाले अंग समरूप अंग कहलाते हैं।\nये अभिसारी विकास का परिणाम हैं, अपसारी विकास का नहीं।",
    ),
  }),
  mcq({
    id: "neet-z-10",
    subject: "zoology",
    topic: "zoo-health",
    difficulty: "easy",
    stem: bi("Which cells produce antibodies in the human body?", "मानव शरीर में प्रतिरक्षी (antibodies) कौन-सी कोशिकाएँ बनाती हैं?"),
    options: [bi("T-lymphocytes", "T-लसीकाणु"), bi("Red blood cells", "लाल रक्त कणिकाएँ"), bi("B-lymphocytes", "B-लसीकाणु"), bi("Platelets", "पट्टिकाणु (प्लेटलेट्स)")],
    answer: 2,
    solution: bi(
      "B-lymphocytes respond to an antigen by multiplying; many become plasma cells that secrete antibodies into the blood (humoral immunity).\nT-lymphocytes do not secrete antibodies; they help B-cells and carry out cell-mediated immunity.\nRed blood cells and platelets have no role in making antibodies.",
      "B-लसीकाणु प्रतिजन (antigen) के संपर्क में आने पर गुणित होते हैं; इनमें से अनेक प्लाज़्मा कोशिकाएँ बनकर रक्त में प्रतिरक्षी स्रावित करती हैं (तरल प्रतिरक्षा)।\nT-लसीकाणु प्रतिरक्षी स्रावित नहीं करते; वे B-कोशिकाओं की सहायता करते हैं और कोशिका-माध्यित प्रतिरक्षा चलाते हैं।\nलाल रक्त कणिकाओं और पट्टिकाणुओं की प्रतिरक्षी बनाने में कोई भूमिका नहीं है।",
    ),
  }),
  mcq({
    id: "neet-z-11",
    subject: "zoology",
    topic: "zoo-locomotion",
    difficulty: "medium",
    stem: bi(
      "According to the sliding filament theory, what happens in a sarcomere when a skeletal muscle fibre contracts?",
      "सर्पी तंतु सिद्धांत (sliding filament theory) के अनुसार, कंकाल पेशी तंतु के संकुचन के समय सार्कोमियर (sarcomere) में क्या होता है?",
    ),
    options: [
      bi("The A band shortens, while the I band keeps its length", "A-बैंड छोटा हो जाता है, जबकि I-बैंड की लंबाई वही रहती है"),
      bi("The A band and the I band both become longer", "A-बैंड और I-बैंड दोनों लंबे हो जाते हैं"),
      bi("The A band keeps its length, while the I band shortens", "A-बैंड की लंबाई वही रहती है, जबकि I-बैंड छोटा हो जाता है"),
      bi("The thick (myosin) filaments themselves become shorter", "मोटे (मायोसिन) तंतु स्वयं छोटे हो जाते हैं"),
    ],
    answer: 2,
    solution: bi(
      "During contraction the thin (actin) filaments slide over the thick (myosin) filaments towards the centre of the sarcomere; neither kind of filament changes its own length.\nThe A band is as long as the thick filaments, so its length stays the same.\nThe I band (thin filaments only) and the H zone (thick filaments only) become shorter as the overlap increases, and the Z lines move closer together.\nAnswer: the A band keeps its length while the I band shortens.",
      "संकुचन के समय पतले (ऐक्टिन) तंतु मोटे (मायोसिन) तंतुओं के ऊपर सार्कोमियर के केंद्र की ओर सरकते हैं; किसी भी तंतु की अपनी लंबाई नहीं बदलती।\nA-बैंड की लंबाई मोटे तंतुओं की लंबाई के बराबर होती है, अतः यह वही रहती है।\nअतिव्यापन बढ़ने से I-बैंड (केवल पतले तंतु) और H-क्षेत्र (केवल मोटे तंतु) छोटे हो जाते हैं, और Z-रेखाएँ पास-पास आ जाती हैं।\nउत्तर: A-बैंड की लंबाई वही रहती है, जबकि I-बैंड छोटा हो जाता है।",
    ),
  }),
];

export const NEET_SAMPLE_QUESTIONS: MockQuestion[] = [...NEET_PHYSICS, ...NEET_CHEMISTRY, ...NEET_BOTANY, ...NEET_ZOOLOGY];
