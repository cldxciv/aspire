/**
 * Namespace "contact" (owner: PAGES-B). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/contact.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 */
const contact = {
  meta: {
    title: "Contact",
    description:
      "Contact the Aspire IIT & Medical team with questions about programs, admissions, scholarships or centres.",
  },
  hero: {
    title: "Talk to the Aspire team",
    crumb: "Contact",
    lead: "Ask about programs, admissions, scholarships or the nearest centre.",
  },
  form: {
    title: "Send an enquiry",
    lead: "Tell us what you'd like to know and how to reach you.",
  },
  details: {
    title: "Contact details",
    phone: "Phone",
    whatsapp: "WhatsApp",
    whatsappHint: " (chat on WhatsApp)",
    email: "Email",
    hours: "Office hours",
    address: "Address",
    headCampus: "Head campus · {name}",
    languages: "Languages",
    responseTimes: "Response times",
    fallback:
      "Aspire's official phone number, email, address and office hours will be added here once they have been verified. Until then, you can use the enquiry form — it will tell you clearly whether your enquiry was sent.",
  },
  social: {
    title: "Follow Aspire",
  },
  help: {
    title: "Need help choosing a program?",
    body: "Request a counselling session to discuss the student's academic goals and the options available.",
    cta: "Book counselling",
  },
  centres: {
    title: "Looking for a centre?",
    body: "Browse the centre directory for locations and available programs.",
    cta: "Explore centres",
  },
  desks: {
    eyebrow: "Campuses",
    title: "Campus admissions desks",
    description: "Call, email or visit the campus closest to you.",
    address: "Address",
    phone: "Phone",
    email: "Email",
    hours: "Hours",
    campusDetails: "Campus details",
    /** Screen-reader suffix after "Campus details". */
    campusDetailsFor: " for {name}",
    /** Note under the desks: their photos are generic stock, never the campus or office. */
    photoNote: "Illustrative stock photos — not Aspire's campuses or offices.",
  },
};

export default contact;
