import type { Program } from "@/lib/types";
import { demoRef } from "./demo-source";
import { stockImages } from "./images";

// PLACEHOLDER — imported from Aspire's demo site (docs/demo-data-import.md).
// Titles, descriptions and highlights are the demo's own wording. Contact hours,
// doubt minutes and batch caps come from the home-page batch comparison; duration,
// mode and batch size from each course page. Fees, start dates and seat counts are
// deliberately NOT imported. Nothing here is verified (docs/content-verification.md).
//
// `exam` is the primary track that drives the existing filter/icon. Dual JEE/NEET
// courses list both in `tracks`; their primary track is chosen so each existing
// filter (JEE, NEET, Foundation, Integrated) still has one program.
export const programs: Program[] = [
  {
    id: "prog-jee-neet-pinnacle-2027",
    slug: "jee-neet-pinnacle-2027",
    title: "JEE (Main & Advanced) / NEET Pinnacle 2027",
    exam: "Integrated",
    tracks: ["Integrated", "JEE", "NEET"],
    classLevel: "Class XI",
    cohortName: "SSB-Alpha (Two-Year Comprehensive)",
    shortDescription: "Two-year integrated programme for students stepping into Class 11.",
    description:
      "Engineered for students stepping into Class 11. Synchronizes NCERT CBSE/HP State Board curricula with high-order IITian reasoning and NEET NCERT line-by-line mastery without school stress.",
    targetAudience: "Students stepping into Class 11 (Class 10 → 11).",
    highlights: ["35-Student Micro-Cohort in Session", "1-on-1 Resident IITian Evening Desk"],
    dailyContactHours: 5.5,
    doubtMinutesPerDay: 90,
    batchSize: 35,
    deliveryMode: "Offline classroom",
    duration: "2 Years",
    image: stockImages.studentsTakingNotes,
    status: "placeholder",
    updatedAt: "2026-10-19",
    sourceRef: demoRef("/", "/courses/jee-neet-pinnacle-2027"),
  },
  {
    id: "prog-class-12-intensive",
    slug: "class-12-intensive",
    title: "Class 11 → 12 Intensive (JEE / NEET 2026)",
    exam: "JEE",
    tracks: ["JEE", "NEET"],
    classLevel: "Class XII",
    cohortName: "SSB-Beta (One-Year Intensive)",
    shortDescription: "One-year intensive for Class 12 students synchronised with board exams.",
    description:
      "Board-synchronised sprint for Class 12 students. Weekly NTA-pattern CBTs, chapter-wise PYQ drills and a resident doubt desk so school and entrance preparation never collide.",
    targetAudience: "Students in Class 12.",
    highlights: ["Weekly NTA-Pattern CBT Hall", "Chapter-wise PYQ Drill Desk"],
    dailyContactHours: 6,
    doubtMinutesPerDay: 90,
    batchSize: 35,
    deliveryMode: "Offline classroom",
    duration: "1 Year",
    image: stockImages.physicsWhiteboard,
    status: "placeholder",
    updatedAt: "2026-10-19",
    sourceRef: demoRef("/", "/courses/class-12-intensive"),
  },
  {
    // The home page's "Repeater Residential (11 Months)" cohort is this course,
    // not a separate one — kept as `cohortName`.
    id: "prog-dropper-special",
    slug: "dropper-special",
    title: "Class 12 Pass Dropper Special (Target 2026)",
    exam: "NEET",
    tracks: ["JEE", "NEET"],
    classLevel: "Class 12 pass (dropper)",
    cohortName: "Repeater Residential (11 Months)",
    shortDescription: "Full-day repeater programme with residential discipline.",
    description:
      "Full-day residential regime for Class 12 pass students. Diagnostic gap-mapping in week one, then 8 contact hours daily with mentored self-study pods till 11:30 PM.",
    targetAudience: "Class 12 pass students (droppers / repeaters).",
    highlights: ["Full-Day Repeater Cohort", "Monitored Night Study Pods"],
    dailyContactHours: 8,
    doubtMinutesPerDay: 120,
    batchSize: 30,
    deliveryMode: "Residential classroom",
    duration: "11 Months",
    image: stockImages.libraryReading,
    status: "placeholder",
    updatedAt: "2026-10-19",
    sourceRef: demoRef("/", "/courses/dropper-special"),
  },
  {
    id: "prog-junior-foundation",
    slug: "junior-foundation",
    title: "Class 8-10th Junior Foundation (Olympiad / NTSE)",
    exam: "Foundation",
    tracks: ["Foundation"],
    classLevel: "Class VIII–X",
    cohortName: "Junior Foundation (After-School)",
    shortDescription: "Concept-first foundation for Classes 8 to 10 after school hours.",
    description:
      "Concept-first mathematics and science for Classes 8 to 10, built around curiosity and Olympiad-style reasoning so the Class 11 jump never feels like a cliff.",
    targetAudience: "Students in Classes 8, 9 and 10.",
    highlights: ["Olympiad Reasoning Workshop", "After-School Mentor Desk"],
    dailyContactHours: 2.5,
    doubtMinutesPerDay: 45,
    batchSize: 30,
    deliveryMode: "Offline classroom",
    duration: "1 Year",
    image: stockImages.youngStudentWriting,
    status: "placeholder",
    updatedAt: "2026-10-19",
    sourceRef: demoRef("/", "/courses/junior-foundation"),
  },
];
