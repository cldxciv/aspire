/**
 * Locale overlays for content records (D-028).
 *
 * An overlay holds ONLY human-readable text for one English record, keyed by
 * the record's id (or slug / centreSlug for nested lists). `mergeOverlay()`
 * copies the English record and replaces a text field only where the overlay
 * has a non-empty string; everything else falls back to English field by field.
 *
 * The overlay can never change identity, visibility or facts:
 * - keys in PROTECTED_KEYS (ids, slugs, status, consent, links, contact
 *   numbers, emails, dates, people's names, quotes, exam names…) are excluded
 *   from the overlay types and ignored at runtime;
 * - numbers and booleans are never replaced; literal-union fields (exam
 *   tracks, categories, relations) are excluded by type and by PROTECTED_KEYS;
 * - arrays keep the English length (index-aligned); keys absent from the
 *   English record are ignored, so an overlay cannot add fields.
 *
 * Pure: the English source objects are never mutated.
 */

export const PROTECTED_KEYS = [
  // identity, lifecycle, provenance
  "id",
  "slug",
  "status",
  "consentStatus",
  "sourceRef",
  "sourceReference",
  "publishedAt",
  "updatedAt",
  "verifiedAt",
  "verifiedBy",
  // links between records
  "centreSlug",
  "centreSlugs",
  "programSlug",
  "facultySlug",
  "facultySlugs",
  "headOfficeCentreSlug",
  // links, contact channels, media
  "src",
  "url",
  "tel",
  "display",
  "email",
  "phone",
  "wardenPhone",
  "directionsUrl",
  "image",
  "coverImage",
  "videoDuration",
  // people, attributed words, proper names, figures
  "studentDisplayName",
  "author",
  "quote",
  "honorific",
  "credentials",
  "institution",
  "school",
  "examLabel",
  "value",
  "feeDisplay",
  // filter keys / enums
  "exam",
  "tracks",
  "programs",
  "category",
  "relation",
  "platform",
  "group",
] as const;

export type ProtectedKey = (typeof PROTECTED_KEYS)[number];

const PROTECTED = new Set<string>(PROTECTED_KEYS);

/** Overlay value for one field type: free text only (never literal unions, numbers or booleans). */
type OverlayValue<V> = V extends string
  ? string extends V
    ? string
    : never
  : V extends readonly (infer U)[]
    ? [OverlayValue<U>] extends [never]
      ? never
      : ReadonlyArray<OverlayValue<U> | undefined>
    : V extends object
      ? keyof TextOverlay<V> extends never
        ? never
        : TextOverlay<V>
      : never;

/**
 * Deep-partial, text-only view of a record type. Protected keys and fields
 * with no free text are removed, so `{ slug: "…" }` or a misspelt field is a
 * compile error in an overlay literal.
 */
export type TextOverlay<T> = {
  [K in keyof T as K extends ProtectedKey
    ? never
    : [OverlayValue<NonNullable<T[K]>>] extends [never]
      ? never
      : K]?: OverlayValue<NonNullable<T[K]>>;
};

/** Overlays for a collection, keyed by the English record's id. */
export type OverlayMap<T> = Readonly<Record<string, TextOverlay<T>>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * English `base` with the overlay's text applied (field-level fallback to
 * English for anything missing or empty). See the module comment for the
 * guarantees.
 */
export function mergeOverlay<T>(base: T, overlay: unknown): T {
  if (overlay === undefined || overlay === null) return base;
  if (typeof base === "string") {
    return typeof overlay === "string" && overlay.trim() !== "" ? (overlay as T) : base;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(overlay)) return base;
    return base.map((item: unknown, i) => mergeOverlay(item, overlay[i])) as T;
  }
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(overlay)) {
      if (PROTECTED.has(key) || !Object.hasOwn(base, key)) continue;
      out[key] = mergeOverlay(base[key], overlay[key]);
    }
    return out as T;
  }
  // numbers, booleans, undefined fields, mismatched shapes: English wins
  return base;
}

/**
 * Merge a list whose items are identified by `keyOf` (e.g. hostel campuses by
 * centreSlug) — robust to the list having been filtered before localisation.
 */
export function mergeKeyedList<T>(
  items: readonly T[],
  overlays: Readonly<Record<string, unknown>> | undefined,
  keyOf: (item: T) => string,
): T[] {
  return items.map((item) => mergeOverlay(item, overlays?.[keyOf(item)]));
}
