import { describe, expect, it } from "vitest";

import {
  bandOf,
  discrimination,
  GUESSING_FLOOR_MCQ4,
  intervalBand,
  isNegativeDiscrimination,
  paperThird,
  QB_DEFAULT_THRESHOLDS,
  scoreBucket,
  suggestDifficulty,
  thirdCutoffs,
  wilsonInterval,
} from "./calibration-math";
import {
  exactJaccard,
  fingerprintOf,
  jaccardEstimate,
  minhashFromBlob,
  minhashOf,
  minhashToBlob,
  normaliseForFidelity,
  normaliseForFingerprint,
  shinglesOf,
} from "./fingerprint";
import { packItems, unpackItems } from "./items-pack";
import { isOfficialSourceUrl } from "./official-hosts";
import { derivedFlags, differsFromOriginal, mergeFlags, type FlagInput } from "./question-rules";
import { formatSourceDate, sourceLabel, sourceLabelStaff } from "./labels";
import {
  blueprintPlaceholderNote,
  blueprintTestId,
  blueprintTotals,
  defaultBlueprint,
  originalMarkingFor,
  parseBlueprintTestId,
  patternTagFor,
  PATTERN_HISTORY,
  PATTERNS,
  QB_PLACEHOLDER_NOTE,
  QB_SLOT_META,
  summaryIsPlaceholderNote,
  TIE_BREAK,
} from "./patterns";
import { createRng } from "./rng";
import { escapeHtml, figureIndicesIn, normaliseDollarMath, parseRichText, plainTextOf, renderRichTextToHtml, richTextIssues } from "./rich-text";
import { applyOverrides, computeChapterWeights, computeFormatTargets, type OfficialQuestionRecord } from "./weights";
import { QB_BLOCKING_FLAGS, QB_BULK_EXCLUDED_FLAGS, QB_SLOTS, type QbQuestionContent, type QbSource } from "./types";

// Pure QB-CORE-A modules. Synthetic content only (no text from any real paper).

describe("patterns", () => {
  it("matches the official 2026 totals", () => {
    const main = blueprintTotals(defaultBlueprint("jee-main"));
    expect(main).toMatchObject({ questions: 75, marks: 300, minutes: 180 });
    const neet = blueprintTotals(defaultBlueprint("neet-ug"));
    expect(neet).toMatchObject({ questions: 180, marks: 720, minutes: 180 });
    const adv = blueprintTotals(defaultBlueprint("jee-adv"));
    expect(adv.parts).toEqual([
      { partId: "p1", questions: 48, marks: 180, minutes: 180 },
      { partId: "p2", questions: 54, marks: 180, minutes: 180 },
    ]);
    expect(PATTERNS.JEE_MAIN.questionsPerPaper).toEqual([75]);
    expect(PATTERNS.JEE_ADV.marksPerPaper).toEqual([180, 180]);
  });

  it("marks BOH as a placeholder that nobody has confirmed", () => {
    const boh = defaultBlueprint("boh-class-10");
    expect(boh.placeholder).toBe(true);
    expect(boh.patternConfirmedBy).toBeNull();
    expect(boh.pattern.verifiedAt).toBeNull();
    expect(boh.chapterLevels).toEqual(["class_9_10", "general"]);
    expect(QB_SLOT_META["boh-class-10"].placeholder).toBe(true);
    expect(PATTERNS.BOH.status).toBe("placeholder");
    for (const slot of ["jee-main", "neet-ug", "jee-adv"] as const) expect(defaultBlueprint(slot).placeholder).toBe(false);
  });

  it("seeds drafts with Aspire's mixes, the integer rule and the official tie-breaks", () => {
    for (const slot of QB_SLOTS) {
      const bp = defaultBlueprint(slot);
      expect(bp.status).toBe("draft");
      expect(bp.difficultyMix.easy + bp.difficultyMix.medium + bp.difficultyMix.hard).toBe(100);
      expect(new Set(bp.parts.flatMap((p) => p.sections.map((s) => s.id))).size).toBe(bp.parts.flatMap((p) => p.sections).length);
    }
    const main = defaultBlueprint("jee-main");
    expect(main.parts[0].sections.filter((s) => s.type === "numerical").every((s) => s.answerFormat === "integer")).toBe(true);
    expect(main.parts[0].sections.every((s) => s.marking.correct === 4 && s.marking.wrong === -1)).toBe(true);
    expect(main.tieBreak?.[0]).toEqual({ by: "subject_score", subject: "maths" });
    expect(defaultBlueprint("neet-ug").tieBreak?.[0]).toEqual({ by: "subject_score", subject: "biology" });
    expect(TIE_BREAK.JEE_ADV).toBeNull();
    expect(main.ranked).toBe("monthly");
    expect(defaultBlueprint("jee-adv").ranked).toBe("off");
    expect(main.pattern.reviewDueAt).toBe("2026-11-15");
    // A fresh copy every call.
    main.parts[0].sections[0].count = 1;
    expect(defaultBlueprint("jee-main").parts[0].sections[0].count).toBe(20);
  });

  it("tags old questions with their own year's pattern", () => {
    expect(patternTagFor("JEE_MAIN", 2020)).toBe("jee-main-2020");
    expect(patternTagFor("NEET", 2022)).toBe("neet-2021-2024");
    expect(patternTagFor("JEE_MAIN", 2010)).toBeNull();
    expect(originalMarkingFor("JEE_MAIN", 2020, "numerical")).toEqual({ correct: 4, wrong: 0 });
    expect(originalMarkingFor("JEE_MAIN", 2023, "numerical")).toBeNull();
    expect(originalMarkingFor("JEE_ADV", 2026, "multiple")).toEqual({ correct: 4, wrong: -1, partial: "per_correct_option" });
    expect(PATTERN_HISTORY.filter((e) => e.status === "verified").map((e) => e.tag)).toEqual(["jee-main-2026", "neet-2026", "jee-adv-2026"]);
  });

  it("names generated test ids", () => {
    expect(blueprintTestId("jee-main", "practice")).toBe("bp-jee-main");
    expect(blueprintTestId("neet-ug", "ranked")).toBe("bp-neet-ug-ranked");
    expect(parseBlueprintTestId("bp-jee-adv")).toEqual({ slot: "jee-adv", mode: "practice" });
    expect(parseBlueprintTestId("bp-neet-ug-ranked")).toEqual({ slot: "neet-ug", mode: "ranked" });
    expect(parseBlueprintTestId("jee-main-sample")).toBeNull();
    expect(parseBlueprintTestId("bp-unknown")).toBeNull();
  });

  it("keeps the blocking and bulk-excluded flag lists consistent", () => {
    for (const flag of QB_BLOCKING_FLAGS) expect(QB_BULK_EXCLUDED_FLAGS).toContain(flag);
    expect(QB_BLOCKING_FLAGS).not.toContain("low_confidence");
    expect(QB_BULK_EXCLUDED_FLAGS).toContain("student_report");
  });
});

describe("rich text", () => {
  it("parses only \\( \\) and \\[ \\] as math", () => {
    const segments = parseRichText("Speed \\(v = \\frac{d}{t}\\) and $x$ costs \\$5\n\\[E = mc^2\\]");
    expect(segments).toEqual([
      { kind: "text", text: "Speed " },
      { kind: "math", tex: "v = \\frac{d}{t}", display: false },
      { kind: "text", text: " and $x$ costs $5\n" },
      { kind: "math", tex: "E = mc^2", display: true },
    ]);
  });

  it("keeps unclosed math and over-long math as text, and parses figures and pipe tables", () => {
    expect(parseRichText("a \\(x + 1")).toEqual([{ kind: "text", text: "a \\(x + 1" }]);
    const long = `\\(${"x".repeat(1001)}\\)`;
    expect(parseRichText(long)).toEqual([{ kind: "text", text: long }]);
    expect(parseRichText("See [[figure:1]].")).toEqual([
      { kind: "text", text: "See " },
      { kind: "figure", index: 1 },
      { kind: "text", text: "." },
    ]);
    const table = parseRichText("Match:\n| List-I | List-II |\n|---|---|\n| A | \\(x^2\\) |\n| B | 2 |");
    expect(table[1]).toMatchObject({ kind: "table", header: [[{ kind: "text", text: "List-I" }], [{ kind: "text", text: "List-II" }]] });
    expect((table[1] as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("caps math segments at 100 per field", () => {
    const text = Array.from({ length: 105 }, (_, i) => `\\(${i}\\)`).join(" ");
    expect(parseRichText(text).filter((s) => s.kind === "math")).toHaveLength(100);
    expect(richTextIssues(text).map((i) => i.code)).toContain("too_many_math");
  });

  it("escapes text, including a <script> attempt", () => {
    const html = renderRichTextToHtml('<script>alert("x")</script> \\(a<b\\)');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("\\(a&lt;b\\)");
    expect(escapeHtml(`<img src=x onerror='1'>`)).toBe("&lt;img src=x onerror=&#39;1&#39;&gt;");
    const withMath = renderRichTextToHtml("<b>bold</b> \\(x\\)", { renderMath: (tex) => `<span class="katex">${escapeHtml(tex)}</span>` });
    expect(withMath).toBe('&lt;b&gt;bold&lt;/b&gt; <span class="katex">x</span>');
  });

  it("normaliseDollarMath converts paired dollars, keeps \\$ and is idempotent", () => {
    expect(normaliseDollarMath("Find $x^2$ and $$\\int f$$.")).toBe("Find \\(x^2\\) and \\[\\int f\\].");
    expect(normaliseDollarMath("It costs \\$5 and \\$6.")).toBe("It costs \\$5 and \\$6.");
    expect(normaliseDollarMath("Prices: $5 and $6 today")).toBe("Prices: $5 and $6 today");
    expect(normaliseDollarMath("Keep \\(a\\) and $b$")).toBe("Keep \\(a\\) and \\(b\\)");
    const once = normaliseDollarMath("$a$ costs \\$3, $$b$$");
    expect(normaliseDollarMath(once)).toBe(once);
    expect(parseRichText("\\$3")).toEqual([{ kind: "text", text: "$3" }]);
  });

  it("reports structural issues", () => {
    expect(richTextIssues("ok \\(x\\)")).toEqual([]);
    expect(richTextIssues("bad \\(x").map((i) => i.code)).toContain("unclosed_math");
    expect(richTextIssues("money $a$ here").map((i) => i.code)).toContain("dollar_math");
    expect(richTextIssues("[[figure:2]]", { figureCount: 1 }).map((i) => i.code)).toContain("figure_missing");
    expect(richTextIssues("x".repeat(8001)).map((i) => i.code)).toContain("too_long");
    expect(figureIndicesIn("[[figure:1]] and [[figure:3]]")).toEqual([1, 3]);
    expect(plainTextOf("Force \\(\\vec{F} = ma\\) [[figure:1]]")).toBe("Force F = ma");
  });
});

describe("fingerprints and MinHash", () => {
  const base = {
    stem: { en: "A ball is thrown up with speed \\(u = 10\\) m/s. Find the height.", hi: "" },
    options: [
      { en: "5 m", hi: "" },
      { en: "10 m", hi: "" },
      { en: "\\(5\\sqrt{2}\\) m", hi: "" },
      { en: "20 m", hi: "" },
    ],
  };

  it("ignores whitespace, $ versus \\( and option order", () => {
    const fp = fingerprintOf(base);
    expect(fingerprintOf({ ...base, stem: { en: "A  ball is   thrown up with speed $u=10$ m/s.\nFind the height.", hi: "" } })).toBe(fp);
    expect(fingerprintOf({ ...base, options: [...base.options].reverse() })).toBe(fp);
    expect(fingerprintOf({ ...base, stem: { en: "A ball is thrown up with speed \\( u = 10 \\) m/s. Find the height.", hi: "" } })).toBe(fp);
    expect(fingerprintOf({ ...base, stem: { en: "A ball is thrown up with speed \\(u = 12\\) m/s. Find the height.", hi: "" } })).not.toBe(fp);
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
    expect(normaliseForFingerprint("X \\(a \\, + \\; b\\)")).toBe("x \\(a+b\\)");
  });

  it("estimates Jaccard within ±0.1 on synthetic pairs", () => {
    const words = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => `w${i + offset}`).join(" ");
    const pairs: [string, string][] = [
      [words(60), words(60)],
      [words(60), `${words(54)} x1 x2 x3 x4 x5 x6`],
      [words(60), words(60, 20)],
      [words(60), words(60, 40)],
      [words(40), words(40, 100)],
    ];
    for (const [a, b] of pairs) {
      const exact = exactJaccard(shinglesOf(a), shinglesOf(b));
      const estimate = jaccardEstimate(minhashOf(a), minhashOf(b));
      expect(Math.abs(estimate - exact)).toBeLessThanOrEqual(0.1);
    }
    // Over many pairs the estimate is unbiased to within a few hundredths (64 functions: σ ≤ 0.0625).
    let totalError = 0;
    let count = 0;
    for (let n = 30; n <= 80; n += 10) {
      for (let off = 0; off <= n; off += 5) {
        const exact = exactJaccard(shinglesOf(words(n)), shinglesOf(words(n, off)));
        totalError += Math.abs(jaccardEstimate(minhashOf(words(n)), minhashOf(words(n, off))) - exact);
        count += 1;
      }
    }
    expect(totalError / count).toBeLessThan(0.05);
    const sig = minhashOf(words(30));
    expect(minhashFromBlob(minhashToBlob(sig))).toEqual(sig);
    expect(minhashFromBlob(new Uint8Array(3))).toBeNull();
  });
});

describe("fidelity diff and official sources", () => {
  const original = {
    stem: { en: "A wire carries a current of 2 MA. Find B at \\(x^2 = 4\\) cm.", hi: "" },
    options: [
      { en: "CO is formed", hi: "" },
      { en: "x² units", hi: "" },
    ],
    answer: { kind: "single" as const, index: 0 },
  };
  const edit = (patch: Partial<typeof original>) => ({ ...original, ...patch });

  it("treats case, superscripts and other characters as changes; whitespace, LaTeX spacing and $ delimiters not", () => {
    expect(differsFromOriginal(edit({}), original)).toBe(false);
    expect(differsFromOriginal(edit({ stem: { en: "A  wire carries a current of 2 MA.\nFind B at $x^2=4$ cm.", hi: "" } }), original)).toBe(false);
    expect(differsFromOriginal(edit({ stem: { en: "A wire carries a current of 2 MA. Find B at \\(x^2 \\, = \\; 4\\) cm.", hi: "" } }), original)).toBe(false);
    // Case-only edits change the meaning (MA vs mA; CO vs Co) and must not stay "verbatim".
    expect(differsFromOriginal(edit({ stem: { en: "A wire carries a current of 2 mA. Find B at \\(x^2 = 4\\) cm.", hi: "" } }), original)).toBe(true);
    expect(differsFromOriginal(edit({ options: [{ en: "Co is formed", hi: "" }, original.options[1]] }), original)).toBe(true);
    // NFKC would fold x² into x2: the fidelity diff keeps it.
    expect(differsFromOriginal(edit({ options: [original.options[0], { en: "x2 units", hi: "" }] }), original)).toBe(true);
    // A control word keeps its separating space; other math-mode spacing does not count.
    expect(normaliseForFidelity("\\(\\alpha b\\)")).not.toBe(normaliseForFidelity("\\(\\alphab\\)"));
    expect(normaliseForFidelity("\\(a + b\\)")).toBe(normaliseForFidelity("$a+b$"));
    // The duplicate fingerprint still folds case and compatibility forms.
    expect(normaliseForFingerprint("2 MA")).toBe(normaliseForFingerprint("2 ma"));
  });

  it("accepts only the issuers' own https sites, including the IITs", () => {
    for (const url of [
      "https://jeemain.nta.nic.in/paper.pdf",
      "https://nta.ac.in/x",
      "https://exams.nta.ac.in/NEET/",
      "https://jeeadv.ac.in/past_qps/2024.pdf",
      "https://www.iitm.ac.in/jee/paper.pdf",
      "https://iitk.ac.in/a",
      "https://ncert.nic.in/textbook.php",
      "https://www.nmc.org.in/x",
    ]) {
      expect(isOfficialSourceUrl(url)).toBe(true);
    }
    for (const url of [
      "http://nta.ac.in/x",
      "https://nta.ac.in.example.com/x",
      "https://examplecoaching.com/jee-main-2024.pdf",
      "https://iitjeeacademy.ac.in/x",
      "https://drive.google.com/file/d/x",
      "not a url",
    ]) {
      expect(isOfficialSourceUrl(url)).toBe(false);
    }
  });

  it("flags official evidence on a non-official site as third-party, and keeps the flag after the link is fixed", () => {
    const content: QbQuestionContent = {
      type: "single",
      format: "standard",
      passageId: null,
      passageOrder: null,
      stem: { en: "Synthetic stem.", hi: "" },
      options: [0, 1, 2, 3].map((i) => ({ en: `Option ${i}`, hi: "" })),
      answer: { kind: "single", index: 0 },
      solution: { en: "", hi: "" },
      solutionSource: "none",
      hiSource: "none",
      figures: [],
      topics: [],
    };
    const base: FlagInput = {
      content,
      sourceKind: "official",
      source: { kind: "official", exam: "JEE_MAIN", year: 2024, shift: "Shift 1", qno: "4", evidenceUrl: "https://examplecoaching.com/paper.pdf", evidencePage: 2 },
      importId: null,
      chapterId: "phy-a",
      exams: [{ exam: "JEE_MAIN", eligible: true, difficulty: "medium" }],
      keyStatus: "staff_entered",
      keyStage: "staff_verified",
      fidelity: null,
      imported: null,
      mathError: false,
    };
    const flagged = derivedFlags(base);
    expect(flagged.has("third_party_source")).toBe(true);
    expect(QB_BLOCKING_FLAGS).toContain("third_party_source");
    const fixed = derivedFlags({ ...base, source: { ...base.source, evidenceUrl: "https://jeemain.nta.nic.in/paper.pdf" } });
    expect(fixed.has("third_party_source")).toBe(false);
    // Sticky: fixing the link does not clear it (an admin clears it with the official URL).
    expect(mergeFlags([...flagged], fixed)).toContain("third_party_source");
    expect(derivedFlags({ ...base, sourceKind: "aspire", source: { kind: "aspire" } }).has("third_party_source")).toBe(false);
  });
});

describe("BOH placeholder wording", () => {
  it("keeps the blueprint summary neutral and derives the 'not confirmed' note", () => {
    const boh = defaultBlueprint("boh-class-10");
    expect(summaryIsPlaceholderNote(boh.summary)).toBe(false);
    expect(boh.summary.en).not.toMatch(/not available/i);
    expect(blueprintPlaceholderNote(boh)).toEqual(QB_PLACEHOLDER_NOTE);
    expect(blueprintPlaceholderNote({ ...boh, patternConfirmedBy: "admin-1" })).toBeNull();
    expect(blueprintPlaceholderNote(defaultBlueprint("jee-main"))).toBeNull();
    expect(summaryIsPlaceholderNote({ en: ` ${QB_PLACEHOLDER_NOTE.en} `, hi: "" })).toBe(true);
  });
});

describe("items-pack", () => {
  it("round-trips 7-byte items", () => {
    const items = [
      { n: 1, version: 1, section: 0 },
      { n: 4294967295, version: 65535, section: 255 },
      { n: 123456, version: 3, section: 7 },
    ];
    const packed = packItems(items);
    expect(packed.length).toBe(21);
    expect(unpackItems(packed)).toEqual(items);
    expect(unpackItems(Buffer.from(packed))).toEqual(items);
    expect(() => packItems([{ n: -1, version: 1, section: 0 }])).toThrow();
    expect(() => unpackItems(new Uint8Array(8))).toThrow();
  });
});

describe("calibration maths", () => {
  it("computes Wilson intervals and bands", () => {
    const [low, high] = wilsonInterval(30, 40)!;
    expect(low).toBeGreaterThan(0.58);
    expect(high).toBeLessThan(0.86);
    expect(wilsonInterval(0, 0)).toBeNull();
    const t = QB_DEFAULT_THRESHOLDS.JEE_MAIN.mcq;
    expect(bandOf(0.7, t)).toBe("easy");
    expect(bandOf(0.4, t)).toBe("medium");
    expect(bandOf(0.2, t)).toBe("hard");
    expect(intervalBand([0.62, 0.8], t)).toBe("easy");
    expect(intervalBand([0.5, 0.7], t)).toBeNull();
  });

  it("keeps every MCQ threshold above the 0.25 guessing floor", () => {
    for (const exam of Object.values(QB_DEFAULT_THRESHOLDS)) {
      expect(exam.mcq.hardMax).toBeGreaterThan(GUESSING_FLOOR_MCQ4);
      expect(exam.mcq.easyMin).toBeGreaterThan(exam.mcq.hardMax);
      if (exam.numerical) expect(exam.numerical.easyMin).toBeGreaterThan(exam.numerical.hardMax);
    }
  });

  it("suggests only with 30+ attempts and an interval clear of the current band", () => {
    const t = QB_DEFAULT_THRESHOLDS.JEE_MAIN.mcq;
    expect(suggestDifficulty({ attempted: 29, correct: 29, current: "hard", thresholds: t })).toBeNull();
    expect(suggestDifficulty({ attempted: 100, correct: 85, current: "hard", thresholds: t })).toBe("easy");
    expect(suggestDifficulty({ attempted: 100, correct: 85, current: "easy", thresholds: t })).toBeNull();
    expect(suggestDifficulty({ attempted: 40, correct: 24, current: "hard", thresholds: t })).toBeNull(); // straddles 0.6
    expect(suggestDifficulty({ attempted: 200, correct: 20, current: "medium", thresholds: t })).toBe("hard");
    expect(suggestDifficulty({ attempted: 200, correct: 20, current: "medium", thresholds: null })).toBeNull();
  });

  it("flags negative discrimination with 15+ papers in each third", () => {
    expect(discrimination({ topN: 14, topCorrect: 2, bottomN: 20, bottomCorrect: 18 })).toBeNull();
    const d = discrimination({ topN: 20, topCorrect: 4, bottomN: 20, bottomCorrect: 12 });
    expect(d).toBeCloseTo(-0.4);
    expect(isNegativeDiscrimination(d)).toBe(true);
    expect(isNegativeDiscrimination(-0.05)).toBe(false);
  });

  it("tags papers by tercile once the histogram has 30 papers", () => {
    expect(scoreBucket(150, 300)).toBe(50);
    expect(scoreBucket(-40, 300)).toBe(-14);
    const hist = Array.from({ length: 30 }, (_, i) => ({ bucket: i * 3, n: 1 }));
    const cut = thirdCutoffs(hist)!;
    expect(paperThird(0, cut)).toBe("bottom");
    expect(paperThird(87, cut)).toBe("top");
    expect(paperThird(45, cut)).toBe("middle");
    expect(thirdCutoffs(hist.slice(0, 29))).toBeNull();
  });
});

describe("chapter weights", () => {
  const settings = { mode: "past_papers" as const, fromYear: null, fallbackYears: 10, halfLifeYears: 3, overrides: {} };

  it("normalises per paper: a 20-shift year weighs the same as a 1-paper year", () => {
    const records: OfficialQuestionRecord[] = [];
    for (let shift = 0; shift < 20; shift += 1) {
      for (let q = 0; q < 25; q += 1) records.push({ subject: "physics", chapterId: "a", paperKey: `2024|s${shift}`, year: 2024 });
    }
    for (let q = 0; q < 25; q += 1) records.push({ subject: "physics", chapterId: "b", paperKey: "2025|p1", year: 2025 });
    for (let q = 0; q < 25; q += 1) records.push({ subject: "physics", chapterId: "b", paperKey: "2025|p2", year: 2025 });
    const result = computeChapterWeights({
      records,
      eligibleChapters: { physics: ["a", "b", "c"] },
      settings,
      syllabusRevisionYear: 2024,
      currentYear: 2026,
    });
    const w = result.weights.physics!;
    expect(w.a).toBeCloseTo(w.b, 6);
    expect(w.c).toBeGreaterThan(0); // alpha smoothing
    expect(w.c).toBeLessThan(0.02);
    expect(result.meta.mode).toBe("past_papers");
    expect(w.a + w.b + w.c).toBeCloseTo(1);
  });

  it("falls back to 10 years with a 3-year half-life when fewer than 3 papers follow the revision", () => {
    const records: OfficialQuestionRecord[] = [
      { subject: "maths", chapterId: "old", paperKey: "2019", year: 2019 },
      { subject: "maths", chapterId: "new", paperKey: "2025", year: 2025 },
    ];
    const result = computeChapterWeights({
      records,
      eligibleChapters: { maths: ["old", "new"] },
      settings,
      syllabusRevisionYear: 2024,
      currentYear: 2026,
    });
    expect(result.meta.mode).toBe("fallback_decay");
    expect(result.weights.maths!.new).toBeGreaterThan(result.weights.maths!.old);
    // 2019 is 7 years back (factor 0.5^(7/3) ≈ 0.198), 2025 one year back (≈ 0.794).
    expect(result.weights.maths!.new / result.weights.maths!.old).toBeCloseTo((0.02 + Math.pow(0.5, 1 / 3)) / (0.02 + Math.pow(0.5, 7 / 3)), 3);
  });

  it("is uniform without data, and applies manual overrides", () => {
    const uniform = computeChapterWeights({
      records: [],
      eligibleChapters: { chemistry: ["x", "y", "z", "w"] },
      settings,
      syllabusRevisionYear: 2024,
      currentYear: 2026,
    });
    expect(uniform.weights.chemistry).toEqual({ x: 0.25, y: 0.25, z: 0.25, w: 0.25 });
    expect(uniform.meta.uniformSubjects).toEqual(["chemistry"]);
    const overridden = applyOverrides({ x: 0.25, y: 0.25, z: 0.25, w: 0.25 }, { x: 40, y: 0 });
    expect(overridden.x).toBeCloseTo(0.4);
    expect(overridden.y).toBe(0);
    expect(overridden.z).toBeCloseTo(0.3);
    expect(overridden.w).toBeCloseTo(0.3);
  });

  it("derives format targets from past papers", () => {
    const bp = defaultBlueprint("jee-main");
    const records: OfficialQuestionRecord[] = [];
    for (let p = 0; p < 3; p += 1) {
      for (let q = 0; q < 20; q += 1) {
        records.push({ subject: "maths", chapterId: "m", paperKey: `p${p}`, year: 2025, type: "single", format: q < 15 ? "standard" : "statements" });
      }
    }
    const targets = computeFormatTargets({ blueprint: bp, records, syllabusRevisionYear: 2024, currentYear: 2026 });
    expect(targets["maths-a"]).toEqual({ standard: 0.75, statements: 0.25 });
    expect(targets["maths-b"]).toBeUndefined();
  });
});

describe("labels", () => {
  const official: QbSource = {
    kind: "official",
    exam: "JEE_MAIN",
    year: 2024,
    date: "2024-01-27",
    session: "January",
    shift: "Shift 1",
    paper: "Paper 1",
    qno: "12",
    aspireRef: "INT-7",
    claimedSource: "JEE Main 2019",
  };

  it("builds the public label from verified fields only", () => {
    expect(sourceLabel({ source: official, fidelity: "verbatim" }, "en")).toBe("JEE Main 2024 · 27 Jan · Shift 1 · Q 12 (NTA)");
    expect(sourceLabel({ source: official, fidelity: "adapted" }, "en")).toBe("Adapted by Aspire from JEE Main 2024 · 27 Jan · Shift 1 · Q 12 (NTA)");
    expect(sourceLabel({ source: official, fidelity: null }, "en")).not.toContain("2019");
    expect(sourceLabel({ source: official, fidelity: null }, "en")).not.toContain("INT-7");
    expect(sourceLabel({ source: { kind: "aspire", claimedSource: "JEE Main 2023" }, fidelity: null }, "en")).toBe("Aspire question bank");
    expect(sourceLabel({ source: { kind: "sample" }, fidelity: null }, "en")).toBe("Sample question (written for this demo)");
    expect(sourceLabel({ source: { kind: "official", exam: "JEE_ADV", year: 2025, paper: "Paper 2", qno: "7" }, fidelity: null }, "en")).toBe(
      "JEE (Advanced) 2025 · Paper 2 · Q 7 (official paper)",
    );
    expect(sourceLabel({ source: { kind: "official", exam: "NEET", year: 2026, session: "Re-exam", date: "2026-06-21", qno: "5" }, fidelity: null }, "en")).toBe(
      "NEET (UG) 2026 · 21 Jun · Re-exam · Q 5 (NTA)",
    );
    expect(sourceLabel({ source: official, fidelity: null }, "hi")).toContain("JEE Main 2024");
  });

  it("adds staff-only facts to the staff label, marking the claim unverified", () => {
    const staff = sourceLabelStaff({ source: official, fidelity: "transcription_fixed" }, "en");
    expect(staff).toContain("Aspire ref: INT-7");
    expect(staff).toContain("claimed source, UNVERIFIED: JEE Main 2019");
    expect(staff).toContain("transcription fixed");
    expect(formatSourceDate("2024-13-01", "en")).toBeNull();
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng("x");
    const b = createRng("x");
    const c = createRng("y");
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
    expect(createRng("z").shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(createRng("z").weightedIndex([0, 0, 5])).toBe(2);
    expect(createRng("z").weightedIndex([0, 0])).toBe(-1);
  });
});
