/**
 * Namespace "home" (owner: PAGES-A): the homepage sections (src/components/home/**).
 * English is the source of truth for the key shape; TypeScript then requires the same keys in
 * ../hi/home.ts. Plain object, no `as const`. See src/i18n/README.md.
 * Shared words (Demo, Illustration, Illustrative image, …) come from `common.labels`.
 */
const home = {
  meta: {
    title: "Aspire IIT & Medical — IIT JEE, NEET & Foundation coaching in Himachal Pradesh",
    description: "IIT JEE, NEET, Foundation and integrated school programs for students across Himachal Pradesh.",
  },
  hero: {
    eyebrow: "IIT-JEE · NEET · Foundation · Himachal Pradesh",
    titleLine1: "Dreams",
    titleLine2: "Take Discipline.",
    titleLine3: "Let’s Build Yours.",
    lead: "Structured programs, personal mentoring and a supportive learning environment for students preparing for IIT-JEE, NEET and Foundation.",
    ctaPrograms: "Explore Our Programs",
    ctaStory: "Our Story",
    trust: {
      faculty: "Experienced Faculty",
      tests: "Regular Tests & Analysis",
      mentoring: "Personal Mentoring",
      environment: "Supportive Learning Environment",
    },
  },
  stats: {
    title: "Aspire at a glance",
  },
  results: {
    eyebrow: "Results",
    title: "Results, year by year",
    leadWithCards: "Each card shows the exam, year and outcome as recorded. The full list is on the results page.",
    leadEmpty: "Verified results will be published here once Aspire has confirmed them.",
    cta: "View all results",
    railLabel: "Selected results",
    nameWithheld: "Name withheld",
    yearPrefix: "Year:",
    /** Visible rail position, e.g. "2 of 6". */
    position: "{current} of {total}",
    positionPrefix: "Showing result",
    previous: "Previous result",
    next: "Next result",
  },
  programs: {
    eyebrow: "Our programs",
    title: "A clear path for every aspirant",
    lead: "Choose a program by class and target exam, then see who it is for and how its year is structured.",
    cta: "Explore all programs",
    emptyTitle: "Program details are being finalised",
    emptyBody: "Programs will be listed here once Aspire has confirmed them. A counsellor can help in the meantime.",
    emptyCta: "Talk to a counsellor",
  },
  /**
   * "Student tools" widget (HomeTools). Tool names, form labels, sample labels and most CTAs come
   * from the `tools`, `predictor`, `mocktest`, `ask` and `planner` namespaces; only widget copy is here.
   */
  tools: {
    eyebrow: "Free student tools",
    title: "Practise, predict and plan",
    lead: "Estimate a rank band, take an exam-style mock test, get help with a doubt or count the days to your exam — free, in English or Hindi.",
    /**
     * Mode-agnostic since the lead gate (docs/lead-gate-plan.md §11.4): true whether the gate is
     * off, optional or required, and never "no sign-up needed".
     */
    points: {
      free: "Free. You may be asked for a contact number once before results",
      private: "Exact scores and dates are worked out in your browser, never sent",
      languages: "In English and Hindi",
    },
    seeAll: "See all tools",
    tabs: {
      predictor: "Rank predictor",
      mockTests: "Mock tests",
      ask: "Ask Rancho",
      planner: "Study planner",
    },
    /** Phone tile labels (nouns, one line at 375px). Visual only: each tab is still named by its full `tabs` label. */
    tabsShort: {
      predictor: "Rank",
      mockTests: "Mock test",
      ask: "Rancho",
      planner: "Planner",
    },
    /** One-line descriptions under each tile from `md` (and under the panel title below `md`). */
    taglines: {
      predictor: "From score to rank band in seconds",
      mockTests: "Timed tests, just like the real CBT",
      ask: "Type or photograph a doubt",
      planner: "Count the days, then plan them",
    },
    predictor: {
      lead: "Enter a score or percentile to see an estimated rank band. The full predictor adds colleges, category and home-state quota.",
      empty: "Your estimated rank band will appear here.",
      cta: "See colleges & full prediction",
      /** Recap above the contact form (local values only; {value} is the number the visitor typed). */
      ready: {
        score: "Your {exam} rank band for {value} marks is ready",
        percentile: "Your {exam} rank band for the {value} percentile is ready",
      },
      /** Closes the contact form and moves focus back to the score field. */
      change: {
        score: "Change score",
        percentile: "Change percentile",
      },
    },
    mockTests: {
      lead: "Exam-style computer-based tests with a timer, question palette and negative marking, then a topic-wise analysis of your attempt.",
      listLabel: "Tests you can start now",
    },
    /**
     * Rancho is Aspire's existing snow leopard mascot (not a new character) and now names the AI doubt
     * solver (owner request). The AI caveat comes from `ask.answer.disclaimer`; the full tool keeps its own `ask` copy.
     */
    ask: {
      title: "Ask Rancho",
      lead: "Rancho, Aspire's friendly snow leopard, answers Physics, Chemistry, Maths and Biology doubts step by step, in English or Hindi.",
      /** Rancho's speech bubble above the example questions (each one opens the chat with it prefilled). */
      examplesTitle: "Hi, I'm Rancho! Tap a question to ask me.",
      /** Opens the floating Rancho chat on this page (a plain link to /tools/ask without JS). */
      cta: "Chat with Rancho",
      /** Link to /rancho (the installable Rancho app). */
      app: "Get the Rancho app",
      examples: {
        physics: "Find the maximum height of a ball thrown at 20 m/s at 30° to the ground.",
        chemistry: "Why does the boiling point of water rise when salt is added?",
        maths: "How do I integrate x·eˣ?",
        biology: "How does double circulation work in the human heart?",
      },
    },
    planner: {
      lead: "Pick your exam and its date to see how many days you have. The planner then builds a day-by-day plan to that date.",
      prompt: "Choose your exam date to see the days left.",
      daysLeft: "{days} days to {exam}",
      today: "{exam} is today — all the best!",
      past: "That date has passed. Choose your next exam date.",
      /** The countdown's submit button (the lead gate may ask for contact details first). */
      submit: "Show days left",
      dateMissing: "Choose your exam date first.",
      /** A date is chosen but the countdown is not shown yet ({button} is `submit`). */
      pressToShow: "Press “{button}” to see your countdown.",
      /** Recap above the contact form. */
      ready: "Your {exam} countdown is ready",
      /** Closes the contact form and moves focus back to the date field. */
      change: "Change exam or date",
      /** Opens the Rancho chat with this prompt prefilled and a short context: exam and days left only. */
      askRancho: "Ask Rancho for a plan",
      askRanchoPrompt: "Can you help me plan my preparation for the days I have left?",
      askRanchoContext: "{exam}, {days} days to the exam",
      featuresLabel: "What the planner does",
      features: {
        plan: "A day-by-day plan to your exam date",
        revise: "Spaced revision of what you study",
        cards: "Formula flashcards",
        streak: "Streaks and XP to keep you going",
      },
    },
  },
  why: {
    eyebrow: "Why Aspire",
    title: "More than coaching",
    fallbackLead:
      "Preparation for IIT-JEE, NEET and Foundation built on clear concepts, planned practice and guidance that students and families can reach.",
    cta: "Our story",
    imageLine1: "Rooted in",
    imageLine2: "Himachal",
    /** Shown while no institute profile is publishable (mirrors the About page's approach pillars). */
    fallbackPoints: {
      clarity: { title: "Conceptual clarity", detail: "Understanding the ideas behind each topic before speed." },
      practice: { title: "Structured practice", detail: "Planned practice and revision that build exam readiness." },
      feedback: { title: "Consistent feedback", detail: "Regular checks that show students where to focus next." },
      guidance: { title: "Accessible guidance", detail: "Academic help students and families can reach." },
    },
  },
  centres: {
    eyebrow: "Our centres",
    titleOne: "{count} centre across Himachal Pradesh",
    titleMany: "{count} centres across Himachal Pradesh",
    lead: "Choose a centre on the map or from the list to see its address and phone number, then visit the directory for full details.",
    cta: "View all centres",
    demoNote:
      "Centre details are imported for review and not yet verified by Aspire. Building images are illustrations, not photos of the centres.",
    mapPinsLabel: "Centres on the map",
    mapNotToScale: "Map not to scale",
    listLabel: "Choose a centre",
    /** Live-region text after a centre is chosen. */
    showing: "Showing {name}",
    callPrefix: "Call {name}:",
    learnMore: "Learn more",
    learnMoreSuffix: "about {name}",
  },
  life: {
    eyebrow: "Student life",
    title: "A home for learning and growth",
    lead: "Student life is more than lectures: time in class, quiet reading, hands-on practicals and a settled daily routine. Ask us what each centre offers.",
    cta: "Explore student life",
    stockNote: "Illustrative stock photos. They do not show Aspire's centres, students or staff.",
    campusImageAlt: "Illustration of a hill-style campus building with mountains behind",
    tiles: {
      classroomsTitle: "Classrooms",
      classroomsActivity: "Learning together",
      hostelTitle: "Hostel life",
      hostelActivity: "Study and rest",
      campusTitle: "Campus life",
      campusActivity: "A place to focus",
      libraryTitle: "Library",
      libraryActivity: "Quiet reading",
      labsTitle: "Labs",
      labsActivity: "Hands-on practicals",
    },
  },
  voices: {
    eyebrow: "Testimonials",
    title: "Voices from families",
    lead: "Parents and students describe their experience in their own words.",
    demoNote: "Shown for review: consent and details are pending verification by Aspire.",
    parent: "Parent",
    student: "Student",
  },
  impact: {
    eyebrow: "Results list",
    title: "Entries in the imported results list, by exam year",
    subtitle: "These are list entries, not ranks.",
    demoSuffix: "Demo data — unverified.",
    legendLabel: "Legend",
    leftBar: "(left bar)",
    rightBar: "(right bar)",
    entryOne: "{count} entry",
    entryMany: "{count} entries",
    /** Accessible name of the chart: `{years}` = "2020: JEE 3, NEET 4; 2021: …". */
    chartLabel: "Grouped bar chart of entries in the imported results list by exam year. {years}.",
    chartYear: "{year}: JEE {jee}, NEET {neet}",
    showTable: "Show data as a table",
    tableCaption: "Entries in the imported results list by exam year (list entries, not ranks)",
    examYear: "Exam year",
    jeeEntries: "JEE entries",
    neetEntries: "NEET entries",
    coverage: "The chart covers {span} only.",
  },
  resources: {
    eyebrow: "Resources",
    title: "Guidance for your journey",
    lead: "Articles on study planning, exams and admissions to help students and parents plan ahead.",
    cta: "Explore resources",
  },
  cta: {
    title: "Ready to begin your journey?",
    description:
      "Take the first step towards your goals. Talk to the academic team about programs, admissions and centres.",
    primary: "Enquire Now",
    callUs: "Call Us",
    sloganDream: "Dream",
    sloganPrepare: "Prepare",
    sloganAchieve: "Achieve",
  },
};

export default home;
