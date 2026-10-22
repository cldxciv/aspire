/**
 * Namespace "layout" (owner: PAGE-LAYOUT CORE-1; docs/page-layout-plan.md §3, §11). English is the
 * source of truth for the key shape; TypeScript requires the same keys in ../hi/layout.ts. Plain
 * object, no `as const`.
 *
 * The admin "Page layout" screen (staff-facing), the draft-preview banner on the public pages
 * (seen only by a super admin in preview) and the label of every section in
 * src/lib/page-layout/registry.ts. Placeholders use `{name}` (fill / format).
 *
 * `pages.<page>.sections.<key>.label` exists for every registry key (hero and pinned ones
 * included); `.hint` (a full sentence) only for conditional sections (registry.test.ts checks both).
 */
const layout = {
  meta: {
    title: "Page layout",
    description: "Choose the order of the sections on each website page and which ones are shown.",
  },
  title: "Page layout",
  lead: "Move sections up or down and choose which ones are shown. Visitors see a change only after you publish it.",
  readOnly: {
    title: "Only a super admin can change page layouts",
    body: "You can see the order that is live on each page and its history.",
  },
  previewAccess: "Preview: sign in as an admin to see the saved layouts.",
  picker: {
    label: "Page",
    hint: "The list below shows this page's sections from top to bottom.",
    unsaved: "unsaved changes",
    draft: "draft",
    custom: "custom order",
  },
  status: {
    liveDefault: "Live now: the original order.",
    liveCustom: "Live now: a custom order, published {date} by {name}.",
    draft: "Draft saved {date} by {name}. Not live yet.",
    noDraft: "No draft.",
    unsaved: "You have changes that are not saved.",
  },
  viewLive: "View the live page",
  newTab: "(opens in a new tab)",
  list: {
    heading: "Sections, top to bottom",
  },
  row: {
    position: "Position {n}",
    fixedFirst: "Always first",
    fixedLast: "Always last",
    hidden: "Hidden",
    moveUp: "Move {section} up",
    moveDown: "Move {section} down",
    show: "Show on page",
    showFor: "({section})",
  },
  keep: {
    linked: "Always shown: buttons and links elsewhere on the website lead to this section.",
    notice: "Always shown: it carries the page's note on which information is verified.",
    core: "Always shown: this is the main content of the page.",
  },
  reasons: {
    notLast: "{section} can't be the last section: keep an always-shown section below it.",
    noneVisible: "Keep at least one section visible that doesn't depend on verified details.",
    atTop: "Already at the top.",
    atBottom: "Already at the bottom.",
  },
  announce: {
    moved: "{section} moved to position {position} of {total}.",
    hidden: "{section} will be hidden.",
    shown: "{section} will be shown.",
  },
  actions: {
    save: "Save draft",
    saving: "Saving…",
    saveNothing: "No changes to save.",
    undo: "Undo changes",
    preview: "Preview draft",
    previewNeedsSave: "Save your changes to preview them.",
    previewNoDraft: "Save a draft to preview it.",
    publish: "Publish draft",
    publishNeedsDraft: "Save a draft before publishing.",
    publishNeedsSave: "Save your changes before publishing.",
    publishTitle: "Publish this order?",
    publishBody: "Visitors will see it on the {page} page straight away.",
    publishNow: "Publish now",
    discard: "Discard draft",
    discardTitle: "Discard the draft?",
    discardBody: "The live page does not change.",
    discardNow: "Discard now",
    reset: "Reset to the original order",
    resetNothing: "This page already uses the original order.",
    resetTitle: "Go back to the original order?",
    resetBody: "This puts the original order live straight away and deletes any draft for this page.",
    resetNow: "Reset now",
    cancel: "Cancel",
    reload: "Reload",
  },
  done: {
    saved: "Draft saved. Preview it, then publish.",
    published: "Published. The {page} page now uses this order.",
    discarded: "Draft discarded.",
    reset: "The original order is live again.",
  },
  errors: {
    conflict:
      "Someone else changed this page's layout. Reload to see their changes (your unsaved changes will be lost).",
    forbidden: "Only a super admin can change page layouts.",
    signedOut: "Your session has ended. Sign in again.",
    validation: "Please fix the problems listed above.",
    rateLimited: "Too many changes in a short time. Wait a minute and try again.",
    network: "Could not reach the server. Check your connection and try again.",
    noDraft: "There is no saved draft to publish.",
    generic: "Something went wrong. Please try again.",
  },
  history: {
    heading: "History",
    empty: "No changes yet: this page uses the original order.",
    /** Used before "ने" in Hindi (oblique form there). */
    someone: "Someone",
    actions: {
      saveDraft: "{name} saved a draft",
      publish: "{name} published",
      reset: "{name} reset to the original order",
      discardDraft: "{name} discarded the draft",
    },
    moved: "{section} moved from position {from} to {to}",
    hid: "{section} hidden",
    showed: "{section} shown",
    noChange: "no change to the order",
  },
  banner: {
    title: "Draft preview",
    draft: "You are previewing the draft layout of this page. Visitors still see the published layout.",
    noDraft: "Preview mode is on. This page has no draft, so you see its published layout.",
    exit: "Exit preview",
    back: "Back to the layout editor",
  },
  pages: {
    home: {
      name: "Home",
      sections: {
        hero: { label: "Top banner and enquiry form" },
        stats: { label: "Aspire at a glance (key figures)", hint: "Shown only when the key figures are verified." },
        results: { label: "Results, year by year" },
        programs: { label: "Programs" },
        tools: { label: "Free student tools" },
        why: { label: "Why Aspire" },
        centres: { label: "Our centres", hint: "Shown only when centre details are verified." },
        life: { label: "Student life" },
        voices: { label: "Voices from families", hint: "Shown only when testimonials are approved." },
        impact: { label: "Results list by year (chart)", hint: "Shown only when the results list is published." },
        resources: { label: "Guidance articles", hint: "Shown only when articles are published." },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    about: {
      name: "About",
      sections: {
        hero: { label: "Top banner" },
        story: { label: "Our story" },
        mission: { label: "Our mission", hint: "Shown only when the institute profile is verified." },
        approach: { label: "How learning is organised" },
        values: { label: "Our principles" },
        results: { label: "Results from previous batches" },
        journey: { label: "Milestones", hint: "Shown only when the institute profile is verified." },
        explore: { label: "Hostels and campuses" },
        spaces: { label: "Learning spaces (photos)" },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    admissions: {
      name: "Admissions",
      sections: {
        hero: { label: "Top banner" },
        enquiry: { label: "Admission enquiry form" },
        next: { label: "What happens next" },
        results: { label: "Results from previous batches" },
        scholarships: { label: "Scholarships", hint: "Shown only when scholarship-test dates are verified." },
        downloads: { label: "Prospectus and test papers", hint: "Shown only when downloads are published." },
        faqs: { label: "Frequently asked questions" },
      },
    },
    programs: {
      name: "Programs",
      sections: {
        hero: { label: "Top banner and program picker" },
        directory: { label: "Program list" },
        tracks: { label: "Preparation tracks" },
        guide: { label: "What each program page covers" },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    results: {
      name: "Results",
      sections: {
        hero: { label: "Top banner" },
        stories: { label: "Student stories", hint: "Shown only when featured results are verified." },
        archive: { label: "Results archive" },
        rankers: { label: "Rankers list", hint: "Shown only when the rankers list is published." },
        method: { label: "How results are published" },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    centres: {
      name: "Centres",
      sections: {
        hero: { label: "Top banner and centre finder" },
        directory: { label: "Centre directory" },
        districts: { label: "Districts each campus serves" },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    hostels: {
      name: "Hostels",
      note: "Until hostel details are verified, this page shows one 'details coming soon' section instead of the sections below.",
      sections: {
        hero: { label: "Top banner" },
        intro: { label: "Hostel overview" },
        campuses: { label: "Hostels by campus", hint: "Shown only when hostel details are verified." },
        care: { label: "Safety, study and care" },
        rooms: { label: "Rooms", hint: "Shown only when hostel details are verified." },
        day: { label: "A day in residence", hint: "Shown only when hostel details are verified." },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    resources: {
      name: "Resources",
      sections: {
        hero: { label: "Top banner" },
        types: { label: "Find what you need" },
        downloads: { label: "Planners, papers and prospectus", hint: "Shown only when downloads are published." },
        articles: { label: "Study guidance and updates" },
        results: { label: "Results from previous batches" },
        cta: { label: "Closing invitation to enquire" },
      },
    },
    contact: {
      name: "Contact",
      sections: {
        hero: { label: "Top banner and centre finder" },
        form: { label: "Enquiry form" },
        details: { label: "Contact details" },
        help: { label: "Help choosing a program or centre" },
        desks: { label: "Campus admissions desks", hint: "Shown only when campus desk details are verified." },
      },
    },
    tools: {
      name: "Student tools",
      sections: {
        hero: { label: "Top banner with links to each tool" },
        rancho: { label: "Rancho app card" },
        predictor: { label: "Rank and college predictor" },
        mockTests: { label: "Mock tests" },
        ask: { label: "Ask Rancho (doubt solver)" },
        planner: { label: "Study planner" },
        note: { label: "Closing note about saving your work" },
      },
    },
  },
};

export default layout;
