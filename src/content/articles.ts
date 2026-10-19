import type { Article } from "@/lib/types";
import { stockImages } from "./images";

// PLACEHOLDER articles so the resources list/detail routes can be built and
// reviewed. Replace with Aspire-approved content before launch.
export const articles: Article[] = [
  {
    id: "art-revision-plan",
    slug: "building-a-weekly-revision-plan",
    title: "Building a weekly revision plan",
    summary: "A simple structure for balancing new topics, revision and practice tests across the week.",
    body: [
      "This is placeholder text for layout review. The final article should be written or approved by Aspire's academic team.",
      "A good weekly plan usually balances three things: learning new concepts, revisiting earlier topics, and practising under exam-like conditions.",
      "Students should review the plan with a mentor and adjust it after each test.",
    ],
    category: "study-guidance",
    coverImage: stockImages.mathsNotebook,
    publishedAt: "2026-10-18",
    status: "placeholder",
  },
  {
    id: "art-choosing-a-program",
    slug: "choosing-the-right-program",
    title: "Choosing the right program",
    summary: "Questions families can ask when comparing JEE, NEET, Foundation and integrated options.",
    body: [
      "This is placeholder text for layout review. The final article should be written or approved by Aspire's academic team.",
      "Start with the student's interests and current class, then talk to a counsellor about which pathway fits their goals and schedule.",
    ],
    category: "admissions",
    coverImage: stockImages.notebookPlanning,
    publishedAt: "2026-10-18",
    status: "placeholder",
  },
];
