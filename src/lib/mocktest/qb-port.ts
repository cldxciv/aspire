import "server-only";

import type { DatabaseSync } from "node:sqlite";
import { qbDb } from "@/lib/qb/db";
import * as qbFigures from "@/lib/qb/figures";
import * as qbPapers from "@/lib/qb/papers";
import { ensureQbSeeded } from "@/lib/qb/seed";
import type { QbPaperPort } from "./generated";
import { monthWindowFromId } from "./timing";
import type { TestWindow } from "./types";

/**
 * The default `QbPaperPort`: the ONE place where the mock-test side (QB-MOCKTEST-API) calls the
 * question bank's services (QB-CORE-B) and seeding (QB-SEED). Loaded lazily by `qbPaperPort()`, so
 * route modules never load the bank unless they use it; route tests inject a fake, and
 * `qb-port.test.ts` runs THIS mapping against the real bank on an in-memory database.
 *
 * Reconciled with QB-CORE-B as it landed (src/lib/qb/papers.ts, figures.ts):
 * - `createPaper(input, db)`, `loadPaper(id, access, now, db)`, `loadPaperTrusted(id, now, db)`,
 *   `paperReviewItems(id, now, db)`, `lockPaperAnswers(id, { answersHash, summary, now }, db)`
 *   (adds "not_found"), `recordPaperOutcome(id, { questions, score, maxScore, now }, db)` (its own
 *   compare-and-set on `stats_recorded_at`, timing re-check, dropped questions left out),
 *   `paperIdsContaining(questionId, paperIds, db)`, `reportServedQuestion({ paperId, questionId,
 *   kind, note, now }, db)` (the route checked access by loading the paper; stores the served
 *   version, never the account), `slotReadiness(input, db)`, `publicBlueprintMocks(input, db)`,
 *   `rankedBoard(slot, now, db)`;
 * - `readPublicFigure(id, db)` (only figures referenced by an approved version, ≥ 1).
 * The bank's records, readiness and list shapes equal the mock-test types structurally, so they
 * pass through unchanged; only the ranked windows are re-derived from their ids (canonical IST
 * month bounds, the same function the boards use).
 *
 * Every call runs on `connection()`: by default `qbDb()` seeded first (`ensureQbSeeded`,
 * idempotent and memoised per connection — plan §B14: route handlers seed before using services).
 */
export function createQbPaperPort(connection: () => DatabaseSync): QbPaperPort {
  return {
    async readiness(input) {
      return qbPapers.slotReadiness(input, connection());
    },

    async createPaper(input) {
      return qbPapers.createPaper(
        {
          slot: input.slot,
          mode: input.mode,
          userId: input.userId,
          language: input.language,
          compensatory: input.compensatory,
          recent: input.recent,
          placeholderMode: input.placeholderMode,
          now: input.now,
        },
        connection(),
      );
    },

    async loadPaper(id, access, now) {
      return qbPapers.loadPaper(id, { token: access.token ?? null, userId: access.userId ?? null }, now, connection());
    },

    async loadPaperTrusted(id, now) {
      return qbPapers.loadPaperTrusted(id, now, connection());
    },

    async reviewItems(paper, now) {
      return qbPapers.paperReviewItems(paper.view.id, now, connection());
    },

    async lockAnswers(paperId, input) {
      return qbPapers.lockPaperAnswers(paperId, { answersHash: input.answersHash, summary: input.summary, now: input.now }, connection());
    },

    async recordOutcome(paper, input) {
      return qbPapers.recordPaperOutcome(
        paper.view.id,
        {
          // Already without dropped questions, partial responses as "not correct" (paperStatsOutcomes).
          questions: input.questions.map((q) => ({ id: q.id, outcome: q.outcome, timeSec: q.timeSec })),
          score: input.score,
          maxScore: input.maxScore,
          now: input.now,
        },
        connection(),
      );
    },

    async createReport(input) {
      // The route opened the paper with the caller's token / session (`loadPaper`); the bank stores
      // question, served version, paper, kind, note and time — no account, no IP.
      return qbPapers.reportServedQuestion(
        { paperId: input.paper.view.id, questionId: input.questionId, kind: input.kind, note: input.note, now: input.now },
        connection(),
      );
    },

    async figure(id) {
      return qbFigures.readPublicFigure(id, connection());
    },

    async paperIdsContaining(questionId, paperIds) {
      return qbPapers.paperIdsContaining(questionId, paperIds, connection());
    },

    async rankedBoard(slot, now) {
      const board = qbPapers.rankedBoard(slot, now, connection());
      if (board === null) return null;
      return {
        windows: board.windows
          .map((w) => ({ window: monthWindowFromId(w.window.id), maxScore: w.maxScore }))
          .filter((w): w is { window: TestWindow; maxScore: number } => w.window !== null),
      };
    },

    async publicMocks(input) {
      return qbPapers.publicBlueprintMocks(input, connection());
    },
  };
}

/** The bank's connection (`qbDb()`: qb schema + lazy FTS5), seeded first. */
function seeded(): DatabaseSync {
  const db = qbDb();
  ensureQbSeeded(db);
  return db;
}

export const defaultQbPaperPort: QbPaperPort = createQbPaperPort(seeded);
