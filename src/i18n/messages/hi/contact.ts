import type { Messages } from "../types";

/**
 * Namespace "contact" — Hindi. MACHINE DRAFT (D-028): needs native review before launch
 * (docs/hindi-review-register.md, "PAGES-B"). Brand names (Aspire, WhatsApp) stay in Latin script.
 */
const contact: Messages<"contact"> = {
  meta: {
    title: "संपर्क",
    description:
      "प्रोग्राम, प्रवेश, छात्रवृत्ति या केंद्रों से जुड़े प्रश्नों के लिए Aspire IIT & Medical की टीम से संपर्क करें।",
  },
  hero: {
    title: "Aspire टीम से बात करें",
    crumb: "संपर्क",
    lead: "प्रोग्राम, प्रवेश, छात्रवृत्ति या नज़दीकी केंद्र के बारे में पूछें।",
  },
  form: {
    title: "पूछताछ भेजें",
    lead: "हमें बताएँ कि आप क्या जानना चाहते हैं और हम आपसे कैसे संपर्क करें।",
  },
  details: {
    title: "संपर्क विवरण",
    phone: "फ़ोन",
    whatsapp: "WhatsApp",
    whatsappHint: " (WhatsApp पर चैट करें)",
    email: "ईमेल",
    hours: "कार्यालय का समय",
    address: "पता",
    headCampus: "मुख्य परिसर · {name}",
    languages: "भाषाएँ",
    responseTimes: "जवाब मिलने का समय",
    fallback:
      "Aspire का आधिकारिक फ़ोन नंबर, ईमेल, पता और कार्यालय का समय सत्यापन के बाद यहाँ जोड़ा जाएगा। तब तक आप पूछताछ फ़ॉर्म का उपयोग कर सकते हैं — वह आपको साफ़-साफ़ बताएगा कि आपकी पूछताछ भेजी गई या नहीं।",
  },
  social: {
    title: "Aspire को फ़ॉलो करें",
  },
  help: {
    title: "प्रोग्राम चुनने में मदद चाहिए?",
    body: "विद्यार्थी के शैक्षणिक लक्ष्यों और उपलब्ध विकल्पों पर चर्चा के लिए काउंसलिंग सत्र का अनुरोध करें।",
    cta: "काउंसलिंग बुक करें",
  },
  centres: {
    title: "केंद्र खोज रहे हैं?",
    body: "स्थानों और उपलब्ध प्रोग्रामों के लिए केंद्रों की सूची देखें।",
    cta: "केंद्र देखें",
  },
  desks: {
    eyebrow: "परिसर",
    title: "परिसरों के प्रवेश डेस्क",
    description: "अपने सबसे नज़दीकी परिसर को कॉल या ईमेल करें, या वहाँ जाकर मिलें।",
    address: "पता",
    phone: "फ़ोन",
    email: "ईमेल",
    hours: "समय",
    campusDetails: "परिसर की जानकारी",
    campusDetailsFor: " ({name})",
    photoNote: "सांकेतिक स्टॉक फ़ोटो — ये Aspire के परिसर या कार्यालय नहीं हैं।",
  },
};

export default contact;
