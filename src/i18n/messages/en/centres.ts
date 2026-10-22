/**
 * Namespace "centres" (owner: PAGES-A): /centres, the centre cards and directory, and the
 * home centres picker's image alt text. English is the source of truth for the key shape;
 * ../hi/centres.ts must have the same keys. Plain object, no `as const`. See src/i18n/README.md.
 * Card photos are stock education photos, never captioned as a centre or campus; no landscapes
 * and no result cards on this page (D-031).
 */
const centres = {
  meta: {
    title: "Centres",
    description:
      "Find an Aspire IIT & Medical centre in Himachal Pradesh. Addresses, phone numbers and opening hours are published only after verification.",
  },
  crumb: "Centres",
  /** E · centre finder hero (2026-10-22 hero redesign). */
  hero: {
    title: "Find your nearest Aspire centre",
    /** Phrase of `title` set in gold; must appear in it exactly. */
    highlight: "Aspire centre",
    /** While no centre can be shown (production until the records are verified). */
    lead: "A centre directory for families across Himachal Pradesh. Only verified locations are published as confirmed centres.",
    /** Above the district finder. */
    finderLead: "Choose your district to see which Aspire centre serves it.",
  },
  /** The hero's district finder (also used on /contact). Head campus, Call and Directions come from `card`. */
  finder: {
    district: "Your district",
    centreFor: "Aspire centre for {district}",
    mapLabel: "Illustrative map of Aspire's {count} centres in Himachal Pradesh: {names}",
    mapNote: "Illustrative map, not to scale",
    page: "See centre details",
    whatsapp: "WhatsApp",
    /** Heading of the centre list shown instead of the finder without JavaScript. */
    listTitle: "Our centres",
  },
  directory: {
    title: "Centre directory",
    lead: "Search by centre name or by the district you live in. Each campus lists its contact details, notes for families and facilities.",
    emptyTitle: "Verified centre locations will be listed here",
    emptyBody:
      "Aspire is confirming centre addresses, contact numbers and opening hours. Contact the team for help finding the right centre.",
    emptyCta: "Contact Aspire",
    formLabel: "Centres",
    searchLabel: "Search by district or centre",
    searchPlaceholder: "e.g. Mandi or Shimla",
    programLabel: "Program",
    allPrograms: "All programs",
    clear: "Clear",
    showingOne: "Showing 1 centre",
    showingMany: "Showing {count} centres",
    matching: "matching “{query}”",
    demoNotice:
      "Entries marked DEMO are sample listings imported from Aspire's demo site and are pending verification. Building images are illustrations, not photos of the actual centres.",
    programsUnlisted: "Which programs run at each campus is confirmed by the admissions team.",
    noMatchTitle: "No centres match your search",
    noMatchBody:
      "Try another district or centre name, or clear the search. A counsellor can also suggest the nearest campus.",
    clearFilters: "Clear filters",
  },
  card: {
    headCampus: "Head campus",
    pending: "Details pending verification",
    contact: "Contact",
    address: "Address",
    phone: "Phone",
    email: "Email",
    hours: "Opening hours",
    contactPending: "Centre address, contact and opening hours will appear after verification.",
    notes: "Campus notes",
    hostel: "Hostel",
    gettingHere: "Getting here",
    travelTimes: "Travel times",
    districtsServed: "Districts served",
    programs: "Programs",
    highlights: "Highlights",
    facilities: "Facility details ({count})",
    call: "Call",
    emailButton: "Email",
    directions: "Directions",
    directionsSuffix: "to {name}",
    hostelDetails: "Hostel details",
    forName: "for {name}",
  },
  images: {
    buildingAlt: "Illustrative image of a hill-style building (not the actual centre)",
  },
  districts: {
    title: "Which campus serves your district?",
    leadListed: "Each campus desk handles admissions and counselling for the districts listed below.",
    leadUnlisted: "District coverage will be listed here once Aspire confirms it.",
  },
  map: {
    title: "Centre map",
    placeholderLabel: "Map placeholder: a map of verified Aspire centres will appear here",
    comingSoon: "Map coming after verification",
    body: "A map will be added once centre addresses are verified. Call and Directions buttons appear on a centre's card when confirmed details are available.",
  },
  /** Note under the directory while centre cards show stock photos (D-031). */
  photos: {
    note: "Photos on the centre cards are stock photos for illustration. They were not taken at Aspire's centres.",
  },
  help: {
    title: "Not sure which centre to choose?",
    body: "Tell us where you are and what you're preparing for, and the admissions team can help.",
    primary: "Book counselling",
    secondary: "Contact Aspire",
    imageCaption: "Stock photo for illustration — not taken at an Aspire centre.",
  },
};

export default centres;
