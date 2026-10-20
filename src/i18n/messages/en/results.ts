/**
 * Namespace "results" (owner: PAGES-A): /results and the result cards, archive and rankers list.
 * English is the source of truth for the key shape; ../hi/results.ts must have the same keys.
 * Plain object, no `as const`. See src/i18n/README.md.
 * Names, ranks, colleges, quotes and source references are data and are never translated here.
 */
const results = {
  meta: {
    title: "Results",
    description:
      "Aspire's results archive publishes only verified, consent-aware records by exam and year, with the source of every entry.",
  },
  crumb: "Results",
  hero: {
    title: "Student success deserves to be documented accurately.",
    lead: "A transparent archive of achievements by exam and year, with the source of every entry.",
  },
  notices: {
    demoTitle: "Demo data — pending verification",
    demoBody:
      "The names, ranks and colleges on this page were imported from Aspire's demo site for review. They are marked DEMO, have not been verified against Aspire's official records, and publication consent has not been confirmed. They are hidden on the live site until both are in place.",
    verifiedTitle: "Only verified records are published",
    verifiedBody:
      "This archive contains no unverified student names, ranks, selection counts or testimonials. Entries are added from Aspire's official records, with documented consent.",
  },
  stories: {
    eyebrow: "Success stories",
    title: "Students in their own words",
    lead: "Outcomes, destinations and a few words from students about their preparation.",
  },
  archive: {
    title: "Results archive",
    leadWithRecords: "Ranks, scores and allotted colleges by exam and year.",
    leadEmpty: "Browse verified results by exam and year.",
    filterLegend: "Filter the results archive",
    exam: "Exam",
    year: "Year",
    allExams: "All exams",
    allYears: "All years",
    clearFilters: "Clear filters",
    disabledHelp:
      "Filters become available once verified results are published. No result records have been published yet.",
    showingOne: "Showing 1 {noun}",
    showingMany: "Showing {count} {nouns}",
    nounResult: "result",
    nounResults: "results",
    nounVerified: "verified result",
    nounVerifieds: "verified results",
    forExam: "for {exam}",
    inYear: "in {year}",
    noMatchTitle: "No results match these filters",
    noMatchBody: "Try another exam or year.",
  },
  /** Honest stand-ins while no verified record is published (no names, ranks or counts). */
  awaiting: {
    jee: {
      tag: "JEE",
      title: "Verified result archive",
      description:
        "Exam, year and outcome from Aspire's official records, with the student's name only where consent is given.",
      status: "No verified result published yet",
    },
    neet: {
      tag: "NEET",
      title: "Verified result archive",
      description: "Approved result details and student stories, published with consent.",
      status: "No verified result published yet",
    },
    foundation: {
      tag: "Foundation",
      title: "Student progress stories",
      description: "Approved academic milestones that do not imply unverified exam outcomes.",
      status: "No approved story published yet",
    },
    archive: {
      tag: "Archive",
      title: "Historical records",
      description: "Year-wise records will be browsable here once Aspire provides verified data.",
      status: "Awaiting records",
    },
  },
  card: {
    nameWithheld: "Name withheld",
    student: "Student",
    destination: "Destination",
    destinationPrefix: "Destination:",
    school: "School",
    campus: "Campus",
    source: "Source:",
    verified: "Verified:",
    /** Short month names, space-separated (verification dates). */
    months: "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec",
  },
  rankers: {
    title: "Rankers list",
    lead: "Search by name or college, or filter by exam and year. The newest results are listed first.",
    formLabel: "Rankers list",
    searchLabel: "Search by name or college",
    searchPlaceholder: "e.g. NIT Hamirpur",
    exam: "Exam",
    year: "Year",
    allExams: "All exams",
    allYears: "All years",
    clear: "Clear",
    matching: "matching “{query}”",
    noMatch: "No rankers match",
    noMatchFor: "No rankers match: {filters}",
    showing: "Showing {shown} of {total}",
    showingFiltered: "Showing {shown} of {total} ({filters})",
    rankerOne: "{count} ranker",
    rankerMany: "{count} rankers",
    caption: "Rankers, newest first. Columns: student, college or institute, exam and year.",
    student: "Student",
    institution: "College / institute",
    examYear: "Exam / year",
    notStated: "Not stated",
    showMore: "Show {count} more",
    remainingOne: "of {count} remaining ranker",
    remainingMany: "of {count} remaining rankers",
    noMatchTitle: "No rankers match these filters",
    noMatchBody: "Check the spelling, or try another exam or year.",
    clearFilters: "Clear filters",
    source: "Source:",
  },
  method: {
    eyebrow: "Methodology",
    title: "How results are published",
    lead: "Results matter to families making important decisions, so every entry follows the same standard.",
    standards: {
      sourced: {
        title: "Sourced",
        text: "Each entry records where the outcome comes from, and that source is shown with the result.",
      },
      consent: {
        title: "Consent-aware",
        text: "A student's name appears only when the student or guardian has approved publication.",
      },
      verified: {
        title: "Verified first",
        text: "Results are checked against Aspire's official records before they are published.",
      },
      context: {
        title: "In context",
        text: "Outcomes are listed by exam and year, without combined counts or unsupported superlatives.",
      },
    },
    disclaimer:
      "Individual results reflect each student's own effort and circumstances and are not a guarantee of future outcomes. If you believe an entry is inaccurate, please contact Aspire so it can be reviewed.",
  },
  cta: {
    title: "Plan your own preparation journey",
    body: "Talk to a counsellor about the program and support that suit the learner's goals.",
    primary: "Book counselling",
    secondary: "Explore programs",
  },
};

export default results;
