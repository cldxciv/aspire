import type { Messages } from "../types";

/**
 * Namespace "resources" — Hindi. MACHINE DRAFT (D-028): needs native review before launch
 * (docs/hindi-review-register.md, "PAGES-B"). Brand and exam names stay in Latin script.
 */
const resources: Messages<"resources"> = {
  meta: {
    title: "संसाधन",
    description:
      "Aspire IIT & Medical की ओर से IIT JEE, NEET और फ़ाउंडेशन के विद्यार्थियों के लिए पढ़ाई का मार्गदर्शन, परीक्षा की तैयारी पर लेख और प्रवेश से जुड़ी सहायता।",
  },
  hero: {
    eyebrow: "विद्यार्थियों और परिवारों के लिए",
    title: "अगले कदम के लिए संसाधन",
    highlight: "अगले कदम",
    crumb: "संसाधन",
    lead: "पढ़ाई का मार्गदर्शन, परीक्षाओं की जानकारी और प्रवेश से जुड़े आम प्रश्नों के उत्तर।",
    articles: "लेख पढ़ें",
  },
  latest: {
    eyebrow: "सबसे नया लेख",
    category: "श्रेणी",
    published: "प्रकाशित",
    read: "यह लेख पढ़ें",
  },
  types: {
    title: "जो चाहिए, वह यहाँ पाएँ",
    description: "तैयारी के हर चरण में विद्यार्थियों और परिवारों के लिए मार्गदर्शन।",
  },
  categories: {
    study: {
      title: "पढ़ाई का मार्गदर्शन",
      description: "पढ़ाई की योजनाएँ, रिवीज़न का मार्गदर्शन और परीक्षा की तैयारी पर लेख।",
      countOne: "नीचे {count} लेख",
      countMany: "नीचे {count} लेख",
      comingSoon: "जल्द आ रहा है",
      read: "लेख पढ़ें",
      ask: "पढ़ाई से जुड़ा प्रश्न पूछें",
    },
    practice: {
      title: "अभ्यास और टेस्ट",
      description: "यदि Aspire अपना टेस्ट प्लेटफ़ॉर्म जोड़ता है, तो ऑनलाइन अभ्यास और टेस्ट के लिंक यहाँ दिए जाएँगे।",
      action: "स्टूडेंट पोर्टल",
    },
    downloads: {
      title: "प्रॉस्पेक्टस और डाउनलोड",
      description: "प्लानर, पिछले वर्षों के प्रश्नपत्र और प्रॉस्पेक्टस। Aspire की स्वीकृति के बाद फ़ाइलें जोड़ी जाएँगी।",
      note: "जल्द उपलब्ध",
      action: "डाउनलोड देखें",
    },
    prospectus: {
      title: "प्रॉस्पेक्टस",
      description: "Aspire की स्वीकृति के बाद नया प्रॉस्पेक्टस यहाँ उपलब्ध होगा।",
      action: "जानकारी का अनुरोध करें",
    },
    faqs: {
      title: "अक्सर पूछे जाने वाले प्रश्न",
      description: "प्रवेश, प्रोग्राम, छात्रवृत्ति और केंद्रों से जुड़ी जानकारी।",
      action: "प्रवेश से जुड़े प्रश्न पढ़ें",
    },
  },
  downloads: {
    eyebrow: "डाउनलोड",
    title: "प्लानर, प्रश्नपत्र और प्रॉस्पेक्टस",
    description: "ये फ़ाइलें अभी डाउनलोड के लिए उपलब्ध नहीं हैं। Aspire की स्वीकृति के बाद इन्हें यहाँ जोड़ा जाएगा।",
    showAll: "सभी {count} डाउनलोड देखें",
    showFewer: "कम डाउनलोड दिखाएँ",
  },
  downloadCard: {
    subjects: "विषय",
    audience: "किसके लिए",
    pages: "पृष्ठ",
    size: "आकार",
    availableSoon: "जल्द उपलब्ध",
  },
  articles: {
    eyebrow: "लेख",
    title: "पढ़ाई का मार्गदर्शन और अपडेट",
    description: "Aspire की समीक्षा के बाद लेख यहाँ प्रकाशित किए जाते हैं।",
    emptyTitle: "अभी कोई लेख प्रकाशित नहीं हुआ है",
    emptyDescription:
      "Aspire की शैक्षणिक टीम की स्वीकृति के बाद पढ़ाई का मार्गदर्शन और परीक्षाओं से जुड़े अपडेट यहाँ दिखाई देंगे।",
    emptyAction: "प्रश्न पूछें",
  },
  results: {
    eyebrow: "पिछले परिणाम",
    title: "पिछले बैचों के परिणाम",
    description:
      "Aspire के पिछले JEE और NEET बैचों के परिणाम सत्यापन के बाद परिणाम पेज पर प्रकाशित होते हैं — किसी छात्र का नाम और परिणाम कार्ड केवल छात्र या अभिभावक की सहमति से।",
  },
  cta: {
    title: "समझ नहीं आ रहा कि कहाँ से शुरू करें?",
    description: "सही प्रोग्राम और तैयारी की योजना के बारे में शैक्षणिक टीम से बात करें।",
    enquire: "पूछताछ करें",
    contact: "Aspire से संपर्क करें",
  },
  card: {
    read: "पढ़ें",
    categories: {
      "study-guidance": "पढ़ाई का मार्गदर्शन",
      "exam-updates": "परीक्षा अपडेट",
      news: "समाचार",
      admissions: "प्रवेश",
    },
    months: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  },
  article: {
    notFoundTitle: "लेख नहीं मिला",
    published: "प्रकाशित: {date}",
    by: "लेखक: {author}",
    allResources: "सभी संसाधन",
    ctaTitle: "किसी प्रोग्राम के बारे में प्रश्न हैं?",
    ctaBody: "विद्यार्थी के लिए सही प्रोग्राम और अगले कदमों के बारे में प्रवेश टीम से बात करें।",
    enquire: "पूछताछ करें",
    explorePrograms: "प्रोग्राम देखें",
    related: "संबंधित संसाधन",
  },
};

export default resources;
