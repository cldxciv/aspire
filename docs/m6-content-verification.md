# M6 content verification (CONTENT-VERIFY, phase 2)

Date: 2026-10-20. Scope: the D-032 SAMPLE study content. Everything is still `status: "placeholder"`, so it shows only with `showPlaceholderContent()` and carries a Sample label.

- `src/content/mocktest/`: `jee-main-sample.ts` (45), `neet-sample.ts` (40), the weekly All-Himachal set in `index.ts` (15 JEE questions reused) and `topics.ts`.
- `src/content/planner/`: `flashcards.ts` (75 cards) and `syllabus.ts`.
- `src/content/predictor/`: sample / placeholder labelling only.

## Method

1. I extracted each question's stem and options without the stored key and solved all 85 from scratch. My working notes are in the session scratchpad, not the repo.
2. Then I compared my answers with the stored keys, the marking (+4/−1 MCQ, +4/0 numerical), the solution steps, the units, the distractors (exactly one correct option) and the topic and difficulty labels.
3. I read the Hindi side by side with the English for every stem, option, unit and solution. I checked that the numbers, the option order and the meaning match.
4. Verbatim check: I recognised no stem or solution that is copied from NCERT or an NTA paper. Several are classic textbook *types* with generic numbers, for example a ball thrown up at 20 m/s and the Daniell cell at 1.10 V. Their wording is original. A few one-line facts naturally echo NCERT's phrasing, such as "the pyramid of energy is always upright". That is not substantial copying.
5. Syllabus checks were against the current NTA JEE Main unit list (2024 revision), the NMC NEET-UG unit list (2024, reported unchanged for 2025–26) and the NCERT rationalised Class 9–10 chapter lists.
6. A final script confirmed that every stored key equals my independent answer, comparing by option text so that re-ordering cannot hide an error. Result: 85/85 match, plus the new neet-z-11.

## Headline findings

1. **No wrong answer key and no wrong arithmetic** in any of the 85 questions. All 9 numerical answers are exact integers, so tolerance 0 is right, and the scorer accepts equivalent spellings such as `60.0`. Units are shown where needed. Every MCQ has exactly one correct option.
2. **Most serious issue: the answer keys could be guessed** (test design).
   - JEE sample: B was the key for 21 of 36 MCQs, and D was never the key.
   - NEET sample: B was the key for 24 of 40.
   - Weekly set: B was the key for 8 of 12.
   - "Always pick B" therefore scored 69/144 on the JEE MCQs and 80/160 on NEET.
   - **Fixed:** I re-ordered the options of 32 questions. Whole {en, hi} option objects were moved, so the two languages stay in step and no text changed.
   - Keys are now JEE 9/9/9/9, NEET 11/10/11/8 and weekly 3/3/3/3. "Always X" now scores at most 9/144 (JEE) or 15/160 (NEET).
   - I added a guard test in `src/lib/mocktest/mocktest.test.ts`: each letter must be 15–35 % of the key in every test.
3. **neet-z-01 was out of syllabus.** It is a pepsin question from "Digestion and absorption", a chapter that is not in the current NMC NEET-UG syllabus. I withdrew it, retired its id (never reused) and replaced it with **neet-z-11**, a sliding-filament question from "Locomotion and movement". `topics.ts` and `index.ts` are updated to match.
4. **jee-c-02:** the solution referred to "Option 1/2/3/4", but the runner labels options (A)–(D). Rewritten by letter.
5. **neet-z-05:** the solution implied the Na⁺/K⁺ pump alone makes the outside of the resting membrane positive. Refined: the pump maintains the gradients, and K⁺ leaking out leaves the outside positive.
6. **Flashcards:** every formula was correct. I added missing conditions or definitions on 10 cards, such as constant mass, real coefficients, x > 0, complete dominance and point charges. The Hardy–Weinberg card wrongly described genotype frequencies as allele frequencies; that is fixed.
7. **Syllabus:** the JEE Main (20 + 20 + 14 units) and NEET-UG (Physics and Chemistry shared, 10 Biology units) unit names match the official lists. Two NCERT Class 9 chapters were missing from the foundation list and are now added: "Introduction to Euclid's Geometry" and "Improvement in Food Resources". The file makes no weightage claims, and `MOCK_MINUTES` is labelled "SUGGESTED".
8. **Predictor:** all 6 tables are `placeholder`, with source "Sample data — not official…". One UI sentence, which I do not own, can still read as official. It is flagged below.

## Summary table

| File | Items checked | Correct (unchanged) | Fixed | Flagged | Re-keyed / new |
|---|---|---|---|---|---|
| `mocktest/jee-main-sample.ts` | 45 | 44 | 1 | 0 | 16 re-keyed |
| `mocktest/neet-sample.ts` | 40 | 37 | 3 (z-01 withdrawn, z-02, z-05) | 0 | 16 re-keyed; +1 new (z-11) |
| `mocktest/index.ts` (3 test definitions) | 3 | 2 | 1 (NEET zoology ids) | 0 | — |
| `mocktest/topics.ts` (labels) | 58 | 57 | 1 (zoo-digestion removed) | 0 | +1 new (zoo-locomotion) |
| `planner/flashcards.ts` | 75 | 64 | 10 | 1 | — |
| `planner/syllabus.ts` (topics) | 115 | 115 | 0 | 3 notes | +2 new (missing chapters) |
| `predictor/*` (tables) | 6 | 6 | 0 | 2 notes (UI wording, owned by A1) | — |
| **Total** | **342** | **325** | **16** | **6** (1 item + 5 notes) | **32 re-keyed, 4 new** |

"Re-keyed" means the options were re-ordered and the text is unchanged. It is not a correctness error; it is counted separately.

**Tests.**

- `npx vitest run src/content src/lib/mocktest src/lib/planner src/lib/predictor src/components/mocktest src/components/planner src/app/api/mocktest` gives 8 files and 123 tests, all passing. That includes the new answer-balance test.
- `npx vitest run src/app/api/planner src/components/predictor` gives 2 files and 20 tests, all passing.
- A `tsc` type-check of the edited content and test files is clean.
- I changed no existing test expectation and added one test.

## Items for Aspire's faculty (and the lead) to review

1. **JEE numerical marking.** The samples use +4 / 0 for numerical-value (Section B) questions, as briefed, through `JEE_NUMERICAL_MARKING` in `src/content/mocktest/types.ts`. Several recent sources say NTA now applies −1 to Section B as well, and the sources conflict. Please confirm against the current NTA information bulletin. If −1 is right, change that one constant and the matching expectation in `mocktest.test.ts`.
2. **Difficulty calibration.** The questions are NCERT-level single-step problems. "medium" here is generous compared with actual JEE Main and NEET papers. That is fine for a demo, but Aspire's own papers should replace it.
3. **NEET syllabus currency.** The neet-z-01 withdrawal relies on the NMC 2024 NEET-UG syllabus, which coaching sources report unchanged for 2025–26. Please confirm against the NEET-UG 2026 bulletin. "Transport in plants" and "Mineral nutrition" are also out, and none of the samples use them.
4. **Botany / zoology split.** The official NEET syllabus has one Biology subject. The sample's split follows a common coaching convention: genetics and molecular basis appear under both, and DNA base-pairing (neet-z-08) sits in zoology. Aspire may prefer its own split.
5. **Hindi.** It is a machine-assisted draft and still needs a native reviewer. I found no meaning-changing mistranslations. Spelling of terms differs between files, for example मार्कोनीकॉफ (questions) and मार्कोवनिकॉफ़ (flashcards), and ग्लूकोज / ग्लूकोस. Faculty should pick one house style and record it in `docs/hindi-review-register.md`.
6. **Flashcard `chem-mole` foundation tag.** The card is correct. However, the mole concept may no longer be in the rationalised Class 9 "Atoms and Molecules" chapter. If so, make the card senior-only or label it as a stretch topic.
7. **Syllabus notes.**
   - (a) JEE Advanced reuses the JEE Main unit names; this is already disclosed in the file.
   - (b) The BOH syllabus and its mental-ability topics are a suggestion; Aspire has not confirmed them.
   - (c) NEET's Physics unit 1 is officially named "Physics and Measurement", while the shared list says "Units and Measurements". That is cosmetic.
8. **Predictor wording (for A1 / lead; I did not edit it because messages are outside my files).**
   - With sample tables, `predictor.result.optionsLead` renders "Compared with JoSAA 2025 final-round closing ranks.", and `basedOn` renders "JEE Main · 2025 tables". A "Sample data" badge and "Sample closing rank …" appear on each row, but those sentences read alone present illustrative numbers as JoSAA / MCC 2025 data.
   - Suggested fix: add `optionsLeadSample` and `basedOnSample` variants, for example "Compared with SAMPLE closing ranks (illustrative, not official {counselling} data)", mirroring `closingSample`.
9. **Saved demo attempts.** Mock-test answers are stored by position. Any attempt saved in a demo environment *before* this change would now be reviewed against the re-ordered options or the replaced zoology question. Placeholder tests are invisible in production, so real students are not affected. Clear demo attempts if needed.

## 1. Mock-test questions (per item)

The columns are: id, topic and difficulty, type, my independent working, the key (old → new letter when re-keyed), the verdict and notes. "Hindi match" means the stem, the options (same order), the unit and the solution say the same thing with the same numbers.

| id | topic · difficulty | type | independent working | key | verdict | notes |
|---|---|---|---|---|---|---|
| jee-p-01 | phy-kinematics · easy | MCQ | h = u²/2g = 20 m | B | correct | Key, steps, units and Hindi match. |
| jee-p-02 | phy-kinematics · medium | MCQ | R = u² sin 2θ / g = 20√3 m | A | correct | Key, steps, units and Hindi match. |
| jee-p-03 | phy-laws-of-motion · medium | MCQ | a = 2 m/s², N = 6 N | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-04 | phy-laws-of-motion · medium | MCQ | f(max) = 20 N > 15 N, so static f = 15 N | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-05 | phy-work-energy · easy | MCQ | ΔK = ½·2·(16 − 4) = 12 J | B | correct | Key, steps, units and Hindi match. |
| jee-p-06 | phy-rotation · medium | MCQ | K(rot)/K = (1/5)/(7/10) = 2/7 | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-07 | phy-gravitation · medium | MCQ | g(R/(R+h))² = 4g/9 | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-08 | phy-thermodynamics · medium | MCQ | nRT ln 2 = 1725.6 J | A | correct | Distractor 2490 J = nRT without ln — good. |
| jee-p-09 | phy-oscillations · easy | MCQ | T ∝ √L → 4 s | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-10 | phy-electrostatics · medium | MCQ | 2/x² = 8/(30 − x)² → x = 10 cm | A | correct | Key, steps, units and Hindi match. |
| jee-p-11 | phy-current · medium | MCQ | I = 2 A, V = 10 V | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-p-12 | phy-magnetism · medium | MCQ | r = mv/qB → 1 : 2 | B | correct | Key, steps, units and Hindi match. |
| jee-p-13 | phy-optics · medium | Num | 1/v = 1/20 − 1/30 → v = 60 cm | 60 (tol 0, cm) | correct | Key, steps, units and Hindi match. |
| jee-p-14 | phy-modern · easy | Num | K = 3 eV → 3 V | 3 (tol 0, V) | correct | Key, steps, units and Hindi match. |
| jee-p-15 | phy-current · medium | Num | Rp = 1 Ω, I = 10/5 = 2 A | 2 (tol 0, A) | correct | Key, steps, units and Hindi match. |
| jee-c-01 | chem-mole · easy | MCQ | 2 mol CO₂ → 4 mol O | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-c-02 | chem-atomic · medium | MCQ | n = 2 cannot have l = 2 | B → C | fixed | Solution said “Option 1 / 2 / 3, 4” but the runner labels options (A)–(D); rewritten per lettered option (EN + HI), each option explained. Options re-ordered to balance the key (text unchanged). |
| jee-c-03 | chem-bonding · easy | MCQ | BeCl₂(g) sp, linear | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-c-04 | chem-bonding · medium | MCQ | (10 − 7)/2 = 1.5 | B → A | correct | Options re-ordered to balance the key (text unchanged). |
| jee-c-05 | chem-periodic · medium | MCQ | N > O > C > B | A | correct | Exception O < N explained correctly. |
| jee-c-06 | chem-thermo · medium | MCQ | T = ΔH/ΔS = 400 K | B | correct | Key, steps, units and Hindi match. |
| jee-c-07 | chem-equilibrium · easy | MCQ | pOH 3 → pH 11 | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| jee-c-08 | chem-redox · easy | MCQ | 0.34 − (−0.76) = 1.10 V | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-c-09 | chem-kinetics · medium | MCQ | 2 half-lives = 40 min | B | correct | Key, steps, units and Hindi match. |
| jee-c-10 | chem-coordination · easy | MCQ | 4 + x − 6 = 0 → +2 | A | correct | Key, steps, units and Hindi match. |
| jee-c-11 | chem-goc · easy | MCQ | 3° most stable | C | correct | Key, steps, units and Hindi match. |
| jee-c-12 | chem-hydrocarbons · medium | MCQ | Markovnikov → 2-bromopropane | B | correct | Key, steps, units and Hindi match. |
| jee-c-13 | chem-mole · medium | Num | 10 mmol H⁺ / 0.2 M = 50 mL | 50 (tol 0, mL) | correct | Key, steps, units and Hindi match. |
| jee-c-14 | chem-solutions · easy | Num | 0.1 mol × 40 = 4 g | 4 (tol 0, g) | correct | Key, steps, units and Hindi match. |
| jee-c-15 | chem-atomic · medium | Num | Fe³⁺ 3d⁵ → 5 | 5 (tol 0) | correct | Key, steps, units and Hindi match. |
| jee-m-01 | math-quadratic · easy | MCQ | 25 − 12 = 13 | A → C | correct | Options re-ordered to balance the key (text unchanged). |
| jee-m-02 | math-sequences · easy | MCQ | 10 × 82 = 820 | B | correct | Key, steps, units and Hindi match. |
| jee-m-03 | math-trigonometry · easy | MCQ | 2t/(1 + t²) = 24/25 | A | correct | Key, steps, units and Hindi match. |
| jee-m-04 | math-complex · easy | MCQ | 5/√2 | A → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-m-05 | math-pnc · easy | MCQ | 5!/(2!2!) = 30 | C | correct | Key, steps, units and Hindi match. |
| jee-m-06 | math-binomial · easy | MCQ | C(5,3)·2³ = 80 | B | correct | Key, steps, units and Hindi match. |
| jee-m-07 | math-coordinate · easy | MCQ | |6 + 12 − 8|/5 = 2 | A | correct | Key, steps, units and Hindi match. |
| jee-m-08 | math-coordinate · medium | MCQ | (2, −3), r = √16 = 4 | A | correct | Key, steps, units and Hindi match. |
| jee-m-09 | math-limits · medium | MCQ | 2 sin²x/x² → 2 | C | correct | Key, steps, units and Hindi match. |
| jee-m-10 | math-derivatives · medium | MCQ | max at x = −1: f = 4 | C → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-m-11 | math-integrals · medium | MCQ | π/4 | B | correct | Key, steps, units and Hindi match. |
| jee-m-12 | math-probability · easy | MCQ | 5/36 | A → D | correct | Options re-ordered to balance the key (text unchanged). |
| jee-m-13 | math-matrices · easy | Num | 2²·5 = 20 | 20 (tol 0) | correct | Key, steps, units and Hindi match. |
| jee-m-14 | math-vectors · easy | Num | 6 − 2λ = 0 → 3 | 3 (tol 0) | correct | Key, steps, units and Hindi match. |
| jee-m-15 | math-differential-eq · medium | Num | y = 3e^(2x) → 12 | 12 (tol 0) | correct | Key, steps, units and Hindi match. |
| neet-p-01 | phy-units · easy | MCQ | E/ν → [M L² T⁻¹] | A | correct | Key, steps, units and Hindi match. |
| neet-p-02 | phy-kinematics · easy | MCQ | avg v × t = 50 m | A → C | correct | Options re-ordered to balance the key (text unchanged). |
| neet-p-03 | phy-laws-of-motion · medium | MCQ | m(g + a) = 720 N | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| neet-p-04 | phy-work-energy · easy | MCQ | mgh = 200 J | B | correct | Key, steps, units and Hindi match. |
| neet-p-05 | phy-gravitation · medium | MCQ | vₑ ∝ R (same ρ) → 22.4 | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| neet-p-06 | phy-kinetic-theory · medium | MCQ | 4 × 300 K = 1200 K = 927 °C | B → D | correct | Distractor 1200 °C (forgot K → °C) — good. Options re-ordered to balance the key (text unchanged). |
| neet-p-07 | phy-electrostatics · easy | MCQ | 6/5 = 1.2 μF | B → A | correct | Options re-ordered to balance the key (text unchanged). |
| neet-p-08 | phy-current · easy | MCQ | n²R = 4R | B | correct | Key, steps, units and Hindi match. |
| neet-p-09 | phy-magnetism · medium | MCQ | μ₀I/2R = π × 10⁻⁵ T | A | correct | Key, steps, units and Hindi match. |
| neet-p-10 | phy-optics · easy | MCQ | sin C = 1/√2 → 45° | B | correct | Key, steps, units and Hindi match. |
| neet-c-01 | chem-mole · easy | MCQ | 0.5 mol → 3.01 × 10²³ | A → D | correct | Options re-ordered to balance the key (text unchanged). |
| neet-c-02 | chem-atomic · easy | MCQ | 2(2l + 1) = 10 | C | correct | Key, steps, units and Hindi match. |
| neet-c-03 | chem-periodic · easy | MCQ | Na | A | correct | Key, steps, units and Hindi match. |
| neet-c-04 | chem-bonding · easy | MCQ | sp | A | correct | Key, steps, units and Hindi match. |
| neet-c-05 | chem-equilibrium · medium | MCQ | Δn = −2 | B | correct | Key, steps, units and Hindi match. |
| neet-c-06 | chem-redox · easy | MCQ | +6 | B → C | correct | Options re-ordered to balance the key (text unchanged). |
| neet-c-07 | chem-solutions · medium | MCQ | osmotic pressure | D | correct | Key, steps, units and Hindi match. |
| neet-c-08 | chem-goc · easy | MCQ | 2-methylbutane | A → C | correct | Options re-ordered to balance the key (text unchanged). |
| neet-c-09 | chem-hydrocarbons · medium | MCQ | but-2-ene | B | correct | Key, steps, units and Hindi match. |
| neet-c-10 | chem-kinetics · easy | MCQ | mol L⁻¹ s⁻¹ | B | correct | Key, steps, units and Hindi match. |
| neet-b-01 | bot-cell · easy | MCQ | ribosome | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| neet-b-02 | bot-cell-division · medium | MCQ | pachytene | C | correct | Key, steps, units and Hindi match. |
| neet-b-03 | bot-photosynthesis · easy | MCQ | water | B → A | correct | Options re-ordered to balance the key (text unchanged). |
| neet-b-04 | bot-photosynthesis · medium | MCQ | PEP | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| neet-b-05 | bot-respiration · medium | MCQ | net 2 ATP | A | correct | “Produced directly” + “net” makes 2 unambiguous (8 = old NADH-inclusive count, a fair distractor). |
| neet-b-06 | bot-growth · easy | MCQ | ABA | C | correct | Key, steps, units and Hindi match. |
| neet-b-07 | bot-genetics · easy | MCQ | 3 : 1 | B | correct | Key, steps, units and Hindi match. |
| neet-b-08 | bot-genetics · easy | MCQ | homozygous recessive | B | correct | Key, steps, units and Hindi match. |
| neet-b-09 | bot-reproduction · easy | MCQ | 3n | C | correct | Key, steps, units and Hindi match. |
| neet-b-10 | bot-ecology · easy | MCQ | always upright | A | correct | Key, steps, units and Hindi match. |
| neet-z-01 | zoo-digestion · easy | MCQ | pepsin (correct, but out of syllabus) | B (withdrawn) | fixed (withdrawn) | Answer correct, but “Digestion and absorption” is not in the current NMC NEET-UG syllabus (dropped in 2024, unchanged since). Withdrawn; id retired, not reused. |
| neet-z-02 | zoo-breathing · easy | MCQ | ~500 mL | A | fixed | Stem said “is about:” and every option also says “about” — stem tidied (EN + HI). Values (TV ≈ 500 mL, RV 1100–1200 mL, IRV 2500–3000 mL, 6000–8000 mL/min) checked. |
| neet-z-03 | zoo-circulation · easy | MCQ | left ventricle | D | correct | Key, steps, units and Hindi match. |
| neet-z-04 | zoo-excretion · easy | MCQ | nephron | B → A | correct | Options re-ordered to balance the key (text unchanged). |
| neet-z-05 | zoo-neural · medium | MCQ | K⁺ > Na⁺ | B | fixed | Key right; solution implied the Na⁺/K⁺ pump alone makes the outside positive. Now: pump maintains the gradients; K⁺ leak (higher permeability) leaves the outside positive (EN + HI). |
| neet-z-06 | zoo-endocrine · easy | MCQ | insulin | B → D | correct | Options re-ordered to balance the key (text unchanged). |
| neet-z-07 | zoo-reproduction · easy | MCQ | ampullary region | B → C | correct | Key correct: NCERT places fertilisation at the ampullary region (ampullary–isthmic junction), as the option says. Options re-ordered to balance the key (text unchanged). |
| neet-z-08 | zoo-molecular · easy | MCQ | thymine, 2 H-bonds | B → A | correct | Options re-ordered to balance the key (text unchanged). |
| neet-z-09 | zoo-evolution · easy | MCQ | analogous | B | correct | Key, steps, units and Hindi match. |
| neet-z-10 | zoo-health · easy | MCQ | B-lymphocytes | B → C | correct | Strictly plasma cells (derived from B cells) secrete antibodies; solution says so. OK for NEET. Options re-ordered to balance the key (text unchanged). |
| neet-z-11 | zoo-locomotion · medium | MCQ | A band constant, I band shortens | C (new) | new | NEW (replaces neet-z-01), topic zoo-locomotion “Locomotion and movement” (in syllabus). Sliding-filament question, original wording, EN + HI. |

### Weekly All-Himachal set (`all-himachal-mock-sample`)

| Item | Detail |
|---|---|
| Questions | Reuses jee-p-01, 03, 06, 10, 13; jee-c-01, 04, 07, 09, 13; jee-m-01, 04, 07, 11, 15. All are verified above. |
| Answer key | 12 MCQs; the key was 8× B before and is 3/3/3/3 now. |
| Labelling | Title and summary say "sample week" / "Sample schedule only — no real event has been announced". `status: "placeholder"`. Correct. |

### Topics (`topics.ts`)

| Item | Detail |
|---|---|
| Labels checked | All 58 chapter labels (EN + HI) are plausible standard chapter names. |
| Fixed | `zoo-digestion` removed (no longer used, and out of the NEET syllabus). `zoo-locomotion` "Locomotion and movement" / "गमन एवं संचलन" added. |
| Coverage | Every topic is used by at least one question. Every question's topic exists and has the right subject (test-enforced). |

## 2. Flashcards (`planner/flashcards.ts`, per card)

| id | subject | levels | verdict | notes |
|---|---|---|---|---|
| phy-equations-of-motion | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-newton-second-law | physics | senior, foundation | fixed | Added the condition: F = ma holds for constant mass (F = dp/dt is the general form). |
| phy-projectile | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-work-energy-theorem | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-universal-gravitation | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-escape-speed | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-moment-of-inertia | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-shm-period | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-ideal-gas | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-first-law-thermo | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-coulomb-law | physics | senior | fixed | Front now says point charges (Coulomb's law is for point charges). |
| phy-ohm-power | physics | senior, foundation | fixed | Added the condition for V = IR: ohmic conductor at constant temperature. |
| phy-resistors-combination | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-faraday-law | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-lens-formula | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-mirror-formula | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-snell-law | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-photoelectric | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-de-broglie | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-radioactive-decay | physics | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| phy-wave-speed | physics | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-mole | chemistry | senior, foundation | flagged | Also tagged foundation (fchem-atoms-molecules). The mole concept may have been dropped from the rationalised Class 9 book. Faculty should confirm the foundation tag. |
| chem-molarity-molality | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-gibbs | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-gibbs-equilibrium | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-gibbs-cell | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-nernst | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-ph | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-first-order | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-arrhenius | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-bohr-energy | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-uncertainty | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-raoult | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-colligative | chemistry | senior | fixed | Defined m (molality) and C (molar concentration) and noted dilute solutions; m could be read as mass. |
| chem-hybridisation | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-kp-kc | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-markovnikov | chemistry | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-atomic-mass-number | chemistry | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-neutralisation | chemistry | foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| chem-displacement | chemistry | foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-quadratic-formula | maths | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-discriminant | maths | senior, foundation | fixed | Added “for real a, b, c (a ≠ 0)”. With complex coefficients the D-based rules do not hold. |
| math-ap | maths | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-gp | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-pythagorean-identities | maths | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-compound-angles | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-double-angle | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-permutations-combinations | maths | senior | fixed | Added 0 ≤ r ≤ n. |
| math-binomial-term | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-standard-limits | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-basic-derivatives | maths | senior | fixed | Added the domain x > 0 for (ln x)′ = 1/x. |
| math-product-chain-rule | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-basic-integrals | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-integration-by-parts | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-distance-section | maths | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-circle-equation | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-dot-cross | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-matrix-inverse | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-probability-rules | maths | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-circle-area | maths | foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-herons-formula | maths | foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| math-volumes | maths | foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-mitochondria | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-ribosomes | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-photosynthesis | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-glycolysis | biology | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-monohybrid | biology | senior, foundation | fixed | Added the condition: one gene, complete dominance (3 : 1 fails with incomplete dominance). |
| bio-dihybrid | biology | senior | fixed | Added the conditions: independent assortment, complete dominance. |
| bio-base-pairing | biology | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-hardy-weinberg | biology | senior | fixed | The old wording called p², 2pq and q² allele frequencies. They are genotype frequencies; p and q are allele frequencies. |
| bio-chromosome-number | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-nephron | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-cardiac-output | biology | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-insulin-glucagon | biology | senior | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |
| bio-ten-percent-law | biology | senior, foundation | correct | Statement, symbols, units and conditions are correct. The Hindi matches. |

## 3. Syllabus map (`planner/syllabus.ts`)

| Group | Topics | Verdict | Notes |
|---|---|---|---|
| Senior Physics (JEE Main / Adv / NEET) | 20 | correct | Matches the 20 NTA JEE Main 2024 units in order. NEET uses the same units; unit 1 is officially "Physics and Measurement" (flag 7c). Class levels are plausible. |
| Senior Chemistry | 20 | correct | Matches the 20 units, from "Some Basic Concepts in Chemistry" to "Principles Related to Practical Chemistry". |
| Senior Maths | 14 | correct | Matches the 14 JEE Main 2024 units (reasoning and induction correctly absent). |
| NEET Biology | 10 | correct | Matches the 10 NMC units, from "Diversity in Living World" to "Ecology and Environment". |
| Foundation Physics (Class 9–10) | 9 | correct | NCERT rationalised chapter names. |
| Foundation Chemistry | 8 | correct | NCERT rationalised chapter names. |
| Foundation Biology | 7 + 1 | fixed | Added `fbio-food-resources` "Improvement in Food Resources" (Class 9, ch. 12, still in the book). |
| Foundation Maths | 17 + 1 | fixed | Added `fmath-euclid` "Introduction to Euclid's Geometry" (Class 9, ch. 5). Class 9 probability is correctly absent. "Linear Equations in Two Variables" covers Class 10's "Pair of …". |
| Mental ability (BOH) | 10 | flagged | Generic MAT topics. Already labelled a suggestion; Aspire must confirm the BOH syllabus (flag 7b). |
| Weightage / claims | — | correct | No weightages, marks or "important chapter" claims. `MOCK_MINUTES` is labelled "SUGGESTED … not an official exam duration". |

## 4. Predictor sample tables (`src/content/predictor/`, labels only)

| Table | status | source label | Verdict |
|---|---|---|---|
| `jeeMainScores` (2025) | placeholder | `SAMPLE_SOURCE` ("Sample data — not official. Illustrative numbers only; …") | correct; no absurd values |
| `jeeMainCutoffs` (JoSAA, 2025) | placeholder | `SAMPLE_SOURCE`; closing ranks are rounded to 2 significant figures by `sampleRound` | correct; IITs correctly excluded |
| `neetUgScores` (2025) | placeholder | `SAMPLE_SOURCE` | correct |
| `neetUgCutoffs` (MCC + HP, 2025) | placeholder | `SAMPLE_SOURCE` | correct |
| `bohScores` (2025) | placeholder | `SAMPLE_SOURCE`; the file header says the marking, curve and tiers are illustrative | correct |
| `bohCutoffs` (tiers 1–4) | placeholder | `SAMPLE_SOURCE`; the tiers carry no percentages or amounts | correct |
| UI wording (not in my files) | — | `optionsLead` / `basedOn` show "{counselling} {year}" with no "sample" qualifier | **flagged** for A1 / lead (item 8 above) |

`src/lib/predictor/data.ts` drops placeholder tables in production, so no sample number reaches production users.
