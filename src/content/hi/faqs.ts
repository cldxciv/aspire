import type { Faq } from "@/lib/types";
import type { OverlayMap } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/faqs.ts, keyed by FAQ id.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// “छात्रवृत्ति” in faq-scholarship must match the Hindi label of the enquiry form option.
export const faqsHi: OverlayMap<Faq> = {
  "faq-how-to-enquire": {
    question: "मैं पूछताछ कैसे शुरू करूँ?",
    answer:
      "विद्यार्थी की कक्षा और जिस प्रोग्राम में रुचि है, उसकी जानकारी के साथ पूछताछ फ़ॉर्म भरें। आगे की प्रक्रिया पर बात करने के लिए प्रवेश टीम आपसे संपर्क करेगी।",
  },
  "faq-counselling": {
    question: "क्या प्रोग्राम चुनने से पहले हम किसी काउंसलर से बात कर सकते हैं?",
    answer: "हाँ। पूछताछ फ़ॉर्म के माध्यम से काउंसलिंग सत्र का अनुरोध करें और अपने प्रश्न संदेश वाले खाने में लिखें।",
  },
  "faq-scholarship": {
    question: "क्या छात्रवृत्ति उपलब्ध है?",
    answer:
      "छात्रवृत्ति की उपलब्धता और पात्रता की पुष्टि Aspire द्वारा की जानी है। पूछताछ करते समय “छात्रवृत्ति” चुनें, टीम आपको वर्तमान जानकारी देगी।",
  },
  "faq-centre": {
    question: "मैं अपने सबसे नज़दीकी केंद्र का पता कैसे लगाऊँ?",
    answer: "केंद्र निर्देशिका देखें। इसमें केवल वही सत्यापित केंद्र सूचीबद्ध हैं जिनके पते और संपर्क विवरण की पुष्टि हो चुकी है।",
  },
};
