import type { AliasKind, HpDistrictId } from "../lead-ops-types";

/**
 * The seed for "areas = Himachal's 12 districts" (docs/lead-routing-plan.md §13.1 – §13.2; owner
 * LR-ROUTING). Pure data, client-safe. Written once into `crm_areas`, `crm_area_centres` and
 * `crm_area_aliases` by `ensureAreasSeeded` (./seed.ts); super admins edit the rows afterwards, so
 * this file is never read again for routing once the seed ran.
 *
 * The centre map must match `district` / `servesDistricts` in src/content/centres.ts (a test
 * checks it). Public geography only — no claim about Aspire.
 */

export interface DistrictSeed {
  id: HpDistrictId;
  en: string;
  hi: string;
  /** Centres in this district (`crm_area_centres`). */
  centres: readonly string[];
  /** The centre that serves the district when the family named none. */
  defaultCentre: string;
  /** Other names: spellings, towns, Hindi. The English and Hindi names are added by the seed. */
  aliases: readonly { label: string; kind: AliasKind }[];
}

const town = (...labels: string[]) => labels.map((label) => ({ label, kind: "town" as const }));
const spelling = (...labels: string[]) => labels.map((label) => ({ label, kind: "spelling" as const }));
const hindi = (...labels: string[]) => labels.map((label) => ({ label, kind: "hindi" as const }));

export const SEED_VERSION = 1 as const;

export const DISTRICT_SEEDS: readonly DistrictSeed[] = [
  {
    id: "bilaspur",
    en: "Bilaspur",
    hi: "बिलासपुर",
    centres: [],
    defaultCentre: "hamirpur",
    aliases: [
      ...town("Ghumarwin", "Jhandutta", "Naina Devi", "Shri Naina Devi Ji", "Barmana", "Talai", "Swarghat"),
      ...hindi("घुमारवीं"),
    ],
  },
  {
    id: "chamba",
    en: "Chamba",
    hi: "चंबा",
    centres: [],
    defaultCentre: "dharamshala",
    aliases: [
      ...hindi("चम्बा", "डलहौजी"),
      ...town("Dalhousie", "Banikhet", "Bharmour", "Brahmaur", "Tissa", "Salooni", "Chowari", "Bhattiyat", "Sihunta", "Pangi", "Killar", "Khajjiar"),
    ],
  },
  {
    id: "hamirpur",
    en: "Hamirpur",
    hi: "हमीरपुर",
    centres: ["hamirpur"],
    defaultCentre: "hamirpur",
    aliases: [...town("Nadaun", "Sujanpur", "Sujanpur Tira", "Bhoranj", "Barsar", "Bhota", "Galore", "Tauni Devi"), ...hindi("नादौन")],
  },
  {
    id: "kangra",
    en: "Kangra",
    hi: "कांगड़ा",
    centres: ["dharamshala"],
    defaultCentre: "dharamshala",
    aliases: [
      ...hindi("कांगडा", "काँगड़ा", "धर्मशाला", "पालमपुर"),
      ...town(
        "Dharamshala",
        "Dharamsala",
        "Dharmshala",
        "McLeod Ganj",
        "Palampur",
        "Nurpur",
        "Jawali",
        "Dehra",
        "Dehra Gopipur",
        "Jawalamukhi",
        "Baijnath",
        "Paprola",
        "Shahpur",
        "Nagrota Bagwan",
        "Indora",
        "Fatehpur",
        "Jaisinghpur",
        "Gaggal",
        "Yol",
        "Sidhbari",
      ),
    ],
  },
  {
    id: "kinnaur",
    en: "Kinnaur",
    hi: "किन्नौर",
    centres: [],
    defaultCentre: "shimla",
    aliases: [
      ...town("Reckong Peo", "Recong Peo", "Rekong Peo", "Kalpa", "Sangla", "Nichar", "Pooh", "Bhabanagar", "Tapri", "Chitkul"),
      ...hindi("रिकांग पिओ"),
    ],
  },
  {
    id: "kullu",
    en: "Kullu",
    hi: "कुल्लू",
    centres: ["kullu"],
    defaultCentre: "kullu",
    aliases: [
      ...spelling("Kulu"),
      ...town("Manali", "Bhuntar", "Banjar", "Anni", "Nirmand", "Naggar", "Kasol", "Manikaran", "Shamshi"),
      ...hindi("मनाली"),
    ],
  },
  {
    id: "lahaul-spiti",
    en: "Lahaul and Spiti",
    hi: "लाहौल और स्पीति",
    centres: [],
    defaultCentre: "kullu",
    aliases: [
      ...spelling("Lahaul Spiti", "Lahaul & Spiti", "Lahul and Spiti", "Lahaul", "Lahul", "Spiti"),
      ...hindi("लाहौल-स्पीति", "लाहौल", "केलांग"),
      ...town("Keylong", "Kyelang", "Kaza", "Tandi", "Sissu", "Tabo"),
    ],
  },
  {
    id: "mandi",
    en: "Mandi",
    hi: "मंडी",
    centres: [],
    defaultCentre: "kullu",
    aliases: [
      ...hindi("मण्डी", "सुंदरनगर"),
      ...town(
        "Sundernagar",
        "Sundarnagar",
        "Jogindernagar",
        "Joginder Nagar",
        "Sarkaghat",
        "Karsog",
        "Gohar",
        "Chachiot",
        "Padhar",
        "Rewalsar",
        "Nerchowk",
        "Thunag",
        "Aut",
        "Janjehli",
      ),
    ],
  },
  {
    id: "shimla",
    en: "Shimla",
    hi: "शिमला",
    centres: ["shimla"],
    defaultCentre: "shimla",
    aliases: [
      ...spelling("Simla"),
      ...town(
        "Rampur",
        "Rampur Bushahr",
        "Rohru",
        "Theog",
        "Chopal",
        "Jubbal",
        "Kotkhai",
        "Narkanda",
        "Kumarsain",
        "Chirgaon",
        "Sunni",
        "Mashobra",
        "Kufri",
        "Dhalli",
        "Sanjauli",
        "New Shimla",
        "Totu",
      ),
    ],
  },
  {
    id: "sirmaur",
    en: "Sirmaur",
    hi: "सिरमौर",
    centres: [],
    defaultCentre: "shimla",
    aliases: [
      ...spelling("Sirmour"),
      ...town("Nahan", "Paonta Sahib", "Ponta Sahib", "Rajgarh", "Sangrah", "Shillai", "Kala Amb", "Dadahu", "Renuka"),
      ...hindi("नाहन", "पांवटा साहिब"),
    ],
  },
  {
    id: "solan",
    en: "Solan",
    hi: "सोलन",
    centres: [],
    defaultCentre: "shimla",
    aliases: [
      ...town("Baddi", "Nalagarh", "Parwanoo", "Kasauli", "Arki", "Kandaghat", "Barotiwala", "Subathu", "Dagshai", "Chail", "Kunihar", "Waknaghat", "Darlaghat"),
      ...hindi("बद्दी"),
    ],
  },
  {
    id: "una",
    en: "Una",
    hi: "ऊना",
    centres: [],
    defaultCentre: "hamirpur",
    aliases: town("Amb", "Gagret", "Haroli", "Bangana", "Mehatpur", "Santokhgarh", "Chintpurni", "Daulatpur Chowk"),
  },
];

/** Names shorter than 5 characters get no fuzzy matching, so they are seeded explicitly (§13.2). */
export const SHORT_NAMES = ["Kulu", "Una", "Amb", "Kaza", "Aut", "Pooh", "Yol", "Tabo"] as const;

/**
 * Places that exist in more than one district (or outside Himachal): never guessed, the lead goes
 * to the Unassigned queue (`ambiguous`). Keys are `normaliseAlias()` output; values the candidate
 * area ids. A super admin can still map one with an alias (an exact alias wins).
 */
export const AMBIGUOUS_PLACES: Readonly<Record<string, readonly HpDistrictId[]>> = {
  dharampur: ["solan", "mandi"],
  sarahan: ["shimla", "sirmaur"],
  sainj: ["kullu", "shimla"],
  // Udaipur in Lahaul, and the city in Rajasthan.
  udaipur: ["lahaul-spiti"],
};

/**
 * Other Indian states and union territories (plus Chandigarh and Delhi): a part of the typed place
 * that names one means the family is outside Himachal even when no state field was given
 * ("Bilaspur, Chhattisgarh", "Pathankot, Punjab"). Normalised by the resolver; never seeded.
 */
export const OTHER_STATE_NAMES: readonly string[] = [
  "Punjab",
  "Haryana",
  "Chandigarh",
  "Delhi",
  "New Delhi",
  "NCR",
  "Uttar Pradesh",
  "UP",
  "Uttarakhand",
  "Uttaranchal",
  "Rajasthan",
  "Jammu and Kashmir",
  "Jammu Kashmir",
  "Jammu",
  "Ladakh",
  "Chhattisgarh",
  "Madhya Pradesh",
  "Bihar",
  "Jharkhand",
  "Gujarat",
  "Maharashtra",
  "Karnataka",
  "Kerala",
  "Tamil Nadu",
  "Telangana",
  "Andhra Pradesh",
  "Odisha",
  "Orissa",
  "West Bengal",
  "Assam",
  "Goa",
  "Sikkim",
  "Arunachal Pradesh",
  "Nagaland",
  "Manipur",
  "Mizoram",
  "Tripura",
  "Meghalaya",
  "पंजाब",
  "हरियाणा",
  "चंडीगढ़",
  "दिल्ली",
  "उत्तर प्रदेश",
  "उत्तराखंड",
  "राजस्थान",
  "जम्मू",
];
