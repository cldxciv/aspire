import type { DownloadItem, InstituteProfile } from "@/lib/types";
import { demoRef } from "./demo-source";

// PLACEHOLDER — institute profile from Aspire's demo site (docs/demo-data-import.md).
// NOT imported: ISO 9001:2015 and other certification / accreditation /
// alignment badges, "100% transparent" and "guarantee" claims, the "Verifiable
// results" pillar, the 2026 "Admissions open" milestone, legal-entity names.
// The 2023 milestone is imported without its ISO certification half.

// Downloads: the resources page lists 20 cards; the files are not in this project,
// so every entry is `available: false`. The source truncates long descriptions
// ("…"); we keep the last complete sentence, or the visible text cut at a word
// boundary with "…" when no sentence is complete.
const downloads: DownloadItem[] = [
  {
    id: "dl-revision-planner",
    title: "NEET & JEE Daily Hour-by-Hour Revision Planner",
    category: "Vault Kit",
    description: "Prevents burnout through spaced-repetition loops.",
    subjects: "All Subjects",
    audience: "XI-XII & Droppers",
    size: "14.2 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-ncert-weightage-radar",
    title: "Class-Wise NCERT Weightage Radar (2026 Edition)",
    category: "Notes",
    description:
      "Every Physics, Chemistry, Biology and Mathematics chapter ranked by 10-year NTA frequency, question yield per study hour…",
    subjects: "PCMB",
    audience: "XI-XII",
    pages: 64,
    size: "4.8 MB",
    available: false,
  },
  {
    id: "dl-12-month-schedule",
    title: "12-Month Micro-Topic Daily Schedule",
    category: "Planner",
    description: "NEET & JEE Daily Hour-by-Hour Revision Planner. Prevents burnout through spaced-repetition loops.",
    subjects: "NEET & JEE",
    audience: "Class 11/12 & Droppers",
    pages: 48,
    size: "14.2 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-2026-master-planner",
    title: "2026 Daily Master Planner",
    category: "Planner",
    description: "Day-by-Day Syllabus",
    size: "14.2 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-boh-class-10",
    title: "Class 10th BOH Blueprint & 2024 Paper",
    category: "BOH Paper",
    description: "Physics (20Q), Chemistry (20Q), Math (30Q), Mental Ability (30Q)",
    subjects: "All Subjects",
    audience: "X",
    pages: 24,
    size: "2.4 MB",
    available: false,
  },
  {
    id: "dl-high-yield-matrix",
    title: "Topic-Wise High-Yield Chapter Matrix",
    category: "Vault Kit",
    description: "Highlights Tier-1 chapters giving 64% of total aggregate marks.",
    subjects: "PCM & PCB",
    audience: "XI-XII",
    size: "8.6 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-decadal-trend-matrix",
    title: "Decadal Weightage & Trend Matrix",
    category: "Analysis",
    description: "Topic-Wise High-Yield Chapter Matrix. Highlights Tier-1 chapters giving 64% of total aggregate marks.",
    subjects: "PCM & PCB",
    audience: "Class 11/12 & Droppers",
    pages: 32,
    size: "8.6 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-decadal-weightage-radar",
    title: "Decadal Weightage Radar",
    category: "Analysis",
    description: "2015-2025 Trends",
    size: "8.6 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-boh-neet-wing",
    title: "Class 11th & 12th Medical (NEET Wing)",
    category: "BOH Paper",
    description: "NCERT Zoology, Botany, Physical Chemistry, Mechanics",
    subjects: "All Subjects",
    audience: "XI-XII",
    pages: 32,
    size: "3.1 MB",
    available: false,
  },
  {
    id: "dl-pyq-compendium",
    title: "Verified PYQ Diagnostic Compendium",
    category: "Vault Kit",
    description:
      "Contains hand-solved answer scripts illustrating why 80% of students lose negative marks on partial-credit…",
    subjects: "JEE Adv + NEET UG",
    audience: "XI-XII & Droppers",
    size: "22.1 MB ZIP",
    gated: true,
    available: false,
  },
  {
    id: "dl-5-year-past-papers",
    title: "5-Year Past Papers & IITian Solutions",
    category: "PYQ",
    description: "Verified PYQ Diagnostic Compendium.",
    subjects: "JEE Adv + NEET UG",
    audience: "Class 12 & Droppers",
    pages: 210,
    size: "22.1 MB ZIP",
    gated: true,
    available: false,
  },
  {
    id: "dl-5-year-solved-papers",
    title: "5-Year Solved Papers",
    category: "PYQ",
    description: "Stepwise Solutions",
    size: "22.0 MB ZIP",
    gated: true,
    available: false,
  },
  {
    id: "dl-boh-jee-wing",
    title: "Class 11th & 12th Non-Medical (JEE Wing)",
    category: "BOH Paper",
    description: "Calculus, Vectors, Electromagnetism, Physical/Organic Chem",
    subjects: "All Subjects",
    audience: "XI-XII",
    pages: 28,
    size: "2.8 MB",
    available: false,
  },
  {
    id: "dl-core-concept-assessment",
    title: "10-Question Core Concept Assessment",
    category: "Vault Kit",
    description:
      "Evaluates spatial reasoning, organic reaction sequencing, and vector mechanics to pinpoint your current rank standing…",
    subjects: "Aptitude & Core Concepts",
    audience: "XI-XII",
    size: "15 Mins Test",
    gated: true,
    available: false,
  },
  {
    id: "dl-diagnostic-quiz",
    title: "National Caliber Diagnostic Quiz",
    category: "Mock Test",
    description: "10-Question Core Concept Assessment.",
    subjects: "Aptitude & Core Concepts",
    audience: "Class 11/12",
    size: "15 Mins Test",
    available: false,
  },
  {
    id: "dl-boh-junior-talent",
    title: "Classes 7th, 8th & 9th (Junior Talent)",
    category: "BOH Paper",
    description: "Science, Mathematics, Logical Reasoning, Spatial Puzzles",
    subjects: "All Subjects",
    audience: "VII-IX",
    pages: 18,
    size: "1.9 MB",
    available: false,
  },
  {
    id: "dl-physics-formula-vault",
    title: "Physics Formula Vault: Mechanics to Modern Physics",
    category: "Formula Sheet",
    description:
      "Every JEE / NEET physics formula with a one-line derivation cue from the doubt desk…",
    subjects: "Physics",
    audience: "Class 11/12 & Droppers",
    pages: 24,
    size: "4.1 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-organic-dpp",
    title: "Organic Chemistry DPP Set: Mechanisms Week 1–4",
    category: "DPP",
    description:
      "Daily practice problems from the Reaction Roadmap: SN1/SN2, E1/E2, NGP and rearrangements with timed…",
    subjects: "Chemistry",
    audience: "Class 12 & Droppers",
    pages: 36,
    size: "5.8 MB PDF",
    gated: true,
    available: false,
  },
  {
    id: "dl-prospectus-2027",
    title: "Aspire 2027 Prospectus & Fee Schedule",
    category: "Brochure",
    description:
      "All four campuses, every batch, the complete fee schedule, hostel charter and the BOH scholarship brackets…",
    subjects: "All Programmes",
    audience: "Classes 8–12 & Droppers",
    pages: 20,
    size: "9.4 MB PDF",
    available: false,
  },
  {
    id: "dl-aits-jee-main-mock-01",
    title: "AITS Sample Paper: JEE Main Pattern Mock 01",
    category: "Mock Test",
    description:
      "A full 90-question All Himachal Test Series mock in the NTA JEE Main pattern with the answer key and the AI error-audit…",
    subjects: "PCM",
    audience: "Class 12 & Droppers",
    pages: 28,
    size: "3.9 MB PDF",
    gated: true,
    available: false,
  },
];

export const instituteProfile: InstituteProfile = {
  id: "institute",
  name: "Aspire IIT & Medical",
  foundedYear: 2013,
  foundedIn: "Shimla",
  founder: {
    honorific: "Er.",
    name: "Raman Sharma",
    credentials: "B.Tech, IIT Roorkee",
    role: "Founder & Physics Directorate",
    facultySlug: "er-raman-sharma",
  },
  tagline: "Founded by IIT Roorkee alumni",
  summary:
    "Founded by IITians in Shimla, Aspire prepares ambitious students from every district of Himachal Pradesh for JEE Main, JEE Advanced, NEET and the Olympiads — with permanent resident faculty and disciplined hostels.",
  foundingStory:
    "For decades, a serious JEE or NEET attempt meant sending a 16-year-old to Kota or Delhi. Aspire was founded in 2013 to end that compromise: a residential academy in Himachal Pradesh where the teaching, the hostels and the testing are all held to the same national standard — and where parents are two hours away, not two days.",
  mission: {
    title: "Equal access to national-level preparation, without leaving the hills.",
    paragraphs: [
      "Every senior educator is a permanent resident scholar. There are no fly-in guest lecturers, no mid-year batch handovers, and no rote-memorisation mills — just deliberate, daily problem-solving until intuition becomes second nature.",
    ],
  },
  founderMessage: {
    headline: "Competitive success isn’t born from generic slide-decks or weekend guest lecturers.",
    paragraphs: [
      "It requires relentless, round-the-clock pedagogical immersion. At Aspire, every senior educator is a permanent resident scholar dedicated to dissecting high-order problem patterns until intuition becomes second nature.",
      "Our promise to Himachali families is simple: the same rigour as Kota, two hours from home, with a warden who knows your child’s name.",
    ],
    attribution: "Er. Raman Sharma, Founder & Physics Directorate · B.Tech, IIT Roorkee",
  },
  approach: [
    {
      title: "35-student micro-batches",
      description:
        "Every cohort is capped at 35 students (30 for the Dropper Apex and Foundation batches). The cap is enforced by the subject lead — no overflow batches are ever created.",
    },
    {
      title: "Resident faculty mentorship",
      description: "Every senior educator is a permanent resident scholar — teachers who live on campus, not fly in for lectures.",
    },
    {
      title: "90-minute daily doubt clinic",
      description: "90 Mins / Day at the resident IITian desk, with 1-on-1 evening doubt slots.",
    },
    {
      title: "Daily attendance SMS",
      description:
        "Attendance SMS, bi-weekly CBT reports, 1-on-1 doubt session logs and warden updates are published on the Parent Portal; a monthly parent review call is scheduled with the subject lead.",
    },
    {
      title: "Faculty on campus till 7:30 PM",
      description:
        "Every Aspire campus has resident IITian and doctor mentors available till 7:30 PM, so no doubt travels home unanswered.",
    },
  ],
  pedagogyPrinciples: [
    {
      title: "Zero fly-in faculty",
      description:
        "Every senior educator is a full-time resident scholar present six days a week — not a weekend guest lecturer.",
    },
    {
      title: "Concept before shortcut",
      description:
        "Hardware models and geometric intuition come before formula sheets, so solutions survive new question patterns.",
    },
    {
      title: "NTA-identical testing",
      description:
        "Every second Saturday a computer-based test benchmarks each student against a simulated all-Himachal percentile.",
    },
    {
      title: "Uncapped doubt clinics",
      description: "Open mentor desk from 4:00 PM to 7:30 PM every day. No token system, no teaching assistants.",
    },
    {
      title: "Parent transparency",
      description: "Attendance, test scores and hostel notes sync to the parent portal the same day.",
    },
  ],
  milestones: [
    {
      year: 2013,
      title: "First classroom opens in New Shimla",
      description:
        "Aspire starts with one JEE batch of 28 students and a promise: no guest lecturers, ever.",
      tag: "Founded",
    },
    {
      year: 2015,
      title: "NEET division and first residential block",
      description:
        "Pre-medical faculty led by AIIMS-trained doctors join; the first supervised hostel wing opens a 50 m walk from the Shimla campus.",
    },
    {
      year: 2017,
      title: "Second campus at Hamirpur",
      description:
        "The Hamirpur Central hub near HPTU brings the same resident faculty model to Una, Bilaspur and Kangra families.",
      tag: "Hamirpur",
    },
    {
      year: 2019,
      title: "Brain of Himachal scholarship test launched",
      description:
        // Demo claim "funds 100% free education and boarding for district toppers" withheld pending
        // Aspire's confirmation (docs/content-verification.md, 2026-10-20 integrity review).
        "A statewide diagnostic and scholarship test for Himachal students. Scholarship terms to be confirmed by Aspire.",
      tag: "BOH",
    },
    {
      year: 2021,
      title: "Dharamshala and Kullu Valley centres",
      description:
        "Dharamshala’s Kangra Valley wing and the Kullu Valley residential centre complete the four-campus network.",
      tag: "Kangra · Kullu",
    },
    {
      // Source title: "Quality-management certification & student portal" — ISO part not imported.
      year: 2023,
      title: "Student portal",
      description: "Aspire launches the CBT portal with parent attendance and score tracking.",
    },
  ],
  socialLinks: [
    { platform: "facebook", label: "Facebook", url: "https://www.facebook.com/aspireiitmedical" },
    { platform: "instagram", label: "Instagram", url: "https://www.instagram.com/aspireiitmedical" },
    { platform: "youtube", label: "YouTube", url: "https://www.youtube.com/@aspireiitmedical" },
    { platform: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/company/aspireiitmedical" },
    { platform: "x", label: "X", url: "https://x.com/aspireiitmed" },
    { platform: "telegram", label: "Telegram", url: "https://t.me/aspireiitmedical" },
  ],
  downloads,
  status: "placeholder",
  sourceRef: demoRef("/about", "/", "/why-aspire", "/resources"),
};
