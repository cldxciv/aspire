# Question bank and exam-pattern mock tests: operator guide

Owner: QB-DOCS. Audience: Aspire admins, reviewers and authors, and the people who deploy the site.
Design: `docs/question-bank-plan.md` (v2, 22 Oct 2026). Decisions: D-050 – D-058 in `docs/agent-decisions.md`. Owner and counsel questions: `docs/aspire-approval-checklist.md` §18 (QB-1 – QB-17). Public API: `docs/api.md` → "Exam-pattern mock papers". Deployment: `deploy/README.md` → "Question bank".

> **Status (22 Oct 2026): being built.** This guide was written from the approved design while the code was still being built in parallel packages. A first re-check against the code that had landed by about 03:50 IST on 22 Oct (the admin routes under `src/app/api/admin/qb/`, the paper routes under `src/app/api/mocktest/papers/`, and `src/lib/qb/import/` without its routes) corrected §2, §6, §8, §9.5, §12–§15; it read the source only and ran nothing. The import routes (`/api/admin/qb/imports/**`) and the admin screens had not landed, so the rows marked *design* are not checked. Nothing here has been checked against the running app. Where a screen, field or message differs from this guide, the code is right and this guide must be corrected (the Integrate stage owns the final check). No test result is claimed here; see `docs/integration-status.md` for what has actually been run.

**What the owner asked for:** *"for the mock test create a MCQ questions glossary. from the past 10 years of the respective question papers from the exams. this will also be a feature in the admin panel side for the staff to add questions to the gloassary. catagorise questions into easy medium and hard catagory. and whenver someone appeard for the mock test it will randomly create a new question paper every time picking the right weightage from each catafory. keeping the mock as close as possible to the real test patterns."*

**Contents**

1. [In one page](#1-in-one-page)
2. [Honesty rules (binding)](#2-honesty-rules-binding)
3. [Roles and the team](#3-roles-and-the-team)
4. [First-time set-up (admin)](#4-first-time-set-up-admin)
5. [Adding a question by hand](#5-adding-a-question-by-hand)
6. [Importing papers and question files](#6-importing-papers-and-question-files)
7. [Review and approval](#7-review-and-approval)
8. [After approval: edits, corrections, reports, statistics](#8-after-approval-edits-corrections-reports-statistics)
9. [Blueprints and generated papers](#9-blueprints-and-generated-papers)
10. [Pattern registry (with sources)](#10-pattern-registry-with-sources)
11. [Costs and effort](#11-costs-and-effort)
12. [Retention, privacy and the privacy-notice draft](#12-retention-privacy-and-the-privacy-notice-draft)
13. [Environment variables](#13-environment-variables)
14. [Settings stored in the database](#14-settings-stored-in-the-database)
15. [Admin API reference](#15-admin-api-reference)
16. [Known limits and troubleshooting](#16-known-limits-and-troubleshooting)
17. [Where the code lives](#17-where-the-code-lives)

---

## 1. In one page

- **One question bank** in the admin panel at `/admin/questions` (English `/admin/questions`, Hindi `/hi/admin/questions`). Staff add questions by hand or import them from official papers (PDF) and Aspire's own files (Excel, Word, PDF, CSV).
- **AI reads files; people decide.** An import turns a file into **draft** questions. Drafts are never shown to students. A reviewer checks each one against the source page and approves it.
- **Every question keeps its real source:** an official paper ("JEE Main 2024 · 27 Jan · Shift 1 · Q 12 (NTA)"), "Aspire question bank", or "Sample question (written for this demo)". If staff change an official question beyond fixing typing errors, it becomes "Adapted by Aspire from …", and the system notices the change by itself.
- **Easy, medium and hard are set per exam.** The same question can be easy for JEE Advanced and medium for NEET.
- **A new paper every attempt.** Each practice attempt gets a freshly generated paper that follows the exam's official 2026 pattern (sections, question types, marking, time), Aspire's chosen difficulty mix, and chapter weights taken from past official papers.
- **One monthly ranked paper per exam** (owner decision A7-2, default on for JEE Main and NEET once the bank can make a full paper): the same paper for every signed-in student that month, one sitting each, ranked with the official tie-break rules.
- **Honest when the bank is small.** Not enough approved questions → a labelled **shorter practice set** (down to 50 % of the real length), or "coming soon: the bank has X of Y questions". The system never pads a paper.
- **No AI runs when a paper is generated or scored.** Papers cost nothing to run. AI is used only to read imported files (and, if switched on, to draft solutions or Hindi, always labelled and reviewed).
- **The bank starts empty.** Until staff import and approve questions, the exam-pattern pages show "coming soon", or labelled sample or shorter papers (sample only where demo content is switched on).

Student pages: `/tools/mock-tests` (list, with a new "Exam-pattern mocks: a new paper every attempt" section), `/tools/mock-tests/exam/<slot>` (start page) and `/tools/mock-tests/exam/<slot>/result`. Slots: `jee-main`, `neet-ug`, `jee-adv`, `boh-class-10`. The existing fixed sample tests keep working unchanged.

## 2. Honesty rules (binding)

These are rules for staff and for the software. The software enforces most of them; staff must follow all of them.

1. **Never invent a "past year" question**, and never attribute a question to a paper it did not come from. A question is "official" only if it was imported from the official paper (or entered by hand with an evidence link and page, below).
2. **AI output is a draft.** Nothing an import produces reaches students until a staff member approves it.
3. **Every question keeps its real source:** exam, year, date or session, shift / booklet / paper, question number (and the NTA question ID when printed), or "Aspire bank", or "Sample". Source fields come **only** from the metadata staff type in when they start the import, plus the printed question number, page and ID. If the AI's reading of the page header disagrees with that metadata, the question gets the blocking flag `source_mismatch`.
4. **Official questions entered by hand need evidence:** paper identity (exam, year, and the shift for JEE Main, the booklet for NEET, the paper for JEE Advanced) and either the import or an evidence URL plus page. Without it the question is flagged `source_incomplete` and cannot be approved.
5. **Claims in Aspire's own files** (for example a note "[JEE Main 2023]" next to a question in a Word file) are kept only as a staff-only **"claimed source (unverified)"** and are never shown publicly.
6. **Edited official questions are "Adapted by Aspire"** unless the edit only makes the question match the source page again. The reviewer must choose "transcription fix" or "adapted" whenever the system detects a difference (`fidelity_unconfirmed`). An answer that differs from the official final key is always "adapted".
7. **"Also asked in 2023"** appears only for an exact match (same normalised text), confirmed by a reviewer.
8. **Answer keys must be final.** Official questions need the official **final** key, or a staff-verified answer with a note. A provisional key leaves `key_provisional` (blocking). Questions the final key **dropped**, or for which it accepted **several** answers, are never used in mocks.
9. **Sample and demo questions stay labelled.** They are used only while demo content is switched on (`SHOW_PLACEHOLDER_CONTENT`), and any paper that uses them carries the sample banner and no rank projection.
10. **A thin bank is never padded.** Shorter sets are labelled with their real length ("Practice set: shorter than the real exam (38 of 75 questions, 90 minutes)") and are never ranked or projected.
11. **No coaching-site material.** Never download papers from coaching websites, and never scrape any website. Use official PDFs from the issuers' own sites (the **official sites** list below) and Aspire's own files. Files showing coaching-site watermarks, publisher names or URLs are flagged `third_party_source` (blocking); only an admin can clear it, with a note naming the official URL the file came from.

    **Official sites** (for staff downloads, and the addresses the import accepts as official when it reads page marks): NTA's `nta.ac.in` and its subdomains; the government `*.nic.in` sites NTA uses (for example `jeemain.nta.nic.in`, `neet.nta.nic.in`); the Government of India CDN `*.s3waas.gov.in` (for example `cdnbbsr.s3waas.gov.in`), where NTA's 2026 bulletins are hosted (section 10.1 links) and, reportedly, other NTA PDFs; `jeeadv.ac.in` and the IITs' own `iit….ac.in` sites; for syllabus documents, NMC (`nmc.org.in`) and NCERT (`ncert.nic.in`). The import's page-mark check is a little broader than this staff rule: it treats any `*.nic.in` or `*.gov.in` address as official (`OFFICIAL_HOSTS` in `src/lib/qb/import/normalize.ts`), so a mark from another government site is not flagged; staff still download only from the sites listed here. The URL in an admin's `third_party_source` note is checked only for being `https://`; the admin is responsible for it being one of these sites. The list is the owner's to approve (checklist QB-1(d)).
12. **Rights are Aspire's responsibility.** Every import asks the uploader to confirm that Aspire may use the file; the system records who confirmed and when. It cannot judge licensing (checklist QB-1).
13. **Difficulty labels and mixes are Aspire's judgement, not official.** Public pages say "difficulty mix set by Aspire". Statistics can only suggest a change; nothing changes automatically.

## 3. Roles and the team

| Who | Can do |
|---|---|
| **Author** (a staff account with an author membership) | View the bank; write and edit drafts in their subjects; import CSV or Excel files from the template |
| **Reviewer** | Everything an author can, plus: run AI imports (they cost money), approve, reject, retire, set difficulty and other labels, merge duplicates, manage chapters, record answer-key corrections, edit draft blueprints |
| **Admin** (any `admin` account) | Everything, plus: publish or archive blueprints, confirm syllabus lists and exam patterns, manage the team, change settings (including turning AI import on or off) |

- **Adding someone:** an admin creates the person's account as a **staff** account (the same staff role the CRM uses; `docs/auth-and-portals.md`), then opens **Question bank → Team** and gives it an author or reviewer membership, optionally limited to subjects (no subjects = all subjects). A staff account without a question-bank membership cannot open the bank. Being CRM staff does not give bank access, and bank membership does not give CRM access.
- **Subject scope** applies to authors and reviewers. A physics author cannot edit a chemistry draft.
- **Self-approval:** by default a reviewer may approve a question they wrote, and it is recorded (`approval.self = allowed_recorded`). An admin can require a second reviewer (`second_reviewer`). Owner decision A7-8.
- **Password change first:** an account that must change its password gets no bank access until it does.
- **Where staff land:** staff still land on `/crm` after signing in. Bank-only staff should bookmark `/admin/questions`; in the admin area they see a "Question bank" badge and only the bank's menu. A link on the CRM's "no membership" panel is a follow-up.
- **Audit:** these actions also go to the site's audit log: AI import run, cancel and spend; bulk approvals; blueprint publish and archive; pattern and taxonomy confirmations; answer-key corrections; membership changes; settings changes. Every change to a question is also kept in that question's history.

## 4. First-time set-up (admin)

Do these in order. Until step 1 is done for an exam, no import for that exam can run and its blueprint cannot be published.

1. **Confirm the syllabus list for each exam** (Question bank → Taxonomy, one screen per exam). It shows the official syllabus units (names only, each with its source link) and Aspire's teaching chapters (NCERT-aligned, class 11 and 12) mapped to them. Check:
   - each chapter's subject (a question's subject always comes from its chapter);
   - the **Botany / Zoology block** of each biology chapter (seeded values are marked "verify against a booklet", for example Molecular basis of inheritance);
   - the **syllabus revision year** (reported, not verified: JEE Main 2024, NEET UG 2024, JEE Advanced 2023). Official questions older than this year start as "syllabus unchecked" and are not used until a reviewer confirms they are in the current syllabus.

   If an exam's official units could not be transcribed reliably, its unit list is empty and says so; add them from the official document before confirming.
2. **Name the team** (section 3).
3. **Review the blueprints** (Question bank → Blueprints). Four drafts are seeded from the 2026 patterns (section 10). For each: check the pattern against the cited bulletin and confirm it (**Confirm pattern**). The **BOH** blueprint is a placeholder and cannot be published until an admin confirms the real BOH pattern (classes, subjects, counts, time, marking) and BOH chapters exist (checklist QB-4).
4. **Decide AI import** (checklist QB-7). It needs three things: `ANTHROPIC_API_KEY` set on the server, `QB_IMPORT_ENABLED` not `0`, and the admin setting **Import enabled** (`import.enabled`, default off, audited; changed with `PUT /api/admin/qb/settings`, admins only; where the switch sits on screen is up to the admin screens, not yet landed) switched on. These switches cover **AI imports only** (PDF and Word files). Spreadsheet imports from the CSV / Excel template and CSV answer keys never call the AI and work whatever they say, so staff can import Aspire's own spreadsheets before AI import is approved.
5. **Pilot one paper** (owner decision A7-7): import one recent JEE Main shift and its final key, review it, and compare the real cost with the estimate before importing more.
6. **Publish** a blueprint when its readiness shows **full** (or deliberately accept **short**; section 9). Nothing reaches students before a blueprint is published.

## 5. Adding a question by hand

Question bank → New question.

- **Chapter** first: it sets the subject.
- **Type:** single correct (4 options), one or more correct, or numerical value. **Format:** standard, assertion–reason, statements, match the lists, or passage (several questions sharing one passage).
- **Text in English and Hindi** (tabs) with a live preview. Use:
  - inline math as `\( … \)` and display math as `\[ … \]` (LaTeX). Chemistry formulas as `\ce{H2SO4}`. Hindi words inside math as `\text{बल}`.
  - `$ … $` is **not** read as math in the editor. Imported files are converted (`$…$` → `\( … \)`, `$$…$$` → `\[ … \]`; `\$` stays a literal dollar sign).
  - tables (List-I / List-II) as pipe tables; a figure in the text as `[[figure:1]]`.
  - Limits: 8,000 characters per field, 1,000 per math segment, 100 math segments. Math that does not compile sets `math_error` (blocking).
- **Answer:** the option(s), or a numerical value with an optional unit and either "integer" or a range (`low`–`high`). JEE Main numericals are rounded to the nearest integer in 2026, so they need an integer answer to be used in JEE Main's numerical section.
- **Per exam:** for each exam the question may be used in: difficulty (easy / medium / hard), syllabus status (current / removed / unchecked), expected time. Using a question in an exam other than its source exam ("cross-exam") is off by default and only a reviewer can switch it on; at most 20 % of a paper can be cross-exam (blueprint setting).
- **Source:** official (exam, year, date or session, shift / booklet / paper, question number, and an evidence URL plus page), Aspire bank (optional internal reference), or sample. Authors cannot change the official fields of imported questions.
- **Figures:** paste a screenshot (for example from the source PDF opened at the right page) or upload a file. The browser shrinks it to at most 700 px wide (WebP; choose "line drawing" for diagrams). The server accepts PNG, JPEG or WebP up to **200 KB**; SVG is refused. Give every figure alt text in both languages.
- **Hindi:** official Hindi (from an official Hindi or bilingual paper) or staff-written Hindi counts as Hindi. Machine-translated Hindi is labelled "machine translation, under review", sets `hi_machine`, and is never used on its own in Hindi mode.
- **Solution** (optional): official, staff-written, or an AI draft (labelled, and blocking until reviewed).

A new question is a **draft**. Send it for review, or a reviewer approves it directly (section 7).

## 6. Importing papers and question files

Question bank → Import.

### 6.1 Before you upload

- The exam's syllabus list is confirmed (section 4). Otherwise the upload is refused (`taxonomy_unconfirmed`).
- The file is an **official PDF** downloaded from one of the official sites (section 2, rule 11: NTA's sites and its government CDN `*.s3waas.gov.in`, `*.nic.in`, `jeeadv.ac.in` and the IITs' sites), or **Aspire's own file**. No third-party books or DPPs until Aspire confirms the rights (checklist QB-1).
- Tick **"Aspire has the right to use this file"**. It is recorded with your name and the time.
- Size: at most **9 MB** per file (`QB_IMPORT_MAX_FILE_MB`, never above 9). The same file cannot be uploaded twice while its first import is open. For NEET, import **one booklet code** per paper; a second booklet of the same paper is refused for questions (its answer key can still be imported for that booklet).

### 6.2 What you can import

| Kind | What | AI? | Who can run it |
|---|---|---|---|
| `pdf_paper` | An official question paper | Yes | Reviewer, admin |
| `pdf_key` | An official answer key (provisional or final) | Yes (table reading) | Reviewer, admin |
| `pdf_bank` | Aspire's own questions as a PDF | Yes | Reviewer, admin |
| `docx_bank` | Aspire's own questions in Word | Yes (structures the text) | Reviewer, admin |
| `xlsx_bank`, `csv_bank` | Aspire's own questions in the template (6.6) | No | Author, reviewer, admin |
| `csv_key` | An answer key as CSV | No | Author, reviewer, admin |

**AI switched off?** `QB_IMPORT_ENABLED=0`, the admin setting "Import enabled" off, or no `ANTHROPIC_API_KEY` stop only the AI kinds: a PDF or Word file can still be uploaded and shows its estimate, but **Run** is refused (`ai_disabled:env_off`, `…setting_off` or `…no_api_key`), and a running job pauses itself. The CSV / XLSX kinds are not affected (`aiAvailability()` in `src/lib/qb/import/config.ts`).

**Metadata** typed at upload (these become the questions' source fields): official or Aspire; exam; year; date (YYYY-MM-DD); session ("January", "April", "Re-exam"); shift; paper ("Paper 1"); NEET booklet code; language (`en`, `hi`, or `bilingual` for a NEET Hindi-medium booklet that prints both languages); for a Hindi paper, which English import it pairs with; for a key, which import(s) it is for and whether it is provisional or final; for Aspire files, an internal reference.

### 6.3 Cost estimate and running

- After upload the screen shows an **estimate**: pages or rows, the mode, a token range and a dollar range, and today's spend against the daily cap (`QB_IMPORT_DAILY_USD`, default $10).
- **Modes:** batch (half price, finishes within 24 hours, usually under one) is the default for PDFs over 8 pages and for Word files; fast (twice the batch price, minutes) for small files and retries. A reviewer may pick fast.
- **Run** starts the job (reviewers and admins only). You can **pause**, **cancel**, **retry failed** parts, and **close** it. If the daily cap is reached the job pauses itself ("daily cap") and continues another day.
- What is sent to Anthropic (Claude): **only the paper's pages and the exam's chapter list**. Never student or staff details.
- Encrypted PDFs (some official papers) cannot be split into page batches; the whole file is sent once and cached, then read part by part. This costs a little more.
- **Pattern snapshot:** for an official paper, the import stores the paper's own instruction block (sections, marking). A reviewer checks it against the paper and **confirms the snapshot** (the `confirm_snapshot` action; recorded and audited). This matters most for years whose pattern is not verified (section 10.2). Drafts are created whether or not the snapshot is confirmed; the snapshot and the year's known marking only set the staff-only "original marking" tag, and mocks always use the 2026 marking.
- **Text inside a file is data, not instructions.** A file (especially a Word or PDF file from an old archive) can contain text written to steer an AI, for example to change answers, add links or alter the source. The AI is told to ignore any instruction printed in the document and has no tools; it can only return question data, which is checked question by question and always becomes a draft. Source fields come only from the metadata typed at upload (plus the printed question number, page and ID), never from the AI's reading. Reviewers: if a draft contains text that reads like instructions, a link, or a hint about the answer, compare it with the source page and reject or fix it (section 7.2).

### 6.4 Answer keys

- Matching order: the NTA question ID, then subject + question number + booklet, then question number, against the imports named in "key for" (or the same paper).
- A **final** key sets the answer and clears `answer_missing`. A **provisional** key sets the answer but leaves `key_provisional` (blocking).
- Dropped questions get `key_dropped`; questions where several answers were accepted get `multiple_accepted`; two keys that disagree give `answer_conflict`. All three block approval and keep the question out of mocks.
- The AI is told **never to take an answer from candidate-response marks** printed on a response sheet.

### 6.5 Hindi

- **Paired Hindi paper:** import the official Hindi paper with "pairs with" set to the English import. Hindi text is matched by question ID or number and marked official Hindi.
- **Bilingual booklets** (NEET Hindi medium): import once with language `bilingual`; both printed languages are transcribed.
- **Optional AI extras** per job (shown in the estimate): AI-drafted solutions (`solution_unreviewed`, blocking until reviewed) and machine Hindi (`hi_machine`). Both are labelled.

### 6.6 CSV and Excel template (no AI)

Download the template from the import screen (the design's route is `GET /api/admin/qb/imports/template?kind=csv_bank` or `csv_key`; the import routes had not landed at the last re-check). **The downloaded template is authoritative.** The columns below are taken from the template code (`src/lib/qb/import/template.ts` and `keys.ts`). Column names are not case-sensitive; the template writes them in lower case.

**Question file (`csv_bank`, `xlsx_bank`)**

| Column | Meaning |
|---|---|
| `id` | Optional **row ID from your own file** (1–60 letters, digits, `.`, `_` or `-`), not a question-bank ID. It keeps one row from being imported twice; without it the row number is used. The template's own example rows (IDs starting `TEMPLATE-EXAMPLE-`) are **refused** on import, so delete them or replace them with your rows |
| `exams` | **Required.** Exams the question may be used in: `JEE_MAIN`, `NEET`, `JEE_ADV`, `BOH`. Several are separated by `;` (for example `JEE_MAIN;NEET`; a comma or a vertical bar also works). Only exams whose syllabus list is confirmed are accepted |
| `subject` | `physics`, `chemistry`, `maths`, `botany`, `zoology`, `biology` or `mental_ability`. Needed when there is no `chapter`; with a chapter, the chapter's subject wins and a contradicting value is an error (`biology` is fine for a Botany or Zoology chapter) |
| `chapter` | Optional chapter ID from the Taxonomy screen (for example `phy-kinematics`). Without one the draft gets `chapter_missing` (blocking until a reviewer sets it) |
| `topics` | Optional finer topics, separated by `;` or `,` (at most 10, each up to 60 characters) |
| `type` | **Required.** `single`, `multiple` or `numerical` (also accepted: `mcq`, `scq`, `msq`, `integer`, `numeric`, `nvq`) |
| `format` | `standard` (also when empty), `assertion_reason`, `statements` or `match_list`. **`passage` is not accepted in a spreadsheet** (questions sharing a passage are added by hand or from a PDF) |
| `stem_en` | **Required.** Question text in English (math as `\( … \)`, section 5; `$…$` is converted). Up to 8,000 characters |
| `stem_hi` | Optional Hindi text. Without full Hindi (stem and every option) the draft gets `hi_missing` |
| `option_a_en`, `option_a_hi` … `option_d_en`, `option_d_hi` | Options in both languages. Single and one-or-more questions need at least 2; numericals none. Optional extra columns `option_e_en` … `option_f_hi` are accepted (not in the template). No gaps (B cannot be empty when C is filled) |
| `answer` | `A` (single), `A;C` (one or more), `12` (numerical), `2.30-2.35` (numerical range). Empty is allowed: the draft gets `answer_missing` |
| `unit` | Optional unit of a numerical answer |
| `solution_en`, `solution_hi` | Optional worked solution (recorded as staff-written) |
| `difficulty_jee_main`, `difficulty_neet`, `difficulty_jee_adv`, `difficulty_boh` | Optional `easy`, `medium` or `hard`. This is only the file's **suggestion**: every draft still starts with `difficulty_missing`, and a reviewer sets the difficulty per exam. A value for an exam not listed in `exams` is ignored with a warning |
| `aspire_ref` | Staff-only internal reference |
| `claimed_source` | Staff-only, **unverified** (never public; section 2 rule 5) |
| `figure_note` | What figure is needed; the question gets `figure_needed` |

**Answer-key file (`csv_key`)**

| Column | Meaning |
|---|---|
| `qno` | Question number as printed. Either `qno` or `question_id` is needed in every row |
| `question_id` | The NTA question ID, when the key prints one (matched first) |
| `subject` | Optional; helps matching by subject + question number |
| `booklet` | Optional NEET booklet code |
| `answer` | Option letter(s) or the numerical answer, as in the question file. Required when `status` is `normal` |
| `status` | `normal` (default), `dropped` or `bonus` (both give `key_dropped`), or `multiple` (several answers accepted: `multiple_accepted`). Questions with `key_dropped` or `multiple_accepted` are never used in mocks |

Whether a key is provisional or final, and which import(s) it is for, is chosen at upload (section 6.4), not in the file.

- At most 2,000 rows per file. The import first shows a **dry-run report** (errors and warnings per row), then **Create N drafts**. Rows with an error are skipped; the others become drafts.
- Exported cells that start with `=`, `+`, `-` or `@` get a leading `'` so spreadsheets do not run them as formulas.
- An illustrative row (an original question written for this guide, not from any paper): `exams` = `JEE_MAIN`, `chapter` = `phy-kinematics`, `type` = `single`, `format` = `standard`, `stem_en` = `A ball is thrown straight up at \(10\ \text{m s}^{-1}\). Taking \(g = 10\ \text{m s}^{-2}\), how long does it take to return to the thrower's hand?`, options `1 s`, `2 s`, `3 s`, `4 s`, `answer` = `B`, `difficulty_jee_main` = `easy` (a suggestion for the reviewer).

### 6.7 Word files

Word files are converted to text (images become figure candidates) and then structured by the AI. **Equations made with Word's equation editor may be lost**: when the file contains them the job warns "Equations made in Word may be missing. Save the file as PDF and import the PDF."

### 6.8 Closing an import and what is kept

- **Close import** when the drafts are reviewed. Closing deletes the uploaded file and the stored AI output; usage totals stay.
- An import with no activity for **14 days** (`QB_IMPORT_RETENTION_DAYS`, 1–14) is closed automatically, which deletes its file. The clock restarts with every change to the import, so a file can stay longer than 14 days after upload while the import is still being worked on; it is always deleted when the import is closed. Total upload storage is capped (`QB_IMPORT_STORAGE_MB`, 100 MB).
- While the import is open, reviewers can open the source PDF beside each draft (`…/imports/<id>/source`, opened at the question's page).

## 7. Review and approval

### 7.1 Flags

Each draft shows its flags. **Blocking** flags stop approval. **Bulk-excluded** flags also keep the question out of bulk approval (approve it singly after a look).

| Flag | Meaning | Blocking | Bulk-excluded |
|---|---|---|---|
| `answer_missing` | No answer yet (official: until a final key is matched) | yes | yes |
| `answer_conflict` | Two keys disagree | yes | yes |
| `key_dropped` | The official key dropped the question (never used in mocks) | yes | yes |
| `multiple_accepted` | The official key accepted several answers (never used in mocks) | yes | yes |
| `key_provisional` | Answer only from a provisional key | yes | yes |
| `figure_needed` | A figure is missing | yes | yes |
| `math_error` | Math does not compile | yes | yes |
| `source_mismatch` | The page header disagrees with the import metadata | yes | yes |
| `source_incomplete` | An official question lacks paper identity or evidence | yes | yes |
| `third_party_source` | The file shows coaching or publisher marks; only an admin can clear it, naming the official URL | yes | yes |
| `exact_duplicate` | Same text as another question; decide duplicate / variant / distinct | yes | yes |
| `unsupported_type` | An old question type the bank cannot represent | yes | yes |
| `chapter_missing` | No chapter | yes | yes |
| `difficulty_missing` | No difficulty for an eligible exam | yes | yes |
| `solution_unreviewed` | AI-drafted solution not yet reviewed | yes | yes |
| `options_incomplete` | Options missing or malformed | yes | yes |
| `fidelity_unconfirmed` | An official question differs from the original extraction: choose transcription fix or adapted | yes | yes |
| `low_confidence` | The AI was unsure, or a field failed validation | no | yes |
| `student_report` | A student reported a problem | no | yes |
| `negative_discrimination` | Strong students get it wrong more often than weak ones: possibly a wrong key | no | yes |
| `near_duplicate` | Very similar to another question (unresolved pairs at ≥ 90 % similarity are treated as one in papers) | no | no |
| `hi_missing` | No Hindi (the question is left out of Hindi-mode papers) | no | no |
| `hi_machine` | Hindi is a machine draft (labelled; never alone in Hindi mode) | no | no |

### 7.2 Approving one question

The approval checklist (the server re-checks every item):
- the answer matches the **final** key, or the reviewer solved it and noted that;
- the text matches the source page, or the question is marked adapted with a note;
- the math renders and the figures are present;
- the Hindi is checked, or labelled;
- it is in the **current syllabus** of each exam it is eligible for;
- the import's rights confirmation is recorded.

Also look for anything the source page does not contain: text that reads like instructions (to the AI or to students), links or web addresses, or hints about the answer. A file can carry such text on purpose (section 6.3, "Text inside a file is data"). Compare it with the source page and fix or reject the draft; never approve it as it is.

### 7.3 Bulk approval

- At most **200** questions at a time, only those with no bulk-excluded flag.
- The server picks a **spot-check sample** of max(3, 5 % of the batch rounded up), at most 10. The reviewer must open each sampled question (the opening is recorded) and mark it OK. Failing any one aborts the whole batch.
- Recorded per question and once in the audit log with the count and the sampled IDs.

**Bulk label actions** (same spot-check gate): "accept AI chapter and difficulty" for a filtered set (recorded as AI-accepted with the reviewer's name; the public side never shows how a difficulty was set) and "confirm syllabus current".

### 7.4 Duplicates

- **Exact duplicate** (blocking): choose **duplicate** (the newer one is rejected and its source is added to the other's "also asked in"), **variant** (both kept, never in the same paper), or **distinct**.
- **Near duplicate** (≥ 80 % similar, not blocking): decide when convenient; until then pairs at ≥ 90 % are treated as one question when papers are made.

### 7.5 Review queues

To review (by import, subject or paper) · Flagged · Duplicates · Difficulty checks (statistics) · Possible wrong key · Student reports · Hindi missing or machine.

## 8. After approval: edits, corrections, reports, statistics

- **Content edits** (text, options, answer, figures, solution) create a new working version. Papers keep using the approved version until the edit is approved. Versions are never deleted.
- **Label edits** (chapter within the same subject, per-exam difficulty, syllabus status, eligibility) apply at once and are recorded.
- **Suspend** keeps a question out of new papers (reversible). **Retire** is permanent and needs a reason.
- **Answer-key corrections** (reviewer): record the new answer, or "dropped", for the current and older versions, with a reason and evidence. Saved attempts that used the question are **re-scored**, leaderboards and verify pages update, and they show "score updated after an answer-key correction on <date>". A dropped question gives full marks to everyone whose paper contained it (both bulletins). Practice results re-score the next time they are viewed.
- **Student reports** ("Report a problem" on each question in a result) arrive in the reports queue with the kind (wrong answer, error in the question, figure, Hindi, out of syllabus, other) and an optional note. No account or IP address is stored with a report. Resolve or dismiss each one.
- **Statistics and difficulty checks.** For each question and exam the bank counts how often it was served and answered (totals only, no student data). After at least 30 attempts, if the statistics clearly put it in a different band (95 % Wilson interval entirely inside that band), the question appears under "Difficulty checks" as a **suggestion**. Accepting it is a reviewer's choice; nothing changes automatically. Thresholds are Aspire defaults, not official. **For now they are fixed in the code** (`QB_DEFAULT_THRESHOLDS` in `src/lib/qb/calibration-math.ts`): the settings API cannot change them, so a change (for example after checklist QB-3) is a small code change by the web team:

  | Exam | Single correct (4 options) | Numerical |
  |---|---|---|
  | JEE Main | easy ≥ 60 % correct, hard < 35 % | easy ≥ 50 %, hard < 20 % |
  | JEE Advanced | easy ≥ 50 %, hard < 30 % | easy ≥ 40 %, hard < 15 % |
  | NEET | easy ≥ 75 %, hard < 45 % | – |
  | BOH | easy ≥ 70 %, hard < 40 % | – |

  Percentages are of students who attempted the question. Single-correct thresholds sit above the 25 % guessing floor.
- **Possible wrong key:** once a slot has 30 or more scored papers, the bank compares the top and bottom thirds of students. If the bottom third does clearly better (difference below −0.1, with at least 15 students in each third), the question gets `negative_discrimination` and goes to "Possible wrong key".
- **Expect calibration to be quiet for months.** At about 300 JEE papers a month over about 6,000 questions, each question is served about 4 times a month.

## 9. Blueprints and generated papers

### 9.1 How a paper is made

1. The student picks an exam slot and a language.
2. The published **blueprint** gives the parts, sections, question types, counts, marking and time.
3. Chapter counts per subject follow **chapter weights** from official papers since the syllabus revision year (each paper counts once, however many shifts a year had; a manual override is possible).
4. Each section's easy / medium / hard counts follow the **difficulty mix** (Aspire's choice).
5. Approved questions are picked at random to fill each chapter and difficulty slot: never two copies or close variants in one paper; nothing the same student saw in the last 30 days if avoidable (guests: their last 5 papers on this device); nothing from this month's ranked paper; only questions that fit the 2026 rules (for example, a decimal-answer numerical never goes into JEE Main's integer section).
6. If something is short, rules are relaxed in a fixed, recorded order: recently seen → neighbouring difficulty → chapter quota → format and source mix → shorten. A shortened paper shrinks **evenly** across sections, and its time shrinks with it (rounded to 5 minutes, at least 10).
7. Below the blueprint's minimum (`minShortRatio`, default 50 % of the real length) there is **no paper**: the page says "coming soon: the bank has X of Y questions".
8. Before starting, the student sees the composition, for example "31 from official JEE Main papers 2024–2026 · 44 from Aspire's question bank · difficulty mix set by Aspire". Each question's source and difficulty are shown **after** submission, never during the test.
9. Options are never shuffled (phase 2 for Aspire questions). JEE Advanced generates Paper 1 and Paper 2 together as a pair with no shared question.

### 9.2 Readiness

The blueprint screen and the public start page show readiness per language: **full** (a full-length paper is possible), **short** (only a shorter practice set), or **thin** (no paper). "Variety" estimates how many papers can be made before questions repeat. The admin screen also shows a **100-paper preview**: chapter counts (min / average / max), the difficulty spread, the most-used questions and how often rules had to be relaxed.

### 9.3 Practice and ranked papers

| | Practice | Monthly ranked |
|---|---|---|
| Who | Anyone, including guests | Signed-in students only |
| Paper | New every attempt | One shared paper per slot per India month; one sitting per student |
| Length | Full, or a labelled shorter set | Full only (else "unavailable" that month) |
| Score | Straight after submitting | When the attempt is saved |
| Answers and solutions | After a quarter of the paper's time has passed since it started (at least 5 minutes) | After the month closes |
| Rank | None | Leaderboard `bp-<slot>-ranked`, official tie-break order, time never used; equal results share a rank. "Ranks are indicative" |
| Extra time (PwD) | Can be chosen at start (the official rules give 1 hour per 3 hours); such attempts are unranked | Not offered |

- The contact form (lead gate) asks before a paper of **60 minutes or more** starts, as for today's long mock tests; readiness is checked first, so nobody is asked for details for an exam that has no paper.
- The ranked paper's questions are kept out of practice papers of the same exam until the month closes.
- Ranked papers can only be scored by saving the attempt (the plain score endpoint refuses them), so the key cannot be fished out before the month ends.

### 9.4 Rank projection

Only for full-length, non-sample papers of exams with predictor tables, labelled "indicative", with a note when a paper is mostly past-year questions (A7-12).

### 9.5 Publishing, sign-off and review dates

- **Publish** (admin) needs the exam's taxonomy confirmed. A placeholder blueprint (BOH) also needs "pattern confirmed by Aspire". Only one version per slot is published at a time; ranked windows keep the version they started with.
- **Sign-off:** optionally show "Pattern reviewed by Aspire faculty" on the exam page, without names unless the person agrees (A7-16).
- **Pattern review date:** each verified pattern has `reviewDueAt` (2026-11-15 for the seeded JEE Main, NEET and JEE Advanced blueprints, because the 2027 bulletins are due). The BOH placeholder has none (`null`) until Aspire confirms its pattern; set one then. The admin sees a banner when the date passes; check the new bulletin and update the blueprint.

## 10. Pattern registry (with sources)

Mocks always follow the **current (2026) pattern and marking**. Older questions keep a tag of their own year's pattern for staff only.

### 10.1 Current patterns (verified 22 Oct 2026 against the official documents)

| Slot | Pattern | Marking | Time | Source |
|---|---|---|---|---|
| `jee-main` | Mathematics, Physics, Chemistry. Each: Section A 20 single-correct MCQs (4 options), Section B 5 numerical-value questions (answer **rounded off to the nearest integer**). 75 questions, 300 marks, CBT | MCQ +4 / −1 / 0; numerical +4 / −1 / 0. Several correct options: +4 to anyone who marked one; dropped question: +4 to everyone | 180 min; compensatory 20 min per hour (60 min) for scribe-eligible PwD candidates | NTA, *JEE (Main) 2026 Information Bulletin* §2.3–2.6 and "Method of resolving ties": <https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311145384616.pdf>; notice <https://nta.ac.in/Download/Notice/Notice_20251019125337.pdf> |
| `neet-ug` | 180 compulsory single-correct MCQs (4 options): Physics 45, Chemistry 45, Biology 90. Blueprint sections Physics 45, Chemistry 45, Botany 45, Zoology 45: **the 45/45 split and block order come from booklets, not the bulletin ("verify against a 2025 or 2026 booklet")**. 720 marks, pen and paper | +4 / −1 / 0. Several correct: +4 to anyone who marked one; all options correct: +4 to all who attempted; wrong or dropped question: +4 to everyone | 180 min; 1 hour compensatory for PwD/PwBD candidates with a physical limitation to write | NTA, *NEET (UG) 2026 Information Bulletin*: <https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/02/202602081576322299.pdf> |
| `jee-adv` | Two compulsory papers, each Physics, Chemistry, Mathematics (order to verify). **Paper 1** per subject: S1 4 single correct; S2 4 one-or-more correct; S3 4 numerical (2 decimals); S4 4 match List-I (4) with List-II (5). 48 questions, 180 marks. **Paper 2** per subject: S1 4 single correct; S2 5 one-or-more correct; S3 5 numerical (2 decimals); S4 2 passages × 2 numerical. 54 questions, 180 marks | S1 +3 / 0 / −1; S2 full +4, partial +3/+2/+1 (+1 per chosen option when every chosen option is correct and not all correct options are chosen), 0 unanswered, −1 otherwise; S3 +4 / 0; P1 S4 +4 / 0 / −1; P2 S4 +2 / 0 | 2 × 180 min; 1 hour per paper for eligible PwD | IIT Roorkee, brochure <https://jeeadv.ac.in/documents/IBEnglish_2026.pdf> (syllabus: Annexure-I); instruction pages of <https://jeeadv.ac.in/documents/p1_english.pdf> and <https://jeeadv.ac.in/documents/p2_english.pdf> |
| `boh-class-10` | **Placeholder, unverified:** Physics 20, Chemistry 20, Mathematics 30, Mental ability 30, single correct | +4 / −1 (placeholder) | 120 min (placeholder) | Only hint: the reference-site card `dl-boh-class-10` in `src/content/institute.ts`. **Cannot be published until Aspire confirms** |

**Tie-break rules** (used only for ranked boards):
- JEE Main: NTA score in Mathematics, then Physics, then Chemistry; then the lower ratio of attempted-wrong to correct in all subjects, then in Mathematics, Physics, Chemistry; then equal rank.
- NEET: Biology (Botany and Zoology), then Chemistry, then Physics; then the lower attempted-wrong to correct ratio in all subjects, then in Biology, Chemistry, Physics; then (officially) a random process. The site lists equal entries with a shared rank instead.
- JEE Advanced: not transcribed yet (its ranked pair is phase 2).

**Languages:** JEE Main has 13 languages, English and Hindi everywhere. NEET Hindi medium gets a bilingual English + Hindi booklet; English prevails where they differ. JEE Advanced: English and Hindi, switchable in the exam; English prevails.

**Syllabus sources:** JEE Main syllabus on <https://jeemain.nta.nic.in/>; NEET syllabus notified by NMC (bulletin FAQ link: <https://www.nmc.org.in/MCIRest/open/getDocument?path=/Documents/Public/Portal/LatestNews/Public%20Notice_NEET_removed.pdf>); JEE Advanced brochure Annexure-I. Chapter names follow NCERT (ncert.nic.in).

### 10.2 History (staff tags only; mocks always use 2026 marking)

| Exam | Years | Pattern | Status |
|---|---|---|---|
| JEE Main | 2017–2018 (CBSE) | 90 MCQs (30 per subject), +4/−1, 360 marks, 3 h | Reported |
| | 2019 (NTA, January and April) | 90 MCQs, +4/−1, computer test only | Reported |
| | 2020 | 75: 20 MCQs (+4/−1) and 5 numericals (+4, no negative, decimals allowed) per subject | Reported |
| | 2021 | Section B: 10 numericals, attempt any 5; Section B negative marking unclear | Reported; sources conflict |
| | 2022–2024 | 90 questions, attempt 75; Section B −1 reported for 2022, conflicting for 2024 | Check each year's archived bulletin |
| | 2025 | 75, no choice, Section B −1 | Reported |
| NEET | 2017–2020 | 180 questions, 180 min, +4/−1, pen and paper | Reported |
| | 2021–2024 | 200 questions: per subject Section A 35 + Section B 15 (answer any 10); 200 min | NTA notices <https://nta.ac.in/Download/Notice/Notice_20210820233127.pdf>, <https://nta.ac.in/Download/Notice/Notice_20240211105313.pdf> |
| | 2025 | 180 compulsory, 180 min | 2025 bulletin (search snippet only) |
| | 2026 re-exam | NTA's site lists answer keys for a re-exam dated 21 June 2026 (reason not checked) | Reported |
| JEE Advanced | 2017–2025 | Changes every year (partial marking with −2 or −1, integer or decimal answers, paragraph and matching formats) | Not verified: each import stores the paper's own instructions as a pattern snapshot for staff to confirm |

**Syllabus revision years** (reported, confirmed by an admin on the Taxonomy screen): JEE Main 2024, NEET UG 2024, JEE Advanced 2023.

### 10.3 Default blueprints (seeded as drafts; Aspire's choices marked)

| Slot | Difficulty mix (Aspire) | Ranked | Compensatory |
|---|---|---|---|
| `jee-main` | 30 / 50 / 20 | monthly | 60 min |
| `neet-ug` | 40 / 45 / 15 | monthly | 60 min |
| `jee-adv` | 15 / 45 / 40 | off (phase 2) | 60 min per paper |
| `boh-class-10` | 40 / 40 / 20 (placeholder) | off | none |

Same for every slot: chapter weights from past papers since the syllabus revision year (fallback: 10 years with a 3-year half-life when fewer than 3 official papers fall inside); format mix from past papers (soft); sources official ✓, Aspire ✓, sample only while demo content is on; no cap on the official share; cross-exam at most 20 %; shortest allowed set 50 %; recently seen questions avoided for 30 days; English and Hindi; pattern review due 2026-11-15 (BOH: none until its pattern is confirmed).

## 11. Costs and effort

**AI import** (planning figures; the app shows a real estimate before every import). Prices per million tokens, October 2026 list:

| Model | Input | Output | Cache read |
|---|---|---|---|
| Claude Opus 5.5 (`claude-opus-5-5`, default) | $4 | $20 | $0.20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $10 | $0.20 |
| Claude Haiku 5.5 (`claude-haiku-5-5`, enough for answer-key tables if the owner chooses) | $0.10 | $0.50 | – (prompts up to 100K tokens) |

Batch mode costs half. `QB_IMPORT_PRICE_IN` / `QB_IMPORT_PRICE_OUT` override the input and output prices used in estimates.

| What | Fast mode | Batch mode (default for big files) |
|---|---|---|
| One JEE Main shift paper (75 questions, about 25–40 pages) | about $1.10–2.20 | about $0.55–1.10 |
| One NEET paper (180 questions) | about $2.40–4.60 | about $1.20–2.30 |
| One JEE Advanced paper (48–54 questions) | about $0.80–1.50 | about $0.40–0.75 |
| Phase 1: 2024–2026 papers (about 60 JEE Main shifts, 4 NEET including the 2026 re-exam, 6 JEE Advanced) | about $80–180 | about $40–90 |
| Full 10 years, English (about 170 JEE Main shifts, 11 NEET, 20 JEE Advanced) | about $220–460 | about $110–230 |
| Optional AI-drafted solutions for 15,000 questions | about $180–360 | about $90–180 |

- Official Hindi versions roughly double the extraction cost. Sonnet 5.5 costs about half of Opus 5.5; use it only if the pilot shows equal quality.
- The estimate assumes 1,500–3,000 input tokens per page, a cached system prompt plus chapter list of about 4,000 tokens, about 2.5 questions per page for JEE Main (NEET 4, JEE Advanced 2, others 3) and 600–1,100 output tokens per question. The Integrate stage's two small test calls measure the real figures; until then treat these as planning numbers.
- The daily cap (`QB_IMPORT_DAILY_USD`, default $10) pauses imports automatically.

**Staff time** (the real cost): about 1–2 minutes per clean question and 3–5 minutes when a figure or a fix is needed. Phase 1 (about 5,000 questions) is roughly 100–250 hours; ten years (about 15,000) roughly 300–750 hours.

**Server disk** (the VPS has about 2 GB free): database growth about 120–150 MB at a full 10-year bank; figures about 100–200 MB as files (quota `QB_FIGURE_QUOTA_MB`, 150 MB); each compressed nightly backup about 35 MB larger. The backup script keeps about 26 local copies today, so a full bank adds about 0.9 GB of local backups. Recommendation: keep fewer local copies (`KEEP_LOCAL_*`, `deploy/README.md`), and plan more disk before the 10-year backfill (checklist QB-11).

## 12. Retention, privacy and the privacy-notice draft

| Data | Kept |
|---|---|
| Questions, versions, figures | Indefinitely (versions and referenced figures are never deleted; unreferenced figures are pruned after 7 days) |
| Guest papers | 14 days (`QB_PAPER_GUEST_RETENTION_DAYS`); no name, number or account on the paper. Papers made while signed in with a parent, staff or admin account are treated as guest papers (only student accounts are linked) |
| Signed-in students' papers | 30 days, or as long as a saved attempt uses them |
| Contact details from the lead gate | Not on the paper. While the contact form is on, a family is asked for contact details before a paper of 60 minutes or more starts, otherwise at the result. Scoring through that form then adds a tool-use note (test `bp-<slot>`, exam, 10-point score band; never the score or answers) to the family's enquiry in the CRM, as for the other free tools (`docs/api.md` → Lead gate) |
| Uploaded import files | Until the import is closed, or 14 days after the last activity on it, whichever comes first |
| Stored AI output of an import | Wiped when the import is closed (usage totals stay) |
| Question statistics | Aggregates only (counts per question and exam; a score histogram per slot) |
| Student reports | The question, the kind and the note; **no account and no IP address** |
| Browser (the student's device) | The active paper per exam, answers in progress, and the last 5 papers (to avoid repeats) |

- Only question-paper content (pages, chapter lists) is sent to Anthropic. No student data is.
- Rate limits use the IP address only as an in-memory key, never stored.

**Draft sentences for the privacy notice** (for Aspire's legal adviser; the privacy page itself has not been changed — checklist QB-10):

> **Exam-pattern mock tests.** When you start an exam-pattern mock test, the website makes a question paper for you and keeps it on Aspire's server so that you can come back to it and have it scored. If you are not signed in, or are signed in with a parent or staff account, the paper is kept for 14 days with no name, number or account attached to it. If you are signed in as a student, it is linked to your account and kept for 30 days, or for as long as you keep a saved attempt that uses it. If you shared contact details with us before the test or to see your result, the section "Free student tools: contact details before results" applies: we note on your enquiry which exam-pattern test was taken and a score band, never your answers. After you submit, the server keeps your score and a coded fingerprint of your answers with the paper, so that the same paper cannot be scored twice with different answers. Your browser keeps your answers while you work and a list of your last five papers, so that new papers avoid questions you have just seen. We count how often each question is answered correctly, as totals only, to check how difficult it is; these totals are not linked to you. If you report a problem with a question, we keep your report but not your account or IP address. Aspire uses an AI model from Anthropic (Claude) to read question papers when building its question bank; only question-paper content is sent to it, never students' details.

A Hindi version should be drafted once the English is approved (the Hindi privacy page is in `src/i18n/messages/hi/legal.ts`).

## 13. Environment variables

All are server-only and listed in `.env.example`. They are read at run time (change `.env`, then `docker compose up -d`; no rebuild). "Reader" says which code reads the variable at the last re-check (22 Oct, about 03:50 IST); a variable marked *no reader yet* is part of the design but nothing reads it yet, so setting it has no effect until its package lands (the Integrate stage confirms every row).

| Variable | Default | What it does |
|---|---|---|
| `QB_IMPORT_ENABLED` | (empty: the admin setting decides) | `0` = **AI imports** (PDF, Word) hard off, whatever the admin setting says. CSV / XLSX template imports and CSV keys are not affected. **Production: `0` until the owner approves AI import.** AI imports also need the admin setting "Import enabled" and `ANTHROPIC_API_KEY`. Reader: `src/lib/qb/import/config.ts` |
| `QB_IMPORT_MODEL` | `claude-opus-5-5` | Model for extraction |
| `QB_IMPORT_EFFORT` | `medium` | `low`, `medium` or `high` (the Integrate stage picks the default from two test calls) |
| `QB_IMPORT_BATCH_MIN_PAGES` | `8` | PDFs with more pages use batch mode by default |
| `QB_IMPORT_DAILY_USD` | `10` | Daily spending cap in US dollars; reaching it pauses imports |
| `QB_IMPORT_MAX_FILE_MB` | `9` | Largest upload; never above 9 (Next.js buffers at most 10 MB of a request body) |
| `QB_IMPORT_DIR` | `<folder of AUTH_DB_PATH>/qb-imports` | Where uploads wait (server: `/data/qb-imports` in the container) |
| `QB_IMPORT_STORAGE_MB` | `100` | Total size of waiting uploads |
| `QB_IMPORT_RETENTION_DAYS` | `14` | Imports untouched this long are closed and their files deleted (1–14; larger values are ignored) |
| `QB_IMPORT_PRICE_IN`, `QB_IMPORT_PRICE_OUT` | (list prices) | Override the per-million-token prices used in estimates |
| `QB_FIGURE_DIR` | `<folder of AUTH_DB_PATH>/qb-figures` | Where figures are stored (server: `/data/qb-figures`). *No reader yet* (QB-CORE-B figures) |
| `QB_FIGURE_QUOTA_MB` | `150` | Total size of stored figures; uploads beyond it are refused (409 `figure_quota`). *No reader yet* (QB-CORE-B figures) |
| `QB_PAPER_GUEST_RETENTION_DAYS` | `14` | How long guests' papers are kept. *No reader yet* (QB-CORE-B papers) |
| `QB_GENERATION_ENABLED` | on | `0` = no new exam-pattern papers are generated (a kill switch for the public generator; `POST /api/mocktest/papers` answers 503). Reader: `src/lib/mocktest/generated.ts` |

All other `QB_IMPORT_*` rows are read by `src/lib/qb/import/config.ts`.

Reused: `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (shared with Rancho; the import has its own client and its own daily cap). `SHOW_PLACEHOLDER_CONTENT` decides whether sample questions can be used.

## 14. Settings stored in the database

Any bank member can read the settings (`GET /api/admin/qb/settings`); only admins change them, with `PUT /api/admin/qb/settings` and the body `{ importEnabled?, approvalSelf? }` (nothing else is accepted), or by the screens named. Every change is recorded in the audit log.

| Key | Meaning | Who |
|---|---|---|
| `import.enabled` | **AI imports** (PDF, Word) on or off (default off). `QB_IMPORT_ENABLED=0` overrides it. CSV / XLSX imports do not depend on it. API field `importEnabled` | Admin |
| `approval.self` | `allowed_recorded` (default) or `second_reviewer`. API field `approvalSelf` | Admin |
| (difficulty thresholds) | Not a setting yet: the bands of section 8 are fixed in the code (`QB_DEFAULT_THRESHOLDS`) | Web team (code change) |
| `taxonomy.<EXAM>.confirmed` (with the confirmation time) | The exam's syllabus list is confirmed; gates imports and publishing | Admin (Taxonomy screen) |
| `taxonomy.<EXAM>.syllabusRevisionYear` | Year from which official questions count as current and chapter weights are taken | Admin (Taxonomy screen) |
| `bank.revision` | Counter bumped on every change to the served pool (caches) | System |
| `seed.*` | Markers for the one-time seeding of units, chapters, draft blueprints and sample questions | System |

Blueprint settings (difficulty mix, ranked on/off, languages, shortest allowed set, cross-exam cap, source policy, compensatory time) live in each blueprint version, not here.

## 15. Admin API reference

All under `/api/admin/qb/`. These are portal APIs (not part of `docs/api.md`'s public list). Re-checked against the route files on 22 Oct 2026 (source read, nothing run); the import rows are still the design because those routes had not landed.

**Common rules** (`src/app/api/admin/qb/_lib/http.ts`): D-007 envelope; `Cache-Control: no-store` and `noindex` on every response; 401 signed out; 403 no bank membership or missing capability; **409 when the account must change its password first**; every change must come from the site itself (cross-origin → 403); JSON bodies at most 64 KB; refusals in a given state are 409 with a machine-readable `code` (for example `stale`, `blocking_flags`, `self_approval`, `placeholder_blueprint`, `taxonomy_unconfirmed`). Request bodies are validated by the admin routes' zod schemas in `src/app/api/admin/qb/_lib/schemas.ts` (the shared ones are in `src/lib/qb/schemas.ts`); the services re-check meaning and subject scope.

**Rate limits** (per signed-in user, in memory, reset on restart): reads 600 per 5 minutes; writes 180 per 5 minutes; heavy work (`preview`, `preview-stats`) 30 per 10 minutes; figure uploads 120 per hour. Over the limit → 429 with `Retry-After`.

| Method | Path | Purpose | Capability |
|---|---|---|---|
| GET | `questions` | List and filter (status, subject, chapter, exam, difficulty, source, year, paper, import, flag, queue, search `q`, sort, paging 25 / 50 / 100) | view |
| POST | `questions` | Create a hand-made draft (201) | edit_draft |
| GET | `questions/[id]` | One question: working copy, labels, statistics, source, original extraction, history, versions, duplicates, corrections, approval check. `?spotCheck=<batchId>` records a spot-check opening and returns its one-time token | view |
| PATCH | `questions/[id]` | Edit, with `baseVersion` + `baseUpdatedAt` (409 `stale` if someone saved meanwhile) | edit_draft (the service also needs set_labels for live label changes on approved questions) |
| POST | `questions/[id]/actions` | `submit`, `return_to_draft`, `clear_flag` | edit_draft |
| | | `approve` (with the checklist), `reject`, `set_fidelity` (transcription fix or adapted), `set_key_stage` (`staff_verified` with a note) | approve |
| | | `suspend`, `unsuspend`, `retire` (with a reason), `restore` | retire |
| | | `accept_calibration`, `dismiss_calibration` (per exam) | set_labels |
| | | `clear_flag` for `third_party_source`: **admins only**, needs `officialUrl` (https) and a note; audited | admin |
| POST | `questions/bulk` | Bulk approve (≤ 200): `start` → `commit` with the spot-check tokens, or `cancel` | approve |
| POST | `questions/bulk-labels` | Same flow for "accept AI chapter and difficulty" and "confirm syllabus current" | set_labels |
| POST | `figures` | Upload a figure (multipart `file`, ≤ 200 KB, PNG / JPEG / WebP by content; 413 / 415; 409 `figure_quota`) | edit_draft (upload limit) |
| GET | `figures/[id]` | A figure for staff (drafts included) | view |
| GET | `units?exam=…` | Official syllabus units, confirmation status and gaps | view |
| POST | `units` | Add or correct an official unit (201 new, 200 changed). The source must be an official URL (nta.ac.in, *.nta.nic.in, *.s3waas.gov.in, nmc.org.in, jeeadv.ac.in, ncert.nic.in); audited | confirm_taxonomy (admins) |
| GET | `chapters` | List (`exam`, `subject`, `all=true` for inactive) | view |
| POST | `chapters` | Add a chapter | manage_chapters |
| PATCH | `chapters/[id]` | Edit a chapter (labels, level, order, active, units, per-exam status, subject / biology block) | manage_chapters |
| POST | `taxonomy/[exam]/confirm` | `{ confirm: true, syllabusRevisionYear, note? }`: confirm an exam's syllabus list; audited | confirm_taxonomy (admins) |
| GET | `blueprints` | Every version of every slot | view |
| POST | `blueprints` | `{ slot }`: a draft from the default (409 `duplicate_id` if the slot has one) | edit_blueprint |
| GET | `blueprints/[id]` | One blueprint with validation issues and publish blockers | view |
| PATCH | `blueprints/[id]` | Save a draft: `{ definition, baseUpdatedAt }` (409 `not_allowed_in_status`, `stale`) | edit_blueprint |
| POST | `blueprints/[id]/actions` | `new_version` | edit_blueprint |
| | | `publish`, `archive`, `confirm_pattern`, `signoff` (public wording in `label`) | publish_blueprint (admins) |
| GET | `blueprints/[id]/readiness?language=en\|hi` | Readiness | view |
| GET | `blueprints/[id]/preview?seed=…&language=…` | One sample paper for staff (nothing stored) | view (heavy limit) |
| GET | `blueprints/[id]/preview-stats?language=…` | 100-paper statistics | view (heavy limit) |
| GET | `coverage?exam=…[&subject=…]` | Questions per chapter and difficulty; drafts; figure backlog; answer-position spread per source | view |
| GET | `duplicates?status=…&subject=…` | Duplicate and near-duplicate pairs | view |
| POST | `duplicates/decide` | `{ a, b, decision, keep? }`: duplicate / variant / distinct | merge_duplicates |
| GET | `reports?status=…` | Student reports | view |
| PATCH | `reports/[id]` | `{ status: "resolved" \| "dismissed", note? }` | approve |
| GET | `corrections[?questionId=…]` | Answer-key corrections, newest first | view |
| POST | `corrections` | `{ questionId, appliesToVersion, kind: "answer" \| "dropped", answer?, reason, evidenceUrl? }` (201; re-scores saved attempts; audited) | key_corrections |
| GET | `members` | Team list, and staff accounts without a membership | manage_team (admins) |
| PUT | `members/[userId]` | Add or change a membership: `{ qbRole: "author" \| "reviewer", subjects (empty = all), active }`; the account must be a `staff` account (422 otherwise); audited | manage_team (admins) |
| GET | `settings` | Bank settings view: `import.enabled`, whether the env kill switch is set, whether an API key is configured (never the key), self-approval policy, bank revision, search mode, figure use | view |
| PUT | `settings` | `{ importEnabled?, approvalSelf? }`; audited | manage_settings (admins) |
| GET, POST | `imports` | *Design, not landed:* list imports; upload (multipart; file, kind, meta, `licenceAck=true`) | view; import_tabular (CSV / XLSX) or import_ai (PDF / DOCX) |
| GET | `imports/[id]` | *Design, not landed:* one import: progress, estimate, usage, items | view |
| POST | `imports/[id]` | *Design, not landed:* `{ action: "run" \| "pause" \| "cancel" \| "retry_failed" \| "close" \| "create_drafts" \| "confirm_snapshot", options? }` | import_ai (AI actions); import_tabular (create_drafts for templates) |
| GET | `imports/[id]/source` | *Design, not landed:* the uploaded PDF, inline (`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-origin`); 404 once deleted | view |
| GET | `imports/template?kind=csv_bank\|csv_key` | *Design, not landed:* the CSV template | view |

There is no `GET chapters/[id]`, no `DELETE` anywhere (questions are retired, chapters made inactive, blueprints archived) and no settings field for the difficulty thresholds (section 14).

Import refusals, from the import code (`createImport` and `importAction` in `src/lib/qb/import/jobs.ts`; the routes may map them differently): 422 `licence_required`; 422 for missing or inconsistent metadata; 409 `taxonomy_unconfirmed`; 413 `file_too_large`; 415 `file_type_mismatch` (checked by content, not the name); 409 `duplicate_file` (the same file as an open import); 409 `paper_duplicate` or `booklet_duplicate` (a second NEET booklet of the same paper); a zip-based file (XLSX, DOCX) that would unpack to more than 50 MB or 2,000 entries; 409 `storage_quota`. **Run** and **retry failed** also refuse with 409 `not_an_ai_import`, `ai_disabled:<reason>`, `file_missing` or `daily_cap`.

## 16. Known limits and troubleshooting

- **The bank starts empty**, and review time, not AI, is the bottleneck. Import newest papers first (2024–2026), use bulk approval with spot checks, and filter by paper.
- **Older source files:** older JEE Main shift papers may only be available from candidates' logins. Finding the files is Aspire's job.
- **Batch mode** has never run against the real API: the import package is tested only with a fake client, and the Integrate stage's (at most two) real calls use a 1-page test PDF, which defaults to fast mode. Its first real use will be the owner's pilot. If a batch item is refused, it is retried in fast mode (counted against the cap).
- **"Coming soon" on an exam page:** readiness is thin (too few approved questions in some section, language or chapter level), or the blueprint is not published, or `QB_GENERATION_ENABLED=0` (paper requests then answer 503). The blueprint's readiness panel shows which section is short.
- **Hindi papers shorter than English:** only questions with official or staff Hindi are used in Hindi mode; the page says how many are missing.
- **Search** uses SQLite's full-text search when the server's SQLite has it, else a slower plain search; the server log says which is in use.
- **Upload fails at once with "413" or "Request Entity Too Large":** nginx's upload limit; see `deploy/README.md` → Question bank.
- **Rate limits** (generator: 150 papers per 10 minutes and 600 per day per IP, 10 per hour per signed-in student; readiness and resuming a paper 300 per 10 minutes per IP each; figures 1,200 per 10 minutes per IP; reports 20 per hour per IP; admin APIs per user, section 15) are kept in memory: a single server only, reset on restart.
- **Harvesting:** answers are released only after a quarter of the paper's time, which slows down bots that try to collect questions; it does not stop a determined one (owner decision A7-6).
- **Ranked boards are indicative:** students can share answers within the month, as with any online test series.
- **JEE Advanced changes its pattern every year** and reveals it only on exam day; mocks follow the verified 2026 pattern.
- **Phase 2 (not built):** JEE Advanced ranked pair, pattern variants, easier / typical / tougher presets, an expected-time budget, option shuffling for Aspire questions, "freeze a preview as a fixed paper", part-syllabus slots, more BOH slots, a PDF figure cropper, IRT, a strength summary across a student's papers, the homepage widget listing, certificates for generated papers.

## 17. Where the code lives

| Area | Path | Package |
|---|---|---|
| Schema (`qb_*` tables) | `src/lib/db/features/qb.ts` | QB-CORE-A |
| Types, patterns, generator, rich text, fingerprints, calibration maths, request schemas | `src/lib/qb/*.ts` | QB-CORE-A |
| Math and figure components | `src/components/qb/` | QB-CORE-A |
| Services (access, questions, pool, taxonomy, figures, blueprints, windows, papers, stats, corrections, reports, search) | `src/lib/qb/*.ts`, `src/lib/qb/repo/` | QB-CORE-B |
| Seed (units, chapters, draft blueprints, samples) | `src/lib/qb/seed/` | QB-SEED |
| Mock-test integration and public paper APIs | `src/lib/mocktest/`, `src/app/api/mocktest/papers/`, `src/app/api/qb/figures/[id]/` | QB-MOCKTEST-API |
| Student pages and runner | `src/app/[lang]/(site)/tools/mock-tests/exam/`, `src/components/mocktest/` | QB-MOCKTEST-UI |
| Admin APIs (request schemas in `_lib/schemas.ts`, limits in `_lib/http.ts`) | `src/app/api/admin/qb/` (except `imports/`) | QB-ADMIN-API |
| Admin screens | `src/app/[lang]/(portal)/admin/questions/`, `src/components/qb-admin/` | QB-ADMIN-UI |
| Import pipeline | `src/lib/qb/import/`, `src/app/api/admin/qb/imports/`, `…/admin/questions/import/`, `src/components/qb-import/` | QB-IMPORT |
| Messages | `src/i18n/messages/{en,hi}/qb.ts`, `qbImport.ts`, additions to `mocktest.ts` and `portal.ts` | QB-ADMIN-UI, QB-IMPORT, QB-MOCKTEST-UI |
