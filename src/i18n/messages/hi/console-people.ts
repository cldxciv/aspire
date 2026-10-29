import type en from "../en/console-people";

/**
 * Admin console Phase 1b — People list words, Hindi (owner: 1B-HOUSEKEEPING). Machine draft, needs
 * native review (docs/hindi-review-register.md). Same shape as ../en/console-people.ts. Terms as in
 * the CRM: काउंसलर, एग्ज़ीक्यूटिव, एरिया हेड, क्षेत्र और टीम, पूछताछ.
 */
const consolePeople: typeof en = {
  chips: {
    label: "खाते दिखाएँ",
    all: "सभी",
    staff: "स्टाफ़",
    admin: "एडमिन",
    student: "विद्यार्थी",
    parent: "अभिभावक",
    withCount: "{label} ({count})",
  },
  staff: {
    detailsLabel: "{name} की CRM जानकारी",
    crmRole: {
      counsellor: "काउंसलर (एग्ज़ीक्यूटिव)",
      manager: "एरिया हेड (मैनेजर)",
    },
    noMembership: "अभी CRM एक्सेस तय नहीं हुआ है",
    access: {
      active: "CRM एक्सेस चालू",
      inactive: "CRM एक्सेस बंद",
    },
    areas: "क्षेत्र",
    noAreas: "कोई क्षेत्र नहीं",
    areaInactive: "{name} (इस्तेमाल में नहीं)",
    centres: "सेंटर (पुरानी सेटिंग)",
    everyCentre: "सभी सेंटर",
    away: "{date} तक छुट्टी पर",
    openLeads: "खुली पूछताछ",
    areasLink: "क्षेत्र और टीम",
    rulesLink: "नियम",
  },
  create: {
    crmRole: "CRM में भूमिका",
    crmRoleHint: "चुनें कि यह व्यक्ति CRM में क्या काम करेगा। पहले से कुछ नहीं चुना गया है।",
    crmRoleRequired: "CRM में भूमिका चुनें।",
    areas: "क्षेत्र (ज़रूरी नहीं)",
    areasHint: "इन क्षेत्रों की पूछताछ इस व्यक्ति को मिलेगी। क्षेत्र बाद में ‘क्षेत्र और टीम’ में बदले जा सकते हैं।",
    noAreasWarning: "कोई क्षेत्र नहीं: इस व्यक्ति को कोई पूछताछ नहीं मिलेगी, और एरिया हेड के रूप में इसे सिर्फ़ वही पूछताछ दिखेंगी जो इसे सौंपी गई हों।",
    areasLoading: "क्षेत्र लोड हो रहे हैं…",
    areasFailed: "क्षेत्र लोड नहीं हो सके। इस व्यक्ति को बाद में ‘क्षेत्र और टीम’ में क्षेत्रों से जोड़ा जा सकता है।",
    noAreasYet: "अभी कोई क्षेत्र नहीं बना है।",
    areaInactive: "{name} (इस्तेमाल में नहीं)",
  },
};

export default consolePeople;
