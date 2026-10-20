/**
 * Namespace "programs" (owner: PAGES-A): /programs, /programs/[slug] and the program cards,
 * plus the exam-track labels shared by the home, results and centres components.
 * English is the source of truth for the key shape; ../hi/programs.ts must have the same keys.
 * Plain object, no `as const`. See src/i18n/README.md.
 */
const programs = {
  /** Display labels per ExamTrack (EXAM_META). Exam names stay Latin in every language. */
  tracks: {
    JEE: "IIT JEE",
    NEET: "NEET",
    Foundation: "Foundation",
    Integrated: "Integrated",
  },
  list: {
    metaTitle: "Programs",
    metaDescription:
      "Explore Aspire's IIT JEE, NEET, Foundation and integrated school programs, and speak with an academic counsellor about the right pathway.",
    crumb: "Programs",
    heroTitle: "Programs built around your goals",
    heroLead: "Explore course pathways and speak with an academic counsellor before choosing a program.",
    directoryTitle: "Choose a pathway",
    directoryLead: "Filter by exam, then open a program for its class level, schedule and highlights.",
    demoNotice:
      "Programs marked DEMO are sample listings imported from Aspire's demo site. Class levels, durations, timings and batch sizes are pending verification by Aspire.",
    emptyTitle: "Program details are being finalised",
    emptyBody: "Programs will be listed here once confirmed by Aspire. A counsellor can help in the meantime.",
    emptyCta: "Talk to a counsellor",
    availabilityNotice:
      "Course availability, classes, batch dates, fees and delivery modes are confirmed by Aspire. Please check current details with a counsellor before choosing a program.",
    tracksTitle: "Preparation tracks",
    tracksLead: "Programs are grouped by the exam they prepare for.",
    pageGuideTitle: "What each program page covers",
    pageGuideLead: "Open a program to see its details.",
    pageGuidePoints: {
      audience: "Who the program is for and its class level",
      schedule: "Duration, timings and batch details, where confirmed",
      highlights: "The program's highlights",
      fees: "Fees only once Aspire has verified them — otherwise a counsellor confirms them",
    },
    ctaTitle: "Not sure which program fits?",
    ctaBody: "Book a counselling session to talk through the learner's goals, class and preferred centre.",
    ctaPrimary: "Book counselling",
    ctaSecondary: "Contact Aspire",
  },
  directory: {
    filterLabel: "Filter programs by exam",
    all: "All programs",
    showingOne: "Showing 1 program",
    showingMany: "Showing {count} programs",
    /** Appended to the status when a filter is active. */
    forTrack: "that prepare for {track}",
    emptyTitle: "No programs match this filter",
    emptyBody: "Choose another exam, or ask a counsellor which pathway suits the learner.",
    showAll: "Show all programs",
  },
  card: {
    preparesFor: "Prepares for:",
    learnMore: "Learn more",
    enquire: "Enquire",
    enquireSuffix: "about {title}",
    facts: {
      class: "Class",
      duration: "Duration",
      dailyTeaching: "Daily teaching",
      batchSize: "Batch size",
    },
  },
  /** Fact values ({count} = the stored number). */
  units: {
    hourOne: "{count} hr",
    hourMany: "{count} hrs",
    minutes: "{count} min",
    perDay: "{value} per day",
    upTo: "Up to {count}",
    upToStudents: "Up to {count} students",
  },
  detail: {
    notFoundTitle: "Program not found",
    enquire: "Enquire about this program",
    allPrograms: "All programs",
    draftTitle: "Draft program information",
    draftBody:
      "This description is a placeholder pending verification by Aspire's academic team. Please confirm details with a counsellor.",
    overview: "Overview",
    audience: "Who it's for",
    facts: {
      classLevel: "Class level",
      cohort: "Batch / cohort",
      preparesFor: "Prepares for",
    },
    highlights: "Program highlights",
    highlightsLead: "What the program includes, as described for this course.",
    otherTitle: "Other programs",
    otherLead: "Compare pathways before speaking with a counsellor.",
    ctaTitle: "Interested in the {title}?",
    ctaBody: "Share a few details and Aspire's admissions team can guide you on batches, centres and next steps.",
    ctaPrimary: "Enquire now",
    ctaSecondary: "Contact Aspire",
  },
  schedule: {
    title: "Schedule & fees",
    facts: {
      duration: "Duration",
      deliveryMode: "Delivery mode",
      dailyContactHours: "Daily contact hours",
      doubtResolution: "Doubt resolution",
      batchSize: "Batch size",
      fees: "Fees",
    },
    noneKnown:
      "Duration, timings, batch details and fees for this program are confirmed individually by Aspire's admissions team.",
    withFees: "Batch dates and seat availability are confirmed by Aspire's admissions team.",
    withoutFees: "Fees, batch dates and scholarships are confirmed individually by Aspire's admissions team.",
    askCounsellor: "Ask a counsellor for current details.",
    cta: "Ask a counsellor",
  },
};

export default programs;
