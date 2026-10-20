import type { Messages } from "../types";

/** Namespace "ranchoApp" — Hindi, the Rancho app (/hi/rancho), install bar and cards (machine draft, needs native review: docs/hindi-review-register.md). */
const ranchoApp: Messages<"ranchoApp"> = {
  meta: {
    title: "रैंचो — AI डाउट सॉल्वर और स्टडी ऐप",
    description:
      "Aspire IIT & Medical का AI डाउट सॉल्वर रैंचो — साथ में रैंक प्रेडिक्टर, मॉक टेस्ट और स्टडी प्लानर, सब आपके फ़ोन पर एक ऐप में। हिंदी और अंग्रेज़ी में।",
  },
  home: {
    eyebrow: "रैंचो ऐप",
    title: "नमस्ते, मैं रैंचो हूँ!",
    lead: "JEE, NEET और स्कूल साइंस के लिए Aspire का AI डाउट सॉल्वर। अपना डाउट लिखें या उसकी फ़ोटो भेजें — हिंदी या अंग्रेज़ी में।",
    aiNote: "मैं एक AI हूँ, टीचर नहीं, इसलिए मुझसे गलती हो सकती है — ज़रूरी जवाब अपने टीचर से ज़रूर जाँचें।",
    mascotLabel: "Aspire का हिम तेंदुआ मैस्कॉट रैंचो",
  },
  tools: {
    title: "रैंचो इनमें भी मदद करता है",
    predictor: {
      title: "रैंक प्रेडिक्टर",
      body: "स्कोर या पर्सेंटाइल → रैंक का दायरा और कॉलेज।",
    },
    mockTests: {
      title: "मॉक टेस्ट",
      body: "टाइमर वाले CBT टेस्ट और विश्लेषण।",
    },
    leaderboard: "लीडरबोर्ड",
    planner: {
      title: "स्टडी प्लानर",
      body: "परीक्षा तक दिन-प्रतिदिन की योजना।",
    },
    allTools: {
      title: "सभी टूल्स",
      body: "JEE, NEET और BOH के सभी मुफ़्त टूल्स।",
    },
  },
  account: {
    title: "आपका Aspire खाता",
    checking: "जाँच रहे हैं कि आप साइन इन हैं या नहीं…",
    signedOut: "जिन विद्यार्थियों और अभिभावकों के पास Aspire लॉगिन है, वे साइन इन करके अपना पोर्टल खोल सकते हैं।",
    student: "विद्यार्थी साइन इन",
    parent: "अभिभावक साइन इन",
    noAccount: "अभी लॉगिन नहीं है? Aspire नामांकित विद्यार्थियों और उनके अभिभावकों के खाते बनाता है।",
    signedInAs: "आप {name} के रूप में साइन इन हैं",
    roleLine: "{role} खाता",
    openPortal: "मेरा पोर्टल खोलें",
  },
  install: {
    bar: {
      label: "रैंचो ऐप पाएँ",
      title: "रैंचो ऐप पाएँ",
      value: "AI डाउट सॉल्वर + स्टडी टूल्स",
      install: "इंस्टॉल करें",
      dismiss: "एक हफ़्ते के लिए छिपाएँ",
    },
    card: {
      title: "रैंचो को इस कंप्यूटर पर इंस्टॉल करें",
      body: "रैंचो अपनी अलग विंडो में खुलता है, और प्रेडिक्टर, मॉक टेस्ट व प्लानर बस एक क्लिक दूर रहते हैं।",
      install: "रैंचो इंस्टॉल करें",
    },
    sheet: {
      close: "बंद करें",
      ios: {
        title: "रैंचो को अपनी होम स्क्रीन पर जोड़ें",
        stepShareSafari: "Safari के टूलबार में Share बटन (तीर वाला चौकोर निशान) दबाएँ।",
        stepShareOther: "एड्रेस बार में Share बटन (तीर वाला चौकोर निशान) दबाएँ।",
        stepAdd: "नीचे स्क्रॉल करें और “Add to Home Screen” दबाएँ।",
        stepConfirm: "“Add” दबाएँ। रैंचो आपकी होम स्क्रीन पर आ जाएगा।",
        notListed: "“Add to Home Screen” नहीं दिख रहा? यह पेज Safari में खोलकर फिर से कोशिश करें।",
      },
      menu: {
        title: "रैंचो इंस्टॉल करें",
        chrome: "⋮ (ऊपर दाईं ओर) दबाएँ, फिर “Install app” या “Add to Home screen” चुनें।",
        edge: "Edge का मेन्यू (नीचे ⋯ या ≡) खोलें, फिर “Add to phone” चुनें।",
        samsung: "≡ (नीचे दाईं ओर) दबाएँ, फिर “Add page to” → “Home screen” चुनें।",
        firefox: "⋮ दबाएँ, फिर “Install” या “Add to Home screen” चुनें।",
        opera: "⋮ दबाएँ, फिर “Add to” → “Home screen” चुनें।",
        other: "अपने ब्राउज़र का मेन्यू (⋮ या ≡) खोलें, फिर “Install app” या “Add to Home screen” चुनें।",
        confirm: "“Install” या “Add” दबाकर पुष्टि करें। रैंचो आपके बाकी ऐप्स के साथ दिखेगा।",
      },
      inApp: {
        title: "रैंचो इंस्टॉल करने के लिए Chrome या Safari में खोलें",
        body: "{app} का अंदर वाला ब्राउज़र ऐप इंस्टॉल नहीं कर सकता।",
        openChrome: "Chrome में खोलें",
        androidMenu: "⋮ (ऊपर दाईं ओर) दबाएँ और “Open in browser” या “Open in Chrome” चुनें।",
        iosMenu: "⋯ (या Share बटन) दबाएँ और “Open in Safari” या “Open in browser” चुनें।",
        copy: "लिंक कॉपी करें",
        copied: "लिंक कॉपी हो गया — इसे Chrome या Safari में पेस्ट करें।",
        copyFailed: "कॉपी नहीं हो पाया। लिंक को दबाकर रखें और कॉपी करें।",
        apps: {
          instagram: "Instagram",
          facebook: "Facebook",
          messenger: "Messenger",
          linkedin: "LinkedIn",
          snapchat: "Snapchat",
          x: "X",
          line: "LINE",
          tiktok: "TikTok",
          pinterest: "Pinterest",
          google: "Google ऐप",
          webview: "इस ऐप",
        },
      },
    },
  },
  toolsCard: {
    eyebrow: "आपके फ़ोन पर",
    title: "रैंचो ऐप",
    body: "रैंचो से अपने डाउट पूछें और प्रेडिक्टर, मॉक टेस्ट व प्लानर एक ही ऐप से खोलें। इसे अपनी होम स्क्रीन पर जोड़ें — ऐप स्टोर की ज़रूरत नहीं।",
    cta: "रैंचो ऐप खोलें",
    iconLabel: "रैंचो ऐप का आइकन",
  },
  footerLink: "रैंचो ऐप",
};

export default ranchoApp;
