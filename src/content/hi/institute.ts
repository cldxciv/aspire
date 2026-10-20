import type { DownloadItem, InstituteProfile } from "@/lib/types";
import type { OverlayMap, TextOverlay } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/institute.ts.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// Not overlaid: the institute name (brand), the founder's name / honorific /
// credentials, social links, milestone years, download ids / categories /
// pages / file sizes in MB. The founder message is attributed to a real person:
// its Hindi wording must be approved by him before launch (see the register).
// Lists are index-aligned with the English record; downloads are keyed by id.
export type InstituteOverlay = TextOverlay<Omit<InstituteProfile, "name" | "founder" | "socialLinks" | "downloads">> & {
  founder?: { role?: string };
};

export const instituteProfileHi: InstituteOverlay = {
  founder: { role: "संस्थापक एवं भौतिकी निदेशालय" },
  foundedIn: "शिमला",
  tagline: "IIT Roorkee के पूर्व छात्रों द्वारा स्थापित",
  summary:
    "शिमला में IITian द्वारा स्थापित Aspire, हिमाचल प्रदेश के हर ज़िले के महत्वाकांक्षी विद्यार्थियों को JEE Main, JEE Advanced, NEET और Olympiad परीक्षाओं की तैयारी कराता है — स्थायी आवासीय शिक्षकों और अनुशासित हॉस्टलों के साथ।",
  foundingStory:
    "दशकों तक JEE या NEET की गंभीर तैयारी का मतलब था 16 साल के बच्चे को कोटा या दिल्ली भेजना। Aspire की स्थापना 2013 में इसी समझौते को ख़त्म करने के लिए हुई: हिमाचल प्रदेश में एक आवासीय अकादमी, जहाँ पढ़ाई, हॉस्टल और टेस्ट — सब एक ही राष्ट्रीय मानक पर होते हैं — और जहाँ अभिभावक दो दिन नहीं, बस दो घंटे की दूरी पर होते हैं।",
  mission: {
    title: "पहाड़ छोड़े बिना, राष्ट्रीय स्तर की तैयारी तक समान पहुँच।",
    paragraphs: [
      "हर वरिष्ठ शिक्षक एक स्थायी आवासीय विद्वान है। यहाँ न बाहर से बुलाए गए अतिथि व्याख्याता हैं, न साल के बीच में बैच का हस्तांतरण, और न ही रटंत विद्या के कारख़ाने — बस सोच-समझकर, रोज़ाना प्रश्न हल करना, जब तक समझ स्वाभाविक न बन जाए।",
    ],
  },
  founderMessage: {
    headline: "प्रतियोगी परीक्षाओं में सफलता सामान्य स्लाइड-डेक या सप्ताहांत के अतिथि व्याख्याताओं से नहीं मिलती।",
    paragraphs: [
      "इसके लिए निरंतर, चौबीसों घंटे पढ़ाई में डूबे रहना ज़रूरी है। Aspire में हर वरिष्ठ शिक्षक एक स्थायी आवासीय विद्वान है, जो उच्च-स्तरीय प्रश्नों के पैटर्न को तब तक बारीकी से खोलकर समझाता है, जब तक समझ स्वाभाविक न बन जाए।",
      "हिमाचली परिवारों से हमारा वादा सरल है: कोटा जैसी ही कड़ी मेहनत, घर से दो घंटे की दूरी पर, और ऐसा वार्डन जो आपके बच्चे को नाम से जानता है।",
    ],
    attribution: "Er. Raman Sharma, संस्थापक एवं भौतिकी निदेशालय · B.Tech, IIT Roorkee",
  },
  approach: [
    {
      title: "35 विद्यार्थियों के माइक्रो-बैच",
      description:
        "हर बैच में अधिकतम 35 विद्यार्थी होते हैं (Dropper Apex और फ़ाउंडेशन बैच में 30)। इस सीमा का पालन विषय-प्रमुख करवाते हैं — कभी कोई अतिरिक्त (ओवरफ़्लो) बैच नहीं बनाया जाता।",
    },
    {
      title: "आवासीय शिक्षकों का मार्गदर्शन",
      description:
        "हर वरिष्ठ शिक्षक एक स्थायी आवासीय विद्वान है — ऐसे शिक्षक जो परिसर में ही रहते हैं, केवल लेक्चर के लिए बाहर से नहीं आते।",
    },
    {
      title: "प्रतिदिन 90 मिनट का शंका-समाधान क्लिनिक",
      description: "आवासीय IITian डेस्क पर प्रतिदिन 90 मिनट, शाम को 1:1 शंका-समाधान स्लॉट के साथ।",
    },
    {
      title: "प्रतिदिन उपस्थिति SMS",
      description:
        "उपस्थिति SMS, पाक्षिक CBT रिपोर्ट, 1:1 शंका-समाधान सत्रों का रिकॉर्ड और वार्डन की जानकारी अभिभावक पोर्टल पर प्रकाशित की जाती है; विषय-प्रमुख के साथ हर महीने अभिभावक समीक्षा कॉल तय की जाती है।",
    },
    {
      title: "शाम 7:30 बजे तक परिसर में शिक्षक",
      description:
        "हर Aspire परिसर में शाम 7:30 बजे तक आवासीय IITian और डॉक्टर मेंटर उपलब्ध रहते हैं, ताकि कोई भी शंका बिना उत्तर के घर न जाए।",
    },
  ],
  pedagogyPrinciples: [
    {
      title: "बाहर से बुलाए गए कोई शिक्षक नहीं",
      description:
        "हर वरिष्ठ शिक्षक पूर्णकालिक आवासीय विद्वान है, जो सप्ताह में छह दिन उपस्थित रहता है — सप्ताहांत का अतिथि व्याख्याता नहीं।",
    },
    {
      title: "शॉर्टकट से पहले अवधारणा",
      description:
        "फ़ॉर्मूला शीट से पहले भौतिक मॉडल और ज्यामितीय समझ आती है, ताकि हल नए प्रश्न-पैटर्न में भी काम आएँ।",
    },
    {
      title: "NTA जैसी ही परीक्षा",
      description:
        "हर दूसरे शनिवार एक कंप्यूटर-आधारित टेस्ट हर विद्यार्थी को एक सिम्युलेटेड अखिल-हिमाचल पर्सेंटाइल पर परखता है।",
    },
    {
      title: "असीमित शंका-समाधान क्लिनिक",
      description: "हर दिन शाम 4:00 से 7:30 बजे तक खुला मेंटर डेस्क। न टोकन व्यवस्था, न टीचिंग असिस्टेंट।",
    },
    {
      title: "अभिभावकों के लिए पारदर्शिता",
      description: "उपस्थिति, टेस्ट के अंक और हॉस्टल संबंधी टिप्पणियाँ उसी दिन अभिभावक पोर्टल पर अपडेट हो जाती हैं।",
    },
  ],
  milestones: [
    {
      title: "न्यू शिमला में पहली कक्षा शुरू",
      description: "Aspire की शुरुआत 28 विद्यार्थियों के एक JEE बैच और एक वादे के साथ हुई: कभी कोई अतिथि व्याख्याता नहीं।",
      tag: "स्थापना",
    },
    {
      title: "NEET विभाग और पहला आवासीय भवन",
      description:
        "AIIMS-प्रशिक्षित डॉक्टरों के नेतृत्व में प्री-मेडिकल शिक्षक जुड़े; शिमला परिसर से 50 मीटर की पैदल दूरी पर पहली निगरानी वाली हॉस्टल विंग शुरू हुई।",
    },
    {
      title: "हमीरपुर में दूसरा परिसर",
      description: "HPTU के पास हमीरपुर केंद्रीय हब ने ऊना, बिलासपुर और कांगड़ा के परिवारों तक वही आवासीय शिक्षक मॉडल पहुँचाया।",
      tag: "हमीरपुर",
    },
    {
      // tag "BOH" (test acronym) stays English.
      title: "Brain of Himachal छात्रवृत्ति परीक्षा की शुरुआत",
      description:
        "हिमाचल के विद्यार्थियों के लिए राज्य-स्तरीय डायग्नोस्टिक और छात्रवृत्ति परीक्षा। छात्रवृत्ति की शर्तों की पुष्टि Aspire द्वारा की जानी है।",
    },
    {
      title: "धर्मशाला और कुल्लू घाटी केंद्र",
      description: "धर्मशाला की कांगड़ा घाटी विंग और कुल्लू घाटी आवासीय केंद्र के साथ चार परिसरों का नेटवर्क पूरा हुआ।",
      tag: "कांगड़ा · कुल्लू",
    },
    {
      title: "स्टूडेंट पोर्टल",
      description: "Aspire ने CBT पोर्टल शुरू किया, जिसमें अभिभावकों के लिए उपस्थिति और अंकों की ट्रैकिंग थी।",
    },
  ],
};

/**
 * Download cards, keyed by download id. `category` is a filter key (the
 * admissions page selects "Brochure" / "BOH Paper") and is never overlaid —
 * use downloadCategoriesHi for its label.
 */
export const downloadsHi: OverlayMap<DownloadItem> = {
  "dl-revision-planner": {
    title: "NEET और JEE दैनिक घंटा-दर-घंटा रिवीज़न प्लानर",
    description: "अंतराल पर दोहराव (spaced-repetition) के चक्रों से बर्नआउट से बचाव।",
    subjects: "सभी विषय",
    audience: "XI-XII और ड्रॉपर",
  },
  "dl-ncert-weightage-radar": {
    title: "कक्षा-वार NCERT वेटेज रडार (2026 संस्करण)",
    description:
      "भौतिकी, रसायन विज्ञान, जीवविज्ञान और गणित का हर अध्याय, 10 वर्षों की NTA आवृत्ति और प्रति अध्ययन-घंटा प्रश्नों की संख्या के आधार पर क्रमबद्ध…",
  },
  "dl-12-month-schedule": {
    title: "12 महीने की सूक्ष्म-विषयवार दैनिक समय-सारिणी",
    description: "NEET और JEE दैनिक घंटा-दर-घंटा रिवीज़न प्लानर। अंतराल पर दोहराव के चक्रों से बर्नआउट से बचाव।",
    subjects: "NEET और JEE",
    audience: "कक्षा 11/12 और ड्रॉपर",
  },
  "dl-2026-master-planner": {
    title: "2026 दैनिक मास्टर प्लानर",
    description: "दिन-प्रतिदिन का पाठ्यक्रम",
  },
  "dl-boh-class-10": {
    title: "कक्षा 10 BOH ब्लूप्रिंट और 2024 का प्रश्नपत्र",
    description: "भौतिकी (20 प्रश्न), रसायन विज्ञान (20 प्रश्न), गणित (30 प्रश्न), मानसिक योग्यता (30 प्रश्न)",
    subjects: "सभी विषय",
  },
  "dl-high-yield-matrix": {
    title: "विषयवार हाई-यील्ड अध्याय मैट्रिक्स",
    description: "उन टियर-1 अध्यायों को रेखांकित करता है जिनसे कुल अंकों का 64% आता है।",
    subjects: "PCM और PCB",
  },
  "dl-decadal-trend-matrix": {
    title: "दस-वर्षीय वेटेज और ट्रेंड मैट्रिक्स",
    description: "विषयवार हाई-यील्ड अध्याय मैट्रिक्स। उन टियर-1 अध्यायों को रेखांकित करता है जिनसे कुल अंकों का 64% आता है।",
    subjects: "PCM और PCB",
    audience: "कक्षा 11/12 और ड्रॉपर",
  },
  "dl-decadal-weightage-radar": {
    title: "दस-वर्षीय वेटेज रडार",
    description: "2015-2025 के रुझान",
  },
  "dl-boh-neet-wing": {
    title: "कक्षा 11 और 12 मेडिकल (NEET विंग)",
    description: "NCERT प्राणीविज्ञान, वनस्पतिविज्ञान, भौतिक रसायन, यांत्रिकी",
    subjects: "सभी विषय",
  },
  "dl-pyq-compendium": {
    title: "सत्यापित PYQ डायग्नोस्टिक संकलन",
    description: "हाथ से हल की गई उत्तर-पुस्तिकाएँ, जो समझाती हैं कि 80% विद्यार्थी नेगेटिव अंक क्यों खोते हैं — आंशिक-अंक वाले…",
    audience: "XI-XII और ड्रॉपर",
  },
  "dl-5-year-past-papers": {
    title: "5 वर्षों के पिछले प्रश्नपत्र और IITian हल",
    description: "सत्यापित PYQ डायग्नोस्टिक संकलन।",
    audience: "कक्षा 12 और ड्रॉपर",
  },
  "dl-5-year-solved-papers": {
    title: "5 वर्षों के हल किए गए प्रश्नपत्र",
    description: "चरण-दर-चरण हल",
  },
  "dl-boh-jee-wing": {
    title: "कक्षा 11 और 12 नॉन-मेडिकल (JEE विंग)",
    description: "कलन, सदिश, विद्युतचुंबकत्व, भौतिक/कार्बनिक रसायन",
    subjects: "सभी विषय",
  },
  "dl-core-concept-assessment": {
    title: "10 प्रश्नों का मूल अवधारणा आकलन",
    description:
      "स्थानिक तर्क, कार्बनिक अभिक्रियाओं के क्रम और सदिश यांत्रिकी का मूल्यांकन करके आपकी वर्तमान रैंक-स्थिति का सटीक अनुमान…",
    subjects: "अभिरुचि और मूल अवधारणाएँ",
    size: "15 मिनट का टेस्ट",
  },
  "dl-diagnostic-quiz": {
    title: "राष्ट्रीय स्तर की डायग्नोस्टिक क्विज़",
    description: "10 प्रश्नों का मूल अवधारणा आकलन।",
    subjects: "अभिरुचि और मूल अवधारणाएँ",
    audience: "कक्षा 11/12",
    size: "15 मिनट का टेस्ट",
  },
  "dl-boh-junior-talent": {
    title: "कक्षा 7, 8 और 9 (जूनियर टैलेंट)",
    description: "विज्ञान, गणित, तार्किक क्षमता, स्थानिक पहेलियाँ",
    subjects: "सभी विषय",
  },
  "dl-physics-formula-vault": {
    title: "भौतिकी फ़ॉर्मूला संग्रह: यांत्रिकी से आधुनिक भौतिकी तक",
    description: "शंका-समाधान डेस्क से एक-पंक्ति के व्युत्पत्ति संकेत के साथ JEE / NEET भौतिकी का हर फ़ॉर्मूला…",
    subjects: "भौतिकी",
    audience: "कक्षा 11/12 और ड्रॉपर",
  },
  "dl-organic-dpp": {
    title: "कार्बनिक रसायन DPP सेट: क्रियाविधियाँ, सप्ताह 1–4",
    description: "Reaction Roadmap से दैनिक अभ्यास प्रश्न: SN1/SN2, E1/E2, NGP और पुनर्विन्यास, समयबद्ध…",
    subjects: "रसायन विज्ञान",
    audience: "कक्षा 12 और ड्रॉपर",
  },
  "dl-prospectus-2027": {
    title: "Aspire 2027 विवरणिका और शुल्क-सूची",
    description: "चारों परिसर, हर बैच, पूरी शुल्क-सूची, हॉस्टल चार्टर और BOH छात्रवृत्ति श्रेणियाँ…",
    subjects: "सभी प्रोग्राम",
    audience: "कक्षा 8–12 और ड्रॉपर",
  },
  "dl-aits-jee-main-mock-01": {
    title: "AITS नमूना प्रश्नपत्र: JEE Main पैटर्न मॉक 01",
    description:
      "NTA JEE Main पैटर्न पर All Himachal Test Series का 90 प्रश्नों वाला पूरा मॉक, उत्तर-कुंजी और AI त्रुटि-विश्लेषण के साथ…",
    audience: "कक्षा 12 और ड्रॉपर",
  },
};

/** Display labels for DownloadItem.category (English value → Hindi label). */
export const downloadCategoriesHi: Readonly<Record<string, string>> = {
  "Vault Kit": "वॉल्ट किट",
  Notes: "नोट्स",
  Planner: "प्लानर",
  "BOH Paper": "BOH प्रश्नपत्र",
  Analysis: "विश्लेषण",
  PYQ: "PYQ",
  "Mock Test": "मॉक टेस्ट",
  "Formula Sheet": "फ़ॉर्मूला शीट",
  DPP: "DPP",
  Brochure: "विवरणिका",
};
