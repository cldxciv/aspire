import type { Messages } from "../types";

/**
 * Namespace "forms" — Hindi (owner: PAGES-A). MACHINE DRAFT (D-028): needs native review
 * before launch (docs/hindi-review-register.md, "PAGES-A"). Exam and brand names stay Latin.
 * The Scholarship topic label "छात्रवृत्ति" is referenced by a Hindi FAQ answer — keep them in sync.
 */
const forms: Messages<"forms"> = {
  shared: {
    requiredNote: "जिन फ़ील्ड पर {star} का निशान है, वे आवश्यक हैं।",
    optionalSuffix: "(वैकल्पिक)",
    requiredKey: "आवश्यक",
    consent:
      "मैं विद्यार्थी का माता-पिता या अभिभावक हूँ, या मेरे पास उनकी अनुमति है, और मैं सहमत हूँ कि Aspire इस पूछताछ के बारे में मुझसे फ़ोन, WhatsApp या ईमेल पर संपर्क कर सकता है। मैंने {link} पढ़ ली है।",
    consentLink: "गोपनीयता सूचना",
    honeypotLabel: "यह फ़ील्ड खाली छोड़ें",
    notSureCentre: "अभी तय नहीं",
    centreUnverified: "{name} (उपलब्धता की पुष्टि करें)",
    district: {
      label: "आपका ज़िला",
      hint: "इससे Aspire की सबसे नज़दीकी टीम आपको कॉल कर पाती है।",
      placeholder: "अपना ज़िला चुनें",
      outsideHp: "हिमाचल से बाहर",
    },
    sending: "भेजा जा रहा है…",
    options: {
      class: {
        "class-6-8": "कक्षा 6–8",
        "class-9": "कक्षा 9",
        "class-10": "कक्षा 10",
        "class-11": "कक्षा 11",
        "class-12": "कक्षा 12",
        dropper: "ड्रॉपर",
      },
      program: {
        jee: "IIT JEE",
        neet: "NEET",
        foundation: "फ़ाउंडेशन",
        integrated: "एकीकृत प्रोग्राम",
        "not-sure": "अभी तय नहीं",
      },
      topic: {
        "course-information": "कोर्स की जानकारी",
        admissions: "प्रवेश",
        scholarship: "छात्रवृत्ति",
        "centre-information": "केंद्र की जानकारी",
        other: "अन्य",
      },
      classExam: {
        "jee-class-11": "IIT JEE – कक्षा 11",
        "jee-class-12": "IIT JEE – कक्षा 12",
        "jee-dropper": "IIT JEE – ड्रॉपर",
        "neet-class-11": "NEET – कक्षा 11",
        "neet-class-12": "NEET – कक्षा 12",
        "neet-dropper": "NEET – ड्रॉपर",
        "foundation-class-6-8": "फ़ाउंडेशन – कक्षा 8",
        "foundation-class-9": "फ़ाउंडेशन – कक्षा 9",
        "foundation-class-10": "फ़ाउंडेशन – कक्षा 10",
        "not-sure-class-11": "अभी तय नहीं – कक्षा 11",
        "not-sure-class-12": "अभी तय नहीं – कक्षा 12",
        "not-sure-dropper": "अभी तय नहीं – ड्रॉपर",
      },
      classExamGroup: {
        jee: "IIT JEE",
        neet: "NEET",
        foundation: "फ़ाउंडेशन",
        "not-sure": "अभी तय नहीं",
      },
    },
    errors: {
      name: "नाम लिखें (कम से कम 2 अक्षर)",
      nameTooLong: "नाम बहुत लंबा है",
      phone: "सही 10 अंकों का मोबाइल नंबर लिखें",
      email: "सही ईमेल पता लिखें",
      messageTooLong: "संदेश 1000 अक्षरों या उससे कम का होना चाहिए",
      consent: "कृपया पुष्टि करें कि आप इस पूछताछ के बारे में संपर्क किए जाने के लिए सहमत हैं",
      currentClass: "वर्तमान कक्षा चुनें",
      programInterest: "प्रोग्राम चुनें",
      preferredCentre: "सूची में से केंद्र चुनें",
      district: "सूची में से ज़िला चुनें",
      guardianName: "माता-पिता या अभिभावक का नाम लिखें",
      guardianNameTooLong: "माता-पिता या अभिभावक का नाम बहुत लंबा है",
      classOrExam: "कक्षा / लक्ष्य परीक्षा चुनें",
      topic: "विषय चुनें",
      generic: "कृपया इस फ़ील्ड की जाँच करें",
    },
    directContact: {
      byPhone: "कृपया Aspire से सीधे फ़ोन पर संपर्क करें: {phone}।",
      byEmail: "कृपया Aspire से सीधे ईमेल पर संपर्क करें: {email}।",
      byPhoneOrEmail: "कृपया Aspire से सीधे फ़ोन ({phone}) या ईमेल ({email}) पर संपर्क करें।",
      onContactPage: "कृपया Aspire से सीधे संपर्क करें। सत्यापन के बाद आधिकारिक संपर्क विवरण इसी पेज पर दिए जाएँगे।",
      seeContactPage: "कृपया Aspire से सीधे संपर्क करें — {link} देखें।",
      contactPageLink: "संपर्क पेज",
    },
    wait: {
      fewMinutes: "कुछ मिनट",
      oneMinute: "लगभग 1 मिनट",
      minutes: "लगभग {count} मिनट",
      hours: "लगभग {count} घंटे",
    },
    status: {
      submitting: "आपकी पूछताछ भेजी जा रही है, कृपया प्रतीक्षा करें।",
      invalidClientTitle: "कृपया चिह्नित फ़ील्ड जाँचें",
      invalidClientOne: "1 फ़ील्ड पर ध्यान देना ज़रूरी है। अभी कुछ भी नहीं भेजा गया है।",
      invalidClientMany: "{count} फ़ील्ड पर ध्यान देना ज़रूरी है। अभी कुछ भी नहीं भेजा गया है।",
      invalidServerTitle: "कुछ विवरण सुधारने होंगे",
      invalidServerOne:
        "आपकी पूछताछ नहीं भेजी गई। 1 फ़ील्ड स्वीकार नहीं हुई — कृपया चिह्नित फ़ील्ड जाँचकर फिर से कोशिश करें।",
      invalidServerMany:
        "आपकी पूछताछ नहीं भेजी गई। {count} फ़ील्ड स्वीकार नहीं हुईं — कृपया चिह्नित फ़ील्ड जाँचकर फिर से कोशिश करें।",
      receivedTitle: "पूछताछ प्राप्त हुई",
      receivedBody:
        "धन्यवाद — Aspire को आपकी पूछताछ मिल गई है और प्रवेश टीम आपसे संपर्क करेगी। आपका संदर्भ नंबर {reference} है। आगे की बातचीत के लिए इसे संभालकर रखें।",
      notConfiguredTitle: "आपकी पूछताछ नहीं भेजी गई है",
      notConfiguredBody:
        "आपके विवरण हमारी जाँच में सही पाए गए, लेकिन ऑनलाइन पूछताछ अभी जुड़ी नहीं है, इसलिए कुछ भी भेजा या सहेजा नहीं गया। {contact} आपके विवरण फ़ॉर्म में अभी भी भरे हुए हैं।",
      rateLimitedTitle: "बहुत अधिक प्रयास",
      rateLimitedBody:
        "आपकी पूछताछ नहीं भेजी गई, क्योंकि हाल में इस कनेक्शन से या इस मोबाइल नंबर के लिए कई पूछताछ भेजी गई हैं। कृपया {wait} रुककर फिर से कोशिश करें। आपके विवरण फ़ॉर्म में अभी भी भरे हुए हैं।",
      rejectedTitle: "आपकी पूछताछ नहीं भेजी जा सकी",
      rejectedBody:
        "अनुरोध की पुष्टि नहीं हो सकी, इसलिए कुछ भी नहीं भेजा गया। कृपया पेज रीफ़्रेश करके फिर से कोशिश करें। {contact}",
      unavailableTitle: "ऑनलाइन पूछताछ अभी उपलब्ध नहीं है",
      unavailableBody:
        "हम पूछताछ सेवा तक नहीं पहुँच सके, इसलिए कुछ भी नहीं भेजा गया। कृपया बाद में फिर से कोशिश करें। {contact}",
      serverErrorTitle: "कुछ गड़बड़ हो गई",
      serverErrorBody:
        "हम पुष्टि नहीं कर सके कि आपकी पूछताछ मिल गई है। कृपया कुछ मिनट बाद फिर से कोशिश करें। {contact}",
      timeoutTitle: "सर्वर से कोई जवाब नहीं मिला",
      timeoutBody:
        "सर्वर ने जवाब देने में बहुत देर लगाई, इसलिए हम पुष्टि नहीं कर सकते कि आपकी पूछताछ मिल गई है। कृपया थोड़ी देर में फिर से कोशिश करें। आपके विवरण फ़ॉर्म में अभी भी भरे हुए हैं।",
      networkTitle: "कनेक्शन में समस्या",
      networkBody:
        "हम सर्वर से नहीं जुड़ सके, इसलिए हो सकता है कि आपकी पूछताछ न भेजी गई हो। अपना इंटरनेट कनेक्शन जाँचकर फिर से कोशिश करें। आपके विवरण फ़ॉर्म में अभी भी भरे हुए हैं।",
    },
  },

  enquiry: {
    intentLegend: "आप किस बारे में पूछना चाहते हैं?",
    intentEnquiry: "पूछताछ",
    intentScholarship: "छात्रवृत्ति में रुचि",
    scholarshipNote: "छात्रवृत्ति की उपलब्धता और पात्रता Aspire तय करता है, और टीम जवाब देते समय इसकी पुष्टि करती है।",
    labels: {
      studentName: "विद्यार्थी का नाम",
      yourName: "आपका नाम",
      currentClass: "वर्तमान कक्षा",
      interestedProgram: "पसंदीदा प्रोग्राम",
      program: "प्रोग्राम",
      phone: "फ़ोन नंबर",
      studentOrParentPhone: "विद्यार्थी या अभिभावक का फ़ोन",
      email: "ईमेल",
      preferredCentre: "पसंदीदा ज़िला या केंद्र",
      message: "संदेश",
      topic: "हम किस बारे में मदद करें?",
    },
    placeholders: {
      selectClass: "कक्षा चुनें",
      selectProgram: "प्रोग्राम चुनें",
      selectTopic: "विषय चुनें",
    },
    hints: {
      quickPhone: "अभिभावक या विद्यार्थी का मोबाइल नंबर।",
      phone: "10 अंकों का मोबाइल नंबर।",
      centre: "केंद्र की उपलब्धता की पुष्टि Aspire करता है।",
      admissionsMessage: "कोई भी बात जो प्रवेश टीम को पता होनी चाहिए। अधिकतम {max} अक्षर।",
      contactMessage: "आपका प्रश्न या कोई भी विवरण जिससे हमें जवाब देने में मदद मिले। अधिकतम {max} अक्षर।",
    },
    submit: "पूछताछ भेजें",
    submitScholarship: "छात्रवृत्ति के बारे में पूछें",
    fromPredictor:
      "आप रैंक और कॉलेज प्रेडिक्टर से आए हैं। आपकी परीक्षा और स्कोर बैंड (सटीक स्कोर नहीं) इस पूछताछ में जोड़े जाएँगे, ताकि काउंसलर तैयारी कर सकें।",
    referenceNote: "संदर्भ नंबर यहाँ तभी दिखाया जाता है जब Aspire को आपकी पूछताछ मिल जाती है।",
  },

  hero: {
    title: "पूछताछ करें",
    intro: "हमारे प्रोग्राम, प्रवेश और केंद्रों की जानकारी पाएँ।",
    progressLabel: "पूछताछ के चरण",
    completedSuffix: "(पूरा हुआ)",
    stepLabel: "चरण {current} / {total}",
    steps: {
      student: { title: "विद्यार्थी की जानकारी", description: "विद्यार्थी के बारे में थोड़ा बताएँ।", short: "विद्यार्थी" },
      contact: {
        title: "संपर्क विवरण",
        description: "इस पूछताछ के बारे में Aspire किससे संपर्क करे?",
        short: "संपर्क",
      },
      preferences: {
        title: "प्राथमिकताएँ",
        description: "कोई और बात जिससे हमें जवाब देने में मदद मिले।",
        short: "प्राथमिकताएँ",
      },
    },
    labels: {
      studentName: "विद्यार्थी का नाम",
      classOrExam: "कक्षा / लक्ष्य परीक्षा",
      guardianName: "माता-पिता / अभिभावक का नाम",
      mobile: "मोबाइल नंबर",
      preferredCentre: "पसंदीदा केंद्र",
      message: "संदेश",
    },
    placeholders: {
      studentName: "विद्यार्थी का नाम लिखें",
      classOrExam: "कक्षा / लक्ष्य परीक्षा चुनें",
      guardianName: "माता-पिता / अभिभावक का नाम लिखें",
      mobile: "मोबाइल नंबर लिखें",
      message: "हम आपकी कैसे मदद कर सकते हैं?",
    },
    hints: {
      mobile: "10 अंकों का मोबाइल",
      message: "अधिकतम {max} अक्षर।",
    },
    notConnectedTitle: "ऑनलाइन पूछताछ अभी जुड़ी नहीं है",
    notConnectedBody: "“{check}” आपके भरे विवरण जाँचता है, लेकिन Aspire को कुछ भी भेजा या सहेजा नहीं जाता।",
    notConnectedShort: "ऑनलाइन पूछताछ अभी जुड़ी नहीं है — विवरण भेजे नहीं जाएँगे।",
    back: "पीछे",
    next: "अगला चरण",
    submit: "पूछताछ भेजें",
    check: "मेरे विवरण जाँचें",
    checking: "जाँच हो रही है…",
    privacyNote: "हम इन विवरणों का उपयोग आपकी पूछताछ का जवाब देने के लिए करते हैं।",
    privacyLink: "गोपनीयता सूचना",
    startOver: "एक और पूछताछ करें",
  },
};

export default forms;
