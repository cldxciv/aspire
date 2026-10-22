import type { Messages } from "../types";

/**
 * Namespace "hostels" — Hindi. MACHINE DRAFT (D-028): needs native review before launch
 * (docs/hindi-review-register.md, "PAGES-B"). Brand and exam names stay in Latin script.
 */
const hostels: Messages<"hostels"> = {
  meta: {
    title: "हॉस्टल",
    description:
      "हिमाचल प्रदेश में Aspire IIT & Medical के परिसरों में बाहर से आने वाले विद्यार्थियों के लिए आवासीय और हॉस्टल विकल्प। जानकारी Aspire द्वारा सत्यापन के बाद प्रकाशित की जाती है।",
  },
  hero: {
    eyebrow: "घर से दूर रहकर पढ़ाई",
    title: "हॉस्टल और आवासीय जीवन",
    highlight: "आवासीय जीवन",
    crumb: "हॉस्टल",
    lead: "बाहर से आने वाले विद्यार्थियों के लिए देखरेख वाले आवासीय विकल्प, हर परिसर के अनुसार।",
    emptyLead: "अपने शहर से बाहर से Aspire में पढ़ने आने वाले विद्यार्थियों के लिए आवासीय विकल्प।",
    byCampus: "परिसर के अनुसार हॉस्टल",
    ask: "आवास के बारे में पूछें",
    photoCaption: "स्टॉक फ़ोटो — Aspire का हॉस्टल नहीं",
  },
  heroCard: {
    eyebrow: "विद्यार्थी कहाँ रहते हैं",
    campuses: "हॉस्टल सुविधा वाले परिसर",
  },
  empty: {
    heading: "हॉस्टल की जानकारी",
    title: "हॉस्टल की जानकारी सत्यापन के बाद प्रकाशित की जाएगी",
    description:
      "Aspire हर परिसर में आवासीय विकल्पों, देखरेख और सुविधाओं की पुष्टि कर रहा है। तब तक आवास से जुड़े आपके प्रश्नों के उत्तर कोई काउंसलर दे सकते हैं।",
    action: "काउंसलर से बात करें",
  },
  demoNotice: {
    title: "डेमो जानकारी — सत्यापन बाकी",
    body: "यह पेज समीक्षा के लिए Aspire की डेमो साइट से लिया गया है। सुविधाओं, देखरेख, क्षमता और दिनचर्या का सत्यापन अभी Aspire ने नहीं किया है। फ़ीस नहीं दिखाई गई है; वर्तमान जानकारी के लिए किसी काउंसलर से पूछें।",
  },
  stockCaption: "केवल उदाहरण के लिए स्टॉक फ़ोटो — यह Aspire का हॉस्टल या परिसर नहीं है।",
  intro: {
    eyebrow: "किसके लिए",
  },
  campuses: {
    title: "परिसर के अनुसार हॉस्टल",
    description: "हर परिसर में आवासीय भवन, देखरेख और वार्डन डेस्क।",
  },
  care: {
    title: "सुरक्षा, पढ़ाई और देखभाल",
    description: "आवासीय विद्यार्थियों की देखरेख, सहायता और देखभाल कैसे की जाती है।",
    girlsTitle: "छात्राओं का आवास",
    girlsCampuses: "परिसर:",
  },
  rooms: {
    title: "कमरे",
    description: "कमरों के विकल्प और हर कमरे में क्या-क्या शामिल है। कीमतें नहीं दिखाई गई हैं।",
    note: "नोट: {note}",
    featuresTitle: "कमरों की सुविधाएँ",
  },
  day: {
    title: "आवास में एक दिन",
    description: "एक सामान्य दिन की आवासीय समय-सारिणी।",
    menuTitle: "मेन्यू से",
  },
  cta: {
    title: "परिसर में रहने की योजना है?",
    description: "अपने पसंदीदा परिसर में हॉस्टल की उपलब्धता, देखरेख और फ़ीस के बारे में किसी काउंसलर से पूछें।",
    primary: "काउंसलिंग बुक करें",
    secondary: "परिसर खोजें",
  },
  card: {
    available: "उपलब्ध",
    notAvailable: "उपलब्ध नहीं",
    distance: "दूरी",
    rooms: "कमरे",
    supervision: "देखरेख",
    capacity: "क्षमता",
    wardenDesk: "वार्डन डेस्क: {phone}",
    campusDetails: "परिसर की जानकारी",
    campusDetailsFor: " ({centre})",
  },
};

export default hostels;
