/**
 * SQLite schema for the "page_layout" feature (owner: PAGE-LAYOUT CORE-1; docs/page-layout-plan.md
 * §5, D11). Applied on every open after the core migrations, so it MUST be idempotent: only
 * `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Never alters core tables.
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of
 * project files here. SQL that reads or writes these tables lives in src/lib/page-layout/store.ts.
 *
 * - page_layout_state: at most one draft and one published row per page. `sections` is JSON
 *   `[{"key":"results","hidden":false}, …]` of the movable sections only (no hero, no pinned
 *   last). No row = the default order, so a page keeps following future code changes. There is no
 *   CHECK on `page`: the code validates page keys, so a new page needs no table rebuild.
 * - page_layout_history: append-only, one row per change, with normalised before/after snapshots
 *   (`after_sections` NULL for discard_draft and reset). A page's revision is its newest id here.
 */
export const schema = `
CREATE TABLE IF NOT EXISTS page_layout_state (
  page TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  sections TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (page, stage)
);
CREATE TABLE IF NOT EXISTS page_layout_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save_draft', 'discard_draft', 'publish', 'reset')),
  before_sections TEXT NOT NULL,
  after_sections TEXT,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS page_layout_history_page_idx ON page_layout_history (page, id);
`;
