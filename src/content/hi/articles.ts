import type { Article } from "@/lib/types";
import type { OverlayMap } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/articles.ts, keyed by article id.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// The English articles are themselves placeholders; the "placeholder text" notice is kept.
const PLACEHOLDER_NOTICE =
  "यह लेआउट की समीक्षा के लिए रखा गया अस्थायी (प्लेसहोल्डर) पाठ है। अंतिम लेख Aspire की शैक्षणिक टीम द्वारा लिखा या स्वीकृत किया जाना चाहिए।";

export const articlesHi: OverlayMap<Article> = {
  "art-revision-plan": {
    title: "साप्ताहिक रिवीज़न योजना कैसे बनाएँ",
    summary: "पूरे सप्ताह में नए विषयों, रिवीज़न और अभ्यास टेस्ट के बीच संतुलन बनाने का एक सरल ढाँचा।",
    body: [
      PLACEHOLDER_NOTICE,
      "एक अच्छी साप्ताहिक योजना आमतौर पर तीन चीज़ों में संतुलन रखती है: नई अवधारणाएँ सीखना, पहले पढ़े गए विषयों को दोहराना, और परीक्षा जैसी परिस्थितियों में अभ्यास करना।",
      "विद्यार्थियों को अपने मेंटर के साथ योजना की समीक्षा करनी चाहिए और हर टेस्ट के बाद उसमें आवश्यक बदलाव करने चाहिए।",
    ],
  },
  "art-choosing-a-program": {
    title: "सही प्रोग्राम का चुनाव",
    summary: "JEE, NEET, फ़ाउंडेशन और एकीकृत विकल्पों की तुलना करते समय परिवार कौन-से प्रश्न पूछ सकते हैं।",
    body: [
      PLACEHOLDER_NOTICE,
      "विद्यार्थी की रुचियों और वर्तमान कक्षा से शुरुआत करें, फिर किसी काउंसलर से बात करें कि कौन-सा रास्ता उनके लक्ष्यों और समय-सारिणी के अनुकूल है।",
    ],
  },
};
