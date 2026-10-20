import type { Messages } from "../types";

/**
 * Namespace "programs" — Hindi (owner: PAGES-A). MACHINE DRAFT (D-028): needs native review
 * before launch (docs/hindi-review-register.md, "PAGES-A"). Exam names stay Latin.
 */
const programs: Messages<"programs"> = {
  tracks: {
    JEE: "IIT JEE",
    NEET: "NEET",
    Foundation: "फ़ाउंडेशन",
    Integrated: "एकीकृत",
  },
  list: {
    metaTitle: "प्रोग्राम",
    metaDescription:
      "Aspire के IIT JEE, NEET, फ़ाउंडेशन और एकीकृत स्कूल प्रोग्राम देखें, और सही राह के बारे में किसी शैक्षणिक काउंसलर से बात करें।",
    crumb: "प्रोग्राम",
    heroTitle: "आपके लक्ष्यों के अनुसार बने प्रोग्राम",
    heroLead: "कोर्स के विकल्प देखें और प्रोग्राम चुनने से पहले किसी शैक्षणिक काउंसलर से बात करें।",
    directoryTitle: "अपनी राह चुनें",
    directoryLead: "परीक्षा के अनुसार छाँटें, फिर किसी प्रोग्राम को खोलकर उसकी कक्षा, समय-सारणी और मुख्य बातें देखें।",
    demoNotice:
      "‘डेमो’ चिह्नित प्रोग्राम Aspire की डेमो साइट से लिए गए नमूना विवरण हैं। कक्षा, अवधि, समय और बैच के आकार का Aspire द्वारा सत्यापन बाकी है।",
    emptyTitle: "प्रोग्राम का विवरण तैयार किया जा रहा है",
    emptyBody: "Aspire की पुष्टि के बाद प्रोग्राम यहाँ दिखाए जाएँगे। तब तक कोई काउंसलर आपकी मदद कर सकता है।",
    emptyCta: "काउंसलर से बात करें",
    availabilityNotice:
      "कोर्स की उपलब्धता, कक्षाएँ, बैच की तारीखें, फ़ीस और पढ़ाई का तरीका Aspire तय करता है। प्रोग्राम चुनने से पहले कृपया किसी काउंसलर से ताज़ा जानकारी ले लें।",
    tracksTitle: "तैयारी के ट्रैक",
    tracksLead: "प्रोग्राम उस परीक्षा के अनुसार समूहों में रखे गए हैं जिसकी वे तैयारी कराते हैं।",
    pageGuideTitle: "हर प्रोग्राम पेज पर क्या मिलता है",
    pageGuideLead: "किसी प्रोग्राम को खोलकर उसका विवरण देखें।",
    pageGuidePoints: {
      audience: "प्रोग्राम किसके लिए है और उसकी कक्षा",
      schedule: "अवधि, समय और बैच का विवरण, जहाँ पुष्टि हो चुकी है",
      highlights: "प्रोग्राम की मुख्य बातें",
      fees: "फ़ीस तभी, जब Aspire उसका सत्यापन कर ले — वरना काउंसलर उसकी पुष्टि करते हैं",
    },
    ctaTitle: "तय नहीं कर पा रहे कि कौन-सा प्रोग्राम सही है?",
    ctaBody: "विद्यार्थी के लक्ष्य, कक्षा और पसंदीदा केंद्र पर बात करने के लिए काउंसलिंग सत्र बुक करें।",
    ctaPrimary: "काउंसलिंग बुक करें",
    ctaSecondary: "Aspire से संपर्क करें",
  },
  directory: {
    filterLabel: "परीक्षा के अनुसार प्रोग्राम छाँटें",
    all: "सभी प्रोग्राम",
    showingOne: "1 प्रोग्राम दिखाया जा रहा है",
    showingMany: "{count} प्रोग्राम दिखाए जा रहे हैं",
    forTrack: "जो {track} की तैयारी कराते हैं",
    emptyTitle: "इस फ़िल्टर से कोई प्रोग्राम मेल नहीं खाता",
    emptyBody: "कोई दूसरी परीक्षा चुनें, या काउंसलर से पूछें कि विद्यार्थी के लिए कौन-सी राह सही है।",
    showAll: "सभी प्रोग्राम दिखाएँ",
  },
  card: {
    preparesFor: "तैयारी:",
    learnMore: "और जानें",
    enquire: "पूछताछ करें",
    enquireSuffix: "{title} के बारे में",
    facts: {
      class: "कक्षा",
      duration: "अवधि",
      dailyTeaching: "रोज़ की पढ़ाई",
      batchSize: "बैच का आकार",
    },
  },
  units: {
    hourOne: "{count} घंटा",
    hourMany: "{count} घंटे",
    minutes: "{count} मिनट",
    perDay: "{value} प्रतिदिन",
    upTo: "अधिकतम {count}",
    upToStudents: "अधिकतम {count} विद्यार्थी",
  },
  detail: {
    notFoundTitle: "प्रोग्राम नहीं मिला",
    enquire: "इस प्रोग्राम के बारे में पूछताछ करें",
    allPrograms: "सभी प्रोग्राम",
    draftTitle: "प्रोग्राम की जानकारी (ड्राफ़्ट)",
    draftBody:
      "यह विवरण अस्थायी है और Aspire की शैक्षणिक टीम द्वारा इसका सत्यापन बाकी है। कृपया विवरण की पुष्टि किसी काउंसलर से करें।",
    overview: "परिचय",
    audience: "यह किसके लिए है",
    facts: {
      classLevel: "कक्षा",
      cohort: "बैच / समूह",
      preparesFor: "तैयारी",
    },
    highlights: "प्रोग्राम की मुख्य बातें",
    highlightsLead: "इस कोर्स के विवरण के अनुसार प्रोग्राम में क्या शामिल है।",
    otherTitle: "अन्य प्रोग्राम",
    otherLead: "काउंसलर से बात करने से पहले विकल्पों की तुलना करें।",
    ctaTitle: "क्या आप {title} में रुचि रखते हैं?",
    ctaBody: "कुछ विवरण साझा करें, और Aspire की प्रवेश टीम बैच, केंद्र और आगे के कदमों के बारे में आपका मार्गदर्शन कर सकती है।",
    ctaPrimary: "पूछताछ करें",
    ctaSecondary: "Aspire से संपर्क करें",
    resultsCaption: "Aspire के पिछले बैचों के {exams} परिणाम, सभी प्रोग्रामों से",
  },
  schedule: {
    title: "समय-सारणी और फ़ीस",
    facts: {
      duration: "अवधि",
      deliveryMode: "पढ़ाई का तरीका",
      dailyContactHours: "रोज़ के संपर्क घंटे",
      doubtResolution: "शंका-समाधान",
      batchSize: "बैच का आकार",
      fees: "फ़ीस",
    },
    noneKnown: "इस प्रोग्राम की अवधि, समय, बैच का विवरण और फ़ीस Aspire की प्रवेश टीम अलग से बताती है।",
    withFees: "बैच की तारीखें और सीटों की उपलब्धता Aspire की प्रवेश टीम बताती है।",
    withoutFees: "फ़ीस, बैच की तारीखें और छात्रवृत्ति Aspire की प्रवेश टीम अलग से बताती है।",
    askCounsellor: "ताज़ा जानकारी के लिए किसी काउंसलर से पूछें।",
    cta: "काउंसलर से पूछें",
  },
};

export default programs;
