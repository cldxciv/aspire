/**
 * Namespace "rancho" — the floating "Ask Rancho" button on every public page and its compact chat
 * panel (owner: RANCHO-UI). Rancho is Aspire's snow leopard mascot and the name of the AI doubt solver
 * (/tools/ask, namespace "ask"); the copy always keeps clear that Rancho is an AI.
 * English defines the shape; ../hi/rancho.ts must match it. Plain object, no `as const`.
 */
const rancho = {
  launcher: {
    /** Visible label next to the mascot (tablet and up) and the button's accessible name. */
    label: "Ask Rancho",
    /** Tooltip / description: what the button does. */
    hint: "Stuck on a doubt? Ask Rancho, Aspire's AI study buddy.",
  },
  panel: {
    /** Visible name in the chat header; it also names the chat (the dialog and the page card are labelled by it). */
    name: "Rancho",
    /** Under the name until today's allowance is known. */
    subtitle: "Aspire's AI doubt solver",
    /** Accessible name of the mascot picture in the panel header. */
    mascotLabel: "Rancho, Aspire's snow leopard mascot",
    close: "Close chat",
    reset: "New chat",
    greeting:
      "Hi, I'm Rancho! Send me one Physics, Chemistry, Maths or Biology question, typed or as a photo, and I'll explain it step by step.",
    aiNote: "I'm an AI, not a person, and I answer each question on its own.",
    subjectLegend: "Subject",
    /** Above the subject chips before the first question. */
    subjectHint: "Subject (optional)",
    subjects: {
      auto: "Any",
      physics: "Physics",
      chemistry: "Chemistry",
      maths: "Maths",
      biology: "Biology",
    },
    questionLabel: "Your question",
    placeholder: "Type your doubt…",
    keyHint: "Press Enter to send, Shift + Enter for a new line.",
    charCount: "{count} / {max}",
    send: "Send",
    stop: "Stop",
    you: "You",
    thinking: "Rancho is working it out…",
    ready: "Rancho's answer is ready.",
    stopped: "You stopped this answer.",
    truncated: "This answer was cut short because it got very long. Try asking about one part at a time.",
    refused: "Rancho can't help with that. Try a Physics, Chemistry, Maths or Biology question.",
    /** Short form in the chat header. */
    remainingShort: "{remaining} of {limit} left today",
    remainingNone: "No questions left today",
    disclaimer: "AI can make mistakes — check with your teacher.",
    privacy:
      "Don't type names or personal details in your question. Your question and any photo are processed by Anthropic's API (Claude) to write the answer and aren't stored.",
    privacyLink: "Privacy notice",
    /** Short link in the one-line disclaimer under the composer. */
    privacyShort: "Privacy",
    /** ⓘ button next to the one-line disclaimer: shows the full AI, privacy and voice notes. */
    infoLabel: "About Rancho, AI and your privacy",
    studentNote: "You're signed in: the subject and topic of each doubt are saved to your account to show your weak areas.",
    /** Expand button in the floating panel's header (opens /tools/ask). */
    fullPageLink: "Open the full Rancho page",
    /** One line under the latest answer, before the "Talk to a counsellor" link. */
    stuck: "Still stuck?",
    copy: "Copy answer",
    copied: "Answer copied",
    /** Page chat only: the 👍 / 👎 counts stay on the device (nothing is sent). */
    helpful: {
      yes: "Helpful",
      no: "Not helpful",
      thanks: "Thanks! Saved on this device only.",
    },
    /** Tag under an answer: subject · topic · level. */
    difficulty: {
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
    /** Page chat only: language of the answers (and of voice typing / reading aloud). */
    answerLanguage: "Answer language",
    languages: {
      en: "English",
      hi: "हिंदी",
    },
    /** 🎤 voice typing, 🔊 reading answers aloud, and voice mode. */
    voice: {
      start: "Speak your question",
      stop: "Stop listening",
      listening: "Listening… speak now",
      heard: "Got it. Check your question, then press Send.",
      nothingHeard: "I didn't catch that. Press the microphone and try again.",
      listen: "Listen to this answer",
      stopReading: "Stop reading",
      mode: "Voice mode: read answers aloud after you speak",
      modeOn: "Voice mode on: answers to spoken questions are read aloud.",
      modeOff: "Voice mode off.",
      note: "Voice: 🎤 uses your browser's speech recognition. In Chrome, the browser's speech service (Google) turns your voice into text; Aspire never receives the audio, only the text you send. 🔊 Listen reads answers aloud with your device's own voices.",
      errors: {
        denied: "Microphone access is blocked. Allow it for this site in your browser settings, or type your question.",
        noMic: "No microphone was found. Type your question instead.",
        network: "Voice typing needs an internet connection. Type your question instead.",
        other: "Voice typing stopped. Try again, or type your question.",
      },
      /** Words used when an answer's maths is read aloud ({x} = the base, {n} = the power). */
      say: {
        equals: "equals",
        plus: "plus",
        minus: "minus",
        times: "times",
        dividedBy: "divided by",
        over: "over",
        per: "per",
        squared: "{x} squared",
        cubed: "{x} cubed",
        power: "{x} to the power {n}",
        sqrt: "square root of {x}",
        cbrt: "cube root of {x}",
        plusMinus: "plus or minus",
        approx: "approximately",
        notEqual: "is not equal to",
        lessEq: "is less than or equal to",
        greaterEq: "is greater than or equal to",
        less: "is less than",
        greater: "is greater than",
        arrow: "gives",
        equilibrium: "is in equilibrium with",
        degrees: "degrees",
        percent: "percent",
        infinity: "infinity",
        integral: "integral of",
        sum: "sum of",
        /** LaTeX with limits: \int_a^b, \sum_{i=1}^{n}, \lim_{x \to a}, \log_b. */
        integralFromTo: "integral from {a} to {b} of",
        sumFromTo: "sum from {a} to {b} of",
        limit: "limit as {x} tends to {a} of",
        logBase: "log to the base {b} of",
        half: "one half",
        third: "one third",
        quarter: "one quarter",
        threeQuarters: "three quarters",
      },
    },
    /** "Ask Rancho about this" from a student tool: a removable chip above the composer. */
    handoff: {
      /** Chip label, followed by the tool's short summary. */
      from: "From {tool}",
      remove: "Remove this context",
      tools: {
        predictor: "Predictor",
        "mock-test": "Mock tests",
        planner: "Study planner",
      },
    },
    /** Results from Aspire's tools that Rancho shows inside an answer. */
    cards: {
      sample: "Sample data",
      exams: {
        "jee-main": "JEE Main",
        "jee-advanced": "JEE Advanced",
        "neet-ug": "NEET-UG",
        neet: "NEET-UG",
        boh: "BOH (Brain of Himachal)",
        foundation: "Class 9–10 Foundation",
        JEE_MAIN: "JEE Main",
        NEET: "NEET-UG",
        BOH: "BOH (Brain of Himachal)",
      },
      rankBand: {
        title: "Rank estimate · {exam}",
        fromScore: "For a score of {value}",
        fromPercentile: "For a percentile of {value}",
        rank: "Rank {min} – {max}",
        percentile: "Percentile {min} – {max}",
        percentileOne: "Percentile {value}",
        cta: "See colleges & full prediction",
      },
      mockTests: {
        title: "Mock tests for you",
        meta: "{questions} questions · {minutes} min",
        start: "Start",
        leaderboard: "Leaderboard",
      },
      plan: {
        title: "Study plan · {exam}",
        daysLeft: "{days} days left",
        dayLeft: "1 day left",
        today: "The exam is today",
        examOn: "Exam on {date}",
        cta: "Build my full plan",
      },
    },
    /** Photo questions in the panel (same rules as the Ask page: question text optional, no faces or names). */
    photo: {
      /** Accessible name (and tooltip) of the camera button next to Send. */
      add: "Add a photo",
      change: "Change photo",
      remove: "Remove photo",
      preparing: "Preparing photo…",
      /** Announced when the student presses Send while the photo is still being prepared. */
      wait: "Wait a moment: your photo is still being prepared.",
      /** Next to the thumbnail. */
      attached: "Photo added",
      /** Announced when a photo is added (focus stays on the camera button, below the required box). */
      attachedAnnouncement: "Photo added. Tick the box above to confirm it shows no faces or names.",
      removed: "Photo removed",
      previewAlt: "Your photo of the question",
      /** Alt text of the photo in your sent message. */
      sentAlt: "Photo you sent",
      /** Question placeholder while a photo is attached. */
      placeholder: "Add a note about the photo (optional)…",
      consent: "My photo shows only the question: no faces or names.",
      note: "Don't include faces or names. Location details are removed from the photo on your device before it's sent, and it's used only to answer this question. It isn't stored.",
      errors: {
        unsupported: "That file isn't a photo. Please choose a JPG, PNG or WebP image.",
        unreadable: "We couldn't open that photo. Please try a JPG or PNG.",
        tooLarge: "That photo is too large. Crop it to just the question and try again.",
        consentRequired: "Tick the box to confirm the photo has no faces or names.",
        rejected: "Rancho couldn't use that photo. Please try a clearer JPG or PNG.",
      },
    },
    /**
     * The lead gate (docs/lead-gate-plan.md §8.6): before Rancho's first answer on a browser, the
     * question waits while the family shares contact details once (the form's own copy is in the
     * `leadGate` namespace, including the honest sample-data line).
     */
    gate: {
      /** Announced when the contact form appears under the question (its heading also gets focus). */
      formShown: "Share a contact number once to get Rancho's answer. The form is under your question.",
      /** The same in optional mode (the form also offers "Continue without sharing"). */
      formShownOptional: "You can share a contact number before Rancho's answer, or continue without it. The form is under your question.",
      /**
       * Above the form when the question was refused again right after this chat's form shared
       * details (the browser didn't keep the pass: cookies blocked, or the pass rejected).
       */
      notKept:
        "Rancho still couldn't answer: this browser didn't remember that you shared your details. Cookies may be blocked: allow cookies for this site, then try again.",
      /** The composer's placeholder while a question waits for the form (the composer is disabled). */
      composerWaiting: "Your question is waiting above.",
      /** Contact details were shared in another tab or tool while the question waited. */
      unlocked: "You're all set. Your question is ready to send.",
      sendNow: "Send now",
    },
    errors: {
      questionRequired: "Type your question or add a photo of it.",
      questionTooLong: "Please keep your question under {max} characters.",
      notConnectedTitle: "Rancho isn't connected yet",
      notConnectedBody:
        "The AI service hasn't been switched on for this website yet, so questions can't be answered here for now. Send us an enquiry and an Aspire teacher can help with your doubt.",
      enquiry: "Talk to a counsellor",
      limitTitle: "That's all for today",
      limitBody: "You've used today's questions. Try again in about {hours} h (the limit resets at midnight, India time).",
      limitGuest: "Aspire students get more questions a day when they sign in.",
      signIn: "Student sign-in",
      busy: "Rancho is busy right now. Please try again in a minute.",
      network: "We couldn't reach Rancho. Check your internet connection and try again.",
      interrupted: "The answer stopped part-way. Please try again.",
      blocked: "This request was blocked for security reasons. Please reload the page and try again.",
      generic: "Something went wrong. Please try again.",
    },
  },
};

export default rancho;
