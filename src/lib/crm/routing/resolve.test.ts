import { describe, expect, it } from "vitest";

import { AMBIGUOUS_PLACES, DISTRICT_SEEDS, SHORT_NAMES } from "./districts";
import { buildAliasIndex, editDistance, fuzzyBudget, isOutsideState, normaliseAlias, placeKeyOf, placeKeys, resolveDistrict, type AliasEntry } from "./resolve";
import { seedAliases } from "./seed";

// The resolver is pure: these tests build the index from the seed data, exactly as the database
// would hold it after `ensureAreasSeeded` (docs/lead-routing-plan.md §13.2 – §13.3).
const seededEntries: AliasEntry[] = DISTRICT_SEEDS.flatMap((district) =>
  seedAliases(district).map((alias) => ({ key: alias.key, areaId: district.id, kind: alias.kind })),
);
const index = buildAliasIndex(seededEntries, AMBIGUOUS_PLACES);
const areaOf = (input: string, state: string | null = null) => resolveDistrict(input, state, index).areaId;

describe("normaliseAlias", () => {
  it("lower-cases, applies NFKC, turns & into 'and' and drops punctuation and spaces", () => {
    expect(normaliseAlias("Lahaul & Spiti")).toBe("lahaulandspiti");
    expect(normaliseAlias("Lahaul and Spiti")).toBe("lahaulandspiti");
    expect(normaliseAlias("  McLeod   Ganj ")).toBe("mcleodganj");
    expect(normaliseAlias("Ｓｈｉｍｌａ")).toBe("shimla");
  });

  it("drops district / distt / dist / zila / zilla / जिला / h.p. / hp / himachal / pradesh", () => {
    expect(normaliseAlias("Distt. Kangra")).toBe("kangra");
    expect(normaliseAlias("Kangra District")).toBe("kangra");
    expect(normaliseAlias("Zila Mandi")).toBe("mandi");
    expect(normaliseAlias("zilla una")).toBe("una");
    expect(normaliseAlias("जिला मंडी")).toBe(normaliseAlias("मंडी"));
    expect(normaliseAlias("Shimla, H.P.")).toBe("shimla");
    expect(normaliseAlias("Shimla HP")).toBe("shimla");
    expect(normaliseAlias("Himachal Pradesh")).toBe("");
  });

  it("keeps Devanagari vowel signs (combining marks)", () => {
    expect(normaliseAlias("शिमला")).toBe("शिमला");
    expect(normaliseAlias("लाहौल और स्पीति")).toBe("लाहौलऔरस्पीति");
  });

  it("splits a place into the whole input, then its parts", () => {
    expect(placeKeys("Sundernagar, Mandi")).toEqual(["sundernagarmandi", "sundernagar", "mandi"]);
    expect(placeKeys("Kangra")).toEqual(["kangra"]);
  });
});

describe("seed data", () => {
  it("has 12 districts with unique ids and unique alias keys across areas", () => {
    expect(DISTRICT_SEEDS).toHaveLength(12);
    expect(new Set(DISTRICT_SEEDS.map((district) => district.id)).size).toBe(12);
    const owners = new Map<string, string>();
    for (const entry of seededEntries) {
      expect(owners.get(entry.key) ?? entry.areaId, `alias key ${entry.key}`).toBe(entry.areaId);
      owners.set(entry.key, entry.areaId);
    }
  });

  it("never seeds an explicitly ambiguous place as an alias", () => {
    for (const key of Object.keys(AMBIGUOUS_PLACES)) expect(index.exact.has(key)).toBe(false);
  });
});

describe("resolveDistrict — exact names", () => {
  it("resolves every seeded alias to its own district", () => {
    for (const district of DISTRICT_SEEDS) {
      for (const alias of seedAliases(district)) {
        const result = resolveDistrict(alias.label, null, index);
        expect(result, alias.label).toMatchObject({ areaId: district.id, outcome: "area", match: alias.kind });
      }
    }
  });

  it("resolves the short names (no fuzzy matching under 5 characters)", () => {
    const expected: Record<(typeof SHORT_NAMES)[number], string> = {
      Kulu: "kullu",
      Una: "una",
      Amb: "una",
      Kaza: "lahaul-spiti",
      Aut: "mandi",
      Pooh: "kinnaur",
      Yol: "kangra",
      Tabo: "lahaul-spiti",
    };
    for (const name of SHORT_NAMES) expect(areaOf(name), name).toBe(expected[name]);
    expect(resolveDistrict("Kuul", null, index).outcome).toBe("unknown");
  });

  it("maps the towns families actually type", () => {
    expect(areaOf("Dharamshala")).toBe("kangra");
    expect(areaOf("Manali")).toBe("kullu");
    expect(areaOf("Nahan")).toBe("sirmaur");
    expect(areaOf("Baddi")).toBe("solan");
    expect(areaOf("Keylong")).toBe("lahaul-spiti");
    expect(areaOf("Reckong Peo")).toBe("kinnaur");
    expect(areaOf("kulu")).toBe("kullu");
  });

  it("handles Hindi names, 'Shimla, HP' and 'Distt. Kangra'", () => {
    expect(resolveDistrict("शिमला", null, index)).toMatchObject({ areaId: "shimla", match: "hindi" });
    expect(areaOf("कांगड़ा")).toBe("kangra");
    expect(areaOf("जिला मंडी")).toBe("mandi");
    expect(areaOf("लाहौल और स्पीति")).toBe("lahaul-spiti");
    expect(resolveDistrict("Shimla, HP", null, index)).toMatchObject({ areaId: "shimla", outcome: "area", match: "district", key: "shimla" });
    expect(resolveDistrict("Distt. Kangra", null, index)).toMatchObject({ areaId: "kangra", match: "district" });
  });

  it("accepts the forms' district ids and their 'Outside Himachal' choice", () => {
    expect(areaOf("lahaul-spiti")).toBe("lahaul-spiti");
    expect(areaOf("kangra")).toBe("kangra");
    // An answer, not a place: no key, so it never shows up under "Unmatched places".
    expect(resolveDistrict("outside-hp", null, index)).toEqual({ areaId: null, outcome: "outside_hp", match: null, key: null });
    expect(resolveDistrict("Outside Himachal", null, index)).toEqual({ areaId: null, outcome: "outside_hp", match: null, key: null });
    expect([placeKeyOf("outside-hp"), placeKeyOf("Outside H.P."), placeKeyOf("  "), placeKeyOf("Distt. Kangra")]).toEqual([null, null, null, "kangra"]);
  });

  it("tries the whole input first, then its parts", () => {
    expect(resolveDistrict("Sundernagar, Mandi", null, index)).toMatchObject({ areaId: "mandi", match: "town", key: "sundernagarmandi" });
    expect(areaOf("Village Bhuntar (Kullu)")).toBe("kullu");
  });

  it("reports empty input", () => {
    expect(resolveDistrict("", null, index)).toEqual({ areaId: null, outcome: "empty", match: null, key: null });
    expect(resolveDistrict("   ", "Punjab", index).outcome).toBe("empty");
    expect(resolveDistrict(null, null, index).outcome).toBe("empty");
  });
});

describe("resolveDistrict — ambiguity, other states, fuzzy", () => {
  it("never guesses an explicitly ambiguous place", () => {
    expect(resolveDistrict("Dharampur", null, index)).toMatchObject({ areaId: null, outcome: "ambiguous", candidates: ["solan", "mandi"] });
    expect(resolveDistrict("Sarahan", null, index).outcome).toBe("ambiguous");
    expect(resolveDistrict("Sainj", null, index).outcome).toBe("ambiguous");
    expect(resolveDistrict("Udaipur", null, index).outcome).toBe("ambiguous");
  });

  it("keeps 'Bilaspur, Chhattisgarh' out of HP Bilaspur", () => {
    expect(resolveDistrict("Bilaspur, Chhattisgarh", null, index)).toMatchObject({ areaId: null, outcome: "outside_hp" });
    expect(resolveDistrict("Bilaspur", "Chhattisgarh", index)).toMatchObject({ areaId: null, outcome: "outside_hp" });
    expect(resolveDistrict("Bilaspur", "Himachal Pradesh", index)).toMatchObject({ areaId: "bilaspur" });
    expect(resolveDistrict("Bilaspur", "HP", index)).toMatchObject({ areaId: "bilaspur" });
    expect(resolveDistrict("Chandigarh", null, index).outcome).toBe("outside_hp");
  });

  it("honours a border alias even when the state is not Himachal", () => {
    const withBorder = buildAliasIndex([...seededEntries, { key: "pathankot", areaId: "kangra", kind: "border" }], AMBIGUOUS_PLACES);
    expect(resolveDistrict("Pathankot", "Punjab", withBorder)).toMatchObject({ areaId: "kangra", outcome: "area", match: "border" });
    expect(resolveDistrict("Pathankot, Punjab", null, withBorder)).toMatchObject({ areaId: "kangra", match: "border" });
    expect(resolveDistrict("Pathankot", "Punjab", index).outcome).toBe("outside_hp");
  });

  it("fuzzy-matches Latin spellings of 5+ characters to one district", () => {
    expect(resolveDistrict("Dharamshalla", null, index)).toMatchObject({ areaId: "kangra", outcome: "area", match: "fuzzy" });
    expect(resolveDistrict("Manalii", null, index)).toMatchObject({ areaId: "kullu", match: "fuzzy" });
    expect(resolveDistrict("Hamirpurr", null, index)).toMatchObject({ areaId: "hamirpur", match: "fuzzy" });
    expect(resolveDistrict("Xyzzyplace", null, index).outcome).toBe("unknown");
  });

  it("turns a fuzzy tie between two areas into ambiguous", () => {
    const tied = buildAliasIndex(
      [
        { key: "abcdef", areaId: "one", kind: "town" },
        { key: "abcdeg", areaId: "two", kind: "town" },
      ],
      {},
    );
    expect(resolveDistrict("abcdeh", null, tied)).toMatchObject({ areaId: null, outcome: "ambiguous", candidates: ["one", "two"] });
    expect(resolveDistrict("abcdef", null, tied)).toMatchObject({ areaId: "one", match: "town" });
  });

  it("never fuzzy-matches Hindi or border aliases", () => {
    const withBorder = buildAliasIndex([{ key: "pathankot", areaId: "kangra", kind: "border" }], {});
    expect(resolveDistrict("Pathankott", null, withBorder).outcome).toBe("unknown");
    expect(resolveDistrict("शिमलाा", null, index).outcome).toBe("unknown");
  });
});

describe("helpers", () => {
  it("measures optimal-string-alignment distance with a cut-off", () => {
    expect(editDistance("kangra", "kangra", 1)).toBe(0);
    expect(editDistance("kangra", "kagnra", 1)).toBe(1);
    expect(editDistance("kangra", "kangraaa", 1)).toBe(2);
    expect(editDistance("shimla", "dharamshala", 2)).toBe(3);
  });

  it("allows 0 edits under 5 characters, 1 for 5–8, 2 for 9+", () => {
    expect([4, 5, 8, 9, 14].map(fuzzyBudget)).toEqual([0, 1, 1, 2, 2]);
  });

  it("knows when a state is not Himachal", () => {
    expect(isOutsideState(null)).toBe(false);
    expect(isOutsideState("Himachal Pradesh")).toBe(false);
    expect(isOutsideState("H.P.")).toBe(false);
    expect(isOutsideState("हिमाचल प्रदेश")).toBe(false);
    expect(isOutsideState("Punjab")).toBe(true);
  });

  it("reads common misspellings of Himachal as Himachal, never another state", () => {
    for (const state of ["Himanchal Pradesh", "Himachal Pardesh", "Himachal Pradesh, India", "himachal pradesh 176001", "हिमांचल प्रदेश", "हि.प्र."]) {
      expect(isOutsideState(state), state).toBe(false);
    }
    for (const state of ["Uttar Pradesh", "Arunachal Pradesh", "Madhya Pardesh", "C.G.", "Punjab, India"]) {
      expect(isOutsideState(state), state).toBe(true);
    }
    expect(resolveDistrict("Shimla", "Himanchal Pradesh", index)).toMatchObject({ areaId: "shimla", outcome: "area" });
    expect(resolveDistrict("Nahan", "Himachal Pardesh", index)).toMatchObject({ areaId: "sirmaur", outcome: "area" });
  });

  it("lets a caller mark a place as outside Himachal (a re-routed outside_hp row)", () => {
    const withBorder = buildAliasIndex([...seededEntries, { key: "pathankot", areaId: "kangra", kind: "border" }], AMBIGUOUS_PLACES);
    expect(resolveDistrict("Bilaspur", null, index, { outside: true })).toMatchObject({ areaId: null, outcome: "outside_hp", key: "bilaspur" });
    expect(resolveDistrict("Pathankot", null, withBorder, { outside: true })).toMatchObject({ areaId: "kangra", match: "border" });
  });
});
