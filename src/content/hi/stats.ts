import type { Stat } from "@/lib/types";
import type { OverlayMap } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/stats.ts, keyed by stat id.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// `value` is never overlaid (figures stay exactly as stated, e.g. "90 min", "8.4 Yrs").
// Institution names (IGMC Shimla…) stay in Latin script.
export const statsHi: OverlayMap<Stat> = {
  // label "IGMC Shimla '25" is an institution name + year: falls back to English.
  "stat-igmc-2025": { context: "IGMC 2025 MBBS आवंटन" },
  "stat-doctors-iitians": { label: "डॉक्टर और IITian" },
  "stat-student-mentor-ratio": { label: "विद्यार्थी-मेंटर अनुपात" },
  "stat-years": { label: "वर्ष", context: "2013 में शिमला में स्थापित" },
  "stat-campuses": { label: "क्षेत्रीय परिसर", context: "शिमला BCS, हमीरपुर, धर्मशाला और कुल्लू" },
  "stat-verified-rankers": { label: "सत्यापित रैंकर", context: "परिणाम पृष्ठ पर दी गई रैंकरों की सूची" },
  "stat-state-selections": { label: "राज्य-स्तरीय चयन", context: "वार्षिक मेरिट सम्मेलन" },
  "stat-batch-cap": {
    label: "प्रति बैच अधिकतम विद्यार्थी",
    context: "हर बैच में अधिकतम 35 विद्यार्थी होते हैं (Dropper Apex और फ़ाउंडेशन बैच में 30)।",
  },
  "stat-doubt-desk": {
    label: "दैनिक शंका-समाधान डेस्क",
    context: "आवासीय शिक्षकों के साथ शाम का 1:1 शंका-समाधान क्लिनिक",
  },
  "stat-faculty-till": { label: "शिक्षक परिसर में इस समय तक" },
  "stat-fly-in-lecturers": {
    label: "बाहर से बुलाए गए अतिथि व्याख्याता",
    context: "पूर्णकालिक आवासीय शिक्षक, सप्ताह में 6 दिन उपस्थित।",
  },
  "stat-faculty-tenure": {
    label: "शिक्षकों का औसत कार्यकाल",
    context: "शैक्षणिक वर्ष के बीच में बैच के शिक्षकों का बदलाव शून्य।",
  },
  "stat-senior-leads": { label: "वरिष्ठ आवासीय प्रमुख शिक्षक" },
  "stat-boarders": { label: "हिमाचल प्रदेश में तैयारी कर चुके आवासीय विद्यार्थी" },
  "stat-boarder-selection-rate": { label: "आवासीय विद्यार्थियों की NEET और JEE चयन दर" },
  "stat-faculty-hostel-ratio": { label: "शिक्षक-हॉस्टल अनुपात" },
};
