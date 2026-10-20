import type {
  Article,
  Centre,
  ContactDetails,
  DownloadItem,
  Faq,
  HostelInfo,
  ImageAsset,
  InstituteProfile,
  Program,
  RankerRecord,
  ResultRecord,
  Stat,
  Testimonial,
} from "@/lib/types";
import { articlesHi } from "./articles";
import { centresHi } from "./centres";
import { contactDetailsHi } from "./contact";
import { faqsHi } from "./faqs";
import { hostelInfoHi } from "./hostels";
import { imageAltHi } from "./images";
import { downloadCategoriesHi, downloadsHi, instituteProfileHi } from "./institute";
import { mergeKeyedList, mergeOverlay } from "./overlay";
import { programsHi } from "./programs";
import { rankersHi, resultPhotoAltHi, resultsHi } from "./results";
import { statsHi } from "./stats";
import { testimonialsHi } from "./testimonials";

/**
 * Hindi localisers: English record in, Hindi record out (same ids, slugs,
 * status, consent, numbers, dates, links and images; only text differs, with
 * field-level fallback to English). data.ts applies them AFTER its visibility
 * filters. MACHINE DRAFT content — see docs/hindi-review-register.md.
 */

function image<T extends ImageAsset>(img: T): T {
  const alt = imageAltHi[img.src] ?? resultPhotoAltHi[img.src];
  return alt ? { ...img, alt } : img;
}

function withImage<T extends { image?: ImageAsset }>(record: T): T {
  return record.image ? { ...record, image: image(record.image) } : record;
}

/** Result-card photo (D-031) with its Hindi alt; names and colleges stay in Latin script. */
function withPhoto<T extends { photo?: ImageAsset }>(record: T): T {
  return record.photo ? { ...record, photo: image(record.photo) } : record;
}

function download(item: DownloadItem): DownloadItem {
  return mergeOverlay(item, downloadsHi[item.id]);
}

export const hi = {
  image,
  program: (p: Program): Program => withImage(mergeOverlay(p, programsHi[p.id])),
  centre: (c: Centre): Centre => withImage(mergeOverlay(c, centresHi[c.id])),
  result: (r: ResultRecord): ResultRecord => withPhoto(mergeOverlay(r, resultsHi[r.id])),
  ranker: (r: RankerRecord): RankerRecord => withPhoto(mergeOverlay(r, rankersHi[r.id])),
  testimonial: (t: Testimonial): Testimonial => mergeOverlay(t, testimonialsHi[t.id]),
  stat: (s: Stat): Stat => mergeOverlay(s, statsHi[s.id]),
  faq: (f: Faq): Faq => mergeOverlay(f, faqsHi[f.id]),
  article: (a: Article): Article => {
    const merged = mergeOverlay(a, articlesHi[a.id]);
    return merged.coverImage ? { ...merged, coverImage: image(merged.coverImage) } : merged;
  },
  hostelInfo: (info: HostelInfo): HostelInfo => {
    const { campuses, ...rest } = hostelInfoHi;
    return {
      ...mergeOverlay(info, rest),
      campuses: mergeKeyedList(info.campuses, campuses, (c) => c.centreSlug),
    };
  },
  instituteProfile: (profile: InstituteProfile): InstituteProfile => ({
    ...mergeOverlay(profile, instituteProfileHi),
    downloads: profile.downloads.map(download),
  }),
  download,
  downloadCategory: (category: string): string => downloadCategoriesHi[category] ?? category,
  contactDetails: (details: ContactDetails): ContactDetails => {
    const { campusContacts, ...rest } = contactDetailsHi;
    return {
      ...mergeOverlay(details, rest),
      campusContacts: mergeKeyedList(details.campusContacts, campusContacts, (c) => c.centreSlug),
    };
  },
} as const;

/** Every Hindi overlay table, for coverage / orphan tests. */
export const hiOverlays = {
  programs: programsHi,
  centres: centresHi,
  results: resultsHi,
  rankers: rankersHi,
  testimonials: testimonialsHi,
  stats: statsHi,
  faqs: faqsHi,
  articles: articlesHi,
  downloads: downloadsHi,
  downloadCategories: downloadCategoriesHi,
  imageAlt: imageAltHi,
  resultPhotoAlt: resultPhotoAltHi,
  hostelInfo: hostelInfoHi,
  instituteProfile: instituteProfileHi,
  contactDetails: contactDetailsHi,
} as const;
