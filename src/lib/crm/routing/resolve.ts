import { isHpDistrictId, OUTSIDE_HP, type AliasKind, type AreaResolution, type RoutingMatch } from "../lead-ops-types";
import { OTHER_STATE_NAMES } from "./districts";

/**
 * The place resolver (docs/lead-routing-plan.md §13.3; owner LR-ROUTING). PURE and client-safe:
 * the alias index is built from the database by the caller (`loadAliasIndex`, ./seed.ts).
 *
 * `normaliseAlias` turns a place name into its key; `resolveDistrict` maps what a family typed
 * (plus the state they gave, if any) onto an area: an exact key, then explicit ambiguous keys,
 * then a Latin-only fuzzy match. Aliases of kind `border` (towns just outside Himachal that a
 * super admin mapped) are the only ones that count when the family gave a state other than
 * Himachal, so "Bilaspur, Chhattisgarh" never lands in HP Bilaspur while "Pathankot, Punjab" can.
 */

/** Words that never identify a place ("Distt. Kangra", "Shimla, HP", "जिला मंडी"). */
const DROP_WORDS = new Set(
  ["district", "distt", "dist", "zila", "zilla", "hp", "himachal", "pradesh", "जिला", "ज़िला", "हिमाचल", "प्रदेश"].map((word) =>
    word.normalize("NFKC").toLowerCase(),
  ),
);

/** "H.P." / "h. p" → "hp" before punctuation is dropped, so it is recognised as a word. */
const DOTTED_HP = /(^|[^\p{L}\p{N}])h\.\s?p\.?(?=$|[^\p{L}\p{N}])/gu;
/** Anything that is not a letter, a combining mark (Devanagari vowel signs) or a digit. */
const SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u;

/**
 * The key of a place name: NFKC + lower case, `&` → "and", the words district / distt / dist /
 * zila / zilla / जिला / h.p. / hp / himachal / pradesh dropped, then punctuation and spaces
 * dropped. "Lahaul & Spiti" → "lahaulandspiti"; "Distt. Kangra" → "kangra".
 */
export function normaliseAlias(input: string): string {
  const text = input.normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(DOTTED_HP, "$1 hp ");
  return text
    .split(SEPARATOR)
    .filter((word) => word !== "" && !DROP_WORDS.has(word))
    .join("");
}

/** Keys of other states / union territories ("punjab", "madhya", "उत्तर" …). */
const OTHER_STATES = new Set(OTHER_STATE_NAMES.map(normaliseAlias).filter((key) => key !== ""));

/** Whether a key names another Indian state or union territory. */
export function isOtherStateKey(key: string): boolean {
  return OTHER_STATES.has(key);
}

export interface AliasEntry {
  key: string;
  areaId: string;
  kind: AliasKind;
}

/** Everything the resolver needs, built once per batch of leads. */
export interface AliasIndex {
  exact: ReadonlyMap<string, { areaId: string; kind: AliasKind }>;
  ambiguous: ReadonlyMap<string, readonly string[]>;
  /** Latin-only keys of 5+ characters (fuzzy targets). */
  fuzzy: readonly { key: string; areaId: string }[];
  /** Areas that have at least one alias (the active ones, as the database builds the index). */
  areaIds: ReadonlySet<string>;
}

const LATIN = /^[a-z]+$/;
export const FUZZY_MIN_LENGTH = 5;

/** Builds the index. The first alias of a key wins (keys are unique in the database anyway). */
export function buildAliasIndex(aliases: readonly AliasEntry[], ambiguous: Readonly<Record<string, readonly string[]>> = {}): AliasIndex {
  const exact = new Map<string, { areaId: string; kind: AliasKind }>();
  for (const alias of aliases) if (alias.key && !exact.has(alias.key)) exact.set(alias.key, { areaId: alias.areaId, kind: alias.kind });
  const fuzzy = [...exact.entries()]
    .filter(([key, entry]) => entry.kind !== "border" && key.length >= FUZZY_MIN_LENGTH && LATIN.test(key))
    .map(([key, entry]) => ({ key, areaId: entry.areaId }));
  const areaIds = new Set([...exact.values()].map((entry) => entry.areaId));
  return { exact, ambiguous: new Map(Object.entries(ambiguous)), fuzzy, areaIds };
}

/** The whole input first, then each part split on , / - ( ) | and new lines (keys, duplicates dropped). */
export function placeKeys(input: string): string[] {
  const keys = [normaliseAlias(input), ...input.split(/[,/\-()|\n\r]+/).map(normaliseAlias)];
  return [...new Set(keys.filter((key) => key !== ""))];
}

/**
 * Optimal-string-alignment (Damerau-Levenshtein) distance, or `max + 1` as soon as it must exceed
 * `max` (cheap rejection for the fuzzy step).
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    const row = new Array<number>(b.length + 1);
    row[0] = i;
    rows.push(row);
  }
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Allowed distance for a key: none under 5 characters, 1 for 5–8, 2 for 9 and up. */
export function fuzzyBudget(length: number): number {
  if (length < FUZZY_MIN_LENGTH) return 0;
  return length <= 8 ? 1 : 2;
}

function fuzzyMatch(key: string, index: AliasIndex): { areaId: string } | { tie: string[] } | null {
  const budget = fuzzyBudget(key.length);
  if (budget === 0 || !LATIN.test(key)) return null;
  let best = budget + 1;
  let areas = new Set<string>();
  for (const target of index.fuzzy) {
    const distance = editDistance(key, target.key, budget);
    if (distance > budget) continue;
    if (distance < best) {
      best = distance;
      areas = new Set([target.areaId]);
    } else if (distance === best) {
      areas.add(target.areaId);
    }
  }
  if (areas.size === 0) return null;
  return areas.size === 1 ? { areaId: [...areas][0] } : { tie: [...areas].sort() };
}

/** What `normaliseAlias` makes of "outside-hp", "Outside Himachal", "Outside H.P.". */
const OUTSIDE_KEY = "outside";

/**
 * The key stored for a typed place (`crm_lead_routing.place_key`): null when empty, or when it only
 * says "outside Himachal" (the forms' `outside-hp` choice) — that is an answer, not a place, so it
 * never shows up under "Unmatched places" and can never be mapped to one district.
 */
export function placeKeyOf(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (raw === "" || raw.toLowerCase() === OUTSIDE_HP) return null;
  const key = normaliseAlias(raw);
  return key === "" || key === OUTSIDE_KEY ? null : key;
}

/** Words a state field may add to "Himachal Pradesh" without naming another state. */
const STATE_FILLER = new Set(["india", "bharat", "भारत", "हिमांचल", "हि", "प्र"].map((word) => word.normalize("NFKC")));
/** Latin spellings within two edits of these are Himachal ("Himanchal", "Himachal Pardesh"). */
const HP_STATE_WORDS = ["himachal", "pradesh"] as const;
const DIGITS = /^\d+$/;

function isHimachalWord(word: string): boolean {
  if (STATE_FILLER.has(word) || DIGITS.test(word)) return true;
  return LATIN.test(word) && HP_STATE_WORDS.some((target) => editDistance(word, target, 2) <= 2);
}

/**
 * Whether `state` names somewhere other than Himachal ("Punjab", "Chhattisgarh"). Empty, "HP",
 * "Himachal Pradesh" and its common misspellings ("Himanchal Pradesh", "Himachal Pardesh",
 * "Himachal Pradesh, India") = no. Any other word = yes, so an unknown state never routes into HP
 * except through a `border` alias.
 */
export function isOutsideState(state: string | null | undefined): boolean {
  if (!state || state.trim() === "") return false;
  if (OTHER_STATES.has(normaliseAlias(state))) return true;
  const text = state.normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(DOTTED_HP, "$1 hp ");
  return text
    .split(SEPARATOR)
    .filter((word) => word !== "" && !DROP_WORDS.has(word))
    .some((word) => !isHimachalWord(word));
}

/**
 * Resolves a place (§13.3, A8):
 * 1. empty → `empty`; the forms' district ids → that district; their "Outside Himachal" (or the
 *    words "outside Himachal") → `outside_hp` with no key;
 * 2. `outside` = a state was given that is not Himachal, or a part of the place names another
 *    state ("Bilaspur, Chhattisgarh"; such parts are not place candidates), or the caller says so
 *    (`opts.outside`: re-routing a lead stored as `outside_hp`, whose state is not kept);
 * 3. the whole input, then each part: an exact key counts (only `border` aliases when outside);
 * 4. outside and nothing matched → `outside_hp`;
 * 5. an explicitly ambiguous key → `ambiguous`;
 * 6. Latin-only fuzzy (distance ≤ 1 for 5–8 characters, ≤ 2 for 9+): unique → `fuzzy`, tie → `ambiguous`;
 * 7. otherwise `unknown`.
 */
export function resolveDistrict(
  input: string | null | undefined,
  state: string | null | undefined,
  index: AliasIndex,
  opts: { outside?: boolean } = {},
): AreaResolution {
  const raw = (input ?? "").trim();
  if (raw === "") return { areaId: null, outcome: "empty", match: null, key: null };
  const key = placeKeyOf(raw);
  const lowered = raw.toLowerCase();
  if (lowered === OUTSIDE_HP || normaliseAlias(raw) === OUTSIDE_KEY) return { areaId: null, outcome: "outside_hp", match: null, key: null };
  const all = placeKeys(raw);
  if (all.length === 0) return { areaId: null, outcome: "empty", match: null, key: null };
  const keys = all.filter((candidate) => !OTHER_STATES.has(candidate));
  const outside = opts.outside === true || isOutsideState(state) || keys.length < all.length;
  // The forms' district select sends the area id itself (§13.8): exact, unless that area is gone.
  if (!outside && isHpDistrictId(lowered) && index.areaIds.has(lowered)) return { areaId: lowered, outcome: "area", match: "district", key };

  for (const candidate of keys) {
    const hit = index.exact.get(candidate);
    if (!hit) continue;
    if (outside && hit.kind !== "border") continue;
    return { areaId: hit.areaId, outcome: "area", match: hit.kind as RoutingMatch, key };
  }
  if (outside) return { areaId: null, outcome: "outside_hp", match: null, key };

  for (const candidate of keys) {
    const areas = index.ambiguous.get(candidate);
    if (areas) return { areaId: null, outcome: "ambiguous", match: null, key, candidates: [...areas] };
  }

  let tie: string[] | null = null;
  for (const candidate of keys) {
    const found = fuzzyMatch(candidate, index);
    if (!found) continue;
    if ("areaId" in found) return { areaId: found.areaId, outcome: "area", match: "fuzzy", key };
    tie ??= found.tie;
  }
  if (tie) return { areaId: null, outcome: "ambiguous", match: null, key, candidates: tie };
  return { areaId: null, outcome: "unknown", match: null, key };
}
