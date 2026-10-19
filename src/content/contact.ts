import type { ContactDetails, PhoneNumber } from "@/lib/types";
import { centres } from "./centres";
import { demoRef } from "./demo-source";

// PLACEHOLDER — contact details from Aspire's demo site (docs/demo-data-import.md).
// Deliberately NOT in siteConfig.contact: read them through getContactDetails(),
// which hides them in production until Aspire verifies them (D-005).
// The demo shows three different admissions emails; the contact page's value is
// used. Note its domain (aspireiitmedical.com) differs from the site domain
// (aspireiit.in), while the campus emails use aspireiit.in.

/** "+91 98166 23676" → { display, tel: "+919816623676" }. */
function phone(display: string): PhoneNumber {
  return { display, tel: display.replace(/[^\d+]/g, "") };
}

const headOffice = centres.find((c) => c.isHeadquarters);

export const contactDetails: ContactDetails = {
  id: "contact",
  phoneLabel: "Central helpdesk",
  phone: phone("+91 98166 23676"),
  email: "admissions@aspireiitmedical.com",
  // Plain chat link; the demo's prefilled-message variant is not imported.
  whatsapp: { display: "+91 98166 23676", url: "https://wa.me/919816623676" },
  hours: "Mon–Sat, 9:00 AM – 7:00 PM IST",
  // Campuses-page address of the head campus (the contact page says "Near BCS
  // Gate, New Shimla, Himachal Pradesh 171009" — logged as a conflict).
  address: headOffice?.address,
  headOfficeCentreSlug: headOffice?.slug,
  responseTimes: [
    "Callback within 2 working hours of a form submission or missed call.",
    "Email: reply within one working day.",
    "WhatsApp: replies within working hours.",
  ],
  languages: "Hindi, English and Pahari dialects at all campuses; Punjabi at Hamirpur and Kullu.",
  campusContacts: centres.map((c) => ({
    centreSlug: c.slug,
    name: c.name,
    ...(c.phone ? { phone: phone(c.phone) } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.openingHours ? { hours: c.openingHours } : {}),
  })),
  status: "placeholder",
  sourceRef: demoRef("/contact", "/about", "/campuses"),
};
