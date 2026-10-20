/**
 * Namespace "tools" — student tools hub (owner: lead, M6). English defines the shape;
 * ../hi/tools.ts must match it. Plain object, no `as const` (see src/i18n/README.md).
 */
const tools = {
  meta: {
    title: "Student tools",
    description:
      "Free study tools from Aspire IIT & Medical: rank & college predictor, CBT mock tests, Ask Aspire doubt help and a study planner — in English and Hindi.",
  },
  hero: {
    title: "Free tools for JEE, NEET and BOH students",
    lead: "Practise, plan and get unstuck — in English or Hindi. No sign-up needed to start; sign in to save your progress.",
  },
  status: {
    sample: "Sample data",
    notConnected: "Needs connection",
    ready: "Ready",
  },
  open: "Open",
  items: {
    predictor: {
      title: "Rank & college predictor",
      body: "Enter a mock score or percentile to see a rank band and the colleges that fit it, plus where Aspire students got in. Uses sample cutoff tables until Aspire loads the official ones.",
    },
    mockTests: {
      title: "CBT mock tests",
      body: "Exam-style tests with a timer, question palette, mark-for-review and negative marking — then a topic-wise analysis and a 30-day plan. Sample questions for now.",
    },
    ask: {
      title: "Ask Aspire",
      body: "Type or photograph a Physics, Chemistry, Maths or Biology question and get step-by-step help in English or Hindi. AI can make mistakes — check with your teacher.",
    },
    planner: {
      title: "Study planner",
      body: "A day-by-day plan to your exam date, spaced revision, formula flashcards, streaks and XP. Works on your phone and can be installed like an app.",
    },
  },
  note: "These tools are free to try. Sign in with your Aspire student account to save tests, plans and streaks; parents linked to your account can see your progress in the parent portal.",
};

export default tools;
