import type { ImageAsset } from "@/lib/types";

/**
 * Aspire visual assets in public/assets/aspire/ (see its README.txt).
 *
 * These are AI-generated placeholders cropped from a contact sheet — NOT photographs of
 * Aspire's campuses, staff, students or results (D-019). Rules for every use:
 * - Never place a person image next to a real name (results, testimonials, faculty).
 * - Centre images are illustrative: always caption/label them as such.
 * - Files are small. Never render wider than `maxWidth` CSS px (they blur), and keep
 *   the 2000px stock hero photo for full-bleed backgrounds.
 * - `crop: "top-square"` assets have the source filename printed under the icon:
 *   render inside an aspect-square box with object-cover + object-top so it is hidden.
 */

export type AspireAssetRole = "illustration" | "icon" | "decor" | "person" | "place" | "centre";

export interface AspireAsset extends ImageAsset {
  role: AspireAssetRole;
  /** Largest CSS width it can be shown at without visible blur on standard displays. */
  maxWidth: number;
  crop?: "top-square";
}

const asset = (
  file: string,
  width: number,
  height: number,
  role: AspireAssetRole,
  alt: string,
  extra: Partial<Pick<AspireAsset, "maxWidth" | "crop">> = {},
): AspireAsset => ({
  src: `/assets/aspire/${file}`,
  width,
  height,
  role,
  alt,
  maxWidth: extra.maxWidth ?? Math.round(width * 1.25),
  crop: extra.crop,
});

export const aspireAssets = {
  // Program illustrations (clean tiles, light-blue backgrounds)
  iconIitProgram: asset("icon-iit-program.webp", 268, 214, "icon", ""),
  iconNeetProgram: asset("icon-neet-program.webp", 270, 214, "icon", ""),
  iconFoundationProgram: asset("icon-foundation-program.webp", 276, 214, "icon", ""),
  iconIntegratedProgram: asset("icon-integrated-program.webp", 278, 214, "icon", ""),

  // Feature icons — filename caption baked in below the icon: crop to top square.
  iconExpertFaculty: asset("icon-expert-faculty.webp", 148, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),
  iconMentorship: asset("icon-mentorship.webp", 148, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),
  iconPersonalized: asset("icon-personalized.webp", 146, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),
  iconStudentSupport: asset("icon-student-support.webp", 152, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),
  iconLearningCentres: asset("icon-learning-centres.webp", 148, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),
  iconLearningResults: asset("icon-learning-results.webp", 148, 214, "icon", "", { crop: "top-square", maxWidth: 96 }),

  // Illustrations
  illustrationGoal: asset("illustration-goal.webp", 118, 107, "illustration", ""),
  illustrationGrowth: asset("illustration-growth.webp", 164, 107, "illustration", ""),
  illustrationJourney: asset("illustration-journey.webp", 125, 107, "illustration", ""),
  successJourney: asset("success-journey.webp", 152, 121, "illustration", ""),
  trophySuccess: asset("trophy-success.webp", 152, 121, "illustration", ""),
  medalAchievement: asset("medal-achievement.webp", 158, 121, "illustration", ""),
  graduationSuccess: asset("graduation-success.webp", 162, 121, "illustration", ""),

  // Decorative accents (always alt="" / aria-hidden)
  goldCurve: asset("gold-curve.webp", 170, 84, "decor", "", { maxWidth: 420 }),
  dotPattern: asset("dot-pattern.webp", 120, 84, "decor", "", { maxWidth: 240 }),
  bgShape: asset("bg-shape-1.webp", 138, 84, "decor", "", { maxWidth: 400 }),
  laurelWreath: asset("laurel-wreath.webp", 166, 84, "decor", ""),
  star: asset("star.webp", 167, 84, "decor", ""),
  quoteIcon: asset("quote-icon.webp", 145, 84, "decor", ""),
  phoneIcon: asset("phone-icon.webp", 154, 84, "decor", ""),
  /** Low-res textures: only as faint, blurred backgrounds under an overlay. */
  bgMountainDark: asset("bg-mountain-dark.webp", 173, 84, "decor", "", { maxWidth: 1600 }),
  bgMountainLight: asset("bg-mountain-light.webp", 209, 84, "decor", "", { maxWidth: 1600 }),

  // Places
  heroMountains: asset("hero-mountains.webp", 425, 166, "place", "Snow-capped Himalayan peaks above pine forest"),
  himachalLandscape: asset("himachal-landscape.webp", 335, 166, "place", "Hill town on a forested Himachal slope with mountains behind"),
  campusBuilding: asset("campus-building.webp", 365, 166, "place", "Illustration of a hill-style campus building with mountains behind"),
  classroomLearning: asset("classroom-learning.webp", 274, 174, "place", "Students working at desks in a bright classroom"),
  classroomTeacher: asset("classroom-teacher.webp", 204, 174, "place", "A teacher presenting to a class from a screen at the front"),

  // People — illustrative only; never beside a named person.
  heroStudents: asset("hero-students.webp", 360, 166, "person", "Four smiling students in hoodies with mountains behind"),
  /**
   * Larger cut of the same AI-generated students (photo region only, no UI/text) taken from the
   * owner's approved design `reference/homepage/01-approved-first-fold.png` (2026-10-20, D-023).
   * AI people in "ASPIRE" hoodies: always with a visible "Illustration" label; decorative alt.
   */
  heroStudentsLarge: asset("hero-students-large.jpg", 440, 435, "person", "", { maxWidth: 460 }),
  studentsGroupStudy: asset("students-group-study.webp", 244, 174, "person", "Three students studying together at a laptop"),
  studentStudying: asset("student-studying.webp", 141, 174, "person", "A student studying with books"),
  studentBoy1: asset("student-boy-1.webp", 138, 174, "person", "A smiling student"),
  studentBoy2: asset("student-boy-2.webp", 165, 174, "person", "A smiling student"),
  studentGirl1: asset("student-girl-1.webp", 151, 174, "person", "A smiling student"),
  studentGirlMedical: asset("student-girl-medical.webp", 137, 174, "person", "A student in a white coat with a stethoscope"),

  // Centre buildings — ILLUSTRATIVE, not the real buildings. Label every use.
  // palampur-centre.webp / solan-centre.webp are deliberately NOT registered: Aspire has no such centres (C30).
  centreShimla: asset("shimla-centre.webp", 158, 121, "centre", "Illustrative image of a hill-style building (not the actual centre)"),
  centreHamirpur: asset("hamirpur-centre.webp", 192, 121, "centre", "Illustrative image of a hill-style building (not the actual centre)"),
  centreDharamshala: asset("dharamshala-centre.webp", 155, 121, "centre", "Illustrative image of a hill-style building (not the actual centre)"),
} as const satisfies Record<string, AspireAsset>;

export type AspireAssetKey = keyof typeof aspireAssets;
