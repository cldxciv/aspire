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
  /** Hero C · results ribbon (2026-10-22 hero redesign, src/components/hero). */
  hero: {
    /**
     * True in both modes: the live demo site shows unverified DEMO cards under it, so the headline
     * makes no claim about who the students are (the design's "Every rank … is a real Aspire
     * student" would contradict the page's own demo notice).
     */
    title: "Results from Aspire's batches, year by year",
    /** Phrase of `title` set in gold; must appear in `title` exactly. */
    highlight: "year by year",
    lead: "A transparent archive of achievements by exam and year, with the source of every entry.",
    /** The page's one main action (to /admissions#enquiry). */
    cta: "Join the next batch",
    /**
     * Entries in the rankers list for the ribbon's year (getRankerYearCounts(): list entries, not
     * ranks). Shown only when the data has entries for that year; `one` / `single` when only one
     * exam has entries.
     */
    counts: {
      both: "The {year} rankers list has {jee} JEE and {neet} NEET entries.",
      one: "The {year} rankers list has {count} {exam} entries.",
      single: "The {year} rankers list has 1 {exam} entry.",
    },
    /** ResultsRibbon labels (the year pills filter the ribbon). */
    ribbon: {
      /** Distinct from `cards.listLabel` (the mosaics beside the rankers list). */
      listLabel: "Recent result cards from Aspire's batches",
      yearGroup: "Show results from",
      /** Last pill: every year in the ribbon, which holds only the newest {count} years (not the whole archive). */
      allYears: "All {count} years",
      pause: "Pause the result cards",
      play: "Play the result cards",
      previous: "Previous card",
      next: "Next card",
      position: "Card {current} of {total}",
      hint: "A new card every 5 seconds",
    },
  },
  notices: {
    demoTitle: "Demo data — pending verification",
    demoBody:
      "Entries marked DEMO were imported from Aspire's demo site for review. Their names, ranks and colleges have not been verified against Aspire's official records, and publication consent has not been confirmed. Demo entries are shown only while demo content is switched on for review; otherwise this page lists only verified records published with consent.",
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
  /** Result-card images (ResultCardMosaic / ResultCardMarquee, D-031). Neutral wording: no "toppers", "best" or guarantees. */
  cards: {
    title: "Previous results",
    lead: "Result cards from Aspire's previous batches.",
    listLabel: "Result cards from Aspire's previous batches",
    seeAll: "See all results",
    /** Visible text of the marquee's pause toggle (a checkbox; checked = paused). */
    pause: "Pause",
    /** Accessible name of that toggle; must contain `pause`. */
    pauseLabel: "Pause the moving result cards",
    scrollLabel: "Result cards from Aspire's previous batches (scrolls sideways)",
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
