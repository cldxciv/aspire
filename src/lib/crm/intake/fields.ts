/**
 * Field targets, header / question synonyms and value normalisers SHARED by the CSV import
 * (LR-IMPORT) and Meta Lead Ads (LR-META) — owner: LR-CORE (docs/lead-routing-plan.md §17 step 3–4,
 * §18.3). Pure and client-safe (the import runs it in the browser; META on the server).
 *
 * Inputs are cell / answer strings that are already free of spreadsheet artefacts (the import
 * strips one leading `'` and a trailing `.0` first; Graph answers have none). Every normaliser
 * returns null for anything it cannot read with confidence: nothing is guessed silently, and a
 * lead id is never "repaired" (A3: no character is ever stripped from an id except `l:`).
 */
import {
  IMPORT_FIELD_TARGETS,
  IMPORT_TARGETS,
  type ImportFieldTarget,
  type ImportTarget,
} from "../lead-ops-types";
import { LEAD_CLASSES, LEAD_PROGRAMS } from "../types";

export { IMPORT_FIELD_TARGETS, IMPORT_TARGETS, type ImportFieldTarget, type ImportTarget };

export function isImportTarget(value: unknown): value is ImportTarget {
  return typeof value === "string" && (IMPORT_TARGETS as readonly string[]).includes(value);
}

/** `"Phone Number"`, `"phone_number"`, `"PHONE-NUMBER?"` → `"phone_number"` (letters of any script kept). */
export function normaliseHeader(header: string): string {
  const lower = header.normalize("NFKC").toLowerCase().trim();
  let out = "";
  let gap = false;
  for (const ch of lower) {
    const letter = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch > "\u007f";
    if (letter) {
      if (gap && out.length > 0) out += "_";
      out += ch;
      gap = false;
    } else {
      gap = true;
    }
  }
  return out.slice(0, 80);
}

/** Exact header keys as Meta's Leads Center exports and common sheets name them. */
const EXACT: Readonly<Record<string, ImportTarget>> = {
  id: "metaLeadId",
  lead_id: "metaLeadId",
  leadgen_id: "metaLeadId",
  created_time: "createdTime",
  created: "createdTime",
  created_at: "createdTime",
  date: "createdTime",
  submitted_at: "createdTime",
  submission_time: "createdTime",
  form_id: "formId",
  form_name: "formName",
  form: "formName",
  ad_id: "adId",
  ad_name: "adName",
  adset_name: "adsetName",
  ad_set_name: "adsetName",
  campaign_id: "campaignId",
  campaign_name: "campaignName",
  campaign: "campaignName",
  platform: "platform",
  is_organic: "isOrganic",
  organic: "isOrganic",
  full_name: "contactName",
  name: "contactName",
  contact_name: "contactName",
  your_name: "contactName",
  phone_number: "phone",
  phone: "phone",
  mobile: "phone",
  mobile_number: "phone",
  mobile_no: "phone",
  phone_no: "phone",
  contact_number: "phone",
  whatsapp_number: "phone",
  email: "email",
  email_address: "email",
  e_mail: "email",
  work_email: "email",
  district: "district",
  city: "district",
  town: "district",
  location: "district",
  state: "state",
  province: "state",
  class: "currentClass",
  current_class: "currentClass",
  grade: "currentClass",
  standard: "currentClass",
  course: "programInterest",
  program: "programInterest",
  programme: "programInterest",
  program_interest: "programInterest",
  centre: "centre",
  center: "centre",
  branch: "centre",
  preferred_centre: "centre",
  preferred_center: "centre",
  // Meta's own bookkeeping columns.
  adset_id: "ignore",
  ad_set_id: "ignore",
  lead_status: "ignore",
  inbox_url: "ignore",
  retailer_item_id: "ignore",
  is_qualified: "ignore",
  is_quality: "ignore",
  is_converted: "ignore",
  vehicle: "ignore",
};

function has(key: string, ...words: string[]): boolean {
  return words.some((word) => key.includes(word));
}

/**
 * Best guess for one CSV header or Meta question name (a super admin can change every guess):
 * exact names first, then words inside a question ("which_district_do_you_live_in"). Unknown
 * headers become `answer`, so nothing the family typed is dropped silently.
 */
export function guessTarget(header: string): ImportTarget {
  const key = normaliseHeader(header);
  if (key.length === 0) return "ignore";
  const exact = EXACT[key];
  if (exact) return exact;
  if (has(key, "consent", "agree", "disclaimer", "permission")) return "consentChecked";
  if (has(key, "parent_or_student", "student_or_parent", "are_you_a", "you_are", "i_am_a", "i_am_the", "who_is_filling", "filling_this")) return "submittedBy";
  if (has(key, "student_name", "name_of_student", "child_name", "student_s_name", "students_name", "ward_name")) return "studentName";
  if (has(key, "parent_name", "guardian_name", "father_name", "mother_name", "parent_s_name", "parents_name", "guardian")) return "guardianName";
  if (has(key, "phone", "mobile", "whatsapp", "contact_number", "contact_no")) return "phone";
  if (has(key, "email", "e_mail")) return "email";
  if (has(key, "district", "city", "town", "where_do_you_live", "your_location", "जिला", "शहर")) return "district";
  if (has(key, "state")) return "state";
  if (has(key, "centre", "center", "branch")) return "centre";
  if (has(key, "class", "grade", "standard", "कक्षा")) return "currentClass";
  if (has(key, "course", "program", "exam", "preparing_for", "interested_in", "कोर्स")) return "programInterest";
  if (key.endsWith("_name") && !has(key, "ad_", "form_", "campaign_", "adset_")) return "contactName";
  return "answer";
}

/** Guesses for a whole header row: a field target is used once; a second column with it becomes `answer`. */
export function guessTargets(headers: readonly string[]): ImportTarget[] {
  const used = new Set<ImportTarget>();
  return headers.map((name) => {
    const target = guessTarget(name);
    if (target === "answer" || target === "ignore") return target;
    if (used.has(target)) return "answer";
    used.add(target);
    return target;
  });
}

// ---------------------------------------------------------------------------------------------
// Value normalisers

function allDigits(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

/** A Meta lead id: exactly `^(l:)?(\d{15,17})$` (trimmed). Never strips any other character (A3). */
export function parseMetaLeadId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(?:l:)?(\d{15,17})$/.exec(raw.trim());
  return match ? match[1] : null;
}

/** Form / ad / ad set / campaign ids: digits only after an export prefix (`f:`, `ag:`, `as:`, `c:`). */
export function parseMetaObjectId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  for (const prefix of ["f:", "ag:", "as:", "c:"]) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }
  return value.length <= 20 && allDigits(value) ? value : null;
}

/** A phone answer → the string `normalizePhoneE164` reads (`p:+91…` → `+91…`); empty → null. */
export function cleanPhoneInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  const stripped = value.startsWith("p:") ? value.slice(2).trim() : value;
  return stripped.length === 0 ? null : stripped.slice(0, 32);
}

const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?)?\s?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Meta's `created_time` (`2026-10-21T04:45:30+0000`, `…+05:30`, `…Z`) or `2026-10-21 10:15[:30]`
 * → ISO-8601 UTC. A time without a zone is read as IST. Years outside 2015–2100 → null.
 */
export function parseMetaTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length > 40) return null;
  const match = ISO_TIME.exec(value);
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", zone] = match;
  let offset = "+05:30";
  if (zone === "Z") offset = "Z";
  else if (zone) offset = zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  const year = Number(y);
  if (!Number.isFinite(ms) || year < 2015 || year > 2100) return null;
  return new Date(ms).toISOString();
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "checked", "agreed", "agree", "i agree", "on", "✓", "✔", "हाँ", "हां"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "unchecked", "off", "नहीं"]);

/** A yes / no answer or checkbox cell → boolean, else null. */
export function parseBooleanAnswer(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(value)) return true;
  if (FALSE_WORDS.has(value)) return false;
  return null;
}

const ROMAN: Readonly<Record<string, number>> = { vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** A class answer → a `LEAD_CLASSES` value, or null. */
export function normaliseClass(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 60) return null;
  if ((LEAD_CLASSES as readonly string[]).includes(value)) return value;
  if (value.includes("drop") || value.includes("repeat") || value.includes("ड्रॉप") || /12(th)?\s*(pass|passed|complete)/.test(value)) return "dropper";
  const number = /(\d{1,2})/.exec(value);
  let grade = number ? Number(number[1]) : Number.NaN;
  if (!Number.isFinite(grade)) {
    for (const token of value.split(/[^a-z]+/)) {
      if (ROMAN[token] !== undefined) {
        grade = ROMAN[token];
        break;
      }
    }
  }
  if (grade >= 6 && grade <= 8) return "class-6-8";
  if (grade >= 9 && grade <= 12) return `class-${grade}`;
  return null;
}

/** A course / exam answer → a `LEAD_PROGRAMS` value, or null (both JEE and NEET named → null). */
export function normaliseProgram(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 80) return null;
  if ((LEAD_PROGRAMS as readonly string[]).includes(value)) return value;
  if (has(value, "not sure", "not-sure", "undecided", "confused", "don't know", "dont know", "पता नहीं")) return "not-sure";
  if (value.includes("integrated")) return "integrated";
  const jee = has(value, "jee", "iit", "engineer", "इंजीनियर");
  const neet = has(value, "neet", "medical", "aiims", "doctor", "मेडिकल", "डॉक्टर");
  if (jee && neet) return null;
  if (jee) return "jee";
  if (neet) return "neet";
  if (has(value, "foundation", "olympiad", "ntse", "फाउंडेशन")) return "foundation";
  return null;
}

/** "I am the parent / student" answers → `submittedBy`, else null. */
export function normaliseSubmittedBy(raw: unknown): "student" | "parent" | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 80) return null;
  const parent = has(value, "parent", "guardian", "father", "mother", "अभिभावक", "माता", "पिता");
  const student = has(value, "student", "self", "myself", "छात्र", "विद्यार्थी");
  if (parent && !student) return "parent";
  if (student && !parent) return "student";
  return null;
}

/** A centre for `matchCentre`: its slug and its display names (both languages). */
export interface CentreOption {
  slug: string;
  names: readonly string[];
}

const CENTRE_SPELLINGS: Readonly<Record<string, string>> = { dharamsala: "dharamshala", dharmshala: "dharamshala", kulu: "kullu", simla: "shimla" };

function letters(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFKC").toLowerCase()) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch > "\u007f") out += ch;
  }
  return out;
}

/** A centre answer → a centre slug, or null ("not sure", unknown text). */
export function matchCentre(raw: unknown, centres: readonly CentreOption[]): string | null {
  if (typeof raw !== "string") return null;
  const key = letters(raw);
  if (key.length === 0 || key.length > 80) return null;
  const spelled = CENTRE_SPELLINGS[key] ?? key;
  for (const centre of centres) {
    if (letters(centre.slug) === spelled) return centre.slug;
    if (centre.names.some((name) => letters(name) === key)) return centre.slug;
  }
  return null;
}

/** Meta's `platform` (`fb`, `ig`, "Facebook", …) → `fb` / `ig` / a short other code, else null. */
export function platformCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = letters(raw);
  if (value === "facebook" || value === "fb") return "fb";
  if (value === "instagram" || value === "ig") return "ig";
  return value.length > 0 && value.length <= 20 ? value : null;
}

/** `utmSource` for a Meta lead (§18.3): fb → facebook, ig → instagram, else meta. */
export function utmSourceForPlatform(raw: unknown): "facebook" | "instagram" | "meta" {
  const code = platformCode(raw);
  return code === "fb" ? "facebook" : code === "ig" ? "instagram" : "meta";
}

/**
 * Unmapped answers → one text (≤ `max`, default 1000): "Question: answer" lines, in order. Empty
 * answers are left out; a cut never splits a character pair.
 */
export function joinAnswers(pairs: readonly { label: string; value: string }[], max = 1000): string | null {
  const lines: string[] = [];
  for (const { label, value } of pairs) {
    const answer = value.replace(/\s+/g, " ").trim();
    if (!answer) continue;
    const question = label.replace(/\s+/g, " ").trim().slice(0, 120);
    lines.push(question ? `${question}: ${answer}` : answer);
  }
  if (lines.length === 0) return null;
  const text = lines.join("\n");
  return text.length <= max ? text : Array.from(text).slice(0, max).join("").slice(0, max);
}
