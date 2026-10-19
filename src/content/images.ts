import type { ImageAsset } from "@/lib/types";

/**
 * TEMPORARY stock photography (Unsplash License), approved by the owner as
 * stand-in imagery until Aspire supplies its own photos.
 *
 * - Files live in `public/images/stock/` and are served locally (no hotlinking).
 * - People shown are NOT Aspire students, faculty or staff, and no place shown is
 *   an Aspire centre. Alt text and captions must never claim otherwise.
 * - Credits, sources, licence and replacement steps: `docs/asset-manifest.md`.
 *
 * `width`/`height` are the real pixel dimensions of each file (used by
 * next/image to reserve space and avoid layout shift).
 */
export const stockImages = {
  himalayaHero: {
    src: "/images/stock/himalaya-dhauladhar-ridge-hero.jpg",
    alt: "Snow-capped Dhauladhar mountain range in Himachal Pradesh under a clear blue sky",
    width: 2000,
    height: 1249,
  },
  himalayaBlueRidge: {
    src: "/images/stock/himalaya-blue-ridge.jpg",
    alt: "Layered Himalayan ridges in soft blue morning light",
    width: 1200,
    height: 800,
  },
  physicsWhiteboard: {
    src: "/images/stock/physics-equation-whiteboard.jpg",
    alt: "A hand writing a physics integral on a whiteboard",
    width: 1200,
    height: 796,
  },
  stethoscopeTextbooks: {
    src: "/images/stock/stethoscope-medical-textbooks.jpg",
    alt: "A stethoscope and a pencil resting beside a stack of textbooks",
    width: 1200,
    height: 771,
  },
  youngStudentWriting: {
    src: "/images/stock/young-student-writing.jpg",
    alt: "A young student concentrating while writing",
    width: 1200,
    height: 676,
  },
  studentsTakingNotes: {
    src: "/images/stock/students-taking-notes-class.jpg",
    alt: "Students writing notes side by side during a class",
    width: 1200,
    height: 900,
  },
  classroomDesks: {
    src: "/images/stock/classroom-desks-sunlight.jpg",
    alt: "An empty classroom with rows of desks lit by afternoon sunlight",
    width: 1200,
    height: 900,
  },
  libraryReading: {
    src: "/images/stock/library-reading-student.jpg",
    alt: "A student reading at a table in a library lined with bookshelves",
    width: 1200,
    height: 900,
  },
  labPipette: {
    src: "/images/stock/science-lab-pipette-experiment.jpg",
    alt: "Gloved hands using a pipette to add coloured liquid to test tubes",
    width: 1200,
    height: 753,
  },
  mentoringConversation: {
    src: "/images/stock/mentoring-conversation-table.jpg",
    alt: "Two people talking across a small table in a bright room",
    width: 1200,
    height: 800,
  },
  mathsNotebook: {
    src: "/images/stock/maths-homework-notebook.jpg",
    alt: "Handwritten algebra practice in a squared notebook with a pencil",
    width: 1200,
    height: 520,
  },
  notebookPlanning: {
    src: "/images/stock/open-notebook-planning-desk.jpg",
    alt: "An open lined notebook with a pencil and a highlighter on a wooden table",
    width: 1200,
    height: 800,
  },
} as const satisfies Record<string, ImageAsset>;

export type StockImageKey = keyof typeof stockImages;
