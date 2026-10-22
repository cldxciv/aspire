/**
 * Namespace "hostels" (owner: PAGES-B). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/hostels.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 */
const hostels = {
  meta: {
    title: "Hostels",
    description:
      "Residential and hostel options for outstation students at Aspire IIT & Medical's campuses in Himachal Pradesh. Details are published once Aspire has verified them.",
  },
  /** B · editorial hero (2026-10-22 hero redesign). */
  hero: {
    /** Short label, distinct from the lead (no facts). */
    eyebrow: "Studying away from home",
    title: "Hostels and residential life",
    /** Phrase of `title` underlined in gold; must appear in it exactly. */
    highlight: "residential life",
    crumb: "Hostels",
    lead: "Supervised residential options for outstation students, campus by campus.",
    emptyLead: "Residential options for students joining Aspire from outside their home town.",
    byCampus: "Hostels by campus",
    ask: "Ask about accommodation",
    /** Under the hero's stock photos while no hostel details are published (D-030). */
    photoCaption: "Stock photos — not an Aspire hostel",
  },
  /** The hero's white card: only rows the hostel data fills. */
  heroCard: {
    /** Neutral: some listed campuses use partner hostels, not on-campus ones. */
    eyebrow: "Where students stay",
    campuses: "Campuses with hostel options",
  },
  empty: {
    heading: "Hostel information",
    title: "Hostel details will be published after verification",
    description:
      "Aspire is confirming residential options, supervision and facilities at each campus. A counsellor can answer questions about accommodation in the meantime.",
    action: "Talk to a counsellor",
  },
  demoNotice: {
    title: "Demo information — pending verification",
    body: "This page was imported from Aspire's demo site for review. Facilities, supervision, capacities and routines have not yet been verified by Aspire. Fees are not shown; ask a counsellor for current details.",
  },
  /** Caption under every stock photo on this page. */
  stockCaption: "Stock photo for illustration — not an Aspire hostel or campus.",
  intro: {
    eyebrow: "Who it's for",
  },
  campuses: {
    title: "Hostels by campus",
    description: "Residential blocks, supervision and the warden desk at each campus.",
  },
  care: {
    title: "Safety, study and care",
    description: "How residential students are supervised, supported and looked after.",
    girlsTitle: "Girls' residency",
    girlsCampuses: "Campuses:",
  },
  rooms: {
    title: "Rooms",
    description: "Room options and what each room includes. Prices are not shown.",
    note: "Note: {note}",
    featuresTitle: "Room features",
  },
  day: {
    title: "A day in residence",
    description: "The residential timetable for a typical day.",
    menuTitle: "From the menu",
  },
  cta: {
    title: "Planning to stay on campus?",
    description: "Ask a counsellor about hostel availability, supervision and fees at your preferred campus.",
    primary: "Book counselling",
    secondary: "Find a campus",
  },
  card: {
    available: "Available",
    notAvailable: "Not available",
    distance: "Distance",
    rooms: "Rooms",
    supervision: "Supervision",
    capacity: "Capacity",
    wardenDesk: "Warden desk: {phone}",
    campusDetails: "Campus details",
    /** Screen-reader suffix after "Campus details". */
    campusDetailsFor: " for {centre}",
  },
};

export default hostels;
