import { bi, same, sampleMcq, sampleNumerical } from "./builders";
import { JEE_MCQ_MARKING, JEE_NUMERICAL_MARKING, type MockQuestion } from "./types";

/**
 * "JEE Main sample" question bank: 45 ORIGINAL sample questions written for the Aspire demo
 * (15 Physics, 15 Chemistry, 15 Mathematics; in each subject 12 single-correct MCQs and 3
 * numerical-value questions). Not taken from NTA papers, coaching books or NCERT text.
 * status "placeholder" → visible only with showPlaceholderContent(), labelled Sample (D-032).
 * CONTENT-VERIFY re-solves every question; Hindi is a machine-assisted draft.
 */

const mcq = (input: Parameters<typeof sampleMcq>[2]) => sampleMcq("JEE_MAIN", JEE_MCQ_MARKING, input);
const num = (input: Parameters<typeof sampleNumerical>[2]) => sampleNumerical("JEE_MAIN", JEE_NUMERICAL_MARKING, input);

export const JEE_PHYSICS: MockQuestion[] = [
  mcq({
    id: "jee-p-01",
    subject: "physics",
    topic: "phy-kinematics",
    difficulty: "easy",
    stem: bi(
      "A ball is thrown vertically upward from the ground with a speed of 20 m/s. Taking g = 10 m/s², what is the maximum height reached by the ball?",
      "एक गेंद को धरातल से 20 m/s की चाल से ऊर्ध्वाधर ऊपर की ओर फेंका जाता है। g = 10 m/s² लेते हुए, गेंद द्वारा प्राप्त अधिकतम ऊँचाई कितनी है?",
    ),
    options: [same("10 m"), same("20 m"), same("30 m"), same("40 m")],
    answer: 1,
    solution: bi(
      "At the highest point the velocity becomes zero.\nUse v² = u² − 2gh with v = 0 and u = 20 m/s:\n0 = (20)² − 2 × 10 × h\nh = 400 / 20 = 20 m.",
      "उच्चतम बिंदु पर वेग शून्य हो जाता है।\nv² = u² − 2gh में v = 0 और u = 20 m/s रखने पर:\n0 = (20)² − 2 × 10 × h\nh = 400 / 20 = 20 m.",
    ),
  }),
  mcq({
    id: "jee-p-02",
    subject: "physics",
    topic: "phy-kinematics",
    difficulty: "medium",
    stem: bi(
      "A projectile is launched from level ground with a speed of 20 m/s at an angle of 30° above the horizontal. Taking g = 10 m/s² and ignoring air resistance, what is its horizontal range?",
      "एक प्रक्षेप्य को समतल धरातल से 20 m/s की चाल से क्षैतिज से 30° ऊपर के कोण पर प्रक्षेपित किया जाता है। g = 10 m/s² लें और वायु प्रतिरोध की उपेक्षा करें। इसकी क्षैतिज परास (range) कितनी है?",
    ),
    options: [same("20√3 m"), same("40 m"), same("20 m"), same("10√3 m")],
    answer: 0,
    solution: bi(
      "Horizontal range on level ground: R = u² sin 2θ / g.\nR = (20)² × sin 60° / 10\n= 400 × (√3/2) / 10\n= 20√3 m (about 34.6 m).",
      "समतल धरातल पर क्षैतिज परास: R = u² sin 2θ / g\nR = (20)² × sin 60° / 10\n= 400 × (√3/2) / 10\n= 20√3 m (लगभग 34.6 m)।",
    ),
  }),
  mcq({
    id: "jee-p-03",
    subject: "physics",
    topic: "phy-laws-of-motion",
    difficulty: "medium",
    stem: bi(
      "Two blocks of masses 2 kg and 3 kg are placed in contact on a smooth horizontal surface. A horizontal force of 10 N is applied to the 2 kg block, pushing both blocks. What force does the 2 kg block exert on the 3 kg block?",
      "2 kg और 3 kg द्रव्यमान के दो गुटके एक चिकनी क्षैतिज सतह पर एक-दूसरे के संपर्क में रखे हैं। 2 kg वाले गुटके पर 10 N का क्षैतिज बल लगाया जाता है जो दोनों गुटकों को धकेलता है। 2 kg वाला गुटका 3 kg वाले गुटके पर कितना बल लगाता है?",
    ),
    options: [same("4 N"), same("2 N"), same("10 N"), same("6 N")],
    answer: 3,
    solution: bi(
      "Both blocks move together, so the common acceleration is a = F / (m₁ + m₂) = 10 / (2 + 3) = 2 m/s².\nThe only horizontal force on the 3 kg block is the contact force N from the 2 kg block:\nN = m₂ × a = 3 × 2 = 6 N.",
      "दोनों गुटके साथ-साथ चलते हैं, अतः उभयनिष्ठ त्वरण a = F / (m₁ + m₂) = 10 / (2 + 3) = 2 m/s²।\n3 kg वाले गुटके पर एकमात्र क्षैतिज बल 2 kg वाले गुटके का संपर्क बल N है:\nN = m₂ × a = 3 × 2 = 6 N।",
    ),
  }),
  mcq({
    id: "jee-p-04",
    subject: "physics",
    topic: "phy-laws-of-motion",
    difficulty: "medium",
    stem: bi(
      "A 5 kg block rests on a rough horizontal floor. The coefficient of static friction between the block and the floor is 0.4. A horizontal force of 15 N is applied to the block. What is the friction force acting on the block? (g = 10 m/s²)",
      "5 kg का एक गुटका खुरदरे क्षैतिज फर्श पर रखा है। गुटके और फर्श के बीच स्थैतिक घर्षण गुणांक 0.4 है। गुटके पर 15 N का क्षैतिज बल लगाया जाता है। गुटके पर लगने वाला घर्षण बल कितना है? (g = 10 m/s²)",
    ),
    options: [same("20 N"), same("0 N"), same("15 N"), same("5 N")],
    answer: 2,
    solution: bi(
      "Limiting (maximum) static friction = μs × m × g = 0.4 × 5 × 10 = 20 N.\nThe applied force, 15 N, is less than 20 N, so the block stays at rest.\nStatic friction only balances the applied force, so f = 15 N (not the maximum value 20 N).",
      "सीमांत (अधिकतम) स्थैतिक घर्षण = μs × m × g = 0.4 × 5 × 10 = 20 N।\nलगाया गया बल 15 N, 20 N से कम है, इसलिए गुटका विराम में रहता है।\nस्थैतिक घर्षण केवल लगाए गए बल को संतुलित करता है, अतः f = 15 N (अधिकतम मान 20 N नहीं)।",
    ),
  }),
  mcq({
    id: "jee-p-05",
    subject: "physics",
    topic: "phy-work-energy",
    difficulty: "easy",
    stem: bi(
      "The speed of a 2 kg body increases from 2 m/s to 4 m/s. What is the work done by the net force on the body?",
      "2 kg के एक पिंड की चाल 2 m/s से बढ़कर 4 m/s हो जाती है। पिंड पर कुल (नेट) बल द्वारा किया गया कार्य कितना है?",
    ),
    options: [same("4 J"), same("12 J"), same("16 J"), same("24 J")],
    answer: 1,
    solution: bi(
      "Work–energy theorem: W(net) = change in kinetic energy = ½ m (v² − u²).\nW = ½ × 2 × (4² − 2²)\n= 1 × (16 − 4) = 12 J.",
      "कार्य–ऊर्जा प्रमेय: W(नेट) = गतिज ऊर्जा में परिवर्तन = ½ m (v² − u²)।\nW = ½ × 2 × (4² − 2²)\n= 1 × (16 − 4) = 12 J।",
    ),
  }),
  mcq({
    id: "jee-p-06",
    subject: "physics",
    topic: "phy-rotation",
    difficulty: "medium",
    stem: bi(
      "A solid sphere rolls without slipping on a horizontal surface. What fraction of its total kinetic energy is rotational?",
      "एक ठोस गोला क्षैतिज सतह पर बिना फिसले लुढ़क रहा है। इसकी कुल गतिज ऊर्जा का कितना भाग घूर्णी (rotational) है?",
    ),
    options: [same("2/5"), same("5/7"), same("2/7"), same("1/2")],
    answer: 2,
    solution: bi(
      "Rolling without slipping: v = ωR. For a solid sphere, I = (2/5) m R².\nTranslational KE = ½ m v².\nRotational KE = ½ I ω² = ½ × (2/5) m R² × (v/R)² = (1/5) m v².\nTotal KE = ½ m v² + (1/5) m v² = (7/10) m v².\nFraction = (1/5) ÷ (7/10) = 2/7.",
      "बिना फिसले लुढ़कना: v = ωR। ठोस गोले के लिए I = (2/5) m R²।\nस्थानांतरीय गतिज ऊर्जा = ½ m v²।\nघूर्णी गतिज ऊर्जा = ½ I ω² = ½ × (2/5) m R² × (v/R)² = (1/5) m v²।\nकुल गतिज ऊर्जा = ½ m v² + (1/5) m v² = (7/10) m v²।\nभाग = (1/5) ÷ (7/10) = 2/7।",
    ),
  }),
  mcq({
    id: "jee-p-07",
    subject: "physics",
    topic: "phy-gravitation",
    difficulty: "medium",
    stem: bi(
      "The acceleration due to gravity on the Earth's surface is g and the Earth's radius is R. What is the acceleration due to gravity at a height h = R/2 above the surface?",
      "पृथ्वी की सतह पर गुरुत्वीय त्वरण g है और पृथ्वी की त्रिज्या R है। सतह से h = R/2 ऊँचाई पर गुरुत्वीय त्वरण कितना होगा?",
    ),
    options: [same("g/2"), same("g/4"), same("2g/3"), same("4g/9")],
    answer: 3,
    solution: bi(
      "g′ = GM / (R + h)² and g = GM / R², so g′ = g × R² / (R + h)².\nWith h = R/2: R + h = 3R/2.\ng′ = g × R² / (9R²/4) = 4g/9.",
      "g′ = GM / (R + h)² तथा g = GM / R², अतः g′ = g × R² / (R + h)²।\nh = R/2 के लिए: R + h = 3R/2।\ng′ = g × R² / (9R²/4) = 4g/9।",
    ),
  }),
  mcq({
    id: "jee-p-08",
    subject: "physics",
    topic: "phy-thermodynamics",
    difficulty: "medium",
    stem: bi(
      "One mole of an ideal gas expands isothermally and reversibly at 300 K from a volume of 10 L to 20 L. How much work is done by the gas? (R = 8.3 J mol⁻¹ K⁻¹, ln 2 = 0.693)",
      "एक मोल आदर्श गैस 300 K पर समतापीय और उत्क्रमणीय रूप से 10 L से 20 L आयतन तक प्रसारित होती है। गैस द्वारा किया गया कार्य कितना है? (R = 8.3 J mol⁻¹ K⁻¹, ln 2 = 0.693)",
    ),
    options: [same("≈ 1726 J"), same("≈ 2490 J"), same("≈ 863 J"), bi("Zero", "शून्य")],
    answer: 0,
    solution: bi(
      "For a reversible isothermal process of an ideal gas: W = nRT ln(V₂/V₁).\nW = 1 × 8.3 × 300 × ln(20/10)\n= 2490 × 0.693\n≈ 1726 J (positive: work is done by the gas).",
      "आदर्श गैस के उत्क्रमणीय समतापीय प्रक्रम के लिए: W = nRT ln(V₂/V₁)।\nW = 1 × 8.3 × 300 × ln(20/10)\n= 2490 × 0.693\n≈ 1726 J (धनात्मक: कार्य गैस द्वारा किया गया)।",
    ),
  }),
  mcq({
    id: "jee-p-09",
    subject: "physics",
    topic: "phy-oscillations",
    difficulty: "easy",
    stem: bi(
      "A simple pendulum has a time period of 2 s. If its length is made 4 times the original length (at the same place), what is the new time period?",
      "एक सरल लोलक का आवर्तकाल 2 s है। यदि उसी स्थान पर इसकी लंबाई मूल लंबाई की 4 गुनी कर दी जाए, तो नया आवर्तकाल क्या होगा?",
    ),
    options: [same("1 s"), same("2√2 s"), same("4 s"), same("8 s")],
    answer: 2,
    solution: bi(
      "T = 2π √(L/g), so T ∝ √L when g is unchanged.\nT′ / T = √(4L / L) = 2.\nT′ = 2 × 2 s = 4 s.",
      "T = 2π √(L/g), अतः g अपरिवर्तित रहने पर T ∝ √L।\nT′ / T = √(4L / L) = 2।\nT′ = 2 × 2 s = 4 s।",
    ),
  }),
  mcq({
    id: "jee-p-10",
    subject: "physics",
    topic: "phy-electrostatics",
    difficulty: "medium",
    stem: bi(
      "Point charges of +2 μC and +8 μC are placed 30 cm apart. At what distance from the +2 μC charge, on the line joining them, is the electric field zero?",
      "+2 μC और +8 μC के बिंदु आवेश एक-दूसरे से 30 cm की दूरी पर रखे हैं। इन्हें मिलाने वाली रेखा पर +2 μC आवेश से कितनी दूरी पर विद्युत क्षेत्र शून्य होगा?",
    ),
    options: [same("10 cm"), same("15 cm"), same("20 cm"), same("6 cm")],
    answer: 0,
    solution: bi(
      "Both charges are positive, so the fields cancel at a point between them. Let it be x cm from the +2 μC charge.\nk(2 μC) / x² = k(8 μC) / (30 − x)²\n(30 − x)² / x² = 4, so (30 − x) / x = 2\n30 − x = 2x, so x = 10 cm.",
      "दोनों आवेश धनात्मक हैं, अतः क्षेत्र इनके बीच किसी बिंदु पर निरस्त होंगे। माना यह बिंदु +2 μC आवेश से x cm दूर है।\nk(2 μC) / x² = k(8 μC) / (30 − x)²\n(30 − x)² / x² = 4, अतः (30 − x) / x = 2\n30 − x = 2x, अतः x = 10 cm।",
    ),
  }),
  mcq({
    id: "jee-p-11",
    subject: "physics",
    topic: "phy-current",
    difficulty: "medium",
    stem: bi(
      "A cell of emf 12 V and internal resistance 1 Ω is connected to an external resistor of 5 Ω. What is the potential difference across the terminals of the cell?",
      "12 V विद्युत वाहक बल (emf) और 1 Ω आंतरिक प्रतिरोध वाला एक सेल 5 Ω के बाहरी प्रतिरोधक से जोड़ा गया है। सेल के टर्मिनलों के बीच विभवांतर कितना है?",
    ),
    options: [same("12 V"), same("8 V"), same("2 V"), same("10 V")],
    answer: 3,
    solution: bi(
      "Current I = E / (R + r) = 12 / (5 + 1) = 2 A.\nTerminal voltage V = E − I r = 12 − 2 × 1 = 10 V.\nCheck: V = I R = 2 × 5 = 10 V.",
      "धारा I = E / (R + r) = 12 / (5 + 1) = 2 A।\nटर्मिनल विभवांतर V = E − I r = 12 − 2 × 1 = 10 V।\nजाँच: V = I R = 2 × 5 = 10 V।",
    ),
  }),
  mcq({
    id: "jee-p-12",
    subject: "physics",
    topic: "phy-magnetism",
    difficulty: "medium",
    stem: bi(
      "A proton and an alpha particle enter a uniform magnetic field with the same speed, moving perpendicular to the field. What is the ratio of the radii of their circular paths, r(proton) : r(alpha)?",
      "एक प्रोटॉन और एक ऐल्फा कण समान चाल से एकसमान चुंबकीय क्षेत्र में क्षेत्र के लंबवत प्रवेश करते हैं। उनके वृत्तीय पथों की त्रिज्याओं का अनुपात r(प्रोटॉन) : r(ऐल्फा) क्या है?",
    ),
    options: [same("1 : 1"), same("1 : 2"), same("2 : 1"), same("1 : 4")],
    answer: 1,
    solution: bi(
      "Radius of the circular path: r = m v / (q B).\nProton: mass m, charge e, so r(p) = m v / (e B).\nAlpha particle: mass 4m, charge 2e, so r(α) = 4m v / (2e B) = 2 m v / (e B).\nr(p) : r(α) = 1 : 2.",
      "वृत्तीय पथ की त्रिज्या: r = m v / (q B)।\nप्रोटॉन: द्रव्यमान m, आवेश e, अतः r(p) = m v / (e B)।\nऐल्फा कण: द्रव्यमान 4m, आवेश 2e, अतः r(α) = 4m v / (2e B) = 2 m v / (e B)।\nr(p) : r(α) = 1 : 2।",
    ),
  }),
  num({
    id: "jee-p-13",
    subject: "physics",
    topic: "phy-optics",
    difficulty: "medium",
    stem: bi(
      "An object is placed 30 cm in front of a thin convex lens of focal length 20 cm. Find the distance of the image from the lens (in cm).",
      "20 cm फोकस दूरी वाले एक पतले उत्तल लेंस के सामने 30 cm की दूरी पर एक वस्तु रखी है। लेंस से प्रतिबिंब की दूरी (cm में) ज्ञात कीजिए।",
    ),
    answer: 60,
    unit: same("cm"),
    solution: bi(
      "Lens formula: 1/v − 1/u = 1/f, with the sign convention u = −30 cm and f = +20 cm.\n1/v = 1/f + 1/u = 1/20 − 1/30 = (3 − 2)/60 = 1/60.\nv = +60 cm: a real image 60 cm from the lens, on the other side.\nAnswer: 60.",
      "लेंस सूत्र: 1/v − 1/u = 1/f, चिह्न परिपाटी से u = −30 cm और f = +20 cm।\n1/v = 1/f + 1/u = 1/20 − 1/30 = (3 − 2)/60 = 1/60।\nv = +60 cm: लेंस के दूसरी ओर 60 cm पर वास्तविक प्रतिबिंब।\nउत्तर: 60।",
    ),
  }),
  num({
    id: "jee-p-14",
    subject: "physics",
    topic: "phy-modern",
    difficulty: "easy",
    stem: bi(
      "Light whose photons each have an energy of 5.0 eV falls on a metal surface with a work function of 2.0 eV. Find the stopping potential (in volts).",
      "5.0 eV ऊर्जा वाले फोटॉनों का प्रकाश 2.0 eV कार्य-फलन वाली धातु की सतह पर पड़ता है। निरोधी विभव (stopping potential) वोल्ट में ज्ञात कीजिए।",
    ),
    answer: 3,
    unit: same("V"),
    solution: bi(
      "Einstein's photoelectric equation: K(max) = hν − φ = 5.0 eV − 2.0 eV = 3.0 eV.\nThe stopping potential V₀ satisfies e V₀ = K(max), so V₀ = 3 V.\nAnswer: 3.",
      "आइंस्टीन का प्रकाश-विद्युत समीकरण: K(max) = hν − φ = 5.0 eV − 2.0 eV = 3.0 eV।\nनिरोधी विभव V₀ के लिए e V₀ = K(max), अतः V₀ = 3 V।\nउत्तर: 3।",
    ),
  }),
  num({
    id: "jee-p-15",
    subject: "physics",
    topic: "phy-current",
    difficulty: "medium",
    stem: bi(
      "Resistors of 2 Ω, 3 Ω and 6 Ω are connected in parallel. This combination is connected in series with a 4 Ω resistor across an ideal 10 V battery. Find the current drawn from the battery (in amperes).",
      "2 Ω, 3 Ω और 6 Ω के प्रतिरोधक समांतर क्रम में जुड़े हैं। यह संयोजन 4 Ω के एक प्रतिरोधक के साथ श्रेणी में एक आदर्श 10 V बैटरी से जोड़ा गया है। बैटरी से ली गई धारा (ऐम्पियर में) ज्ञात कीजिए।",
    ),
    answer: 2,
    unit: same("A"),
    solution: bi(
      "Parallel part: 1/Rp = 1/2 + 1/3 + 1/6 = (3 + 2 + 1)/6 = 1, so Rp = 1 Ω.\nTotal resistance = 1 + 4 = 5 Ω.\nCurrent I = V / R = 10 / 5 = 2 A.\nAnswer: 2.",
      "समांतर भाग: 1/Rp = 1/2 + 1/3 + 1/6 = (3 + 2 + 1)/6 = 1, अतः Rp = 1 Ω।\nकुल प्रतिरोध = 1 + 4 = 5 Ω।\nधारा I = V / R = 10 / 5 = 2 A।\nउत्तर: 2।",
    ),
  }),
];

export const JEE_CHEMISTRY: MockQuestion[] = [
  mcq({
    id: "jee-c-01",
    subject: "chemistry",
    topic: "chem-mole",
    difficulty: "easy",
    stem: bi(
      "How many moles of oxygen atoms are present in 88 g of carbon dioxide? (C = 12, O = 16)",
      "88 g कार्बन डाइऑक्साइड में ऑक्सीजन परमाणुओं के कितने मोल उपस्थित हैं? (C = 12, O = 16)",
    ),
    options: [same("2 mol"), same("8 mol"), same("1 mol"), same("4 mol")],
    answer: 3,
    solution: bi(
      "Molar mass of CO₂ = 12 + 2 × 16 = 44 g/mol.\nMoles of CO₂ = 88 / 44 = 2 mol.\nEach CO₂ molecule contains 2 O atoms, so moles of O atoms = 2 × 2 = 4 mol.",
      "CO₂ का मोलर द्रव्यमान = 12 + 2 × 16 = 44 g/mol।\nCO₂ के मोल = 88 / 44 = 2 mol।\nप्रत्येक CO₂ अणु में 2 O परमाणु होते हैं, अतः O परमाणुओं के मोल = 2 × 2 = 4 mol।",
    ),
  }),
  mcq({
    id: "jee-c-02",
    subject: "chemistry",
    topic: "chem-atomic",
    difficulty: "medium",
    stem: bi(
      "Which of the following sets of quantum numbers is NOT possible for an electron?",
      "निम्नलिखित में से क्वांटम संख्याओं का कौन-सा समुच्चय किसी इलेक्ट्रॉन के लिए संभव नहीं है?",
    ),
    options: [
      same("n = 3, l = 2, m = −2, s = +½"),
      same("n = 4, l = 0, m = 0, s = +½"),
      same("n = 2, l = 2, m = 0, s = −½"),
      same("n = 3, l = 1, m = +1, s = −½"),
    ],
    answer: 2,
    solution: bi(
      "Rules: l can be 0 to (n − 1); m can be −l to +l; s = +½ or −½.\n(A) n = 3 allows l = 2, and m = −2 is allowed (a 3d electron).\n(B) n = 4, l = 0, m = 0 is allowed (a 4s electron).\n(C) n = 2 allows only l = 0 or 1, so l = 2 is impossible.\n(D) n = 3, l = 1, m = +1 is allowed (a 3p electron).\nAnswer: (C) n = 2, l = 2, m = 0, s = −½.",
      "नियम: l का मान 0 से (n − 1) तक; m का मान −l से +l तक; s = +½ या −½।\n(A) n = 3 के लिए l = 2 संभव है, और m = −2 भी संभव है (3d इलेक्ट्रॉन)।\n(B) n = 4, l = 0, m = 0 संभव है (4s इलेक्ट्रॉन)।\n(C) n = 2 के लिए केवल l = 0 या 1 संभव है, अतः l = 2 असंभव है।\n(D) n = 3, l = 1, m = +1 संभव है (3p इलेक्ट्रॉन)।\nउत्तर: (C) n = 2, l = 2, m = 0, s = −½।",
    ),
  }),
  mcq({
    id: "jee-c-03",
    subject: "chemistry",
    topic: "chem-bonding",
    difficulty: "easy",
    stem: bi("Which of the following molecules is linear?", "निम्नलिखित में से कौन-सा अणु रैखिक (linear) है?"),
    options: [same("H₂O"), same("SO₂"), same("NH₃"), bi("BeCl₂ (in the gas phase)", "BeCl₂ (गैस प्रावस्था में)")],
    answer: 3,
    solution: bi(
      "Use VSEPR: count bond pairs and lone pairs on the central atom.\nH₂O: 2 bond pairs + 2 lone pairs → bent.\nBeCl₂: 2 bond pairs, no lone pair (sp) → linear, 180°.\nNH₃: 3 bond pairs + 1 lone pair → trigonal pyramidal.\nSO₂: S has 2 σ-bonds + 1 lone pair → bent.\nAnswer: BeCl₂.",
      "VSEPR सिद्धांत: केंद्रीय परमाणु पर आबंधी युग्म और एकाकी युग्म गिनें।\nH₂O: 2 आबंधी युग्म + 2 एकाकी युग्म → बंकित (bent)।\nBeCl₂: 2 आबंधी युग्म, कोई एकाकी युग्म नहीं (sp) → रैखिक, 180°।\nNH₃: 3 आबंधी युग्म + 1 एकाकी युग्म → त्रिकोणीय पिरामिडी।\nSO₂: S पर 2 σ-आबंध + 1 एकाकी युग्म → बंकित।\nउत्तर: BeCl₂।",
    ),
  }),
  mcq({
    id: "jee-c-04",
    subject: "chemistry",
    topic: "chem-bonding",
    difficulty: "medium",
    stem: bi(
      "According to molecular orbital theory, what is the bond order of the superoxide ion, O₂⁻?",
      "आण्विक कक्षक सिद्धांत के अनुसार सुपरऑक्साइड आयन O₂⁻ का आबंध क्रम (bond order) क्या है?",
    ),
    options: [same("1.5"), same("2"), same("2.5"), same("1")],
    answer: 0,
    solution: bi(
      "O₂ has 16 electrons, so O₂⁻ has 17.\nO₂⁻: σ1s² σ*1s² σ2s² σ*2s² σ2pz² π2px² π2py² π*2px² π*2py¹\nBonding electrons Nb = 10; antibonding electrons Na = 7.\nBond order = (Nb − Na) / 2 = (10 − 7) / 2 = 1.5.",
      "O₂ में 16 इलेक्ट्रॉन होते हैं, अतः O₂⁻ में 17।\nO₂⁻: σ1s² σ*1s² σ2s² σ*2s² σ2pz² π2px² π2py² π*2px² π*2py¹\nआबंधी इलेक्ट्रॉन Nb = 10; प्रतिआबंधी इलेक्ट्रॉन Na = 7।\nआबंध क्रम = (Nb − Na) / 2 = (10 − 7) / 2 = 1.5।",
    ),
  }),
  mcq({
    id: "jee-c-05",
    subject: "chemistry",
    topic: "chem-periodic",
    difficulty: "medium",
    stem: bi(
      "Which of the following elements has the highest first ionisation enthalpy?",
      "निम्नलिखित में से किस तत्व की प्रथम आयनन एन्थैल्पी सबसे अधिक है?",
    ),
    options: [same("N"), same("O"), same("C"), same("B")],
    answer: 0,
    solution: bi(
      "Across period 2 the first ionisation enthalpy generally increases: B < C < N.\nOxygen is an exception: in O (2p⁴) one 2p orbital holds a pair of electrons, and their mutual repulsion makes one easier to remove. N (2p³) has a stable, half-filled 2p subshell.\nOrder: N > O > C > B. Answer: N.",
      "आवर्त 2 में बाएँ से दाएँ प्रथम आयनन एन्थैल्पी सामान्यतः बढ़ती है: B < C < N।\nऑक्सीजन अपवाद है: O (2p⁴) में एक 2p कक्षक में इलेक्ट्रॉन युग्म होता है, जिनके परस्पर प्रतिकर्षण से एक इलेक्ट्रॉन निकालना आसान हो जाता है। N (2p³) का 2p उपकोश अर्ध-पूरित और स्थायी है।\nक्रम: N > O > C > B। उत्तर: N।",
    ),
  }),
  mcq({
    id: "jee-c-06",
    subject: "chemistry",
    topic: "chem-thermo",
    difficulty: "medium",
    stem: bi(
      "For a reaction, ΔH = −40 kJ mol⁻¹ and ΔS = −100 J K⁻¹ mol⁻¹. Assuming both are independent of temperature, above which temperature does the reaction stop being spontaneous?",
      "एक अभिक्रिया के लिए ΔH = −40 kJ mol⁻¹ और ΔS = −100 J K⁻¹ mol⁻¹ है। दोनों को ताप से स्वतंत्र मानते हुए, किस ताप से ऊपर अभिक्रिया स्वतःप्रवर्तित (spontaneous) नहीं रहती?",
    ),
    options: [same("300 K"), same("400 K"), same("40 K"), same("4000 K")],
    answer: 1,
    solution: bi(
      "ΔG = ΔH − TΔS. The reaction is spontaneous while ΔG < 0.\nAt the boundary ΔG = 0: T = ΔH / ΔS = (−40 000 J mol⁻¹) / (−100 J K⁻¹ mol⁻¹) = 400 K.\nAbove 400 K the positive term −TΔS outweighs ΔH, so ΔG > 0 and the reaction is not spontaneous.",
      "ΔG = ΔH − TΔS। जब तक ΔG < 0 है, अभिक्रिया स्वतःप्रवर्तित है।\nसीमा पर ΔG = 0: T = ΔH / ΔS = (−40 000 J mol⁻¹) / (−100 J K⁻¹ mol⁻¹) = 400 K।\n400 K से ऊपर धनात्मक पद −TΔS, ΔH से बड़ा हो जाता है, अतः ΔG > 0 और अभिक्रिया स्वतःप्रवर्तित नहीं रहती।",
    ),
  }),
  mcq({
    id: "jee-c-07",
    subject: "chemistry",
    topic: "chem-equilibrium",
    difficulty: "easy",
    stem: bi(
      "What is the pH of a 0.001 M aqueous solution of NaOH at 25 °C?",
      "25 °C पर NaOH के 0.001 M जलीय विलयन का pH क्या है?",
    ),
    options: [same("3"), same("10"), same("11"), same("12")],
    answer: 2,
    solution: bi(
      "NaOH is a strong base and ionises completely, so [OH⁻] = 0.001 M = 10⁻³ M.\npOH = −log(10⁻³) = 3.\nAt 25 °C, pH + pOH = 14, so pH = 14 − 3 = 11.",
      "NaOH प्रबल क्षार है और पूर्णतः आयनित होता है, अतः [OH⁻] = 0.001 M = 10⁻³ M।\npOH = −log(10⁻³) = 3।\n25 °C पर pH + pOH = 14, अतः pH = 14 − 3 = 11।",
    ),
  }),
  mcq({
    id: "jee-c-08",
    subject: "chemistry",
    topic: "chem-redox",
    difficulty: "easy",
    stem: bi(
      "Find the standard emf of the cell Zn | Zn²⁺ (1 M) || Cu²⁺ (1 M) | Cu. Given: E°(Zn²⁺/Zn) = −0.76 V and E°(Cu²⁺/Cu) = +0.34 V.",
      "सेल Zn | Zn²⁺ (1 M) || Cu²⁺ (1 M) | Cu का मानक emf ज्ञात कीजिए। दिया है: E°(Zn²⁺/Zn) = −0.76 V और E°(Cu²⁺/Cu) = +0.34 V।",
    ),
    options: [same("0.42 V"), same("0.76 V"), same("−1.10 V"), same("1.10 V")],
    answer: 3,
    solution: bi(
      "E°(cell) = E°(cathode) − E°(anode).\nCathode (right side, reduction): Cu²⁺/Cu, +0.34 V. Anode (left side, oxidation): Zn²⁺/Zn, −0.76 V.\nE°(cell) = 0.34 − (−0.76) = 1.10 V.",
      "E°(सेल) = E°(कैथोड) − E°(ऐनोड)।\nकैथोड (दायाँ भाग, अपचयन): Cu²⁺/Cu, +0.34 V। ऐनोड (बायाँ भाग, ऑक्सीकरण): Zn²⁺/Zn, −0.76 V।\nE°(सेल) = 0.34 − (−0.76) = 1.10 V।",
    ),
  }),
  mcq({
    id: "jee-c-09",
    subject: "chemistry",
    topic: "chem-kinetics",
    difficulty: "medium",
    stem: bi(
      "A first-order reaction has a half-life of 20 minutes. How long will it take for the reaction to be 75% complete?",
      "एक प्रथम कोटि की अभिक्रिया की अर्ध-आयु 20 मिनट है। अभिक्रिया को 75% पूर्ण होने में कितना समय लगेगा?",
    ),
    options: [bi("30 min", "30 मिनट"), bi("40 min", "40 मिनट"), bi("60 min", "60 मिनट"), bi("80 min", "80 मिनट")],
    answer: 1,
    solution: bi(
      "For a first-order reaction the half-life does not depend on concentration.\nAfter one half-life 50% of the reactant remains; after two half-lives 25% remains, i.e. the reaction is 75% complete.\nTime = 2 × 20 = 40 minutes.",
      "प्रथम कोटि की अभिक्रिया की अर्ध-आयु सांद्रता पर निर्भर नहीं करती।\nएक अर्ध-आयु के बाद 50% अभिकारक बचता है; दो अर्ध-आयु के बाद 25% बचता है, अर्थात अभिक्रिया 75% पूर्ण।\nसमय = 2 × 20 = 40 मिनट।",
    ),
  }),
  mcq({
    id: "jee-c-10",
    subject: "chemistry",
    topic: "chem-coordination",
    difficulty: "easy",
    stem: bi(
      "What is the oxidation state of iron in K₄[Fe(CN)₆]?",
      "K₄[Fe(CN)₆] में आयरन (लोहे) की ऑक्सीकरण अवस्था क्या है?",
    ),
    options: [same("+2"), same("+3"), same("+4"), same("0")],
    answer: 0,
    solution: bi(
      "K has oxidation state +1 and the cyanide ion CN⁻ has charge −1. Let Fe be x.\n4(+1) + x + 6(−1) = 0\n4 + x − 6 = 0, so x = +2.",
      "K की ऑक्सीकरण अवस्था +1 है और सायनाइड आयन CN⁻ का आवेश −1 है। माना Fe की ऑक्सीकरण अवस्था x है।\n4(+1) + x + 6(−1) = 0\n4 + x − 6 = 0, अतः x = +2।",
    ),
  }),
  mcq({
    id: "jee-c-11",
    subject: "chemistry",
    topic: "chem-goc",
    difficulty: "easy",
    stem: bi("Which of the following carbocations is the most stable?", "निम्नलिखित में से कौन-सा कार्बधनायन (carbocation) सबसे अधिक स्थायी है?"),
    options: [same("CH₃⁺"), same("(CH₃)₂CH⁺"), same("(CH₃)₃C⁺"), same("CH₃CH₂⁺")],
    answer: 2,
    solution: bi(
      "Alkyl groups stabilise a carbocation through the +I (inductive) effect and hyperconjugation.\nThe more alkyl groups on the positive carbon, the more stable the ion.\nOrder: (CH₃)₃C⁺ (tertiary) > (CH₃)₂CH⁺ (secondary) > CH₃CH₂⁺ (primary) > CH₃⁺.",
      "ऐल्किल समूह +I (प्रेरणिक) प्रभाव और अतिसंयुग्मन (hyperconjugation) द्वारा कार्बधनायन को स्थायी बनाते हैं।\nधनात्मक कार्बन पर जितने अधिक ऐल्किल समूह, आयन उतना अधिक स्थायी।\nक्रम: (CH₃)₃C⁺ (तृतीयक) > (CH₃)₂CH⁺ (द्वितीयक) > CH₃CH₂⁺ (प्राथमिक) > CH₃⁺।",
    ),
  }),
  mcq({
    id: "jee-c-12",
    subject: "chemistry",
    topic: "chem-hydrocarbons",
    difficulty: "medium",
    stem: bi(
      "What is the main product when HBr adds to propene (CH₃–CH=CH₂) in the absence of peroxides?",
      "परॉक्साइड की अनुपस्थिति में प्रोपीन (CH₃–CH=CH₂) पर HBr के योग से मुख्य उत्पाद क्या बनता है?",
    ),
    options: [bi("1-Bromopropane", "1-ब्रोमोप्रोपेन"), bi("2-Bromopropane", "2-ब्रोमोप्रोपेन"), bi("1,2-Dibromopropane", "1,2-डाइब्रोमोप्रोपेन"), bi("Propane", "प्रोपेन")],
    answer: 1,
    solution: bi(
      "Without peroxides the addition is electrophilic and follows Markovnikov's rule.\nH⁺ adds to the terminal CH₂ carbon, giving the more stable secondary carbocation CH₃–CH⁺–CH₃.\nBr⁻ then bonds to that carbon: CH₃–CHBr–CH₃, i.e. 2-bromopropane.",
      "परॉक्साइड के बिना योग इलेक्ट्रॉनस्नेही होता है और मार्कोनीकॉफ नियम का पालन करता है।\nH⁺ सिरे वाले CH₂ कार्बन से जुड़ता है, जिससे अधिक स्थायी द्वितीयक कार्बधनायन CH₃–CH⁺–CH₃ बनता है।\nफिर Br⁻ उसी कार्बन से जुड़ता है: CH₃–CHBr–CH₃, अर्थात 2-ब्रोमोप्रोपेन।",
    ),
  }),
  num({
    id: "jee-c-13",
    subject: "chemistry",
    topic: "chem-mole",
    difficulty: "medium",
    stem: bi(
      "What volume of 0.2 M NaOH solution (in mL) is needed to completely neutralise 50 mL of 0.1 M H₂SO₄?",
      "50 mL 0.1 M H₂SO₄ को पूर्णतः उदासीन करने के लिए 0.2 M NaOH विलयन का कितना आयतन (mL में) चाहिए?",
    ),
    answer: 50,
    unit: same("mL"),
    solution: bi(
      "Each H₂SO₄ gives 2 H⁺ ions.\nMoles of H⁺ = 2 × 0.1 mol L⁻¹ × 0.050 L = 0.010 mol.\nMoles of NaOH needed = 0.010 mol (NaOH gives one OH⁻ each).\nVolume = 0.010 / 0.2 = 0.050 L = 50 mL.\nAnswer: 50.",
      "प्रत्येक H₂SO₄ से 2 H⁺ आयन मिलते हैं।\nH⁺ के मोल = 2 × 0.1 mol L⁻¹ × 0.050 L = 0.010 mol।\nआवश्यक NaOH के मोल = 0.010 mol (प्रत्येक NaOH एक OH⁻ देता है)।\nआयतन = 0.010 / 0.2 = 0.050 L = 50 mL।\nउत्तर: 50।",
    ),
  }),
  num({
    id: "jee-c-14",
    subject: "chemistry",
    topic: "chem-solutions",
    difficulty: "easy",
    stem: bi(
      "What mass of NaOH (molar mass 40 g mol⁻¹), in grams, is needed to prepare 250 mL of a 0.4 M solution?",
      "0.4 M के 250 mL विलयन को बनाने के लिए NaOH (मोलर द्रव्यमान 40 g mol⁻¹) का कितना द्रव्यमान (ग्राम में) चाहिए?",
    ),
    answer: 4,
    unit: same("g"),
    solution: bi(
      "Moles needed = molarity × volume in litres = 0.4 × 0.250 = 0.10 mol.\nMass = moles × molar mass = 0.10 × 40 = 4 g.\nAnswer: 4.",
      "आवश्यक मोल = मोलरता × आयतन (लीटर में) = 0.4 × 0.250 = 0.10 mol।\nद्रव्यमान = मोल × मोलर द्रव्यमान = 0.10 × 40 = 4 g।\nउत्तर: 4।",
    ),
  }),
  num({
    id: "jee-c-15",
    subject: "chemistry",
    topic: "chem-atomic",
    difficulty: "medium",
    stem: bi(
      "How many unpaired electrons are present in a gaseous Fe³⁺ ion? (Atomic number of Fe = 26)",
      "गैसीय Fe³⁺ आयन में कितने अयुग्मित इलेक्ट्रॉन होते हैं? (Fe का परमाणु क्रमांक = 26)",
    ),
    answer: 5,
    solution: bi(
      "Fe (Z = 26): [Ar] 3d⁶ 4s².\nTo form Fe³⁺, the two 4s electrons are removed first, then one 3d electron: [Ar] 3d⁵.\nBy Hund's rule the five 3d electrons occupy the five d orbitals singly, so there are 5 unpaired electrons.\nAnswer: 5.",
      "Fe (Z = 26): [Ar] 3d⁶ 4s²।\nFe³⁺ बनाने में पहले दोनों 4s इलेक्ट्रॉन निकलते हैं, फिर एक 3d इलेक्ट्रॉन: [Ar] 3d⁵।\nहुंड के नियम से पाँचों 3d इलेक्ट्रॉन पाँच d कक्षकों में अकेले-अकेले रहते हैं, अतः 5 अयुग्मित इलेक्ट्रॉन।\nउत्तर: 5।",
    ),
  }),
];

export const JEE_MATHS: MockQuestion[] = [
  mcq({
    id: "jee-m-01",
    subject: "maths",
    topic: "math-quadratic",
    difficulty: "easy",
    stem: bi("If α and β are the roots of x² − 5x + 6 = 0, find α² + β².", "यदि α और β समीकरण x² − 5x + 6 = 0 के मूल हैं, तो α² + β² ज्ञात कीजिए।"),
    options: [same("11"), same("25"), same("13"), same("37")],
    answer: 2,
    solution: bi(
      "Sum of roots: α + β = 5. Product of roots: αβ = 6.\nα² + β² = (α + β)² − 2αβ = 25 − 12 = 13.\nCheck: the roots are 2 and 3, and 4 + 9 = 13.",
      "मूलों का योग: α + β = 5। मूलों का गुणनफल: αβ = 6।\nα² + β² = (α + β)² − 2αβ = 25 − 12 = 13।\nजाँच: मूल 2 और 3 हैं, तथा 4 + 9 = 13।",
    ),
  }),
  mcq({
    id: "jee-m-02",
    subject: "maths",
    topic: "math-sequences",
    difficulty: "easy",
    stem: bi("Find the sum of the first 20 terms of the arithmetic progression 3, 7, 11, 15, …", "समांतर श्रेणी 3, 7, 11, 15, … के प्रथम 20 पदों का योग ज्ञात कीजिए।"),
    options: [same("800"), same("820"), same("840"), same("780")],
    answer: 1,
    solution: bi(
      "First term a = 3, common difference d = 4, n = 20.\nSₙ = (n/2) [2a + (n − 1)d] = 10 × [6 + 19 × 4] = 10 × 82 = 820.",
      "प्रथम पद a = 3, सार्व अंतर d = 4, n = 20।\nSₙ = (n/2) [2a + (n − 1)d] = 10 × [6 + 19 × 4] = 10 × 82 = 820।",
    ),
  }),
  mcq({
    id: "jee-m-03",
    subject: "maths",
    topic: "math-trigonometry",
    difficulty: "easy",
    stem: bi("If tan θ = 3/4 and θ lies in the first quadrant, find sin 2θ.", "यदि tan θ = 3/4 है और θ प्रथम चतुर्थांश में है, तो sin 2θ ज्ञात कीजिए।"),
    options: [same("24/25"), same("7/25"), same("12/25"), same("3/5")],
    answer: 0,
    solution: bi(
      "Take a right triangle with opposite side 3, adjacent side 4 and hypotenuse √(9 + 16) = 5.\nIn the first quadrant: sin θ = 3/5, cos θ = 4/5.\nsin 2θ = 2 sin θ cos θ = 2 × (3/5) × (4/5) = 24/25.",
      "एक समकोण त्रिभुज लें जिसमें सम्मुख भुजा 3, आसन्न भुजा 4 और कर्ण √(9 + 16) = 5 हो।\nप्रथम चतुर्थांश में: sin θ = 3/5, cos θ = 4/5।\nsin 2θ = 2 sin θ cos θ = 2 × (3/5) × (4/5) = 24/25।",
    ),
  }),
  mcq({
    id: "jee-m-04",
    subject: "maths",
    topic: "math-complex",
    difficulty: "easy",
    stem: bi("Find the modulus of the complex number (3 + 4i) / (1 − i).", "सम्मिश्र संख्या (3 + 4i) / (1 − i) का मापांक (modulus) ज्ञात कीजिए।"),
    options: [same("7/√2"), same("5√2"), same("5"), same("5/√2")],
    answer: 3,
    solution: bi(
      "For complex numbers, |z₁ / z₂| = |z₁| / |z₂|.\n|3 + 4i| = √(9 + 16) = 5 and |1 − i| = √(1 + 1) = √2.\nModulus = 5/√2 (about 3.54).",
      "सम्मिश्र संख्याओं के लिए |z₁ / z₂| = |z₁| / |z₂|।\n|3 + 4i| = √(9 + 16) = 5 तथा |1 − i| = √(1 + 1) = √2।\nमापांक = 5/√2 (लगभग 3.54)।",
    ),
  }),
  mcq({
    id: "jee-m-05",
    subject: "maths",
    topic: "math-pnc",
    difficulty: "easy",
    stem: bi("In how many distinct ways can the letters of the word LEVEL be arranged?", "शब्द LEVEL के अक्षरों को कितने भिन्न प्रकार से व्यवस्थित किया जा सकता है?"),
    options: [same("120"), same("60"), same("30"), same("20")],
    answer: 2,
    solution: bi(
      "LEVEL has 5 letters: L twice, E twice and V once.\nNumber of distinct arrangements = 5! / (2! × 2!) = 120 / 4 = 30.",
      "LEVEL में 5 अक्षर हैं: L दो बार, E दो बार और V एक बार।\nभिन्न व्यवस्थाओं की संख्या = 5! / (2! × 2!) = 120 / 4 = 30।",
    ),
  }),
  mcq({
    id: "jee-m-06",
    subject: "maths",
    topic: "math-binomial",
    difficulty: "easy",
    stem: bi("Find the coefficient of x³ in the expansion of (1 + 2x)⁵.", "(1 + 2x)⁵ के प्रसार में x³ का गुणांक ज्ञात कीजिए।"),
    options: [same("40"), same("80"), same("10"), same("160")],
    answer: 1,
    solution: bi(
      "General term: T(r+1) = C(5, r) × (2x)ʳ.\nFor x³ put r = 3: C(5, 3) × 2³ = 10 × 8 = 80.",
      "व्यापक पद: T(r+1) = C(5, r) × (2x)ʳ।\nx³ के लिए r = 3 रखें: C(5, 3) × 2³ = 10 × 8 = 80।",
    ),
  }),
  mcq({
    id: "jee-m-07",
    subject: "maths",
    topic: "math-coordinate",
    difficulty: "easy",
    stem: bi("Find the perpendicular distance of the point (2, 3) from the line 3x + 4y − 8 = 0.", "बिंदु (2, 3) की रेखा 3x + 4y − 8 = 0 से लंबवत दूरी ज्ञात कीजिए।"),
    options: [same("2"), same("10"), same("18/5"), same("4")],
    answer: 0,
    solution: bi(
      "Distance = |a x₁ + b y₁ + c| / √(a² + b²).\n= |3(2) + 4(3) − 8| / √(9 + 16)\n= |6 + 12 − 8| / 5 = 10 / 5 = 2.",
      "दूरी = |a x₁ + b y₁ + c| / √(a² + b²)।\n= |3(2) + 4(3) − 8| / √(9 + 16)\n= |6 + 12 − 8| / 5 = 10 / 5 = 2।",
    ),
  }),
  mcq({
    id: "jee-m-08",
    subject: "maths",
    topic: "math-coordinate",
    difficulty: "medium",
    stem: bi("Find the centre and the radius of the circle x² + y² − 4x + 6y − 3 = 0.", "वृत्त x² + y² − 4x + 6y − 3 = 0 का केंद्र और त्रिज्या ज्ञात कीजिए।"),
    options: [
      bi("Centre (2, −3), radius 4", "केंद्र (2, −3), त्रिज्या 4"),
      bi("Centre (−2, 3), radius 4", "केंद्र (−2, 3), त्रिज्या 4"),
      bi("Centre (2, −3), radius 16", "केंद्र (2, −3), त्रिज्या 16"),
      bi("Centre (−2, 3), radius √10", "केंद्र (−2, 3), त्रिज्या √10"),
    ],
    answer: 0,
    solution: bi(
      "Compare with x² + y² + 2gx + 2fy + c = 0: g = −2, f = 3, c = −3.\nCentre = (−g, −f) = (2, −3).\nRadius = √(g² + f² − c) = √(4 + 9 + 3) = √16 = 4.\nOr complete the squares: (x − 2)² + (y + 3)² = 16.",
      "x² + y² + 2gx + 2fy + c = 0 से तुलना करने पर: g = −2, f = 3, c = −3।\nकेंद्र = (−g, −f) = (2, −3)।\nत्रिज्या = √(g² + f² − c) = √(4 + 9 + 3) = √16 = 4।\nया वर्ग पूरा करें: (x − 2)² + (y + 3)² = 16।",
    ),
  }),
  mcq({
    id: "jee-m-09",
    subject: "maths",
    topic: "math-limits",
    difficulty: "medium",
    stem: bi("Evaluate the limit of (1 − cos 2x) / x² as x → 0.", "x → 0 पर (1 − cos 2x) / x² की सीमा ज्ञात कीजिए।"),
    options: [same("0"), same("1"), same("2"), same("4")],
    answer: 2,
    solution: bi(
      "Use the identity 1 − cos 2x = 2 sin² x.\nLimit = lim (x → 0) 2 sin² x / x² = 2 × (lim (x → 0) sin x / x)² = 2 × 1² = 2.",
      "सर्वसमिका 1 − cos 2x = 2 sin² x का प्रयोग करें।\nसीमा = lim (x → 0) 2 sin² x / x² = 2 × (lim (x → 0) sin x / x)² = 2 × 1² = 2।",
    ),
  }),
  mcq({
    id: "jee-m-10",
    subject: "maths",
    topic: "math-derivatives",
    difficulty: "medium",
    stem: bi("Find the local maximum value of f(x) = x³ − 3x + 2.", "f(x) = x³ − 3x + 2 का स्थानीय उच्चिष्ठ मान ज्ञात कीजिए।"),
    options: [same("0"), same("2"), same("6"), same("4")],
    answer: 3,
    solution: bi(
      "f′(x) = 3x² − 3 = 0 gives x = 1 or x = −1.\nf″(x) = 6x. f″(−1) = −6 < 0, so x = −1 is a point of local maximum.\nf(−1) = (−1)³ − 3(−1) + 2 = −1 + 3 + 2 = 4.\n(f″(1) = 6 > 0, so x = 1 gives the local minimum f(1) = 0.)",
      "f′(x) = 3x² − 3 = 0 से x = 1 या x = −1।\nf″(x) = 6x। f″(−1) = −6 < 0, अतः x = −1 स्थानीय उच्चिष्ठ का बिंदु है।\nf(−1) = (−1)³ − 3(−1) + 2 = −1 + 3 + 2 = 4।\n(f″(1) = 6 > 0, अतः x = 1 पर स्थानीय निम्निष्ठ f(1) = 0 है।)",
    ),
  }),
  mcq({
    id: "jee-m-11",
    subject: "maths",
    topic: "math-integrals",
    difficulty: "medium",
    stem: bi("Evaluate the definite integral of sin² x from x = 0 to x = π/2.", "x = 0 से x = π/2 तक sin² x का निश्चित समाकल ज्ञात कीजिए।"),
    options: [same("π/2"), same("π/4"), same("1"), same("π")],
    answer: 1,
    solution: bi(
      "Write sin² x = (1 − cos 2x) / 2.\nIntegral = [x/2 − (sin 2x)/4] evaluated from 0 to π/2\n= (π/4 − (sin π)/4) − (0 − 0) = π/4.",
      "sin² x = (1 − cos 2x) / 2 लिखें।\nसमाकल = [x/2 − (sin 2x)/4], 0 से π/2 तक\n= (π/4 − (sin π)/4) − (0 − 0) = π/4।",
    ),
  }),
  mcq({
    id: "jee-m-12",
    subject: "maths",
    topic: "math-probability",
    difficulty: "easy",
    stem: bi("Two fair dice are thrown together. What is the probability that the sum of the numbers shown is 8?", "दो अनभिनत पासे एक साथ फेंके जाते हैं। प्राप्त संख्याओं का योग 8 होने की प्रायिकता क्या है?"),
    options: [same("7/36"), same("1/6"), same("1/9"), same("5/36")],
    answer: 3,
    solution: bi(
      "Total equally likely outcomes = 6 × 6 = 36.\nOutcomes with sum 8: (2, 6), (3, 5), (4, 4), (5, 3), (6, 2), i.e. 5 outcomes.\nProbability = 5/36.",
      "कुल समसंभाव्य परिणाम = 6 × 6 = 36।\nयोग 8 वाले परिणाम: (2, 6), (3, 5), (4, 4), (5, 3), (6, 2), अर्थात 5 परिणाम।\nप्रायिकता = 5/36।",
    ),
  }),
  num({
    id: "jee-m-13",
    subject: "maths",
    topic: "math-matrices",
    difficulty: "easy",
    stem: bi(
      "Let A be the 2 × 2 matrix whose first row is (2, 1) and second row is (3, 4). Find the value of det(2A).",
      "माना A एक 2 × 2 आव्यूह है जिसकी पहली पंक्ति (2, 1) और दूसरी पंक्ति (3, 4) है। det(2A) का मान ज्ञात कीजिए।",
    ),
    answer: 20,
    solution: bi(
      "det A = 2 × 4 − 1 × 3 = 5.\nFor an n × n matrix, det(kA) = kⁿ det A. Here n = 2, so det(2A) = 2² × 5 = 20.\nCheck: 2A has rows (4, 2) and (6, 8); 4 × 8 − 2 × 6 = 32 − 12 = 20.\nAnswer: 20.",
      "det A = 2 × 4 − 1 × 3 = 5।\nn × n आव्यूह के लिए det(kA) = kⁿ det A। यहाँ n = 2, अतः det(2A) = 2² × 5 = 20।\nजाँच: 2A की पंक्तियाँ (4, 2) और (6, 8) हैं; 4 × 8 − 2 × 6 = 32 − 12 = 20।\nउत्तर: 20।",
    ),
  }),
  num({
    id: "jee-m-14",
    subject: "maths",
    topic: "math-vectors",
    difficulty: "easy",
    stem: bi(
      "Find λ if the vectors a = 2î + λĵ + k̂ and b = î − 2ĵ + 4k̂ are perpendicular to each other.",
      "λ ज्ञात कीजिए यदि सदिश a = 2î + λĵ + k̂ और b = î − 2ĵ + 4k̂ परस्पर लंबवत हैं।",
    ),
    answer: 3,
    solution: bi(
      "Perpendicular vectors have a zero dot product.\na · b = (2)(1) + (λ)(−2) + (1)(4) = 6 − 2λ.\n6 − 2λ = 0, so λ = 3.\nAnswer: 3.",
      "लंबवत सदिशों का अदिश गुणनफल (dot product) शून्य होता है।\na · b = (2)(1) + (λ)(−2) + (1)(4) = 6 − 2λ।\n6 − 2λ = 0, अतः λ = 3।\nउत्तर: 3।",
    ),
  }),
  num({
    id: "jee-m-15",
    subject: "maths",
    topic: "math-differential-eq",
    difficulty: "medium",
    stem: bi(
      "If dy/dx = 2y and y = 3 when x = 0, find the value of y when x = ln 2.",
      "यदि dy/dx = 2y है और x = 0 पर y = 3 है, तो x = ln 2 पर y का मान ज्ञात कीजिए।",
    ),
    answer: 12,
    solution: bi(
      "Separate the variables: dy / y = 2 dx, so ln|y| = 2x + C and y = A e^(2x).\ny(0) = 3 gives A = 3, so y = 3 e^(2x).\ny(ln 2) = 3 e^(2 ln 2) = 3 × e^(ln 4) = 3 × 4 = 12.\nAnswer: 12.",
      "चरों को पृथक करें: dy / y = 2 dx, अतः ln|y| = 2x + C और y = A e^(2x)।\ny(0) = 3 से A = 3, अतः y = 3 e^(2x)।\ny(ln 2) = 3 e^(2 ln 2) = 3 × e^(ln 4) = 3 × 4 = 12।\nउत्तर: 12।",
    ),
  }),
];

export const JEE_MAIN_SAMPLE_QUESTIONS: MockQuestion[] = [...JEE_PHYSICS, ...JEE_CHEMISTRY, ...JEE_MATHS];
