import type en from "../en/console-common";

/**
 * Admin console Phase 1b — shared console words, Hindi (owner: 1B-CORE). Machine draft, needs
 * native review (docs/hindi-review-register.md). Same shape as ../en/console-common.ts.
 */
const consoleCommon: typeof en = {
  common: {
    notSet: "तय नहीं",
    noTarget: "लक्ष्य तय नहीं",
    notRecorded: "दर्ज नहीं",
    xOfY: "{y} में से {x}",
    xOfYPercent: "{y} में से {x} ({percent} %)",
    demoCentres: "डेमो सेंटर सूची: असली सूची अभी आनी है",
    demoCentresDecision: "असली सेंटर सूची आने तक कंसोल में वेबसाइट के सेंटर और वे सेंटर दिखते हैं जो किसी पूछताछ या क्षेत्र में पहले से इस्तेमाल हुए हैं।",
    smallSample: "संख्या कम है",
    noCentre: "अभी कोई सेंटर नहीं",
    total: "कुल",
    preview: "प्रीव्यू · कोई असली डेटा नहीं",
    previewValue: "—",
    scrollHint: "{table}: और कॉलम देखने के लिए बगल में स्क्रॉल करें",
  },
  details: {
    fields: {
      altPhone: "दूसरा फ़ोन / WhatsApp नंबर",
      school: "स्कूल",
      board: "बोर्ड",
      hostel: "हॉस्टल",
      targetExam: "लक्ष्य परीक्षा",
      targetYear: "लक्ष्य वर्ष",
      heardVia: "हमारे बारे में कैसे पता चला",
      referredBy: "किसने भेजा",
      intakeSession: "किस सत्र में दाख़िला",
      preferredTime: "कॉल का सही समय",
      decisionMaker: "फ़ैसला कौन करेगा",
    },
  },
};

export default consoleCommon;
