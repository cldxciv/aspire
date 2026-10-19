import type { Faq } from "@/lib/types";

// PLACEHOLDER answers — Aspire must confirm its actual admissions process.
export const faqs: Faq[] = [
  {
    id: "faq-how-to-enquire",
    question: "How do I start an enquiry?",
    answer:
      "Fill in the enquiry form with the student's class and program of interest. The admissions team will contact you to discuss next steps.",
    category: "admissions",
    status: "placeholder",
  },
  {
    id: "faq-counselling",
    question: "Can we speak to a counsellor before choosing a program?",
    answer:
      "Yes. Request a counselling session through the enquiry form and mention any questions in the message field.",
    category: "admissions",
    status: "placeholder",
  },
  {
    id: "faq-scholarship",
    question: "Are scholarships available?",
    answer:
      "Scholarship availability and eligibility must be confirmed by Aspire. Select “Scholarship” when you enquire and the team will share current details.",
    category: "admissions",
    status: "placeholder",
  },
  {
    id: "faq-centre",
    question: "How do I find the nearest centre?",
    answer:
      "Use the centre directory. Only verified centres with confirmed addresses and contact details are listed.",
    category: "centres",
    status: "placeholder",
  },
];
