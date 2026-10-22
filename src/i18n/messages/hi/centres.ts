import type { Messages } from "../types";

/**
 * Namespace "centres" — Hindi (owner: PAGES-A). MACHINE DRAFT (D-028): needs native review
 * before launch (docs/hindi-review-register.md, "PAGES-A"). Card photos are stock photos, never
 * captioned as a centre (केंद्र) or campus (परिसर); no landscapes or result cards here (D-031).
 */
const centres: Messages<"centres"> = {
  meta: {
    title: "केंद्र",
    description:
      "हिमाचल प्रदेश में Aspire IIT & Medical का केंद्र खोजें। पते, फ़ोन नंबर और खुलने का समय सत्यापन के बाद ही प्रकाशित किए जाते हैं।",
  },
  crumb: "केंद्र",
  hero: {
    title: "अपना नज़दीकी Aspire केंद्र खोजें",
    highlight: "Aspire केंद्र",
    lead: "हिमाचल प्रदेश के परिवारों के लिए केंद्र निर्देशिका। केवल सत्यापित स्थानों को ही पुष्ट केंद्र के रूप में प्रकाशित किया जाता है।",
    finderLead: "अपना ज़िला चुनें और देखें कि कौन-सा Aspire केंद्र आपके ज़िले के लिए है।",
  },
  finder: {
    district: "आपका ज़िला",
    centreFor: "{district} के लिए Aspire केंद्र",
    mapLabel: "हिमाचल प्रदेश में Aspire के {count} केंद्रों का सांकेतिक नक्शा: {names}",
    mapNote: "सांकेतिक नक्शा, पैमाने के अनुसार नहीं",
    page: "केंद्र का विवरण देखें",
    whatsapp: "WhatsApp",
    listTitle: "हमारे केंद्र",
  },
  directory: {
    title: "केंद्र निर्देशिका",
    lead: "केंद्र के नाम या अपने ज़िले से खोजें। हर परिसर के साथ उसके संपर्क विवरण, परिवारों के लिए जानकारी और सुविधाएँ दी गई हैं।",
    emptyTitle: "सत्यापित केंद्रों की सूची यहाँ दी जाएगी",
    emptyBody:
      "Aspire केंद्रों के पते, संपर्क नंबर और खुलने के समय की पुष्टि कर रहा है। सही केंद्र खोजने में मदद के लिए टीम से संपर्क करें।",
    emptyCta: "Aspire से संपर्क करें",
    formLabel: "केंद्र",
    searchLabel: "ज़िले या केंद्र से खोजें",
    searchPlaceholder: "जैसे मंडी या Shimla",
    programLabel: "प्रोग्राम",
    allPrograms: "सभी प्रोग्राम",
    clear: "साफ़ करें",
    showingOne: "1 केंद्र दिखाया जा रहा है",
    showingMany: "{count} केंद्र दिखाए जा रहे हैं",
    matching: "“{query}” से मेल खाते",
    demoNotice:
      "‘डेमो’ चिह्नित प्रविष्टियाँ Aspire की डेमो साइट से ली गई नमूना सूचियाँ हैं और इनका सत्यापन बाकी है। भवनों के चित्र सांकेतिक हैं, असली केंद्रों की तस्वीरें नहीं।",
    programsUnlisted: "किस परिसर में कौन-से प्रोग्राम चलते हैं, इसकी पुष्टि प्रवेश टीम करती है।",
    noMatchTitle: "आपकी खोज से कोई केंद्र मेल नहीं खाता",
    noMatchBody: "कोई दूसरा ज़िला या केंद्र का नाम आज़माएँ, या खोज साफ़ करें। काउंसलर भी नज़दीकी परिसर बता सकते हैं।",
    clearFilters: "फ़िल्टर हटाएँ",
  },
  card: {
    headCampus: "मुख्य परिसर",
    pending: "विवरण का सत्यापन बाकी",
    contact: "संपर्क",
    address: "पता",
    phone: "फ़ोन",
    email: "ईमेल",
    hours: "खुलने का समय",
    contactPending: "केंद्र का पता, संपर्क और खुलने का समय सत्यापन के बाद दिखाई देगा।",
    notes: "परिसर से जुड़ी जानकारी",
    hostel: "हॉस्टल",
    gettingHere: "यहाँ कैसे पहुँचें",
    travelTimes: "यात्रा का समय",
    districtsServed: "सेवा वाले ज़िले",
    programs: "प्रोग्राम",
    highlights: "मुख्य बातें",
    facilities: "सुविधाओं का विवरण ({count})",
    call: "कॉल करें",
    emailButton: "ईमेल करें",
    directions: "रास्ता देखें",
    directionsSuffix: "{name} तक",
    hostelDetails: "हॉस्टल का विवरण",
    forName: "{name} के लिए",
  },
  images: {
    buildingAlt: "पहाड़ी शैली के भवन का सांकेतिक चित्र (असली केंद्र नहीं)",
  },
  districts: {
    title: "आपके ज़िले के लिए कौन-सा परिसर है?",
    leadListed: "हर परिसर का डेस्क नीचे दिए गए ज़िलों के लिए प्रवेश और काउंसलिंग संभालता है।",
    leadUnlisted: "Aspire की पुष्टि के बाद ज़िलों की जानकारी यहाँ दी जाएगी।",
  },
  map: {
    title: "केंद्रों का नक्शा",
    placeholderLabel: "नक्शे की जगह: सत्यापित Aspire केंद्रों का नक्शा यहाँ दिखाई देगा",
    comingSoon: "सत्यापन के बाद नक्शा जोड़ा जाएगा",
    body: "केंद्रों के पते सत्यापित होने के बाद नक्शा जोड़ा जाएगा। पुष्ट विवरण उपलब्ध होने पर केंद्र के कार्ड पर ‘कॉल करें’ और ‘रास्ता देखें’ बटन दिखाई देते हैं।",
  },
  photos: {
    note: "केंद्र कार्डों पर दी गई फ़ोटो केवल उदाहरण के लिए स्टॉक फ़ोटो हैं। ये Aspire के केंद्रों पर नहीं ली गई हैं।",
  },
  help: {
    title: "तय नहीं कर पा रहे कि कौन-सा केंद्र चुनें?",
    body: "हमें बताएँ कि आप कहाँ हैं और किसकी तैयारी कर रहे हैं — प्रवेश टीम आपकी मदद कर सकती है।",
    primary: "काउंसलिंग बुक करें",
    secondary: "Aspire से संपर्क करें",
    imageCaption: "उदाहरण के लिए स्टॉक फ़ोटो — Aspire के किसी केंद्र पर नहीं ली गई।",
  },
};

export default centres;
