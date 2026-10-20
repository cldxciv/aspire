/**
 * Namespace "ask" — RANCHO, the AI doubt solver at /tools/ask (formerly "Ask Aspire"; owner: A3-ASK).
 * Rancho is Aspire's own friendly snow leopard mascot; the copy always keeps clear that the doubt solver is an AI.
 * English defines the shape; ../hi/ask.ts must match it.
 * Plain object, no `as const` (see src/i18n/README.md).
 */
import rancho from "./rancho";

const ask = {
  /** The chat on /tools/ask and /rancho uses the floating panel's strings (one source: ./rancho.ts). */
  chat: rancho.panel,
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
  /** The homepage tools widget's link into the chat and its AI caveat (src/components/home/HomeTools.tsx). */
  form: {
    heading: "Ask Rancho your doubt",
  },
  answer: {
    disclaimer: "AI can make mistakes — check with your teacher.",
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
