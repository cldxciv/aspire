/**
 * Namespace "admissions" (owner: PAGES-B). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/admissions.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 */
const admissions = {
  meta: {
    title: "Admissions",
    description:
      "Start an admissions enquiry with Aspire IIT & Medical for IIT JEE, NEET, Foundation or integrated programs, and see what happens next.",
  },
  /**
   * Design A · proof up front with B's "Next batch" card (2026-10-22). No figure or date lives here:
   * the proof stats, the result card and the card's centres come from the data (DEMO-badged
   * placeholders, hidden in production). `highlight` must appear in `title` exactly (set in gold).
   */
  hero: {
    eyebrow: "IIT JEE · NEET · Foundation",
    title: "Start your Aspire journey",
    highlight: "Aspire journey",
    crumb: "Admissions",
    lead: "Tell us about the student's goals. An enquiry is the first step — the admissions team can then guide you through counselling and the next stages.",
    primaryCta: "Send an enquiry",
    secondaryCta: "How admission works",
    /** Accessible name of the proof figures. */
    statsLabel: "Aspire in numbers",
    /** Badge on the collage's result card (previous batches, D-031). */
    resultBadge: "Aspire result",
    /**
     * The "Next batch" card: no start date, seats or fees in the data yet, so it asks for them.
     * `centres` labels the row of the visible centres' districts (e.g. the Dharamshala centre is
     * in Kangra), so it says "Centres in", never "Centres".
     */
    batch: {
      eyebrow: "Next batch",
      centres: "Centres in",
      action: "Ask about start dates",
    },
  },
  enquiry: {
    title: "Admission enquiry",
    lead: "A short first step. Sending an enquiry is not an application — the formal admission process is confirmed by Aspire.",
    demoCentres: "The campus options below are demo data pending verification.",
  },
  next: {
    title: "What happens next?",
    stepLabel: "Step {number}",
    steps: [
      { title: "Enquiry", detail: "The admissions team reviews your request." },
      { title: "Counselling", detail: "Discuss the learner's goals and suitable programs." },
      { title: "Application", detail: "Complete the institute's approved admission steps." },
      { title: "Decision and enrolment", detail: "Follow the instructions Aspire confirms with you." },
    ],
    note: "These steps are indicative; Aspire will confirm the exact process.",
    confirmedTitle: "Scholarships, fees and documents",
    confirmedBody:
      "Scholarship eligibility, fee schedules, document requirements and admission decisions are confirmed by Aspire directly. They are not published on this website yet.",
    exploreCentres: "Explore centres",
  },
  /**
   * "Results from previous batches" (D-031) beside a result-card mosaic (preview) or a stock photo
   * (production): the copy says how results are published, never what a card shows.
   */
  results: {
    eyebrow: "Previous results",
    title: "Results from previous batches",
    description:
      "See results from Aspire's previous JEE and NEET batches by exam and year. Results are published once verified, and a student's name and result card only with the student's or guardian's consent.",
    link: "View results",
  },
  scholarships: {
    title: "Scholarships",
    notice:
      "Eligibility, test dates and scholarship amounts are confirmed by Aspire directly. Please check them with the admissions team before relying on them.",
    ask: "Ask about scholarships",
  },
  downloads: {
    eyebrow: "Downloads",
    title: "Prospectus and scholarship-test papers",
    description: "Not available to download yet — the files will be added once Aspire approves them.",
    all: "All downloads",
  },
  faqs: {
    eyebrow: "Admissions",
    title: "Frequently asked questions",
    description: "Quick answers about enquiries, counselling and scholarships.",
    emptyTitle: "Answers are being prepared",
    emptyDescription:
      "Admissions FAQs will be published here once Aspire has reviewed them. You can ask your question using the enquiry form above.",
  },
};

export default admissions;
