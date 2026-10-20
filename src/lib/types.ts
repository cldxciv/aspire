/**
 * Domain types — mapped from specs/data_and_content_contracts.md.
 * Optional fields are optional on purpose: UI must omit absent data, never invent it.
 *
 * `sourceRef` (where present) records where imported placeholder data came from,
 * e.g. "aspire2.thechunkmedia.com/courses (fetched 2026-10-19)". It is provenance
 * for reviewers (docs/demo-data-import.md), not copy to render as a citation.
 */

/**
 * Content lifecycle. `placeholder` marks development/demo fixtures: they are
 * only rendered when showPlaceholderContent() is true and must carry a
 * visible DEMO label in the UI.
 */
export type ContentStatus = "draft" | "pending_review" | "published" | "placeholder";

export type ExamTrack = "JEE" | "NEET" | "Foundation" | "Integrated";

export interface ImageAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Program {
  id: string;
  slug: string;
  title: string;
  /** Primary track (one per program) — drives the existing exam filter, icon and tint. */
  exam: ExamTrack;
  /** Every track the program prepares for, including `exam`. Absent means `[exam]`. */
  tracks?: ExamTrack[];
  shortDescription: string;
  description: string;
  targetAudience: string;
  /** Class level as stated by the source, e.g. "Class XI", "Class 12 pass (dropper)". */
  classLevel?: string;
  /** Aspire's cohort / batch name, e.g. "SSB-Alpha (Two-Year Comprehensive)". */
  cohortName?: string;
  highlights: string[];
  /** Scheduled teaching hours per day (theory + drills). */
  dailyContactHours?: number;
  /** Daily doubt-resolution time at the faculty desk, in minutes. */
  doubtMinutesPerDay?: number;
  /** Maximum students per batch. */
  batchSize?: number;
  deliveryMode?: string;
  duration?: string;
  /** Only when verified by Aspire. */
  feeDisplay?: string;
  image?: ImageAsset;
  status: ContentStatus;
  updatedAt: string;
  sourceRef?: string;
}

export interface CentreHead {
  honorific?: string;
  name: string;
  /** As stated by the source: "Director", "Head", "Dean", "Mentor". */
  title: string;
  credentials?: string;
  /** Set when the head also has a faculty profile. */
  facultySlug?: string;
}

export interface CentreFacility {
  name: string;
  description: string;
}

export interface Centre {
  id: string;
  slug: string;
  name: string;
  district: string;
  /** Short descriptor used by the source, e.g. "Flagship Campus", "Kangra Valley". */
  label?: string;
  isHeadquarters?: boolean;
  summary?: string;
  address?: string;
  phone?: string;
  email?: string;
  openingHours?: string;
  latitude?: number;
  longitude?: number;
  directionsUrl?: string;
  /** Empty when the source does not state which programs a centre runs. */
  programs: ExamTrack[];
  head?: CentreHead;
  hostelNote?: string;
  transportNote?: string;
  /** e.g. "2.5 hrs from Solan". */
  travelTimes?: string[];
  highlights?: string[];
  facilities?: CentreFacility[];
  /** Districts this centre's desk handles, as stated by the source. */
  servesDistricts?: string[];
  image?: ImageAsset;
  status: ContentStatus;
  verifiedAt?: string;
  sourceRef?: string;
}

export type ConsentStatus = "granted" | "pending" | "not_required";

export interface ResultRecord {
  id: string;
  year: number;
  exam: ExamTrack;
  /** Exam as named by the source when more specific than `exam`, e.g. "JEE Advanced". */
  examLabel?: string;
  /** Omitted when the source does not say which program the student took. */
  programSlug?: string;
  /** Only when the student/guardian has approved publication — check with canShowStudentName(). */
  studentDisplayName?: string;
  rankOrOutcome: string;
  /** Allotted college / course, e.g. "B.Tech CSE, IIT Roorkee". */
  destination?: string;
  school?: string;
  centreSlug?: string;
  /** Student quote shown with a featured result. */
  quote?: string;
  /** Shown in the home-page success-story feature. */
  featured?: boolean;
  /**
   * Result-card image of this student (photo, college and name; D-031). PERSONAL DATA: same rule
   * as the name (canShowStudentName()); public APIs expose it only with `granted` consent.
   */
  photo?: ImageAsset;
  sourceReference: string;
  consentStatus: ConsentStatus;
  publishedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  status: ContentStatus;
  sourceRef?: string;
}

/** One entry in the "verified rankers" list: name, college and exam/year only. */
export interface RankerRecord {
  id: string;
  /** Only when the student/guardian has approved publication — check with canShowStudentName(). */
  studentDisplayName: string;
  /** College / institute exactly as listed by the source, e.g. "NIT Hamirpur", "MBBS · Tanda". */
  institution?: string;
  exam: ExamTrack;
  year: number;
  /** Extra detail shown by the source, e.g. "AIR 3238", "From SSB Batch". */
  note?: string;
  /**
   * Result-card image (photo, college and name; src/content/result-photos.ts, D-031). PERSONAL
   * DATA: same rule as the name (canShowStudentName()) — read it through getResultCards().
   */
  photo?: ImageAsset;
  sourceReference: string;
  consentStatus: ConsentStatus;
  status: ContentStatus;
  sourceRef?: string;
}

export interface FacultyMember {
  id: string;
  slug: string;
  /** "Er.", "Dr.", "Prof." — render as `${honorific} ${name}`. */
  honorific?: string;
  name: string;
  /** Role or wing as stated, e.g. "Founder & Physics Directorate". */
  role: string;
  subject: string;
  /** e.g. "B.Tech, IIT Roorkee". */
  credentials?: string;
  /** As stated by the source, e.g. "14+ years". */
  experience?: string;
  /** Home campus. */
  centreSlug?: string;
  /** One-line card blurb. */
  summary?: string;
  /** Plain-text paragraphs. */
  bio?: string[];
  expertise?: string[];
  teaches?: string[];
  /** Listed among the source's "senior resident leads". */
  seniorLead?: boolean;
  status: ContentStatus;
  sourceRef?: string;
}

export type TestimonialRelation = "parent" | "student";

export interface Testimonial {
  id: string;
  quote: string;
  /** Title shown with the quote (mainly video testimonials). */
  headline?: string;
  /** Source caption describing a video, when the quote itself is only its title. */
  caption?: string;
  author: string;
  relation: TestimonialRelation;
  /** e.g. "Son: Aniket Pathania (IIT Roorkee, 2025)". */
  context?: string;
  /** Home town as stated, e.g. "Sundernagar". */
  location?: string;
  centreSlug?: string;
  facultySlugs?: string[];
  /** The original was a video; only its text is imported (no media). */
  isVideo: boolean;
  videoDuration?: string;
  consentStatus: ConsentStatus;
  status: ContentStatus;
  sourceRef?: string;
}

export type StatGroup = "headline" | "pedagogy" | "faculty" | "results" | "residential";

export interface Stat {
  id: string;
  /** Display value exactly as stated, e.g. "3.8 : 1", "5,000+". */
  value: string;
  label: string;
  context?: string;
  group: StatGroup;
  status: ContentStatus;
  sourceRef?: string;
}

export interface HostelFeature {
  name: string;
  detail?: string;
}

export interface HostelBlock {
  name: string;
  available: boolean;
  distance?: string;
  rooms?: string;
  supervision?: string;
  capacity?: string;
}

export interface CampusHostel {
  centreSlug: string;
  note: string;
  wardenPhone?: string;
  blocks: HostelBlock[];
}

export interface HostelRoomType {
  name: string;
  tagline?: string;
  description: string;
  features: string[];
}

export interface DailyRoutineItem {
  time: string;
  label: string;
  title: string;
  description: string;
}

export interface HostelInfo {
  id: string;
  headline: string;
  /** Who the hostels are for. */
  audience: string;
  charter: HostelFeature[];
  features: HostelFeature[];
  girlsResidency: { summary: string; centreSlugs: string[]; features: HostelFeature[] };
  roomTypes: HostelRoomType[];
  roomTypesNote?: string;
  roomFeatures: HostelFeature[];
  dailyRoutine: DailyRoutineItem[];
  menuHighlights: HostelFeature[];
  campuses: CampusHostel[];
  status: ContentStatus;
  sourceRef?: string;
}

export interface ApproachPoint {
  title: string;
  description: string;
}

export interface Milestone {
  year: number;
  title: string;
  description: string;
  tag?: string;
}

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "linkedin" | "x" | "telegram";

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  url: string;
}

export interface DownloadItem {
  id: string;
  title: string;
  category: string;
  description?: string;
  subjects?: string;
  audience?: string;
  pages?: number;
  /** As stated, e.g. "14.2 MB PDF", "15 Mins Test". */
  size?: string;
  /** The source asked for a WhatsApp number before download. */
  gated?: boolean;
  /** False until the file itself exists in this project. */
  available: boolean;
}

export interface InstituteProfile {
  id: string;
  name: string;
  foundedYear: number;
  foundedIn: string;
  founder: { honorific?: string; name: string; credentials?: string; role: string; facultySlug?: string };
  tagline: string;
  summary: string;
  foundingStory: string;
  mission: { title: string; paragraphs: string[] };
  founderMessage?: { headline: string; paragraphs: string[]; attribution: string };
  approach: ApproachPoint[];
  pedagogyPrinciples: ApproachPoint[];
  milestones: Milestone[];
  socialLinks: SocialLink[];
  downloads: DownloadItem[];
  status: ContentStatus;
  sourceRef?: string;
}

export interface PhoneNumber {
  /** e.g. "+91 98166 23676". */
  display: string;
  /** E.164 for tel: links, e.g. "+919816623676". */
  tel: string;
}

export interface CampusContact {
  centreSlug: string;
  name: string;
  phone?: PhoneNumber;
  email?: string;
  hours?: string;
}

export interface ContactDetails {
  id: string;
  phoneLabel: string;
  phone: PhoneNumber;
  email: string;
  /** Plain chat link — no prefilled message. */
  whatsapp: { display: string; url: string };
  hours?: string;
  address?: string;
  headOfficeCentreSlug?: string;
  responseTimes?: string[];
  languages?: string;
  campusContacts: CampusContact[];
  status: ContentStatus;
  sourceRef?: string;
}

export type ArticleCategory = "study-guidance" | "exam-updates" | "news" | "admissions";

export interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** Plain-text paragraphs. Rendered as text — never as raw HTML. */
  body: string[];
  category: ArticleCategory;
  coverImage?: ImageAsset;
  author?: string;
  publishedAt: string;
  status: ContentStatus;
  seoTitle?: string;
  seoDescription?: string;
}

export type FaqCategory = "admissions" | "programs" | "centres" | "general";

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  status: ContentStatus;
}
