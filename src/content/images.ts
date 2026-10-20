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

  // ---------------------------------------------------------------------------
  // Round 2 (2026-10-20, D-030 image-rich pages). 1600px wide unless noted.
  // Landscapes show the region only: never caption one as "the centre" or
  // "our campus". People are never Aspire students, staff or toppers.
  // ---------------------------------------------------------------------------

  // About (hero / intro split); Centres → Shimla region; Contact.
  shimlaPanorama: {
    src: "/images/stock/shimla-hill-town-panorama.jpg",
    alt: "The hill town of Shimla spread across forested ridges under a blue sky",
    width: 1600,
    height: 1067,
  },
  // About ("how we teach"); Programs overview.
  seminarFromBehind: {
    src: "/images/stock/seminar-students-from-behind.jpg",
    alt: "Students seen from behind, seated in rows facing a presenter in a bright room",
    width: 1600,
    height: 1129,
  },
  // About (teaching approach; teacher is faceless by design); IIT JEE detail.
  teacherChalkboard: {
    src: "/images/stock/teacher-chalkboard-from-behind.jpg",
    alt: "A teacher, seen from behind, writing equations on a chalkboard full of formulas",
    width: 1600,
    height: 900,
  },
  // About (doubt-solving / study groups); Admissions (counselling conversation).
  tableDiscussion: {
    src: "/images/stock/table-discussion-notebooks.jpg",
    alt: "People around a table with open notebooks, one pointing at a page with a pen",
    width: 1600,
    height: 1071,
  },
  // Programs → IIT JEE (physics/maths problem-solving); Results.
  notebookSolutions: {
    src: "/images/stock/hand-writing-notebook-solutions.jpg",
    alt: "A hand writing worked solutions in a notebook with a red pencil",
    width: 1600,
    height: 1067,
  },
  // Programs → NEET / IIT JEE (chemistry).
  chemistryGlassware: {
    src: "/images/stock/chemistry-glassware-lab-bench.jpg",
    alt: "Laboratory flasks, tubing and a brown reagent bottle on a dimly lit bench",
    width: 1600,
    height: 1065,
  },
  // Programs → NEET (biology).
  plantCellMicrograph: {
    src: "/images/stock/plant-cell-micrograph.jpg",
    alt: "Stained cross-section of a plant stem under a microscope, showing cells around a vascular bundle",
    width: 1600,
    height: 902,
  },
  // Programs → Foundation (face not prominent).
  youngStudentNotebook: {
    src: "/images/stock/young-student-notebook-pencil.jpg",
    alt: "A young girl, head bowed, writing in a notebook with a pencil",
    width: 1600,
    height: 1067,
  },
  // Programs → test series / exam preparation; Program detail pages.
  pocketWatchWorksheet: {
    src: "/images/stock/pocket-watch-calculus-worksheet.jpg",
    alt: "A pocket watch, a pencil and an eraser on squared paper filled with handwritten calculus",
    width: 1600,
    height: 1067,
  },
  // Results (neutral aspiration; no ranks implied); Home.
  mountainTrail: {
    src: "/images/stock/mountain-ridge-trail-snow-peaks.jpg",
    alt: "A narrow trail along a ridge leading towards snow-capped mountain peaks",
    width: 1600,
    height: 900,
  },
  // Results (no face visible; never beside a name or rank).
  graduateSilhouette: {
    src: "/images/stock/graduate-silhouette-cap-sky.jpg",
    alt: "Silhouette of a person in a graduation cap and gown against a pale sky",
    width: 1600,
    height: 1067,
  },
  // Centres → Dharamshala / Kangra region.
  dhauladharTriund: {
    src: "/images/stock/dhauladhar-peaks-triund-dharamshala.jpg",
    alt: "Snow-dusted Dhauladhar peaks above Dharamshala, seen from Triund with boulders in the foreground",
    width: 1600,
    height: 1143,
  },
  // Centres → Kullu region.
  kulluValley: {
    src: "/images/stock/kullu-valley-solang-snow-range.jpg",
    alt: "Snow-covered peaks rising above the Kullu valley near Solang, Himachal Pradesh",
    width: 1600,
    height: 1067,
  },
  // Centres → Hamirpur region; Legal pages (calm landscape).
  hamirpurHills: {
    src: "/images/stock/hamirpur-hills-dhauladhar-morning.jpg",
    alt: "Forested hills near Hamirpur, Himachal Pradesh, with the snowy Dhauladhar range on the horizon",
    width: 1600,
    height: 1063,
  },
  // Hostels (dorm-style room). Portrait, about 4:5.
  bunkBedRoom: {
    src: "/images/stock/bunk-bed-dorm-room.jpg",
    alt: "A neatly made metal bunk bed beside a tall window, with folded linen on the lower bunk",
    width: 1200,
    height: 1527,
  },
  // Hostels (meals).
  steelThali: {
    src: "/images/stock/steel-thali-meal-tray.jpg",
    alt: "A steel thali with rotis, a vegetable curry and dal beside a steel tumbler",
    width: 1600,
    height: 1067,
  },
  // Hostels (evening study). Portrait, 3:4.
  deskLampEvening: {
    src: "/images/stock/desk-lamp-notebook-evening.jpg",
    alt: "A desk lamp lighting an open handwritten notebook and a pen in a dark room",
    width: 1200,
    height: 1600,
  },
  // Hostels (study room); Resources.
  studyThroughWindow: {
    src: "/images/stock/study-desk-through-window.jpg",
    alt: "A person studying at a desk, seen through a wooden window frame",
    width: 1600,
    height: 1067,
  },
  // Admissions (application / documents).
  signingForm: {
    src: "/images/stock/signing-form-pen-hands.jpg",
    alt: "Hands signing a paper form with a pen",
    width: 1600,
    height: 1068,
  },
  // Admissions; Home. Portrait, 3:4.
  studentsWalkingPath: {
    src: "/images/stock/students-walking-campus-path.jpg",
    alt: "Two people with backpacks, seen from behind, walking along a sunlit path between lawns",
    width: 1200,
    height: 1600,
  },
  // Contact (getting here); Centres.
  hillRoadBarot: {
    src: "/images/stock/winding-hill-road-barot.jpg",
    alt: "A road winding through terraced green hillsides and forest near Barot, Himachal Pradesh",
    width: 1600,
    height: 1067,
  },
  // Resources; Legal pages (privacy, terms).
  booksAndNotebook: {
    src: "/images/stock/books-stack-notebook-pen.jpg",
    alt: "A stack of old hardback books beside a spiral notebook and a pen on a wooden table",
    width: 1600,
    height: 1060,
  },
  // Resources (online material / study session).
  laptopStudy: {
    src: "/images/stock/laptop-notebook-study-hands.jpg",
    alt: "Hands typing on a laptop beside a blank spiral notebook and a pencil",
    width: 1600,
    height: 1067,
  },
  // Resources (library / reading).
  libraryAisle: {
    src: "/images/stock/library-bookshelf-aisle.jpg",
    alt: "A long library aisle lined with shelves of books",
    width: 1600,
    height: 1065,
  },
} as const satisfies Record<string, ImageAsset>;

export type StockImageKey = keyof typeof stockImages;
