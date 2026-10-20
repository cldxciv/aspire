/**
 * Namespace "centres" (owner: PAGES-A): /centres, the centre cards and directory, and the
 * home centres picker's image alt text. English is the source of truth for the key shape;
 * ../hi/centres.ts must have the same keys. Plain object, no `as const`. See src/i18n/README.md.
 * Landscapes are labelled as the REGION, never as a centre or campus (D-030).
 */
const centres = {
  meta: {
    title: "Centres",
    description:
      "Find an Aspire IIT & Medical centre in Himachal Pradesh. Addresses, phone numbers and opening hours are published only after verification.",
  },
  crumb: "Centres",
  hero: {
    title: "Find Aspire near you",
    lead: "A centre directory for families across Himachal Pradesh. Only verified locations are published as confirmed centres.",
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
    kulluAlt: "Illustrative image of a Himachal hill town (not the actual centre)",
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
  regions: {
    title: "Himachal, region by region",
    lead: "Landscapes of the regions where the listed centres are. These are stock photos of each region — not photos of the centres.",
    shimla: "Shimla region",
    dharamshala: "Dharamshala and the Dhauladhar range",
    kullu: "Kullu valley",
    hamirpur: "Hamirpur region",
  },
  help: {
    title: "Not sure which centre to choose?",
    body: "Tell us where you are and what you're preparing for, and the admissions team can help.",
    primary: "Book counselling",
    secondary: "Contact Aspire",
    imageCaption: "Himalayan ridges — a stock photo of the region, not a centre.",
  },
};

export default centres;
