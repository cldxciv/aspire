import { centres } from "@/content/centres";
import type { CampusContact, ContactDetails } from "@/lib/types";
import { centresHi } from "./centres";
import type { TextOverlay } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/contact.ts.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
// Phone numbers, emails and the WhatsApp link are never overlaid. Like the
// English record, the head-office address and the campus desks' names / hours
// are taken from the centres (here: their Hindi overlays), keyed by centreSlug.
export type ContactOverlay = TextOverlay<Omit<ContactDetails, "campusContacts">> & {
  campusContacts?: Readonly<Record<string, TextOverlay<CampusContact>>>;
};

const headOffice = centres.find((c) => c.isHeadquarters);

export const contactDetailsHi: ContactOverlay = {
  phoneLabel: "केंद्रीय सहायता डेस्क",
  hours: "सोम–शनि, सुबह 9:00 – शाम 7:00 IST",
  address: headOffice ? centresHi[headOffice.id]?.address : undefined,
  languages: "सभी परिसरों में हिन्दी, अंग्रेज़ी और पहाड़ी बोलियाँ; हमीरपुर और कुल्लू में पंजाबी।",
  campusContacts: Object.fromEntries(
    centres.map((c) => [c.slug, { name: centresHi[c.id]?.name, hours: centresHi[c.id]?.openingHours }]),
  ),
};
