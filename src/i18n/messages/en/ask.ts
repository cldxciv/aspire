/**
 * Namespace "ask" — RANCHO, the AI doubt solver at /tools/ask (formerly "Ask Aspire"; owner: A3-ASK).
 * Rancho is Aspire's own friendly snow leopard mascot; the copy always keeps clear that the doubt solver is an AI.
 * English defines the shape; ../hi/ask.ts must match it.
 * Plain object, no `as const` (see src/i18n/README.md).
 */
const ask = {
  meta: {
    title: "Ask Rancho: AI doubt solver in English and Hindi",
    description:
      "Rancho, Aspire's snow leopard, now answers your doubts. Type or photograph a Physics, Chemistry, Maths or Biology question and get step-by-step help in English or Hindi from our AI doubt solver. Free daily questions. AI can make mistakes — check with your teacher.",
  },
  hero: {
    crumbTools: "Student tools",
    /** Breadcrumb and short name of the tool. */
    crumb: "Ask Rancho",
    title: "Rancho — your doubt-solving study buddy",
    lead: "Rancho, Aspire's friendly snow leopard, now answers your doubts. Stuck on a Physics, Chemistry, Maths or Biology question? Type it or take a photo and Rancho walks you through it step by step, in English or Hindi.",
    note: "Rancho is an AI doubt solver for Class 9–12, JEE and NEET students, not a person. AI can make mistakes — check with your teacher.",
    /** Accessible name of the mascot illustration. */
    mascotLabel: "Rancho, Aspire's snow leopard mascot, waving",
    /** Visible pill on the mascot illustration (keeps the AI disclosure next to the picture). */
    mascotCaption: "AI doubt solver",
  },
  form: {
    heading: "Ask Rancho your doubt",
    lead: "One question at a time works best.",
    subjectLabel: "Subject",
    subjects: {
      auto: "Any / not sure",
      physics: "Physics",
      chemistry: "Chemistry",
      maths: "Maths",
      biology: "Biology",
    },
    languageLegend: "Answer language",
    languages: {
      en: "English",
      hi: "हिंदी (Hindi)",
    },
    questionLabel: "Your question",
    questionPlaceholder:
      "e.g. A ball is thrown at 20 m/s at 30° above the horizontal. Find its maximum height. (g = 10 m/s²)",
    questionHint: "Type it as it appears in your book, or add a photo below.",
    charCount: "{count} / {max}",
    photoLabel: "Photo of the question",
    optional: "(optional)",
    addPhoto: "Take or choose a photo",
    changePhoto: "Change photo",
    removePhoto: "Remove photo",
    photoHint: "One question per photo: flat, well lit and in focus.",
    photoPreviewAlt: "Your photo of the question",
    photoPreparing: "Preparing photo…",
    photoUnreadable: "We couldn't open that photo. Please try a JPG or PNG.",
    photoTooLarge: "That photo is too large. Crop it to just the question and try again.",
    consentLabel: "This photo shows only the question: no faces, names or other personal details.",
    privacyNote:
      "Don't include faces or names. Photos aren't stored — they're used only to answer this question. Your question and photo are processed by Anthropic's API (Claude) to write the answer.",
    privacyLink: "Privacy notice",
    submit: "Get step-by-step help",
    sending: "Sending…",
    stop: "Stop",
    remaining: "{remaining} of {limit} questions left today",
    remainingNone: "No questions left today. The limit resets at midnight (India time).",
    guestNote: "Aspire students: sign in to get more questions a day and keep track of your weak topics.",
    signIn: "Student sign-in",
    studentNote: "You're signed in. The subject and topic of each doubt are saved to your account to show your weak areas.",
    errors: {
      questionRequired: "Type your question or add a photo of it.",
      questionTooLong: "Please keep your question under {max} characters.",
      consentRequired: "Please tick the box to confirm the photo has no faces or names.",
    },
  },
  answer: {
    heading: "Rancho's answer",
    working: "Rancho is working through your question…",
    workingHint: "Hard questions can take up to a minute.",
    ready: "The answer is ready.",
    stopped: "You stopped the answer.",
    copy: "Copy answer",
    copied: "Copied",
    subjectLabel: "Subject",
    topicLabel: "Topic",
    difficultyLabel: "Level",
    difficulty: {
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
    truncated: "The answer was cut short because it got very long. Try asking about one part of the question at a time.",
    refused: "Rancho can't help with that request. Try a Physics, Chemistry, Maths or Biology question.",
    disclaimer: "AI can make mistakes — check with your teacher.",
    helpfulQuestion: "Was this helpful?",
    helpfulYes: "Yes",
    helpfulNo: "No",
    helpfulThanks: "Thanks for telling us. Your feedback stays on this device.",
    askAnother: "Ask another question",
  },
  errors: {
    notConnectedTitle: "Rancho isn't connected yet",
    notConnectedBody:
      "The AI service hasn't been switched on for this website yet, so questions can't be answered here for now. Bring your doubt to class, or send us an enquiry and an Aspire teacher can help.",
    limitTitle: "Daily limit reached",
    limitBody: "You've used today's questions. Try again in about {hours} h (the limit resets at midnight, India time).",
    limitGuest: "Aspire students get more questions a day when they sign in.",
    busy: "Rancho is busy right now. Please try again in a minute.",
    network: "We couldn't reach Rancho. Check your internet connection and try again.",
    interrupted: "The answer stopped part-way. Please try again.",
    tooLarge: "The photo is too large. Please use a smaller photo.",
    invalidImage: "Please use a JPG, PNG or WebP photo.",
    blocked: "This request was blocked for security reasons. Please reload the page and try again.",
    generic: "Something went wrong. Please try again.",
  },
  stuck: {
    title: "Still stuck?",
    body: "Talk to an Aspire teacher. Send us an enquiry and the team will contact you about a demo class or a doubt session.",
    cta: "Talk to a counsellor",
  },
  how: {
    title: "How it works",
    steps: {
      ask: {
        title: "Ask",
        body: "Type your question or take a clear photo of it. Choose the subject and the answer language.",
      },
      solve: {
        title: "Follow the steps",
        body: "Rancho explains the method step by step, names the concepts used and marks the final answer.",
      },
      revise: {
        title: "Revise",
        body: "It suggests an NCERT chapter you can revise. If something still doesn't make sense, ask your teacher.",
      },
    },
  },
  honest: {
    title: "Good to know",
    items: {
      ai: "Rancho is an AI, not a person: answers are written by an AI model (Claude, made by Anthropic). It can make mistakes, so check important answers with your teacher.",
      scope: "Rancho only helps with Physics, Chemistry, Maths and Biology for Class 9–12, JEE and NEET.",
      sources: "It is not connected to Aspire's notes, lectures or DPPs. Chapter suggestions are general NCERT references.",
      exams: "Please don't use it during a live exam or test.",
      privacy:
        "Photos and questions aren't stored. If you're signed in as an Aspire student, only the subject and topic of each doubt are saved, to show your weak areas.",
    },
  },
};

export default ask;
