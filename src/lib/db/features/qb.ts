/**
 * SQLite schema for the "qb" feature: the question bank and exam-pattern mock tests (owner: QB-CORE-A;
 * design in docs/question-bank-plan.md §B4). Applied on every open after the core migrations, so it
 * MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Tables use the
 * `qb_` prefix. Core tables and other features' tables are never altered (a saved mock attempt is
 * linked to its paper through `qb_attempt_papers` instead).
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no imports here. The FTS5
 * search table (`qb_search`) is NOT created here: `qbDb()` creates it lazily inside try/catch, so a
 * SQLite build without FTS5 can never break database start-up.
 *
 * Conventions: times are epoch milliseconds; JSON columns are TEXT; `*BLOB` columns (snapshots, the
 * imported original) hold raw-deflate JSON (`zlib.deflateRawSync`); `qb_papers.items` is packed
 * (src/lib/qb/items-pack.ts). Additions to the plan's §B4 DDL: `qb_questions.ai_chapter_id` (the
 * AI chapter suggestion, kept apart from the staff chapter for weights and bulk acceptance) and
 * `qb_pool.adapted` (from the approved snapshot, for the paper composition).
 */
export const schema = `
CREATE TABLE IF NOT EXISTS qb_members (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  qb_role TEXT NOT NULL CHECK (qb_role IN ('author', 'reviewer')),
  subjects TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS qb_units (
  id TEXT PRIMARY KEY,
  exam TEXT NOT NULL,
  syllabus_year INTEGER NOT NULL,
  subject TEXT NOT NULL,
  code TEXT,
  label_en TEXT NOT NULL,
  label_hi TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'removed')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS qb_units_exam_idx ON qb_units (exam, syllabus_year, subject, sort);

CREATE TABLE IF NOT EXISTS qb_chapters (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('class_9_10', 'class_11', 'class_12', 'general')),
  label_en TEXT NOT NULL,
  label_hi TEXT NOT NULL DEFAULT '',
  units TEXT NOT NULL DEFAULT '{}',
  exam_status TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL CHECK (origin IN ('seed', 'staff')),
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS qb_passages (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS qb_questions (
  id TEXT PRIMARY KEY,
  n INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'retired')),
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)),
  subject TEXT NOT NULL,
  chapter_id TEXT REFERENCES qb_chapters (id) ON DELETE SET NULL,
  ai_chapter_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('single', 'multiple', 'numerical')),
  format TEXT NOT NULL DEFAULT 'standard' CHECK (format IN ('standard', 'assertion_reason', 'statements', 'match_list', 'passage')),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  approved_version INTEGER,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('official', 'aspire', 'sample')),
  source TEXT NOT NULL,
  source_exam TEXT,
  source_year INTEGER,
  source_paper_key TEXT,
  also_in TEXT NOT NULL DEFAULT '[]',
  fidelity TEXT CHECK (fidelity IN ('verbatim', 'transcription_fixed', 'adapted')),
  adapted_note TEXT,
  imported BLOB,
  import_id TEXT,
  source_key TEXT,
  pattern_tag TEXT,
  original_marking TEXT,
  key_status TEXT NOT NULL DEFAULT 'none' CHECK (key_status IN
    ('none', 'matched', 'staff_entered', 'missing', 'dropped', 'multiple_accepted', 'conflict')),
  key_stage TEXT CHECK (key_stage IN ('provisional', 'final', 'staff_verified', 'aspire')),
  confidence REAL,
  flags TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT,
  minhash BLOB,
  cluster_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER,
  retired_by TEXT,
  retired_at INTEGER,
  retire_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS qb_questions_import_key_uq ON qb_questions (import_id, source_key)
  WHERE import_id IS NOT NULL AND source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS qb_questions_list_idx ON qb_questions (status, subject, chapter_id, updated_at);
CREATE INDEX IF NOT EXISTS qb_questions_source_idx ON qb_questions (source_kind, source_exam, source_year);
CREATE INDEX IF NOT EXISTS qb_questions_import_idx ON qb_questions (import_id);
CREATE INDEX IF NOT EXISTS qb_questions_fp_idx ON qb_questions (fingerprint);
CREATE INDEX IF NOT EXISTS qb_questions_paper_idx ON qb_questions (source_paper_key);

CREATE TABLE IF NOT EXISTS qb_question_exams (
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  exam TEXT NOT NULL,
  eligible INTEGER NOT NULL DEFAULT 1 CHECK (eligible IN (0, 1)),
  cross_exam INTEGER NOT NULL DEFAULT 0 CHECK (cross_exam IN (0, 1)),
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  difficulty_source TEXT CHECK (difficulty_source IN ('staff', 'ai_accepted', 'sample', 'calibrated')),
  difficulty_by TEXT,
  difficulty_at INTEGER,
  ai_difficulty TEXT,
  ai_reason TEXT,
  syllabus TEXT NOT NULL DEFAULT 'unchecked' CHECK (syllabus IN ('current', 'removed', 'unchecked')),
  syllabus_by TEXT,
  syllabus_at INTEGER,
  expected_time_sec INTEGER,
  PRIMARY KEY (question_id, exam)
);

CREATE TABLE IF NOT EXISTS qb_question_versions (
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot BLOB NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, version)
);

CREATE TABLE IF NOT EXISTS qb_pool (
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  exam TEXT NOT NULL,
  n INTEGER NOT NULL,
  version INTEGER NOT NULL,
  subject TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  level TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT NOT NULL,
  answer_integer INTEGER NOT NULL,
  passage_id TEXT,
  passage_order INTEGER,
  difficulty TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_year INTEGER,
  cross_exam INTEGER NOT NULL,
  hi_ok INTEGER NOT NULL,
  cluster_id TEXT NOT NULL,
  has_figures INTEGER NOT NULL,
  adapted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (question_id, exam)
);
CREATE INDEX IF NOT EXISTS qb_pool_exam_idx ON qb_pool (exam, subject, type, chapter_id, difficulty);

CREATE TABLE IF NOT EXISTS qb_item_stats (
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  exam TEXT NOT NULL,
  exposures INTEGER NOT NULL DEFAULT 0,
  scored_n INTEGER NOT NULL DEFAULT 0,
  attempted_n INTEGER NOT NULL DEFAULT 0,
  correct_n INTEGER NOT NULL DEFAULT 0,
  wrong_n INTEGER NOT NULL DEFAULT 0,
  omitted_n INTEGER NOT NULL DEFAULT 0,
  time_sum_sec INTEGER NOT NULL DEFAULT 0,
  top_n INTEGER NOT NULL DEFAULT 0,
  top_correct INTEGER NOT NULL DEFAULT 0,
  bottom_n INTEGER NOT NULL DEFAULT 0,
  bottom_correct INTEGER NOT NULL DEFAULT 0,
  calibrated TEXT,
  calibrated_at INTEGER,
  state TEXT NOT NULL DEFAULT 'none' CHECK (state IN ('none', 'suggested', 'accepted', 'dismissed')),
  discrimination_flagged_at INTEGER,
  PRIMARY KEY (question_id, exam)
);
CREATE TABLE IF NOT EXISTS qb_score_hist (
  slot TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slot, bucket)
);

CREATE TABLE IF NOT EXISTS qb_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS qb_events_q_idx ON qb_events (question_id, at);

CREATE TABLE IF NOT EXISTS qb_dup_pairs (
  a TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  score REAL NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('exact', 'near')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'duplicate', 'variant', 'distinct')),
  decided_by TEXT,
  decided_at INTEGER,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS qb_figures (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size INTEGER NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS qb_figure_refs (
  figure_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (figure_id, question_id, version)
);
CREATE INDEX IF NOT EXISTS qb_figure_refs_q_idx ON qb_figure_refs (question_id, version);

CREATE TABLE IF NOT EXISTS qb_imports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pdf_paper', 'pdf_key', 'pdf_bank', 'docx_bank', 'xlsx_bank', 'csv_bank', 'csv_key')),
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'ready', 'running', 'waiting_batch', 'paused', 'done', 'failed', 'cancelled', 'closed')),
  mode TEXT NOT NULL DEFAULT 'sync' CHECK (mode IN ('sync', 'batch', 'none')),
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  temp_path TEXT,
  file_deleted_at INTEGER,
  pages INTEGER,
  rows INTEGER,
  encrypted INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}',
  model TEXT,
  effort TEXT,
  estimate TEXT,
  usage TEXT NOT NULL DEFAULT '{}',
  batch_ids TEXT NOT NULL DEFAULT '[]',
  page_marks TEXT NOT NULL DEFAULT '[]',
  pattern_snapshot TEXT,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  drafts_created INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  pause_reason TEXT,
  runner_id TEXT,
  lease_until INTEGER,
  licence_ack_by TEXT NOT NULL,
  licence_ack_at INTEGER NOT NULL,
  licence_note TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS qb_imports_status_idx ON qb_imports (status, updated_at);
CREATE INDEX IF NOT EXISTS qb_imports_paper_idx ON qb_imports (file_sha256);
CREATE TABLE IF NOT EXISTS qb_import_items (
  import_id TEXT NOT NULL REFERENCES qb_imports (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  page_from INTEGER,
  page_to INTEGER,
  custom_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'running', 'done', 'failed', 'refused')),
  attempts INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  stop_reason TEXT,
  output TEXT,
  usage TEXT NOT NULL DEFAULT '{}',
  usd REAL NOT NULL DEFAULT 0,
  finished_at INTEGER,
  error TEXT,
  PRIMARY KEY (import_id, seq)
);
CREATE INDEX IF NOT EXISTS qb_import_items_day_idx ON qb_import_items (finished_at);

CREATE TABLE IF NOT EXISTS qb_key_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  applies_to_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('answer', 'dropped')),
  answer TEXT,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  rescored_at INTEGER
);
CREATE INDEX IF NOT EXISTS qb_key_corrections_q_idx ON qb_key_corrections (question_id, applies_to_version);

CREATE TABLE IF NOT EXISTS qb_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES qb_questions (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  paper_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('wrong_answer', 'question_error', 'figure', 'hindi', 'out_of_syllabus', 'other')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS qb_reports_open_idx ON qb_reports (status, created_at);

CREATE TABLE IF NOT EXISTS qb_blueprints (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  definition TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  published_by TEXT,
  published_at INTEGER,
  UNIQUE (slot, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS qb_blueprints_published_uq ON qb_blueprints (slot) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS qb_windows (
  slot TEXT NOT NULL,
  window_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'unavailable', 'closed')),
  blueprint_id TEXT,
  blueprint_version INTEGER,
  seed TEXT,
  items BLOB,
  composition TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (slot, window_id)
);

CREATE TABLE IF NOT EXISTS qb_papers (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('practice', 'ranked')),
  slot TEXT NOT NULL,
  test_id TEXT NOT NULL,
  set_id TEXT,
  set_part INTEGER,
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  window_id TEXT,
  seed TEXT NOT NULL,
  items BLOB NOT NULL,
  composition TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  duration_minutes INTEGER NOT NULL,
  compensatory_minutes INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  short INTEGER NOT NULL DEFAULT 0,
  sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  first_scored_at INTEGER,
  answers_hash TEXT,
  result_summary TEXT,
  stats_recorded_at INTEGER,
  CHECK (kind <> 'ranked' OR (user_id IS NOT NULL AND window_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qb_papers_ranked_uq ON qb_papers (user_id, slot, window_id, COALESCE(set_part, 0))
  WHERE kind = 'ranked';
CREATE INDEX IF NOT EXISTS qb_papers_user_idx ON qb_papers (user_id, created_at);
CREATE INDEX IF NOT EXISTS qb_papers_expiry_idx ON qb_papers (expires_at);
CREATE INDEX IF NOT EXISTS qb_papers_set_idx ON qb_papers (set_id);

CREATE TABLE IF NOT EXISTS qb_attempt_papers (
  attempt_id TEXT PRIMARY KEY REFERENCES mocktest_attempts (id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL UNIQUE,
  tiebreak TEXT,
  rescored_at INTEGER
);

CREATE TABLE IF NOT EXISTS qb_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
`;
