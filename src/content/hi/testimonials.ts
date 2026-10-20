import type { Testimonial } from "@/lib/types";
import type { TextOverlay } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/testimonials.ts, keyed by testimonial id.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
//
// Quotes and headlines are the attributed words of real people: they are NOT
// translated (the type below does not even allow them). data.ts returns them
// unchanged with `quoteLang: "en"` so the UI can mark them `lang="en"`.
// Only generic descriptors (relation words, "Admit", "Allotment"), the site's
// own video captions and home towns are overlaid; people's names, ranks,
// institutions and years are copied unchanged in Latin script.
export type TestimonialOverlay = TextOverlay<Pick<Testimonial, "caption" | "context" | "location">>;

export const testimonialsHi: Readonly<Record<string, TestimonialOverlay>> = {
  "tst-satish-pathania": {
    context: "पुत्र: Aniket Pathania (IIT Roorkee, 2025)",
    location: "सुंदरनगर",
  },
  "tst-ramesh-sunita-thakur-hostel-video": {
    caption:
      "सुनिए, Ramesh और Sunita Thakur बायोमेट्रिक सुरक्षा, वार्डन की रात्रि देखभाल और पौष्टिक भोजन के बारे में बता रहे हैं, जिनसे उन्हें पूरी तरह निश्चिंतता मिली।",
    context: "बेटी अब MBBS (वर्ष 2), IGMC में",
    location: "मंडी",
  },
  "tst-ramesh-sunita-thakur": {
    context: "Aarohi Thakur के माता-पिता • MBBS में प्रवेश, IGMC Shimla",
  },
  "tst-col-s-dogra-video": {
    caption:
      "Col. S. Dogra (Retd.) बताते हैं कि व्यक्तिगत ध्यान ने कैसे उनके बेटे के भौतिकी के डर को JEE Advanced के लिए आत्मविश्वास में बदल दिया।",
    context: "बेटे का चयन IIT Roorkee Mechanical में",
  },
  "tst-col-rajiv-mehta": {
    context: "Aryan Mehta के पिता • IIT Roorkee 2024 बैच",
  },
  "tst-priya-chandel": {
    context: "AIR 142 NEET • MBBS विद्यार्थी, AIIMS Bilaspur (शिमला BCS की पूर्व विद्यार्थी)",
  },
  // tst-karthik-sharma: context is ranks, a degree and an institution only — stays English.
  "tst-mr-mrs-sharma": {
    location: "मंडी, हि.प्र.",
  },
  "tst-sh-ramesh-thakur": {
    context: "IGMC Shimla में प्रवेश · NEET 2026",
  },
  "tst-smt-sunita-sharma": {
    context: "IIT Roorkee में प्रवेश",
  },
  "tst-col-ks-dogra": {
    context: "Aryan Dogra के पिता • AIR 412 (IIT Roorkee, Computer Science)",
  },
  "tst-pranjali-paul": {
    context: "NEET 2025 आवंटन",
  },
  "tst-mahender-singh-sharma": {
    context: "Ananya Sharma के पिता, MBBS IGMC 2025",
    location: "कांगड़ा",
  },
};
