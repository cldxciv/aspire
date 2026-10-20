import type { Program } from "@/lib/types";
import type { OverlayMap } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/programs.ts, keyed by program id.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// Programme / cohort brand names (Pinnacle, SSB-Alpha…) and exam names stay in Latin script.

export const programsHi: OverlayMap<Program> = {
  "prog-jee-neet-pinnacle-2027": {
    title: "JEE (Main और Advanced) / NEET Pinnacle 2027",
    classLevel: "कक्षा XI",
    cohortName: "SSB-Alpha (दो-वर्षीय व्यापक)",
    shortDescription: "कक्षा 11 में प्रवेश करने वाले विद्यार्थियों के लिए दो-वर्षीय एकीकृत प्रोग्राम।",
    description:
      "कक्षा 11 में प्रवेश करने वाले विद्यार्थियों के लिए तैयार किया गया। यह NCERT CBSE/HP स्टेट बोर्ड के पाठ्यक्रम को उच्च-स्तरीय IITian तर्क और NEET के लिए NCERT की पंक्ति-दर-पंक्ति महारत के साथ जोड़ता है — स्कूल के तनाव के बिना।",
    targetAudience: "कक्षा 11 में प्रवेश करने वाले विद्यार्थी (कक्षा 10 → 11)।",
    highlights: ["सत्र में 35 विद्यार्थियों का छोटा समूह", "शाम को आवासीय IITian के साथ 1:1 डेस्क"],
    deliveryMode: "ऑफ़लाइन कक्षा",
    duration: "2 वर्ष",
  },
  "prog-class-12-intensive": {
    title: "कक्षा 11 → 12 गहन तैयारी (JEE / NEET 2026)",
    classLevel: "कक्षा XII",
    cohortName: "SSB-Beta (एक-वर्षीय गहन)",
    shortDescription: "कक्षा 12 के विद्यार्थियों के लिए बोर्ड परीक्षाओं के साथ तालमेल वाला एक-वर्षीय गहन प्रोग्राम।",
    description:
      "कक्षा 12 के विद्यार्थियों के लिए बोर्ड परीक्षाओं के साथ तालमेल वाली तेज़ तैयारी। साप्ताहिक NTA-पैटर्न CBT, अध्याय-वार PYQ अभ्यास और आवासीय शंका-समाधान डेस्क, ताकि स्कूल और प्रवेश परीक्षा की तैयारी आपस में कभी न टकराएँ।",
    targetAudience: "कक्षा 12 के विद्यार्थी।",
    highlights: ["साप्ताहिक NTA-पैटर्न CBT हॉल", "अध्याय-वार PYQ अभ्यास डेस्क"],
    deliveryMode: "ऑफ़लाइन कक्षा",
    duration: "1 वर्ष",
  },
  "prog-dropper-special": {
    title: "कक्षा 12 उत्तीर्ण ड्रॉपर विशेष (लक्ष्य 2026)",
    classLevel: "कक्षा 12 उत्तीर्ण (ड्रॉपर)",
    cohortName: "रिपीटर आवासीय (11 महीने)",
    shortDescription: "आवासीय अनुशासन के साथ पूरे दिन का रिपीटर प्रोग्राम।",
    description:
      "कक्षा 12 उत्तीर्ण विद्यार्थियों के लिए पूरे दिन की आवासीय दिनचर्या। पहले सप्ताह में कमियों की पहचान के लिए डायग्नोस्टिक आकलन, फिर प्रतिदिन 8 संपर्क घंटे और रात 11:30 बजे तक मेंटर की देखरेख में स्व-अध्ययन पॉड।",
    targetAudience: "कक्षा 12 उत्तीर्ण विद्यार्थी (ड्रॉपर / रिपीटर)।",
    highlights: ["पूरे दिन का रिपीटर समूह", "निगरानी वाले रात्रि अध्ययन पॉड"],
    deliveryMode: "आवासीय कक्षा",
    duration: "11 महीने",
  },
  "prog-junior-foundation": {
    title: "कक्षा 8-10 जूनियर फ़ाउंडेशन (Olympiad / NTSE)",
    classLevel: "कक्षा VIII–X",
    cohortName: "जूनियर फ़ाउंडेशन (स्कूल के बाद)",
    shortDescription: "कक्षा 8 से 10 के विद्यार्थियों के लिए स्कूल के समय के बाद अवधारणा-प्रथम फ़ाउंडेशन।",
    description:
      "कक्षा 8 से 10 के लिए अवधारणा-प्रथम गणित और विज्ञान, जो जिज्ञासा और Olympiad-शैली के तर्क पर आधारित है, ताकि कक्षा 11 की छलांग कभी खड़ी चट्टान जैसी न लगे।",
    targetAudience: "कक्षा 8, 9 और 10 के विद्यार्थी।",
    highlights: ["Olympiad तर्कशक्ति कार्यशाला", "स्कूल के बाद मेंटर डेस्क"],
    deliveryMode: "ऑफ़लाइन कक्षा",
    duration: "1 वर्ष",
  },
};
