import "server-only";

import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localizeImage } from "@/lib/data";
import type { ExamTrack, ImageAsset } from "@/lib/types";
import type { ProgramDirectoryMessages } from "./ProgramDirectory";

/** The serialisable copy program cards / the directory need, in `locale` (server side). */
export function programCardMessages(locale: Locale): ProgramDirectoryMessages {
  const { card, units, tracks, directory } = messagesFor(locale, "programs");
  const { labels } = messagesFor(locale, "common");
  return { card, units, tracks, directory, demoLabel: labels.demo, stockPhotoLabel: labels.illustrativeStockPhoto };
}

/**
 * Track-appropriate licensed stock photos for a program page (D-030): hero, the overview split,
 * the highlights / schedule split and the closing call to action. People shown are never Aspire
 * students; no program page names a student, so person photos never sit beside a real name.
 */
const TRACK_PHOTOS: Record<ExamTrack, { hero: ImageAsset; aside: ImageAsset; highlights: ImageAsset; cta: ImageAsset }> = {
  JEE: {
    hero: stockImages.physicsWhiteboard,
    aside: stockImages.teacherChalkboard,
    highlights: stockImages.notebookSolutions,
    cta: stockImages.pocketWatchWorksheet,
  },
  NEET: {
    hero: stockImages.stethoscopeTextbooks,
    aside: stockImages.plantCellMicrograph,
    highlights: stockImages.chemistryGlassware,
    cta: stockImages.labPipette,
  },
  Foundation: {
    hero: stockImages.youngStudentNotebook,
    aside: stockImages.youngStudentWriting,
    highlights: stockImages.notebookSolutions,
    cta: stockImages.booksAndNotebook,
  },
  Integrated: {
    hero: stockImages.studentsTakingNotes,
    aside: stockImages.classroomDesks,
    highlights: stockImages.notebookPlanning,
    cta: stockImages.tableDiscussion,
  },
};

/** Neutral study photos used when a track photo is already taken on the page. */
const FALLBACK_PHOTOS: ImageAsset[] = [
  stockImages.pocketWatchWorksheet,
  stockImages.notebookPlanning,
  stockImages.booksAndNotebook,
  stockImages.deskLampEvening,
  stockImages.libraryAisle,
  stockImages.laptopStudy,
];

/**
 * The program page photos for `track`, with alt text in `locale`. The program's own `image`
 * (when it has one) takes the aside slot; no photo appears twice on the page. `exclude` lists
 * photos already shown elsewhere on the page (the other programs' card images).
 */
export function trackPhotos(
  track: ExamTrack,
  locale: Locale,
  programImage?: ImageAsset,
  exclude: (ImageAsset | undefined)[] = [],
) {
  const photos = TRACK_PHOTOS[track];
  const used = new Set<string>(exclude.flatMap((image) => (image ? [image.src] : [])));
  const pick = (...options: (ImageAsset | undefined)[]): ImageAsset => {
    const image = [...options, ...FALLBACK_PHOTOS].find((option) => option && !used.has(option.src)) as ImageAsset;
    used.add(image.src);
    return localizeImage(image, locale);
  };
  // The program's own image may equal a track photo: reserve it first so the hero never repeats it.
  const ownImage = programImage && !used.has(programImage.src) ? programImage : undefined;
  if (ownImage) used.add(ownImage.src);
  const hero = pick(photos.hero, photos.aside, photos.highlights);
  if (ownImage) used.delete(ownImage.src);
  const aside = pick(ownImage, photos.aside, photos.highlights);
  const highlights = pick(photos.highlights, photos.aside);
  const cta = pick(photos.cta);
  return { hero, aside, highlights, cta };
}
