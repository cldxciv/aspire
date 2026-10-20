/**
 * Namespace "common" (owner: I18N-CORE): site chrome and shared UI strings.
 * English is the source of truth for the key shape: `../hi/common.ts` must have exactly these keys.
 * Plain object, no `as const` (values must stay `string` so Hindi can differ).
 * `{name}` placeholders are filled with `format()` from `@/i18n/format`.
 */
const common = {
  meta: {
    defaultTitle: "Aspire IIT & Medical — IIT JEE, NEET & Foundation coaching",
    description: "IIT JEE, NEET, Foundation and integrated school programs for students across Himachal Pradesh.",
  },
  skipLink: "Skip to content",
  logo: {
    homeLabel: "Aspire IIT & Medical — home",
  },
  previewBanner: {
    shortTitle: "Preview",
    shortDetail: "DEMO items are unverified",
    longTitle: "Preview build",
    longDetail: "Items marked DEMO are placeholders awaiting verification by Aspire.",
  },
  nav: {
    mainLabel: "Main",
    /** Labels for `labelKey` in src/config/site.ts (mainNav / portalNav). */
    items: {
      home: "Home",
      programs: "Programs",
      allPrograms: "All programs",
      admissions: "Admissions",
      results: "Results",
      centres: "Centres",
      hostels: "Hostels",
      about: "About",
      resources: "Resources",
      allResources: "All resources",
      articles: "Articles & guidance",
      downloads: "Downloads",
      admissionsFaqs: "Admissions FAQs",
      studentTools: "Student tools",
      predictor: "Rank & college predictor",
      mockTests: "Mock tests",
      askAspire: "Ask Aspire (doubts)",
      planner: "Study planner",
      contact: "Contact",
      studentLogin: "Student Login",
      parentLogin: "Parent Login",
    },
    /** Dropdown descriptions for `descriptionKey` in src/config/site.ts. */
    descriptions: {
      allPrograms: "IIT-JEE, NEET, Foundation and dropper pathways",
      admissions: "How to enquire and what happens next",
      studentTools: "Free predictor, mock tests, doubt help and planner",
    },
    currentSection: "(current section)",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    portalLogin: "Portal login",
    enquireNow: "Enquire Now",
    loginLabel: "Student and parent login",
  },
  languageSwitcher: {
    /** Accessible name of the switcher group. */
    label: "Language",
  },
  footer: {
    blurb: "Helping students move forward with clarity, effort and guidance.",
    navLabel: "Footer",
    legalNavLabel: "Legal and portal",
    followUs: "Follow Aspire",
    socialLink: "Aspire on {platform}",
    whatsapp: "WhatsApp {number}",
    contactDemo: "Demo · contact details pending verification",
    socialDemo: "Demo · social links pending verification",
    privacy: "Privacy",
    terms: "Terms",
    sitemap: "Sitemap",
  },
  notFound: {
    metaTitle: "Page not found",
    eyebrow: "404",
    title: "We couldn't find that page",
    body: "The page may have moved, or the link may be incorrect.",
    home: "Go to home",
    contact: "Contact us",
  },
  /** (site)/error.tsx (owner: PAGES-B). Buttons come from `buttons.tryAgain` / `buttons.goHome`. */
  errorPage: {
    eyebrow: "Something went wrong",
    title: "We couldn't load this page",
    body: "This is usually temporary. Please try again — if it keeps happening, come back a little later.",
  },
  buttons: {
    enquireNow: "Enquire Now",
    bookCounselling: "Book counselling",
    contactUs: "Contact us",
    goHome: "Go to home",
    tryAgain: "Try again",
    readMore: "Read more",
    learnMore: "Learn more",
    viewAll: "View all",
    back: "Back",
    next: "Next",
    previous: "Previous",
    close: "Close",
    submit: "Submit",
  },
  labels: {
    home: "Home",
    breadcrumb: "Breadcrumb",
    demo: "Demo",
    demoPending: "Demo · pending verification",
    illustrativeImage: "Illustrative image",
    illustrativeStockPhoto: "Illustrative stock photo",
    illustration: "Illustration",
    opensInNewTab: "(opens in a new tab)",
    loading: "Loading…",
    required: "Required",
    optional: "Optional",
  },
  /** Shared `ImageCarousel` (src/components/ui/ImageCarousel.tsx). `{n}` / `{total}` via `format()`. */
  carousel: {
    label: "Photo gallery",
    previous: "Previous photo",
    next: "Next photo",
    pause: "Pause slideshow",
    play: "Play slideshow",
    goTo: "Go to slide {n}",
    slideOf: "{n} of {total}",
    /** Read aloud as the role of the carousel and of each slide (aria-roledescription). */
    roleCarousel: "carousel",
    roleSlide: "slide",
  },
};

export default common;
