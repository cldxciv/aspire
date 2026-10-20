/**
 * Namespace "resources" (owner: PAGES-B). English is the source of truth for the key shape;
 * TypeScript then requires the same keys in ../hi/resources.ts. Plain object, no `as const`.
 * See src/i18n/README.md.
 *
 * `card` is also what other pages pass to `<ArticleCard messages={…}>` (e.g. the home page).
 */
const resources = {
  meta: {
    title: "Resources",
    description:
      "Study guidance, exam preparation articles and admissions help for IIT JEE, NEET and Foundation students from Aspire IIT & Medical.",
  },
  hero: {
    title: "Resources for the next step",
    crumb: "Resources",
    lead: "Study guidance, exam information and answers to common admissions questions.",
  },
  types: {
    title: "Find what you need",
    description: "Guidance for students and families at every stage of preparation.",
  },
  categories: {
    study: {
      title: "Study guidance",
      description: "Study plans, revision guidance and exam preparation articles.",
      countOne: "{count} article below",
      countMany: "{count} articles below",
      comingSoon: "Coming soon",
      read: "Read articles",
      ask: "Ask a study question",
    },
    practice: {
      title: "Practice and tests",
      description: "Online practice and tests will be linked here if Aspire connects its test platform.",
      action: "Student portal",
    },
    downloads: {
      title: "Prospectus and downloads",
      description: "Planners, past papers and the prospectus. Files will be added once Aspire approves them.",
      note: "Available soon",
      action: "See downloads",
    },
    prospectus: {
      title: "Prospectus",
      description: "A current prospectus will be available here once Aspire approves it.",
      action: "Request information",
    },
    faqs: {
      title: "Frequently asked questions",
      description: "Admissions, programs, scholarships and centre information.",
      action: "Read admissions FAQs",
    },
  },
  downloads: {
    eyebrow: "Downloads",
    title: "Planners, papers and prospectus",
    description:
      "These files are not available to download yet. They will be added here once Aspire has approved them.",
    /** Disclosure under the first few download cards. */
    showAll: "Show all {count} downloads",
    showFewer: "Show fewer downloads",
  },
  /** Labels inside each download card (also used on /admissions). */
  downloadCard: {
    subjects: "Subjects",
    audience: "For",
    pages: "Pages",
    size: "Size",
    availableSoon: "Available soon",
  },
  articles: {
    eyebrow: "Articles",
    title: "Study guidance and updates",
    description: "Articles are published here after review by Aspire.",
    emptyTitle: "No articles published yet",
    emptyDescription:
      "Study guidance and exam updates will appear here once Aspire's academic team has approved them.",
    emptyAction: "Ask a question",
  },
  cta: {
    title: "Not sure where to start?",
    description: "Talk to the academic team about the right program and preparation plan.",
    enquire: "Enquire now",
    contact: "Contact Aspire",
  },
  card: {
    read: "Read",
    categories: {
      "study-guidance": "Study guidance",
      "exam-updates": "Exam updates",
      news: "News",
      admissions: "Admissions",
    },
    /** Month names for dates ("18 Oct 2026"). */
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  article: {
    notFoundTitle: "Article not found",
    published: "Published {date}",
    by: "By {author}",
    allResources: "All resources",
    ctaTitle: "Questions about a program?",
    ctaBody: "Talk to the admissions team about the right program and next steps for the student.",
    enquire: "Enquire now",
    explorePrograms: "Explore programs",
    related: "Related resources",
  },
};

export default resources;
