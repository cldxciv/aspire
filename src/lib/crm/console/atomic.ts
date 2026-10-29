import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import type { CrmResult } from "../types";

/**
 * Atomic multi-step console writes (docs/admin-phase-1b-plan.md §4.2; owner: 1B-CORE). Writes go
 * through the existing services (`completeTask`, `createTask`, `logContact`, `changeStage`,
 * `assignLead`), which join the surrounding transaction, so their hooks (lead routing's SLA clock)
 * still fire; a failed step rolls every earlier step back.
 *
 * ```ts
 * return runAtomic(db, () => {
 *   requireOk(completeTask(viewer, taskId, now));
 *   const task = requireOk(createTask(viewer, leadId, input, now));
 *   return ok(task);
 * });
 * ```
 */

/** Thrown by `requireOk` to abort a `runAtomic` block with a service failure. */
export class ConsoleAbort extends Error {
  constructor(readonly result: Extract<CrmResult<never>, { ok: false }>) {
    super(`console_abort:${result.error}`);
    this.name = "ConsoleAbort";
  }
}

/** The data of an ok result; a failure aborts the surrounding `runAtomic` (rolled back, then returned). */
export function requireOk<T>(result: CrmResult<T>): T {
  if (!result.ok) throw new ConsoleAbort(result);
  return result.data;
}

let savepointCounter = 0;

/**
 * Runs `fn` in one write transaction (or, inside an existing transaction, a savepoint). A thrown
 * `ConsoleAbort` OR a returned failure rolls back everything `fn` wrote and returns that failure;
 * any other error rolls back and is re-thrown. `fn` must be synchronous.
 */
export function runAtomic<T>(db: DatabaseSync, fn: () => CrmResult<T>): CrmResult<T> {
  const attempt = (): CrmResult<T> => {
    const result = fn();
    if (!result.ok) throw new ConsoleAbort(result);
    return result;
  };
  try {
    if (!db.isTransaction) return withTransaction(db, attempt);
    savepointCounter += 1;
    const name = `console_atomic_${savepointCounter}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const result = attempt();
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw error;
    }
  } catch (error) {
    if (error instanceof ConsoleAbort) return error.result;
    throw error;
  }
}
