/**
 * Namespace "about" (owner: PAGES-B). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/about.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 */
const about = {
  meta: {
    title: "About",
    description:
      "About Aspire IIT & Medical: our approach to IIT JEE, NEET and Foundation preparation and what we value in supporting students and families.",
  },
  /**
   * Design A · proof up front (2026-10-22). No figure lives here: the proof stats and the result card
   * come from the data (DEMO-badged placeholders, hidden in production). `highlight` must appear in
   * `title` exactly (it is set in gold); a wording without it simply renders a plain headline.
   */
  hero: {
    eyebrow: "About Aspire IIT & Medical",
    title: "IIT JEE and NEET coaching, right here in Himachal",
    highlight: "Himachal",
    lead: "IIT JEE, NEET, Foundation and integrated school programs for students across Himachal Pradesh, built on clear concepts, structured practice and regular feedback.",
    crumb: "About",
    primaryCta: "Talk to a counsellor",
    secondaryCta: "See our results",
    /** Accessible name of the proof figures. */
    statsLabel: "Aspire in numbers",
    /** Badge on the collage's result card (previous batches, D-031). */
    resultBadge: "Aspire result",
    rancho: { title: "Stuck on a doubt?", action: "Ask Rancho" },
  },
  /** Sections built from the institute profile (placeholder: development / preview only). */
  profile: {
    storyTitle: "Our story",
    factFounded: "Founded",
    factWhere: "Where",
    missionTitle: "Our mission",
    approachEyebrow: "Our approach",
    approachTitle: "How learning is organised",
    approachDescription: "Small batches, resident teachers and daily support, so questions don't wait.",
    valuesEyebrow: "What we value",
    valuesTitle: "Principles behind every class",
    journeyEyebrow: "Our journey",
    journeyTitle: "Every milestone starts with a student.",
    journeyDescription:
      "Key moments in how Aspire grew — its first classroom, new programs, campuses and the tools families use today.",
  },
  /** Honest fallback while no institute profile is publishable (production today). */
  pending: {
    storyTitle: "Our story",
    storyBody:
      "Aspire's story — how the institute began, how it has grown and the students it has guided — will be published here once it has been written and verified with the institute's leadership.",
    approachTitle: "Our approach",
    approachLead: "Conceptual clarity, structured practice, consistent feedback and accessible academic guidance.",
    approach: [
      { title: "Conceptual clarity", detail: "Understanding the ideas behind each topic before speed." },
      { title: "Structured practice", detail: "Planned practice and revision that build exam readiness." },
      { title: "Consistent feedback", detail: "Regular checks that show students where to focus next." },
      { title: "Accessible guidance", detail: "Academic help students and families can reach." },
    ],
    notice: "Years of operation, centre details and results will be added only after Aspire has verified them.",
    speakCta: "Speak with Aspire",
    valuesEyebrow: "What we value",
    valuesTitle: "Guided by students and families",
    valuesDescription: "The principles behind how Aspire supports each learner.",
    values: [
      { title: "Student-first", detail: "Guidance beyond the classroom." },
      { title: "Structured learning", detail: "Clear plans for learning, practice and revision." },
      { title: "Personal support", detail: "Attention to each learner's goals and progress." },
      { title: "Close to home", detail: "Local learning and guidance in Himachal Pradesh." },
    ],
  },
  spaces: {
    title: "Learning, practice and revision",
    description:
      "Photographs of Aspire's own centres and classrooms will replace these once they are approved for use.",
    note: "Illustrative stock photos. They do not show Aspire's centres, students or staff.",
    captions: {
      notes: "Taking notes in class",
      classroom: "Classroom learning",
      lab: "Hands-on science practice",
      library: "Reading and revision",
    },
  },
  /**
   * "Results from previous batches" (D-031): beside a result-card mosaic in preview and a stock photo
   * in production, so the copy describes how results are published — never what a card shows.
   */
  results: {
    eyebrow: "Previous results",
    title: "Results from previous batches",
    description:
      "Aspire publishes results from its previous JEE and NEET batches on the results page, by exam and year, once they are verified. A student's name and result card appear only with the student's or guardian's consent.",
    link: "View results",
  },
  explore: {
    eyebrow: "Explore",
    title: "Hostels and campuses",
    description: "See how residential life works and find a campus near you.",
    hostels: {
      title: "Hostels",
      description: "Residential life for students who board: supervision, facilities and the daily routine.",
      cta: "Explore hostels",
    },
    centres: {
      title: "Campuses",
      description: "Where Aspire teaches, with addresses, opening hours and the programs at each campus.",
      cta: "Find a campus",
    },
  },
  cta: {
    title: "Ready to take your next step?",
    description: "Talk to the academic team and explore the right program for your goals.",
    enquire: "Enquire now",
    contact: "Contact Aspire",
  },
};

export default about;
