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
    title: "Ask Rancho",
    subtitle: "Aspire's AI doubt solver",
    /** Accessible name of the mascot picture in the panel header. */
    mascotLabel: "Rancho, Aspire's snow leopard mascot",
    close: "Close chat",
    reset: "New chat",
    greeting:
      "Hi, I'm Rancho! Send me one Physics, Chemistry, Maths or Biology question, typed or as a photo, and I'll explain it step by step.",
    aiNote: "I'm an AI, not a person, and I answer each question on its own.",
    subjectLegend: "Subject",
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
    remaining: "{remaining} of {limit} questions left today",
    remainingNone: "No questions left today",
    disclaimer: "AI can make mistakes — check with your teacher.",
    privacy:
      "Don't type names or personal details. Your question and any photo are processed by Anthropic's API (Claude) to write the answer and aren't stored.",
    privacyLink: "Privacy notice",
    studentNote: "You're signed in: the subject and topic of each doubt are saved to your account to show your weak areas.",
    /** Small link to /tools/ask under the composer. */
    fullPageLink: "Open the full Rancho page",
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
